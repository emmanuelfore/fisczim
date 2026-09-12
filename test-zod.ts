import { insertSupplierInvoiceSchema } from "./shared/schema.js";

const body = {
  supplierId: 1,
  invoiceNumber: "123",
  date: new Date().toISOString(),
  dueDate: null,
  totalAmount: "100.00",
  subtotalAmount: "100.00",
  taxAmount: "0.00",
  taxInclusive: true,
  currency: "USD",
  purchaseOrderId: undefined,
  transactionType: "Invoice",
  referenceInvoiceId: null,
  grvReference: undefined,
  notes: undefined,
  status: "unpaid",
  items: []
};

const companyId = 87;

const payload = {
  ...body,
  date: new Date(body.date),
  dueDate: undefined,
  companyId,
  purchaseOrderId: null,
  grvReference: null,
};

try {
  insertSupplierInvoiceSchema.parse(payload);
  console.log("Success");
} catch (e) {
  console.log(e);
}
