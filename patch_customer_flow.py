import re

with open("server/routes/customer-flow.ts", "r") as f:
    text = f.read()

# Allocation Patch
allocation_regex = re.compile(
    r'(?P<start>router\.post\("/sales-orders/:id/allocate", async \(req, res\) => \{\s*try \{\s*const \{ id \} = req\.params;\s*const \{ stockId, quantity \} = req\.body;\s*const order = await db\.query\.salesOrders\.findFirst\(\{\s*where: eq\(salesOrders\.id, parseInt\(id\)\)\s*\}\);\s*if \(!order\) return res\.status\(404\)\.json\(\{ error: "Sales Order not found" \}\);\s*const stock = await db\.query\.customerStock\.findFirst\(\{\s*where: eq\(customerStock\.id, stockId\)\s*\}\);\s*if \(!stock\) return res\.status\(404\)\.json\(\{ error: "Stock not found" \}\);\s*// STRICT OWNERSHIP CHECK\s*if \(stock\.customerId !== null && stock\.customerId !== order\.customerId\) \{\s*return res\.status\(403\)\.json\(\{ error: "Cannot allocate another customer\'s exclusive stock to this order\." \}\);\s*\})(?P<rest>.*?)(?P<end>res\.json\(\{ message: "Stock allocated successfully" \}\);\s*\} catch \(error: any\) \{)',
    re.DOTALL
)

def replace_alloc(match):
    return match.group("start") + """
      const allocResult = await db.execute(sql`
        SELECT COALESCE(SUM(quantity_allocated), 0) AS total_allocated
        FROM stock_allocations
        WHERE stock_id = ${stockId} AND released_at IS NULL
      `);
      
      const totalAllocated = Number(allocResult.rows[0].total_allocated || 0);
      const availableQuantity = Number(stock.quantity) - totalAllocated;

      if (availableQuantity < Number(quantity)) {
        return res.status(400).json({ error: `Insufficient stock. On hand: ${stock.quantity}, Available: ${availableQuantity}` });
      }
      
      const orderLines = await db.query.salesOrderItems.findMany({
        where: and(
           eq(salesOrderItems.salesOrderId, order.id),
           eq(salesOrderItems.productId, stock.productId)
        )
      });
      
      if (orderLines.length === 0) {
        return res.status(400).json({ error: "Order does not contain the product for this stock ID." });
      }
      const orderLineId = orderLines[0].id; // Assign to first matching line

      await db.insert(stockAllocations).values({
        stockId,
        salesOrderLineId: orderLineId,
        quantityAllocated: quantity.toString()
      });

      // Update line status
      await db.update(salesOrderItems).set({ status: "allocated" }).where(eq(salesOrderItems.id, orderLineId));

      """ + match.group("end")

text = allocation_regex.sub(replace_alloc, text)

# Invoice Patch
invoice_regex = re.compile(
    r'(?P<start>const taxAmt = lineTotal \* \(Number\(orderLine\.taxRate\) / 100\);\s*invoiceSubtotal \+= lineTotal;\s*invoiceTax \+= taxAmt;\s*return \{\s*productId: orderLine\.productId,\s*salesOrderItemId: orderLine\.id,\s*description: orderLine\.description,\s*quantity: reqItem\.quantityToInvoice,\s*unitPrice: orderLine\.unitPrice,\s*taxRate: orderLine\.taxRate,\s*lineTotal: lineTotal\.toString\(\),\s*discountAmount: "0",\s*taxTypeId: null,\s*cogsAmount: "0"\s*\};\s*\});\s+)(?P<rest>const \[newInvoice\] = await db\.insert\(invoices\).*?)(?P<end>res\.json\(newInvoice\);\s*\} catch \(err\) \{)',
    re.DOTALL
)

def replace_invoice(match):
    return match.group("start") + match.group("rest") + """
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
      """ + match.group("end")

text = invoice_regex.sub(replace_invoice, text)

with open("server/routes/customer-flow.ts", "w") as f:
    f.write(text)
print("Patched!")
