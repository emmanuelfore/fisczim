export type MatchLine = {
  quantity: any;
  unitCost?: any;
  unitPrice?: any;
  totalPrice?: any;
  taxAmount?: any;
};

// Documents store their line totals, but a unit price is rounded to 2dp when the line is
// written. Re-deriving the total from that rounded price drifts far enough to trip the
// matching tolerance, so the stored total is authoritative where one exists.
export function matchLineTotal(line: MatchLine): number {
  return Number(
    line.totalPrice ??
      Number(line.quantity || 0) * Number(line.unitCost ?? line.unitPrice ?? 0),
  );
}

export function matchQuantityTotal(lines: MatchLine[]): number {
  return lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
}

export function matchCostTotal(lines: MatchLine[]): number {
  return lines.reduce((sum, line) => sum + matchLineTotal(line), 0);
}

const TOLERANCE = 0.01;

export type MatchingStatus = "MATCHED" | "QTY_MISMATCH" | "PRICE_VARIANCE" | "PENDING_INVOICE";

export function threeWayMatchStatus(
  poLines: MatchLine[] | null,
  grvQuantity: number,
  grvCost: number,
  invLines: MatchLine[] | null,
): MatchingStatus {
  if (!invLines) return "PENDING_INVOICE";

  const grvQty = Number(grvQuantity || 0);
  const grvTotal = Number(grvCost || 0);
  const invQty = matchQuantityTotal(invLines);
  const invCost = matchCostTotal(invLines);

  if (poLines) {
    const poQty = matchQuantityTotal(poLines);
    const poCost = matchCostTotal(poLines);
    if (Math.abs(poQty - grvQty) > TOLERANCE || Math.abs(grvQty - invQty) > TOLERANCE) {
      return "QTY_MISMATCH";
    }
    if (Math.abs(poCost - grvTotal) > TOLERANCE || Math.abs(grvTotal - invCost) > TOLERANCE) {
      return "PRICE_VARIANCE";
    }
    return "MATCHED";
  }

  if (Math.abs(grvQty - invQty) > TOLERANCE) return "QTY_MISMATCH";
  if (Math.abs(grvTotal - invCost) > TOLERANCE) return "PRICE_VARIANCE";
  return "MATCHED";
}

export type PurchaseOrderTotals = {
  taxInclusive: boolean | null | undefined;
  currency?: string | null;
};

// purchase_orders carries no total column; the authorised amount is derived from its lines
// so that a bill is compared gross against gross.
export function purchaseOrderGrossTotal(
  po: PurchaseOrderTotals,
  lines: MatchLine[],
): number {
  const net = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0,
  );
  if (po.taxInclusive) return net;
  return net + lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0);
}
