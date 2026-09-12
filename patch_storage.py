import re

with open('server/storage.ts', 'r') as f:
    content = f.read()

# We need to replace the subtotal/tax variables and the debitAccountCode logic with an iteration over items.

target = """      // Automated Journaling: Credit Accounts Payable (2000), Debit Inventory (1300) or appropriate account
      const subtotal = invoiceTotal - invoiceTax;
      const tax = invoiceTax;

      // Determine the debit account for the invoice:
      // - If matched to a GDN (3-way match): Dr GRNI (2010) to clear the liability posted at goods receipt
      // - If explicit debit account provided: use that (e.g. for expense invoices)
      // - Otherwise: fall back to Inventory (1300) for direct inventory purchases without a GRV
      let debitAccountCode: string;
      if (invoiceData.referenceGdnId) {
        debitAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "grniAccountCode", tx);
      } else if (invoiceData.debitAccountId) {
        const [acc] = await tx.select().from(accounts).where(eq(accounts.id, invoiceData.debitAccountId));
        debitAccountCode = acc ? acc.code : await this.getSystemAccountCode(invoiceData.companyId, "inventoryAccountCode", tx);
      } else {
        debitAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "inventoryAccountCode", tx);
      }
      const vatInputAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "vatInputAccountCode", tx);
      const apAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "accountsPayableCode", tx);

      const lines: { accountCode: string, type: 'DEBIT'|'CREDIT', amount: number }[] = [
        { accountCode: debitAccountCode, type: 'DEBIT', amount: subtotal }
      ];
      
      if (tax > 0) {
        lines.push({ accountCode: vatInputAccountCode, type: 'DEBIT', amount: tax }); // VAT Input (VAT Receivable)
      }

      lines.push({ accountCode: apAccountCode, type: 'CREDIT', amount: invoiceTotal }); // Accounts Payable"""

replacement = """      const vatInputAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "vatInputAccountCode", tx);
      const apAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "accountsPayableCode", tx);
      const defaultInventoryCode = await this.getSystemAccountCode(invoiceData.companyId, "inventoryAccountCode", tx);
      const grniAccountCode = await this.getSystemAccountCode(invoiceData.companyId, "grniAccountCode", tx);

      const lines: { accountCode: string, type: 'DEBIT'|'CREDIT', amount: number }[] = [];
      let totalRecoverableTax = 0;
      let totalAP = invoiceTotal;

      if (items && items.length > 0) {
        for (const item of items) {
          const itemTotal = Number(item.totalPrice || 0);
          const itemTax = Number(item.taxAmount || 0);
          const itemBase = invoiceData.taxInclusive ? itemTotal - itemTax : itemTotal;

          let lineAccountCode = defaultInventoryCode;
          if (invoiceData.referenceGdnId) {
            lineAccountCode = grniAccountCode;
          } else if (item.accountCode) {
            lineAccountCode = item.accountCode;
          } else if (invoiceData.debitAccountId) {
             const [acc] = await tx.select().from(accounts).where(eq(accounts.id, invoiceData.debitAccountId));
             if (acc) lineAccountCode = acc.code;
          }

          let amountToCapitalize = itemBase;
          if (itemTax > 0) {
            if (item.isRecoverable !== false) { // Default true
              totalRecoverableTax += itemTax;
            } else {
              amountToCapitalize += itemTax; // Non-recoverable tax gets added to expense/inventory
            }
          }

          lines.push({ accountCode: lineAccountCode, type: 'DEBIT', amount: amountToCapitalize });
        }
      } else {
         // Fallback if no items were provided (legacy invoices)
         const subtotal = invoiceTotal - invoiceTax;
         let debitAccountCode = defaultInventoryCode;
         if (invoiceData.referenceGdnId) {
            debitAccountCode = grniAccountCode;
         } else if (invoiceData.debitAccountId) {
            const [acc] = await tx.select().from(accounts).where(eq(accounts.id, invoiceData.debitAccountId));
            if (acc) debitAccountCode = acc.code;
         }
         lines.push({ accountCode: debitAccountCode, type: 'DEBIT', amount: subtotal });
         if (invoiceTax > 0) {
           totalRecoverableTax += invoiceTax;
         }
      }

      if (totalRecoverableTax > 0) {
        lines.push({ accountCode: vatInputAccountCode, type: 'DEBIT', amount: totalRecoverableTax });
      }

      lines.push({ accountCode: apAccountCode, type: 'CREDIT', amount: invoiceTotal });"""

if target in content:
    content = content.replace(target, replacement)
    with open('server/storage.ts', 'w') as f:
        f.write(content)
    print("Patched createSupplierInvoice successfully")
else:
    print("Target not found")

