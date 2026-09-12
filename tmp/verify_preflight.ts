// Simulates prepareReceipt + preflight total math for INV-890408 and a credit note
const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function expectedReceiptTotal(lines: any[], taxInclusive: boolean, receiptType: string) {
  const buckets = new Map<string, { taxPercent: number; taxID: number; baseTotal: number }>();
  for (const line of lines) {
    const lineTotal = line.receiptLineQuantity * line.receiptLinePrice;
    const absTotal = receiptType === "CreditNote" ? -Math.abs(roundMoney(lineTotal)) : roundMoney(lineTotal);
    const taxPercent = Number(line.taxPercent || 0);
    const taxID = Number(line.taxID || 0);
    const key = `${taxPercent}-${taxID}`;
    if (!buckets.has(key)) buckets.set(key, { taxPercent, taxID, baseTotal: 0 });
    buckets.get(key)!.baseTotal += Math.abs(absTotal);
  }
  let expectedTotal = 0;
  for (const bucket of buckets.values()) {
    if (taxInclusive) {
      expectedTotal += roundMoney(bucket.baseTotal);
    } else {
      const netTotal = roundMoney(bucket.baseTotal);
      const tax = bucket.taxPercent ? roundMoney(netTotal * (bucket.taxPercent / 100)) : 0;
      expectedTotal += roundMoney(netTotal + tax);
    }
  }
  expectedTotal = roundMoney(expectedTotal);
  return receiptType === "CreditNote" ? -Math.abs(expectedTotal) : expectedTotal;
}

const lines = [
  { receiptLineQuantity: 24, receiptLinePrice: 2.3, taxPercent: 15.5, taxID: 515 },
  { receiptLineQuantity: 12, receiptLinePrice: 2.3, taxPercent: 15.5, taxID: 515 },
  { receiptLineQuantity: 12, receiptLinePrice: 1.1, taxPercent: 15.5, taxID: 515 },
  { receiptLineQuantity: 12, receiptLinePrice: 1.1, taxPercent: 15.5, taxID: 515 },
  { receiptLineQuantity: 24, receiptLinePrice: 2.3, taxPercent: 15.5, taxID: 515 },
  { receiptLineQuantity: 24, receiptLinePrice: 2.5, taxPercent: 15.5, taxID: 515 },
];
console.log("Invoice expected total (want 259.18):", expectedReceiptTotal(lines, false, "FiscalInvoice"));

const cnLines = lines.map((l) => ({ ...l }));
console.log("CN expected total (want -259.18):", expectedReceiptTotal(cnLines, false, "CreditNote"));

const mixed = [
  { receiptLineQuantity: 10, receiptLinePrice: 10, taxPercent: 15.5, taxID: 515 },
  { receiptLineQuantity: 5, receiptLinePrice: 2, taxPercent: 0, taxID: 2 },
];
console.log("Mixed-rate expected (want 115.50+10=125.50):", expectedReceiptTotal(mixed, false, "FiscalInvoice"));

const inclusive = [{ receiptLineQuantity: 1, receiptLinePrice: 115.5, taxPercent: 15.5, taxID: 515 }];
console.log("Inclusive expected (want 115.50):", expectedReceiptTotal(inclusive, true, "FiscalInvoice"));
