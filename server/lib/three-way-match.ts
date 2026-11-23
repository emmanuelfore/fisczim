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

export type MatchingStatus =
  | "MATCHED"
  | "QTY_MISMATCH"
  | "PRICE_VARIANCE"
  | "PENDING_INVOICE"
  | "NO_PO"
  | "WAIVED";

/**
 * Legacy status helper. Kept for existing callers/tests; use evaluateThreeWayMatch
 * for new writes because it is line-level, tax-aware and supports explicit tolerances.
 */
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

// ---------------------------------------------------------------------------
// Enterprise matcher: line-level, tax-aware, with explicit tolerances.
// ---------------------------------------------------------------------------

export type DetailedMatchLine = MatchLine & {
  productId?: number | string | null;
  description?: string | null;
  taxInclusive?: boolean | null;
};

export type NormalizedMatchLine = {
  key: string;
  quantity: number;
  grossTotal: number;
  taxAmount: number;
  netTotal: number;
  netUnitPrice: number;
};

export type ThreeWayMatchInput = {
  poLines: DetailedMatchLine[] | null;
  poTaxInclusive?: boolean | null;
  grvLines: DetailedMatchLine[] | null;
  grvTaxInclusive?: boolean | null;
  invoiceLines: DetailedMatchLine[] | null;
  invoiceTaxInclusive?: boolean | null;
};

export type ThreeWayMatchOptions = {
  quantityTolerance?: number;
  priceToleranceAbs?: number;
  priceToleranceRate?: number;
};

export type LineMatchResult = {
  key: string;
  poQuantity: number;
  grvQuantity: number;
  invoiceQuantity: number;
  quantityVariance: number;
  poUnitPrice: number;
  grvUnitPrice: number;
  invoiceUnitPrice: number;
  priceVariance: number;
  status: "MATCHED" | "QTY_MISMATCH" | "PRICE_VARIANCE";
};

export type ThreeWayMatchDetail = {
  status: MatchingStatus;
  quantityVariance: number;
  priceVariance: number;
  poNetTotal: number;
  grvNetTotal: number;
  invoiceNetTotal: number;
  lines: LineMatchResult[];
};

export function matchLineKey(line: DetailedMatchLine, ordinal = 0): string {
  if (line.productId !== null && line.productId !== undefined && String(line.productId) !== "") {
    return `product:${String(line.productId)}`;
  }
  const description = String(line.description ?? "").trim().toLowerCase();
  return description ? `description:${description}` : `line:${ordinal}`;
}

export function normalizeMatchLine(
  line: DetailedMatchLine,
  taxInclusiveDefault = false,
  ordinal = 0,
): NormalizedMatchLine {
  const quantity = Number(line.quantity || 0);
  const grossTotal = matchLineTotal(line);
  const taxAmount = Number(line.taxAmount || 0);
  const taxInclusive = line.taxInclusive ?? taxInclusiveDefault;
  const netTotal = taxInclusive ? grossTotal - taxAmount : grossTotal;
  return {
    key: matchLineKey(line, ordinal),
    quantity,
    grossTotal,
    taxAmount,
    netTotal,
    netUnitPrice: quantity > 0 ? netTotal / quantity : 0,
  };
}

function normalizeLines(
  lines: DetailedMatchLine[] | null,
  taxInclusive: boolean | null | undefined,
): Map<string, NormalizedMatchLine> {
  const map = new Map<string, NormalizedMatchLine>();
  for (const [index, line] of (lines || []).entries()) {
    const normalized = normalizeMatchLine(line, !!taxInclusive, index);
    const existing = map.get(normalized.key);
    if (!existing) {
      map.set(normalized.key, normalized);
      continue;
    }
    const quantity = existing.quantity + normalized.quantity;
    const netTotal = existing.netTotal + normalized.netTotal;
    map.set(normalized.key, {
      ...existing,
      quantity,
      netTotal,
      grossTotal: existing.grossTotal + normalized.grossTotal,
      taxAmount: existing.taxAmount + normalized.taxAmount,
      netUnitPrice: quantity > 0 ? netTotal / quantity : 0,
    });
  }
  return map;
}

const EMPTY_LINE: NormalizedMatchLine = {
  key: "",
  quantity: 0,
  grossTotal: 0,
  taxAmount: 0,
  netTotal: 0,
  netUnitPrice: 0,
};

