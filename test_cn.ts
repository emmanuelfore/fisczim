import { db } from './server/db.js';
import { storage } from './server/storage.js';

async function main() {
  try {
    const originalInvoice = await storage.getInvoice(11873);
    if (!originalInvoice) {
      console.log("Invoice 11873 not found");
      process.exit(0);
    }
    
    console.log("Original Invoice:", originalInvoice.id);

    const cnItems = originalInvoice.items.map(item => ({
      productId: item.productId,
      description: item.description,
      quantity: 1, // partial return
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      taxTypeId: item.taxTypeId,
      lineTotal: "4.50"
    }));

    const cn = await storage.createInvoice({
      companyId: originalInvoice.companyId,
      customerId: originalInvoice.customerId,
      issueDate: new Date(),
      dueDate: new Date(),
      subtotal: "4.50",
      taxAmount: "0.00",
      total: "4.50",
      status: "draft",
      taxInclusive: originalInvoice.taxInclusive,
      currency: originalInvoice.currency,
      transactionType: "CreditNote",
      relatedInvoiceId: originalInvoice.id,
      notes: "fake money",
      items: cnItems,
      isPos: true
    });
    console.log("Credit note created:", cn.id);

  } catch (error) {
    console.error("Credit Note Error:", error);
  }
  process.exit(0);
}
main();
