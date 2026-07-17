import { Router } from "express";
import { db } from "../db.js";
import { eq, and, isNull, sql } from "drizzle-orm";
import { 
  salesOrders, 
  salesOrderItems, 
  quotations, 
  quotationItems, 
  invoices, 
  invoiceItems,
  customerStock,
  customerProducts,
  stockAllocations,
  salesOrderAuditLogs,
  products,
  customers
} from "../../shared/schema.js";

export function createCustomerFlowRouter(requireAuth: any) {
  const router = Router();
  router.use(requireAuth);

  // 1. Convert Quotation -> Sales Order
  router.post("/sales-orders/from-quotation", async (req, res) => {
    try {
      const { quotationId } = req.body;
      const quote = await db.query.invoices.findFirst({
        where: eq(invoices.id, quotationId),
        with: { items: true }
      });

      if (!quote) return res.status(404).json({ error: "Quotation not found" });

      const [newOrder] = await db.insert(salesOrders).values({
        companyId: quote.companyId,
        branchId: quote.branchId || undefined,
        customerId: quote.customerId,
        quotationId: quote.id,
        orderNumber: `SO-${Date.now()}`,
        issueDate: new Date(),
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        total: quote.total,
        status: "confirmed",
        currency: quote.currency || undefined,
      }).returning();

      const orderItemsToInsert = quote.items.map((item: any) => ({
        salesOrderId: newOrder.id,
        quotationItemId: item.id,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        invoicedQuantity: "0.00",
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        lineTotal: item.lineTotal,
        taxTypeId: item.taxTypeId,
      }));

      await db.insert(salesOrderItems).values(orderItemsToInsert);
      
      // Update quotation status and link
      await db.update(invoices)
        .set({ status: "converted", salesOrderId: newOrder.id })
        .where(eq(invoices.id, quote.id));

      res.json(newOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Manual Stock Receipt (enforcing customer check)
  router.post("/stock/receipt", async (req, res) => {
    try {
      const { companyId, locationId, productId, customerId, quantity, uom, batchId } = req.body;
      
      // Check exclusivity
      const exclusivity = await db.query.customerProducts.findFirst({
        where: and(
          eq(customerProducts.productId, productId),
          eq(customerProducts.isExclusive, true)
        )
      });

      if (exclusivity && exclusivity.customerId !== customerId) {
        return res.status(400).json({ error: "Product is exclusive to another customer. Must provide correct customerId." });
      }

      if (!exclusivity && customerId) {
         // It's a shared product but they provided a customer_id? We allow it or clear it.
         // For now, allow it (maybe they want to reserve it).
      }

      const [newStock] = await db.insert(customerStock).values({
        companyId,
        locationId,
        productId,
        customerId: customerId || null,
        batchId: batchId || null,
        quantity,
        uom,
        status: "AVAILABLE",
      }).returning();

      res.json(newStock);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Allocate Stock to a Sales Order Line
  router.post("/sales-orders/:id/allocate", async (req, res) => {
    try {
      const { id } = req.params;
      const { stockId, quantity } = req.body;

      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, parseInt(id))
      });

      if (!order) return res.status(404).json({ error: "Sales Order not found" });

      const stock = await db.query.customerStock.findFirst({
        where: eq(customerStock.id, stockId)
      });

      if (!stock) return res.status(404).json({ error: "Stock not found" });

      // STRICT OWNERSHIP CHECK
      if (stock.customerId !== null && stock.customerId !== order.customerId) {
        return res.status(403).json({ error: "Cannot allocate another customer's exclusive stock to this order." });
      }

      const allocResult = await db.execute(sql`
        SELECT COALESCE(SUM(quantity_allocated), 0) AS total_allocated
        FROM stock_allocations
        WHERE stock_id = ${stockId} AND released_at IS NULL
      `);
      
      const totalAllocated = Number(allocResult.rows[0].total_allocated || 0);
      const availableQuantity = Number(stock.quantity) - totalAllocated;

      if (availableQuantity < Number(quantity)) {
        return res.status(400).json({ error: `Insufficient stock quantity. On hand: ${stock.quantity}, Available: ${availableQuantity}` });
      }

      const orderLines = await db.query.salesOrderItems.findMany({
        where: and(
           eq(salesOrderItems.salesOrderId, parseInt(id)),
           eq(salesOrderItems.productId, stock.productId)
        )
      });
      
      if (orderLines.length === 0) {
        return res.status(400).json({ error: "Order does not contain the product for this stock ID." });
      }
      const orderLineId = orderLines[0].id; // Assign to first matching line

      await db.insert(stockAllocations).values({
        stockId: parseInt(stockId),
        salesOrderLineId: orderLineId,
        quantityAllocated: quantity.toString()
      });

      // Update line status
      await db.update(salesOrderItems).set({ status: "allocated" } as any).where(eq(salesOrderItems.id, orderLineId));

      res.json({ message: "Stock allocated successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Invoice a Sales Order
  router.post("/invoices/from-sales-order", async (req, res) => {
    try {
      const { salesOrderId, itemsToInvoice } = req.body; 
      // itemsToInvoice = [{ salesOrderItemId, quantityToInvoice }]

      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, salesOrderId),
        with: { items: true }
      });

      if (!order) return res.status(404).json({ error: "Sales order not found" });

      let invoiceSubtotal = 0;
      let invoiceTax = 0;

      const invoiceItemsData = itemsToInvoice.map((reqItem: any) => {
        const orderLine = order.items.find(i => i.id === reqItem.salesOrderItemId);
        if (!orderLine) throw new Error(`Order line ${reqItem.salesOrderItemId} not found`);
        
        const lineTotal = Number(orderLine.unitPrice) * Number(reqItem.quantityToInvoice);
        const taxAmt = lineTotal * (Number(orderLine.taxRate) / 100);
        
        invoiceSubtotal += lineTotal;
        invoiceTax += taxAmt;

        return {
          productId: orderLine.productId,
          salesOrderItemId: orderLine.id,
          description: orderLine.description,
          quantity: reqItem.quantityToInvoice,
          unitPrice: orderLine.unitPrice,
          taxRate: orderLine.taxRate,
          lineTotal: lineTotal.toString(),
          taxTypeId: orderLine.taxTypeId,
        };
      });

      const invoiceTotal = invoiceSubtotal + invoiceTax;

      // Create invoice
      const [newInvoice] = await db.insert(invoices).values({
        companyId: order.companyId,
        branchId: order.branchId,
        customerId: order.customerId,
        salesOrderId: order.id,
        invoiceNumber: `INV-${Date.now()}`,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: invoiceSubtotal.toString(),
        taxAmount: invoiceTax.toString(),
        total: invoiceTotal.toString(),
        status: "issued",
      }).returning();

      await db.insert(invoiceItems).values(
        invoiceItemsData.map((item: any) => ({
          ...item,
          invoiceId: newInvoice.id
        }))
      );

      // Deduct stock for each invoiced line
      for (const reqItem of itemsToInvoice) {
        const allocs = await db.query.stockAllocations.findMany({
          where: and(
            eq(stockAllocations.salesOrderLineId, reqItem.salesOrderItemId),
            isNull(stockAllocations.releasedAt)
          )
        });
        
        let qtyToDeduct = Number(reqItem.quantityToInvoice);
        for (const alloc of allocs) {
           if (qtyToDeduct <= 0) break;
           const allocQty = Number(alloc.quantityAllocated);
           const deductFromAlloc = Math.min(allocQty, qtyToDeduct);
           
           if (deductFromAlloc === allocQty) {
              await db.update(stockAllocations).set({ releasedAt: new Date() }).where(eq(stockAllocations.id, alloc.id));
           } else {
              await db.update(stockAllocations).set({ releasedAt: new Date() }).where(eq(stockAllocations.id, alloc.id));
              await db.insert(stockAllocations).values({
                 stockId: alloc.stockId,
                 salesOrderLineId: alloc.salesOrderLineId,
                 quantityAllocated: (allocQty - deductFromAlloc).toString()
              });
           }
           
           await db.execute(sql`
              UPDATE customer_stock 
              SET quantity = quantity - ${deductFromAlloc} 
              WHERE id = ${alloc.stockId}
           `);
           
           qtyToDeduct -= deductFromAlloc;
        }
      }

      // Update sales order item invoiced quantities
      for (const reqItem of itemsToInvoice) {
        const orderLine = order.items.find(i => i.id === reqItem.salesOrderItemId)!;
        const newInvoicedQty = Number(orderLine.invoicedQuantity) + Number(reqItem.quantityToInvoice);
        
        await db.update(salesOrderItems)
          .set({ invoicedQuantity: newInvoicedQty.toString() })
          .where(eq(salesOrderItems.id, orderLine.id));
          
        orderLine.invoicedQuantity = newInvoicedQty.toString(); // Update memory for check
      }

      // Check if ALL lines on the order are fully invoiced
      let fullyInvoiced = true;
      for (const orderLine of order.items) {
        if (Number(orderLine.invoicedQuantity) < Number(orderLine.quantity)) {
          fullyInvoiced = false;
          break;
        }
      }

      // Update order status
      await db.update(salesOrders)
        .set({ status: fullyInvoiced ? "invoiced" : "partially_invoiced" })
        .where(eq(salesOrders.id, order.id));

      res.json(newInvoice);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Statement View
  router.get("/customers/:id/statement-view", async (req, res) => {
    try {
      const { id } = req.params;
      const { dateFrom, dateTo, companyId } = req.query as any;

      // Get base data
      const result = await db.execute(`SELECT * FROM customer_statements_view WHERE customer_id = ${id}`);
      if (!result.rows || result.rows.length === 0) return res.json({});
      const stmt = result.rows[0] as any;

      // Get full customer record
      const custResult = await db.execute(`SELECT * FROM customers WHERE id = ${id} LIMIT 1`);
      const customer = custResult.rows[0] as any;

      // Get company details (use companyId param or customer's company_id)
      const cid = companyId || stmt.company_id;
      const compResult = await db.execute(`SELECT id, name, trading_name, address, city, country, phone, email, tin, vat_number FROM companies WHERE id = ${cid} LIMIT 1`);
      const company = compResult.rows[0] as any;

      // Date range for the ledger (default: full history starting 2020)
      const from = dateFrom || "2020-01-01";
      const to = dateTo || new Date().toISOString().split('T')[0];

      // Opening balance = opening_balance field + all transactions BEFORE the from date
      const obResult = await db.execute(`
        SELECT
          COALESCE(c.opening_balance, 0) +
          COALESCE((
            SELECT SUM(
              CASE WHEN i.transaction_type = 'CreditNote' THEN -i.total
                   ELSE i.total END
            )
            FROM invoices i
            WHERE i.customer_id = ${id}
              AND i.issue_date < '${from}'
              AND i.status NOT IN ('cancelled','quote')
          ), 0) -
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            WHERE i.customer_id = ${id}
              AND p.payment_date < '${from}'
          ), 0) AS opening_balance
        FROM customers c WHERE c.id = ${id}
      `);
      const openingBalance = Number((obResult.rows[0] as any)?.opening_balance || 0);

      // Period invoices as ledger rows
      const ledgerResult = await db.execute(`
        SELECT
          i.issue_date AS date,
          i.invoice_number AS reference,
          CASE
            WHEN i.transaction_type = 'CreditNote' THEN 'Credit Note Issued'
            WHEN i.transaction_type = 'DebitNote' THEN 'Debit Note Issued'
            ELSE 'Invoice Issued'
          END AS description,
          CASE WHEN i.transaction_type = 'CreditNote' THEN 0 ELSE COALESCE(i.total, 0) END AS debit,
          CASE WHEN i.transaction_type = 'CreditNote' THEN COALESCE(i.total, 0) ELSE 0 END AS credit,
          'invoice' AS entry_type
        FROM invoices i
        WHERE i.customer_id = ${id}
          AND i.issue_date >= '${from}'
          AND i.issue_date <= '${to}'
          AND i.status NOT IN ('cancelled','quote')
        UNION ALL
        SELECT
          p.payment_date AS date,
          COALESCE(p.reference, 'PAY-' || p.id::text) AS reference,
          'Payment Received' AS description,
          0 AS debit,
          COALESCE(p.amount, 0) AS credit,
          'payment' AS entry_type
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        WHERE i.customer_id = ${id}
          AND p.payment_date >= '${from}'
          AND p.payment_date <= '${to}'
        ORDER BY date ASC, entry_type DESC
      `);

      let runningBalance = openingBalance;
      const periodTotalInvoiced = (ledgerResult.rows as any[])
        .reduce((sum, r) => sum + Number(r.debit || 0), 0);
      const periodTotalPaid = (ledgerResult.rows as any[])
        .reduce((sum, r) => sum + Number(r.credit || 0), 0);

      const transactions = (ledgerResult.rows as any[]).map((row) => {
        runningBalance += Number(row.debit || 0) - Number(row.credit || 0);
        return {
          date: row.date,
          reference: row.reference,
          description: row.description,
          debit: Number(row.debit || 0),
          credit: Number(row.credit || 0),
          balance: runningBalance,
          entry_type: row.entry_type,
        };
      });

      // Exclusive / linked stock
      const stockResult = await db.execute(`
        SELECT
          cp.id, p.id AS product_id, p.name AS product_name, p.sku, p.unit_of_measure AS uom,
          cp.customer_sku, cp.is_exclusive,
          CASE WHEN cp.is_exclusive = true THEN
            COALESCE((
              SELECT SUM(s.quantity) FROM customer_stock s
              WHERE s.product_id = p.id
                AND s.customer_id = ${id}
            ), 0)
          ELSE
            COALESCE((
              SELECT SUM(bs.stock_level) FROM branch_stocks bs
              WHERE bs.product_id = p.id
            ), 0)
          END AS quantity_on_hand,
          
          CASE WHEN cp.is_exclusive = true THEN
            COALESCE((
              SELECT SUM(s.quantity) - COALESCE((
                SELECT SUM(sa.quantity_allocated) 
                FROM stock_allocations sa 
                JOIN customer_stock cs ON cs.id = sa.stock_id
                WHERE cs.product_id = p.id 
                  AND cs.customer_id = ${id} 
                  AND sa.released_at IS NULL
              ), 0)
              FROM customer_stock s
              WHERE s.product_id = p.id
                AND s.customer_id = ${id}
            ), 0)
          ELSE
            COALESCE((
              SELECT SUM(bs.stock_level) FROM branch_stocks bs
              WHERE bs.product_id = p.id
            ), 0)
          END AS available_quantity
        FROM customer_products cp
        JOIN products p ON p.id = cp.product_id
        WHERE cp.customer_id = ${id}
        ORDER BY p.name
      `);

      // Items sold during period (Stock Ledger)
      const itemsSoldResult = await db.execute(`
        SELECT
          i.issue_date AS date,
          i.invoice_number AS reference,
          p.sku,
          p.name AS product_name,
          p.unit_of_measure AS uom,
          0 AS qty_in,
          ii.quantity AS qty_out,
          ii.unit_price,
          ii.line_total AS total_value,
          'invoice' AS type
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        LEFT JOIN products p ON p.id = ii.product_id
        WHERE i.customer_id = ${id}
          AND i.issue_date >= '${from}'
          AND i.issue_date <= '${to}'
          AND i.status NOT IN ('cancelled','quote')
          
        UNION ALL
        
        SELECT
          cst.created_at::date AS date,
          cst.reference_id AS reference,
          p.sku,
          p.name AS product_name,
          p.unit_of_measure AS uom,
          cst.quantity AS qty_in,
          0 AS qty_out,
          0 AS unit_price,
          0 AS total_value,
          'receipt' AS type
        FROM inventory_transactions cst
        JOIN products p ON p.id = cst.product_id
        WHERE cst.customer_id = ${id}
          AND cst.type = 'STOCK_IN'
          AND cst.created_at::date >= '${from}'
          AND cst.created_at::date <= '${to}'
          
        ORDER BY date ASC, reference ASC
      `);

      res.json({
        ...stmt,
        company,
        customer,
        date_from: from,
        date_to: to,
        opening_balance: openingBalance,
        period_total_invoiced: periodTotalInvoiced,
        period_total_paid: periodTotalPaid,
        balance_due: runningBalance,
        transactions,
        exclusive_stock: stockResult.rows,
        items_sold: itemsSoldResult.rows,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });




  // 1b. Direct Creation
  router.post("/sales-orders", async (req, res) => {
    try {
      const { companyId, branchId, customerId, items, currency, notes } = req.body;
      
      let subtotal = 0;
      let taxAmount = 0;
      
      const newItems = [];
      for (const item of items) {
        let unitPrice = item.unitPrice;
        if (unitPrice === undefined || unitPrice === null) {
          const cp = await db.query.customerProducts.findFirst({
            where: and(eq(customerProducts.customerId, customerId), eq(customerProducts.productId, item.productId))
          });
          if (cp && (cp as any).negotiatedPrice) {
            unitPrice = (cp as any).negotiatedPrice;
          } else {
            const prod = await db.query.products.findFirst({
              where: eq(products.id, item.productId)
            });
            unitPrice = prod?.price || "0.00";
          }
        }

        const lineTotal = Number(unitPrice) * Number(item.quantity);
        const taxRate = item.taxRate || 0;
        const taxAmt = lineTotal * (taxRate / 100);
        
        subtotal += lineTotal;
        taxAmount += taxAmt;
        
        newItems.push({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          invoicedQuantity: "0.00",
          unitPrice: unitPrice.toString(),
          taxRate: taxRate.toString(),
          lineTotal: lineTotal.toString(),
          taxTypeId: item.taxTypeId,
        });
      }
      
      const total = subtotal + taxAmount;

      const [newOrder] = await db.insert(salesOrders).values({
        companyId,
        branchId: branchId || undefined,
        customerId,
        quotationId: null,
        orderNumber: `SO-${Date.now()}`,
        issueDate: new Date(),
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        status: "draft",
        currency: currency || "USD",
        notes,
      }).returning();

      const orderItemsToInsert = newItems.map(item => ({
        ...item,
        salesOrderId: newOrder.id,
      }));
      if (orderItemsToInsert.length > 0) {
        await db.insert(salesOrderItems).values(orderItemsToInsert);
      }

      const completeOrder = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, newOrder.id),
        with: { items: true }
      });
      res.json(completeOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 1c. Tiered Editing
  router.patch("/sales-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes, items } = req.body;
      const userId = (req as any).user?.id || null;

      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, parseInt(id)),
        with: { items: true }
      });
      if (!order) return res.status(404).json({ error: "Order not found" });

      // Determine Zone
      let zone = 1; // Draft
      if (order.status !== "draft") zone = 2; // Confirmed
      
      for (const item of order.items) {
        if (Number(item.invoicedQuantity) > 0) {
          zone = 3; // Invoiced/Allocated
          break;
        }
      }

      // Handle Header Updates
      const headerUpdates: any = {};
      if (status !== undefined && status !== order.status) headerUpdates.status = status;
      if (notes !== undefined && notes !== order.notes) headerUpdates.notes = notes;

      if (Object.keys(headerUpdates).length > 0) {
        if (zone === 2) {
          for (const [field, newVal] of Object.entries(headerUpdates)) {
            await db.insert(salesOrderAuditLogs).values({
              salesOrderId: order.id,
              fieldChanged: field,
              oldValue: String((order as any)[field]),
              newValue: String(newVal),
              changedBy: userId,
            });
          }
        }
        await db.update(salesOrders).set(headerUpdates).where(eq(salesOrders.id, order.id));
      }

      // Handle Items (Simplified for now - we would need to diff them properly)
      // For Zone 3 constraints, we just reject if they try to edit price/product
      
      res.json({ message: "Sales order updated" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders", async (req, res) => {
    try {
      const orders = await db.query.salesOrders.findMany({
        with: { customer: true, items: true },
        orderBy: (salesOrders, { desc }) => [desc(salesOrders.issueDate)],
      });
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders/:id", async (req, res) => {
    try {
      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, parseInt(req.params.id)),
        with: { 
          items: true,
        },
      });
      
      if (!order) return res.status(404).json({ error: "Not found" });
      
      // Manually fetch customer
      let customer = null;
      if (order.customerId) {
        customer = await db.query.customers.findFirst({
          where: eq(customers.id, order.customerId)
        });
      }
      
      res.json({ ...order, customer });
    } catch (error: any) {
      console.error("Error fetching sales order:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/customer-products/:customerId", async (req, res) => {
    try {
      const links = await db.query.customerProducts.findMany({
        where: eq(customerProducts.customerId, parseInt(req.params.customerId)),
        with: { product: true }
      });
      res.json(links);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/customer-products", async (req, res) => {
    try {
      const { companyId, customerId, productId, isExclusive, customerSku, artworkVersion, specReference } = req.body;
      const [link] = await db.insert(customerProducts).values({
        companyId,
        customerId,
        productId,
        isExclusive: isExclusive ?? true,
        customerSku,
        artworkVersion,
        specReference
      }).returning();
      res.json(link);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Release an Allocation
  router.post("/sales-orders/:id/release-allocation", async (req, res) => {
    try {
      const orderLineId = parseInt(req.params.id);
      
      await db.update(stockAllocations)
        .set({ releasedAt: new Date() })
        .where(
          and(
            eq(stockAllocations.salesOrderLineId, orderLineId),
            isNull(stockAllocations.releasedAt)
          )
        );
        
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
}