export function evaluateThreeWayMatch(
  input: ThreeWayMatchInput,
  options: ThreeWayMatchOptions = {},
): ThreeWayMatchDetail {
  const quantityTolerance = Math.max(0, options.quantityTolerance ?? TOLERANCE);
  const priceToleranceAbs = Math.max(0, options.priceToleranceAbs ?? TOLERANCE);
  const priceToleranceRate = Math.max(0, options.priceToleranceRate ?? 0);

  const poMap = normalizeLines(input.poLines, input.poTaxInclusive);
  const grvMap = normalizeLines(input.grvLines, input.grvTaxInclusive);
  const invMap = normalizeLines(input.invoiceLines, input.invoiceTaxInclusive);

  const poNetTotal = [...poMap.values()].reduce((sum, line) => sum + line.netTotal, 0);
  const grvNetTotal = [...grvMap.values()].reduce((sum, line) => sum + line.netTotal, 0);
  const invoiceNetTotal = [...invMap.values()].reduce((sum, line) => sum + line.netTotal, 0);

  if (!input.invoiceLines) {
    return {
      status: "PENDING_INVOICE",
      quantityVariance: 0,
      priceVariance: 0,
      poNetTotal,
      grvNetTotal,
      invoiceNetTotal,
      lines: [],
    };
  }

  if (!input.poLines) {
    const keys = new Set([...grvMap.keys(), ...invMap.keys()]);
    const lines: LineMatchResult[] = [];
    let quantityVariance = 0;
    let priceVariance = 0;
    let status: MatchingStatus = "MATCHED";

    for (const key of keys) {
      const grv = grvMap.get(key) || EMPTY_LINE;
      const inv = invMap.get(key) || EMPTY_LINE;
      const qtyVar = Math.abs(grv.quantity - inv.quantity);
      const unitTol = Math.max(priceToleranceAbs, priceToleranceRate * grv.netUnitPrice);
      const unitVar = Math.abs(grv.netUnitPrice - inv.netUnitPrice);
      quantityVariance += qtyVar;
      priceVariance += Math.abs(grv.netTotal - inv.netTotal);
      const lineStatus = qtyVar > quantityTolerance
        ? "QTY_MISMATCH"
        : unitVar > unitTol
          ? "PRICE_VARIANCE"
          : "MATCHED";
      if (lineStatus !== "MATCHED") status = lineStatus;
      lines.push({
        key,
        poQuantity: 0,
        grvQuantity: grv.quantity,
        invoiceQuantity: inv.quantity,
        quantityVariance: qtyVar,
        poUnitPrice: 0,
        grvUnitPrice: grv.netUnitPrice,
        invoiceUnitPrice: inv.netUnitPrice,
        priceVariance: unitVar,
        status: lineStatus,
      });
    }
    if (status === "MATCHED" && Math.abs(grvNetTotal - invoiceNetTotal) > Math.max(priceToleranceAbs, priceToleranceRate * grvNetTotal)) {
      status = "PRICE_VARIANCE";
    }
    return { status, quantityVariance, priceVariance, poNetTotal, grvNetTotal, invoiceNetTotal, lines };
  }

  const keys = new Set([...poMap.keys(), ...grvMap.keys(), ...invMap.keys()]);
  const lines: LineMatchResult[] = [];
  let quantityVariance = 0;
  let priceVariance = 0;
  let status: MatchingStatus = "MATCHED";

  for (const key of keys) {
    const po = poMap.get(key) || EMPTY_LINE;
    const grv = grvMap.get(key) || EMPTY_LINE;
    const inv = invMap.get(key) || EMPTY_LINE;

    // Over-receipt is always a mismatch. Short receipt is allowed and treated as partial.
    const qtyVar = Math.max(grv.quantity - po.quantity, Math.abs(grv.quantity - inv.quantity));
    const unitTol = Math.max(priceToleranceAbs, priceToleranceRate * Math.max(po.netUnitPrice, grv.netUnitPrice));
    const poInvUnitVar = Math.abs(po.netUnitPrice - inv.netUnitPrice);
    const grvInvUnitVar = Math.abs(grv.netUnitPrice - inv.netUnitPrice);
    const unitVar = Math.max(poInvUnitVar, grvInvUnitVar);

    quantityVariance += Math.max(0, qtyVar);
    priceVariance += Math.abs(grv.netTotal - inv.netTotal);

    const lineStatus: LineMatchResult["status"] =
      qtyVar > quantityTolerance
        ? "QTY_MISMATCH"
        : unitVar > unitTol
          ? "PRICE_VARIANCE"
          : "MATCHED";

    if (lineStatus !== "MATCHED") status = lineStatus;

    lines.push({
      key,
      poQuantity: po.quantity,
      grvQuantity: grv.quantity,
      invoiceQuantity: inv.quantity,
      quantityVariance: qtyVar,
      poUnitPrice: po.netUnitPrice,
      grvUnitPrice: grv.netUnitPrice,
      invoiceUnitPrice: inv.netUnitPrice,
      priceVariance: unitVar,
      status: lineStatus,
    });
  }

  const totalPriceTol = Math.max(priceToleranceAbs, priceToleranceRate * Math.max(poNetTotal, grvNetTotal));
  if (status === "MATCHED" && Math.abs(grvNetTotal - invoiceNetTotal) > totalPriceTol) {
    status = "PRICE_VARIANCE";
  }

  return { status, quantityVariance, priceVariance, poNetTotal, grvNetTotal, invoiceNetTotal, lines };
}
