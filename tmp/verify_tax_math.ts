const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function newPrepareReceiptTaxes(lines: { receiptLineTotal: number; taxPercent?: number; taxID: number }[], taxInclusive: boolean) {
  const taxMap = new Map<string, { taxPercent?: number; taxID: number; baseTotal: number }>();
  for (const line of lines) {
    const key = `${line.taxPercent}-${line.taxID}`;
    if (!taxMap.has(key)) taxMap.set(key, { taxPercent: line.taxPercent, taxID: line.taxID, baseTotal: 0 });
    taxMap.get(key)!.baseTotal += line.receiptLineTotal;
  }
  const taxes: any[] = [];
  for (const t of taxMap.values()) {
    let salesAmountWithTax = 0, taxAmount = 0;
    if (taxInclusive) {
      salesAmountWithTax = Math.round(t.baseTotal * 100) / 100;
      if (t.taxPercent) {
        const rate = t.taxPercent / 100;
        taxAmount = Math.round((salesAmountWithTax - salesAmountWithTax / (1 + rate)) * 100) / 100;
      }
    } else {
      const netTotal = Math.round(t.baseTotal * 100) / 100;
      if (t.taxPercent) {
        taxAmount = Math.round(netTotal * (t.taxPercent / 100) * 100) / 100;
        salesAmountWithTax = Math.round((netTotal + taxAmount) * 100) / 100;
      } else {
        salesAmountWithTax = netTotal;
      }
    }
    taxes.push({ taxPercent: t.taxPercent, taxID: t.taxID, taxAmount, salesAmountWithTax });
  }
  const total = roundMoney(taxes.reduce((a, t) => a + t.salesAmountWithTax, 0));
  return { taxes, total };
}

// INV-890408: 6 lines @ 15.5%, totals 55.20, 27.60, 13.20, 13.20, 55.20, 60.00
const inv890408 = [
  { receiptLineTotal: 55.2, taxPercent: 15.5, taxID: 515 },
  { receiptLineTotal: 27.6, taxPercent: 15.5, taxID: 515 },
  { receiptLineTotal: 13.2, taxPercent: 15.5, taxID: 515 },
  { receiptLineTotal: 13.2, taxPercent: 15.5, taxID: 515 },
  { receiptLineTotal: 55.2, taxPercent: 15.5, taxID: 515 },
  { receiptLineTotal: 60.0, taxPercent: 15.5, taxID: 515 },
];
const r1 = newPrepareReceiptTaxes(inv890408, false);
console.log("INV-890408 (expected: tax 34.78, sales 259.18):", JSON.stringify(r1));

// Multi-rate invoice: 100@15.5 + 50@0 (zero rated)
const multi = [
  { receiptLineTotal: 100, taxPercent: 15.5, taxID: 515 },
  { receiptLineTotal: 50, taxPercent: 0, taxID: 2 },
];
const r2 = newPrepareReceiptTaxes(multi, false);
console.log("Multi-rate (expected: 15.50 tax / 115.50 + 50 = 165.50):", JSON.stringify(r2));

// Tax-inclusive single bucket: net embedded at 15.5%
const r3 = newPrepareReceiptTaxes([{ receiptLineTotal: 115.5, taxPercent: 15.5, taxID: 515 }], true);
console.log("Inclusive 115.50 @15.5% (expected tax 15.50, sales 115.50):", JSON.stringify(r3));

// 3-cent rounding trap: 0.01 each at 15.5%, qty many
const tiny = Array.from({ length: 100 }, () => ({ receiptLineTotal: 1.01, taxPercent: 15.5, taxID: 515 }));
const r4 = newPrepareReceiptTaxes(tiny, false);
console.log("100 x 1.01 @15.5% (net 101.00, tax 15.66):", JSON.stringify(r4));
