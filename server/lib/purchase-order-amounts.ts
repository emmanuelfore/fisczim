type PurchaseOrderLineAmounts = {
  quantity: number | string;
  unitCost: number | string;
  taxRate?: number | string | null;
  taxAmount?: number | string | null;
};

export function calculatePurchaseOrderLineTax(line: PurchaseOrderLineAmounts, taxInclusive: boolean): string {
  const base = Number(Number(line.quantity).toFixed(2)) * Number(Number(line.unitCost).toFixed(2));
  const rate = Number(Number(line.taxRate ?? 0).toFixed(2)) / 100;
  return (taxInclusive ? base - base / (1 + rate) : base * rate).toFixed(2);
}

/** Approval uses the gross payable amount in the purchase order's currency. */
export function purchaseOrderApprovalTotal(lines: PurchaseOrderLineAmounts[], taxInclusive: boolean): number {
  let cents = 0;
  for (const line of lines) {
    const baseCents = Math.round(Number(Number(line.quantity).toFixed(2)) * Number(Number(line.unitCost).toFixed(2)) * 100);
    const tax = Math.max(Number(line.taxAmount ?? 0), Number(calculatePurchaseOrderLineTax(line, taxInclusive)));
    cents += baseCents + (taxInclusive ? 0 : Math.round(tax * 100));
  }
  return cents / 100;
}
