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
  customers,
  layBySchedules,
  stockReservations,
  compoundProducts,
  compoundProductItems,
  salesOrderSettings,
  payments
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
        customerId: (order.customerId || undefined) as any,
        salesOrderId: order.id,
        invoiceNumber: `INV-${Date.now()}`,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: invoiceSubtotal.toString(),
        taxAmount: invoiceTax.toString(),
        total: invoiceTotal.toString(),
        status: "draft",
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
      const stmt = result.rows && result.rows.length > 0 ? result.rows[0] as any : {};

      // Get full customer record
      const custResult = await db.execute(`SELECT * FROM customers WHERE id = ${id} LIMIT 1`);
      if (!custResult.rows || custResult.rows.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }
      const customer = custResult.rows[0] as any;

      // Get company details (use companyId param or customer's company_id)
      const cid = companyId || stmt.company_id || customer.company_id;
      let company = {};
      if (cid) {
        const compResult = await db.execute(`SELECT id, name, trading_name, address, city, country, phone, email, tin, vat_number FROM companies WHERE id = ${cid} LIMIT 1`);
        company = compResult.rows[0] as any;
      }

      // Date range for the ledger (default: full history starting 2020)
      const from = dateFrom || "2020-01-01";
      const to = dateTo || new Date().toISOString().split('T')[0];
      const fromStart = `${from} 00:00:00`;
      const toEnd = `${to} 23:59:59.999`;

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
              AND i.issue_date < '${fromStart}'
              AND i.status NOT IN ('cancelled','quote')
          ), 0) -
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            WHERE i.customer_id = ${id}
              AND p.payment_date < '${fromStart}'
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
          AND i.issue_date >= '${fromStart}'
          AND i.issue_date <= '${toEnd}'
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
          AND p.payment_date >= '${fromStart}'
          AND p.payment_date <= '${toEnd}'
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
          (
            COALESCE((
              SELECT SUM(s.quantity) FROM customer_stock s
              WHERE s.product_id = p.id
                AND s.customer_id = ${id}
            ), 0)
            +
            COALESCE(p.stock_level, 0)
          ) AS quantity_on_hand,
          
          (
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
            +
            COALESCE(p.stock_level, 0)
          ) AS available_quantity
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
          AND i.issue_date >= '${fromStart}'
          AND i.issue_date <= '${toEnd}'
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
          AND cst.created_at >= '${fromStart}'
          AND cst.created_at <= '${toEnd}'
          
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




  // Report endpoints
  router.get("/sales-orders/reports/preorders", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });
      
      const all = await db.query.salesOrders.findMany({
        where: and(eq(salesOrders.companyId, companyId), eq(salesOrders.orderType as any, 'preorder')),
        with: { customer: true, items: true },
        orderBy: (salesOrders, { desc }) => [desc(salesOrders.issueDate)],
      });

      const now = new Date();
      const active = all.filter(o => !['completed','cancelled'].includes(o.status));
      const delayed = all.filter(o => {
        if (!(o as any).expectedArrival) return false;
        return new Date((o as any).expectedArrival) < now && !['completed','cancelled'].includes(o.status);
      });
      const depositsCollected = all.reduce((s, o) => s + parseFloat((o as any).depositPaid || '0'), 0);
      const outstandingBalances = all.reduce((s, o) => s + parseFloat((o as any).remainingBalance || '0'), 0);

      res.json({ active, delayed, depositsCollected, outstandingBalances, all });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders/reports/lay-bys", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });
      
      const all = await db.query.salesOrders.findMany({
        where: and(eq(salesOrders.companyId, companyId), eq(salesOrders.orderType as any, 'lay_by')),
        with: { customer: true, items: true },
        orderBy: (salesOrders, { desc }) => [desc(salesOrders.issueDate)],
      });

      const schedules = await db
        .select()
        .from(layBySchedules)
        .innerJoin(salesOrders, eq(layBySchedules.salesOrderId, salesOrders.id))
        .where(eq(salesOrders.companyId, companyId));

      const now = new Date();
      const active = all.filter(o => o.status === 'active');
      const defaulted = all.filter(o => o.status === 'defaulted');
      const completed = all.filter(o => o.status === 'completed');
      const upcomingPayments = schedules.filter((s: any) => {
        const due = new Date(s.lay_by_schedules.dueDate);
        const inNext30 = due >= now && due <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        return inNext30 && s.lay_by_schedules.status === 'pending';
      });

      res.json({ active, defaulted, completed, upcomingPayments, all });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders/reports/bundles", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });
      
      const bundles = await db.query.compoundProducts.findMany({
        where: eq(compoundProducts.companyId, companyId),
        with: { items: { with: { product: true } } },
      });
      res.json({ bundles });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Settings Endpoints
  router.get("/sales-order-settings", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });

      const settings = await db.query.salesOrderSettings.findFirst({
        where: eq(salesOrderSettings.companyId, companyId),
      });

      res.json(settings || {
        companyId,
        airPreorderMinDepositPct: "50.00",
        seaPreorderMinDepositPct: "30.00",
        laybyMinDepositPct: "10.00",
        laybyDefaultDurationMonths: 3,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/sales-order-settings", async (req, res) => {
    try {
      const { companyId, airPreorderMinDepositPct, seaPreorderMinDepositPct, laybyMinDepositPct, laybyDefaultDurationMonths } = req.body;
      if (!companyId) return res.status(400).json({ error: "companyId required" });

      const existing = await db.query.salesOrderSettings.findFirst({
        where: eq(salesOrderSettings.companyId, companyId),
      });

      const values: any = {
        updatedAt: new Date(),
      };
      if (airPreorderMinDepositPct !== undefined) values.airPreorderMinDepositPct = airPreorderMinDepositPct.toString();
      if (seaPreorderMinDepositPct !== undefined) values.seaPreorderMinDepositPct = seaPreorderMinDepositPct.toString();
      if (laybyMinDepositPct !== undefined) values.laybyMinDepositPct = laybyMinDepositPct.toString();
      if (laybyDefaultDurationMonths !== undefined) values.laybyDefaultDurationMonths = parseInt(laybyDefaultDurationMonths);

      let settings;
      if (existing) {
        [settings] = await db.update(salesOrderSettings)
          .set(values)
          .where(eq(salesOrderSettings.companyId, companyId))
          .returning();
      } else {
        [settings] = await db.insert(salesOrderSettings)
          .values({ companyId, ...values })
          .returning();
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 1b. Direct Creation - Enhanced for all order types
  router.post("/sales-orders", async (req, res) => {
    try {
      const {
        companyId, branchId, customerId, items, currency, notes, status,
        orderType = 'cash_and_carry',
        preorderType,
        depositPct,
        depositPaid,
        expectedArrival,
        layByDuration,
      } = req.body;

      let subtotal = 0;
      let taxAmount = 0;

      const newItems = [];
      for (const item of items) {
        let unitPrice = item.unitPrice;
        if (unitPrice === undefined || unitPrice === null) {
          let cp = null;
          if (customerId) {
            cp = await db.query.customerProducts.findFirst({
              where: and(eq(customerProducts.customerId, customerId), eq(customerProducts.productId, item.productId))
            });
          }
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
      const depositPaidNum = parseFloat(depositPaid || '0');
      const remainingBalance = total - depositPaidNum;

      // Fetch company sales order settings if available
      const companySettings = await db.query.salesOrderSettings.findFirst({
        where: eq(salesOrderSettings.companyId, companyId),
      });

      const airMinPct = companySettings ? parseFloat(companySettings.airPreorderMinDepositPct) : 50;
      const seaMinPct = companySettings ? parseFloat(companySettings.seaPreorderMinDepositPct) : 30;

      // Determine approval status for preorders
      let approvalStatus = 'none';
      let initialStatus = status || 'draft';

      if (orderType === 'preorder') {
        initialStatus = 'awaiting_deposit';
        const depositPctNum = parseFloat(depositPct || '0');
        const depositPercentActual = total > 0 ? (depositPaidNum / total) * 100 : 0;
        const minPct = preorderType === 'air' ? airMinPct : seaMinPct;

        if (depositPercentActual >= minPct) {
          approvalStatus = 'approved';
          initialStatus = 'approved';
        } else {
          approvalStatus = 'pending';
          initialStatus = 'awaiting_deposit';
        }
      } else if (orderType === 'lay_by') {
        initialStatus = 'active';
        approvalStatus = 'none';
      }

      const [newOrder] = await db.insert(salesOrders).values({
        companyId,
        branchId: branchId || undefined,
        customerId: customerId || null,
        quotationId: null,
        orderNumber: `SO-${Date.now()}`,
        issueDate: new Date(),
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        status: initialStatus,
        currency: currency || 'USD',
        notes,
        orderType,
        preorderType: preorderType || null,
        depositPct: depositPct ? depositPct.toString() : null,
        depositPaid: depositPaidNum.toString(),
        remainingBalance: remainingBalance.toString(),
        expectedArrival: expectedArrival || null,
        layByDuration: layByDuration || null,
        approvalStatus,
      } as any).returning();

      const orderItemsToInsert = newItems.map(item => ({
        ...item,
        salesOrderId: newOrder.id,
      }));
      if (orderItemsToInsert.length > 0) {
        await db.insert(salesOrderItems).values(orderItemsToInsert);
      }

      // Preorder: create stock reservations
      if (orderType === 'preorder') {
        const reservations = newItems
          .filter(i => i.productId)
          .map(i => ({
            companyId,
            salesOrderId: newOrder.id,
            productId: i.productId!,
            quantityReserved: i.quantity.toString(),
            status: 'reserved',
          }));
        if (reservations.length > 0) {
          await db.insert(stockReservations).values(reservations as any);
        }
      }

      // Lay-by: generate payment schedule
      if (orderType === 'lay_by') {
        const months = layByDuration || 3;
        const scheduleItems = [];
        const now = new Date();

        // 3-month: 40%, 30%, 30%
        // 6-month: 20% each
        const pcts = months === 3 ? [0.4, 0.3, 0.3] : [1/6, 1/6, 1/6, 1/6, 1/6, 1/6];
        let runningTotal = 0;

        for (let i = 0; i < months; i++) {
          const dueDate = new Date(now);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          const isLast = i === months - 1;
          const amt = isLast
            ? total - runningTotal
            : parseFloat((total * pcts[i]).toFixed(2));
          runningTotal += amt;

          scheduleItems.push({
            salesOrderId: newOrder.id,
            instalmentNumber: i + 1,
            dueDate: dueDate.toISOString().split('T')[0],
            amountDue: amt.toString(),
            amountPaid: '0.00',
            status: 'pending',
          });
        }

        if (scheduleItems.length > 0) {
          await db.insert(layBySchedules).values(scheduleItems as any);
        }
      }

      // Record deposit payment in payments table for accounting & customer statements
      if (depositPaidNum > 0) {
        await db.insert(payments).values({
          companyId,
          branchId: branchId || undefined,
          salesOrderId: newOrder.id,
          customerId: customerId || null,
          amount: depositPaidNum.toString(),
          currency: currency || 'USD',
          paymentMethod: req.body.paymentMethod || 'Cash',
          reference: req.body.paymentReference || null,
          notes: `Deposit payment for ${orderType} order ${newOrder.orderNumber}`,
          createdBy: (req as any).user?.id || null,
        } as any);
      }

      const completeOrder = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, newOrder.id),
        with: { items: true },
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
      const {
        orderType, preorderType, depositPct, depositPaid, remainingBalance,
        expectedArrival, layByDuration, approvalStatus
      } = req.body;

      const headerUpdates: any = {};
      if (status !== undefined && status !== order.status) headerUpdates.status = status;
      if (notes !== undefined && notes !== order.notes) headerUpdates.notes = notes;
      if (orderType !== undefined) headerUpdates.orderType = orderType;
      if (preorderType !== undefined) headerUpdates.preorderType = preorderType;
      if (depositPct !== undefined) headerUpdates.depositPct = depositPct?.toString();
      if (depositPaid !== undefined) headerUpdates.depositPaid = depositPaid?.toString();
      if (remainingBalance !== undefined) headerUpdates.remainingBalance = remainingBalance?.toString();
      if (expectedArrival !== undefined) headerUpdates.expectedArrival = expectedArrival;
      if (layByDuration !== undefined) headerUpdates.layByDuration = layByDuration;
      if (approvalStatus !== undefined) headerUpdates.approvalStatus = approvalStatus;

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
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      const typeFilter = req.query.type as string | undefined;
      const approvalFilter = req.query.approvalStatus as string | undefined;

      const conditions = [];
      if (companyId) conditions.push(eq(salesOrders.companyId, companyId));
      if (typeFilter) conditions.push(eq((salesOrders as any).orderType, typeFilter));
      if (approvalFilter) conditions.push(eq((salesOrders as any).approvalStatus, approvalFilter));

      const orders = await db.query.salesOrders.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
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
          layBySchedules: true,
          stockReservations: { with: { product: true } },
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

  router.post("/sales-orders/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const { action, notes } = req.body; // action: 'approve' | 'reject'
      const userId = (req as any).user?.id || null;

      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, parseInt(id))
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if ((order as any).approvalStatus !== 'pending') {
        return res.status(400).json({ error: "Order is not pending approval" });
      }

      const newApprovalStatus = action === 'approve' ? 'approved' : 'rejected';
      let newStatus = (order as any).status;
      if (action === 'approve') {
        // Advance preorder from awaiting_deposit to approved
        if (newStatus === 'awaiting_deposit') newStatus = 'approved';
      } else {
        newStatus = 'cancelled';
      }

      await db.update(salesOrders)
        .set({
          approvalStatus: newApprovalStatus,
          approvedBy: userId,
          approvedAt: new Date(),
          approvalNotes: notes || null,
          status: newStatus,
        } as any)
        .where(eq(salesOrders.id, parseInt(id)));

      res.json({ message: `Order ${action}d successfully` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/sales-orders/:id/record-payment", async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, scheduleId, paymentMethod = 'Cash', paymentReference } = req.body;

      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, parseInt(id))
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if ((order as any).orderType !== 'lay_by') {
        return res.status(400).json({ error: "Only lay-by orders support payment recording" });
      }

      const paidAmount = parseFloat(amount);
      const newDepositPaid = parseFloat((order as any).depositPaid || '0') + paidAmount;
      const total = parseFloat(order.total);
      const newBalance = total - newDepositPaid;

      // Update the schedule instalment if scheduleId provided
      if (scheduleId) {
        const scheduleItem = await db.query.layBySchedules.findFirst({
          where: eq(layBySchedules.id, parseInt(scheduleId))
        });
        if (scheduleItem) {
          const prevPaid = parseFloat(scheduleItem.amountPaid || '0');
          const newSchedulePaid = prevPaid + paidAmount;
          const due = parseFloat(scheduleItem.amountDue);
          const newScheduleStatus = newSchedulePaid >= due ? 'paid' : 'pending';

          await db.update(layBySchedules)
            .set({
              amountPaid: newSchedulePaid.toString(),
              status: newScheduleStatus,
              paymentMethod,
              paymentReference: paymentReference || null,
              paidAt: new Date(),
            })
            .where(eq(layBySchedules.id, parseInt(scheduleId)));
        }
      }

      // Record payment in payments table for statement & accounting integration
      await db.insert(payments).values({
        companyId: order.companyId,
        branchId: order.branchId || undefined,
        salesOrderId: order.id,
        customerId: order.customerId || null,
        amount: paidAmount.toString(),
        currency: order.currency || 'USD',
        paymentMethod: paymentMethod || 'Cash',
        reference: paymentReference || null,
        notes: `Lay-by instalment payment for order ${order.orderNumber}`,
        createdBy: (req as any).user?.id || null,
      } as any);

      // Determine new order status
      let newStatus = (order as any).status;
      if (newBalance <= 0) {
        newStatus = 'completed';
      } else if ((order as any).status === 'active') {
        newStatus = 'active';
      }

      await db.update(salesOrders)
        .set({
          depositPaid: newDepositPaid.toString(),
          remainingBalance: Math.max(0, newBalance).toString(),
          status: newStatus,
        } as any)
        .where(eq(salesOrders.id, parseInt(id)));

      res.json({ message: "Payment recorded", depositPaid: newDepositPaid, remainingBalance: Math.max(0, newBalance) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/sales-orders/:id/receive-goods", async (req, res) => {
    try {
      const { id } = req.params;
      const order = await db.query.salesOrders.findFirst({
        where: eq(salesOrders.id, parseInt(id))
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if ((order as any).orderType !== 'preorder') {
        return res.status(400).json({ error: "Only preorder orders support goods receipt" });
      }

      // Update reservations to allocated
      await db.update(stockReservations)
        .set({ status: 'allocated' })
        .where(eq(stockReservations.salesOrderId, parseInt(id)));

      await db.update(salesOrders)
        .set({ status: 'arrived' } as any)
        .where(eq(salesOrders.id, parseInt(id)));

      res.json({ message: "Goods received, order status updated to arrived" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/lay-by-schedules", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });

      const schedules = await db
        .select()
        .from(layBySchedules)
        .innerJoin(salesOrders, eq(layBySchedules.salesOrderId, salesOrders.id))
        .where(eq(salesOrders.companyId, companyId))
        .orderBy(layBySchedules.dueDate);

      res.json(schedules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/stock-reservations", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });

      const reservations = await db.query.stockReservations.findMany({
        where: eq(stockReservations.companyId, companyId),
        with: { product: true, salesOrder: true },
      });
      res.json(reservations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/compound-products", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (!companyId) return res.status(400).json({ error: "companyId required" });
      const bundles = await db.query.compoundProducts.findMany({
        where: eq(compoundProducts.companyId, companyId),
        with: { items: { with: { product: true } } },
      });
      res.json(bundles);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/compound-products/:id", async (req, res) => {
    try {
      const bundle = await db.query.compoundProducts.findFirst({
        where: eq(compoundProducts.id, parseInt(req.params.id)),
        with: { items: { with: { product: true } } },
      });
      if (!bundle) return res.status(404).json({ error: "Bundle not found" });
      res.json(bundle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/compound-products", async (req, res) => {
    try {
      const { companyId, name, sku, description, sellingPrice, isActive, items } = req.body;
      const [bundle] = await db.insert(compoundProducts).values({
        companyId, name, sku, description,
        sellingPrice: sellingPrice.toString(),
        isActive: isActive !== false,
      }).returning();

      if (items && items.length > 0) {
        await db.insert(compoundProductItems).values(
          items.map((item: any) => ({
            compoundProductId: bundle.id,
            productId: item.productId,
            quantity: item.quantity.toString(),
          }))
        );
      }

      const fullBundle = await db.query.compoundProducts.findFirst({
        where: eq(compoundProducts.id, bundle.id),
        with: { items: { with: { product: true } } },
      });
      res.json(fullBundle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/compound-products/:id", async (req, res) => {
    try {
      const { name, description, sellingPrice, isActive, items } = req.body;
      const bundleId = parseInt(req.params.id);
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (sellingPrice !== undefined) updates.sellingPrice = sellingPrice.toString();
      if (isActive !== undefined) updates.isActive = isActive;
      
      if (Object.keys(updates).length > 0) {
        await db.update(compoundProducts).set(updates).where(eq(compoundProducts.id, bundleId));
      }

      // Replace items if provided
      if (items !== undefined) {
        await db.delete(compoundProductItems).where(eq(compoundProductItems.compoundProductId, bundleId));
        if (items.length > 0) {
          await db.insert(compoundProductItems).values(
            items.map((item: any) => ({
              compoundProductId: bundleId,
              productId: item.productId,
              quantity: item.quantity.toString(),
            }))
          );
        }
      }

      const fullBundle = await db.query.compoundProducts.findFirst({
        where: eq(compoundProducts.id, bundleId),
        with: { items: { with: { product: true } } },
      });
      res.json(fullBundle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
