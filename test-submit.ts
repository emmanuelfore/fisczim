import fs from 'fs';

async function run() {
  const loginRes = await fetch("http://localhost:5001/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "password" })
  });
  
  if (!loginRes.ok) {
    console.log("Could not log in:", await loginRes.text());
    // try default user?
  }
  const cookie = loginRes.headers.get("set-cookie") || "";

  const payload = {
    supplierId: 1, // Assume supplier ID 1 exists
    invoiceNumber: "TEST-" + Date.now(),
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
    items: [
      {
        description: "Test Line",
        quantity: 1,
        unitCost: "100.00",
        totalPrice: "100.00",
        taxAmount: "0.00",
        taxInclusive: true
      }
    ]
  };

  const res = await fetch("http://localhost:5001/api/companies/87/supplier-invoices", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Cookie": cookie
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}

run().catch(console.error);
