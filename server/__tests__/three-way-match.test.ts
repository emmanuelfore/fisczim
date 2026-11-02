/**
 * Tests for the PO / GRV / supplier-bill three-way matcher (server/lib/three-way-match.ts).
 * Pure functions — no database required.
 */
import { describe, expect, test } from "vitest";

import {
  purchaseOrderGrossTotal,
  threeWayMatchStatus,
} from "../lib/three-way-match.js";

// PO-20261022-112616: 2x75 + 1x95 + 2x50, tax exclusive, no VAT charged
const poLines = [
  { quantity: "2.00", unitCost: "75.00", taxAmount: "0.00" },
  { quantity: "1.00", unitCost: "95.00", taxAmount: "0.00" },
  { quantity: "2.00", unitCost: "50.00", taxAmount: "0.00" },
];

describe("purchaseOrderGrossTotal", () => {
  test("derives the authorised amount from lines, not a missing total column", () => {
    expect(purchaseOrderGrossTotal({ taxInclusive: false }, poLines)).toBe(345);
  });

  test("adds line VAT when the order is tax exclusive", () => {
    const withVat = [
      { quantity: "10.00", unitCost: "100.00", taxAmount: "150.00" },
    ];
    expect(purchaseOrderGrossTotal({ taxInclusive: false }, withVat)).toBe(1150);
  });

  test("does not double-count VAT on a tax inclusive order", () => {
    const inclusive = [{ quantity: "10.00", unitCost: "115.00", taxAmount: "150.00" }];
    expect(purchaseOrderGrossTotal({ taxInclusive: true }, inclusive)).toBe(1150);
  });

  test("a 15% VAT bill on an exclusive order stays inside the 5% tolerance", () => {
    const exclusive = [{ quantity: "10.00", unitCost: "100.00", taxAmount: "150.00" }];
    const gross = purchaseOrderGrossTotal({ taxInclusive: false }, exclusive);
    expect(gross).toBe(1150);
    expect(1150).lessThanOrEqual(gross * 1.05);
  });

  test("an order with no lines authorises nothing", () => {
    expect(purchaseOrderGrossTotal({ taxInclusive: false }, [])).toBe(0);
  });
});

describe("threeWayMatchStatus", () => {
  const grvLines = [
    { quantity: 2, unitCost: 75 },
    { quantity: 1, unitCost: 95 },
    { quantity: 2, unitCost: 50 },
  ];
  const grvQty = grvLines.reduce((s, l) => s + l.quantity, 0);
  const grvCost = grvLines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  test("waits for a bill rather than matching against nothing", () => {
    expect(threeWayMatchStatus(poLines, grvQty, grvCost, null)).toBe("PENDING_INVOICE");
  });

  test("matches PO, GRV and bill when all three agree", () => {
    const bill = [
      { quantity: "2.0000", unitPrice: "75.00", totalPrice: "150.00" },
      { quantity: "1.0000", unitPrice: "95.00", totalPrice: "95.00" },
      { quantity: "2.0000", unitPrice: "50.00", totalPrice: "100.00" },
    ];
    expect(threeWayMatchStatus(poLines, grvQty, grvCost, bill)).toBe("MATCHED");
  });

  test("ignores the rounding drift from a 2dp unit price by using the stored line total", () => {
    // 100.00 split over 7 units rounds to 14.29; re-deriving 7 x 14.29 = 100.03 would flag a variance
    const grv = { quantity: 7, cost: 100 };
    const bill = [{ quantity: "7.0000", unitPrice: "14.29", totalPrice: "100.00" }];
    expect(threeWayMatchStatus(null, grv.quantity, grv.cost, bill)).toBe("MATCHED");

    const noStoredTotal = [{ quantity: "7.0000", unitPrice: "14.29" }];
    expect(threeWayMatchStatus(null, grv.quantity, grv.cost, noStoredTotal)).toBe(
      "PRICE_VARIANCE",
    );
  });

  test("reports a quantity mismatch before a price variance", () => {
    const short = [{ quantity: "4.0000", unitPrice: "69.00", totalPrice: "276.00" }];
    expect(threeWayMatchStatus(poLines, grvQty, grvCost, short)).toBe("QTY_MISMATCH");
  });

  test("reports a price variance when quantities agree but the bill costs more", () => {
    const dearer = [
      { quantity: "2.0000", unitPrice: "80.00", totalPrice: "160.00" },
      { quantity: "1.0000", unitPrice: "95.00", totalPrice: "95.00" },
      { quantity: "2.0000", unitPrice: "50.00", totalPrice: "100.00" },
    ];
    expect(threeWayMatchStatus(poLines, grvQty, grvCost, dearer)).toBe("PRICE_VARIANCE");
  });

  test("matches on quantity and value alone for a GRV with no purchase order", () => {
    const bill = [{ quantity: "5.0000", unitPrice: "69.00", totalPrice: "345.00" }];
    expect(threeWayMatchStatus(null, grvQty, grvCost, bill)).toBe("MATCHED");
    expect(threeWayMatchStatus(null, grvQty, 400, bill)).toBe("PRICE_VARIANCE");
  });

  test("treats an empty bill as a mismatch rather than a match against a zero total", () => {
    expect(threeWayMatchStatus(poLines, grvQty, grvCost, [])).toBe("QTY_MISMATCH");
  });
});
