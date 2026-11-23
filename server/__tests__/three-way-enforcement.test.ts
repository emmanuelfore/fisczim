/**
 * Guard tests for the write-time three-way enforcement helpers.
 * The executor is a small drizzle-shaped fake so no database is required.
 */
import { describe, expect, test } from "vitest";

import {
  goodsDeliveryNotes,
  purchaseOrderItems,
  purchaseOrders,
  supplierInvoices,
} from "@shared/schema";
import {
  assertNewSupplierInvoiceNumber,
  assertNoOpenReceivingDocument,
  assertPurchaseOrderEditable,
  assertReceiptWithinPurchaseOrder,
  findReceivingDocumentByReference,
} from "../lib/supplier-bill-match.js";

type Rows = Record<symbol, any[]>;

const TABLE_KEYS = new Map<unknown, symbol>([
  [goodsDeliveryNotes, Symbol("goodsDeliveryNotes")],
  [purchaseOrderItems, Symbol("purchaseOrderItems")],
  [purchaseOrders, Symbol("purchaseOrders")],
  [supplierInvoices, Symbol("supplierInvoices")],
]);

function fakeExecutor(rowsByTable: Array<[unknown, any[]]>) {
  const rows: Rows = {};
  for (const [table, data] of rowsByTable) {
    const key = TABLE_KEYS.get(table);
    if (key) rows[key] = data;
  }

  return {
    select() {
      let key: symbol | undefined;
      const chain: any = {
        from(table: unknown) {
          key = TABLE_KEYS.get(table);
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        async limit() {
          return key ? rows[key] || [] : [];
        },
        then(resolve: any, reject: any) {
          return Promise.resolve(key ? rows[key] || [] : []).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const po = [{ id: 7, poNumber: "PO-7", supplierId: 3, status: "SENT", currency: "USD" }];

describe("assertReceiptWithinPurchaseOrder", () => {
  test("allows a receipt inside the remaining ordered quantity", async () => {
    const executor = fakeExecutor([
      [purchaseOrders, po],
      [purchaseOrderItems, [{ productId: 11, quantity: "10", quantityReceived: "8" }]],
    ]);
    await expect(assertReceiptWithinPurchaseOrder(executor, 1, 7, [
      { productId: 11, quantity: 2 },
    ])).resolves.toBeUndefined();
  });

  test("blocks over-receipt", async () => {
    const executor = fakeExecutor([
      [purchaseOrders, po],
      [purchaseOrderItems, [{ productId: 11, quantity: "10", quantityReceived: "8" }]],
    ]);
    await expect(assertReceiptWithinPurchaseOrder(executor, 1, 7, [
      { productId: 11, quantity: 3 },
    ])).rejects.toThrow(/exceed/);
  });

  test("blocks lines that are not on the purchase order", async () => {
    const executor = fakeExecutor([
      [purchaseOrders, po],
      [purchaseOrderItems, [{ productId: 11, quantity: "10", quantityReceived: "0" }]],
    ]);
    await expect(assertReceiptWithinPurchaseOrder(executor, 1, 7, [
      { productId: 99, quantity: 1 },
    ])).rejects.toThrow(/not on purchase order/);
  });

  test("aggregates duplicate purchase order lines when checking capacity", async () => {
    const executor = fakeExecutor([
      [purchaseOrders, po],
      [purchaseOrderItems, [
        { productId: 11, quantity: "10", quantityReceived: "10" },
        { productId: 11, quantity: "10", quantityReceived: "0" },
      ]],
    ]);
    await expect(assertReceiptWithinPurchaseOrder(executor, 1, 7, [
      { productId: 11, quantity: 5 },
    ])).resolves.toBeUndefined();
  });
});

describe("assertNoOpenReceivingDocument", () => {
  test("blocks a second open GDN for the same purchase order", async () => {
    const executor = fakeExecutor([
      [goodsDeliveryNotes, [{ id: 5, gdnNumber: "GRV-5", status: "DRAFT" }]],
    ]);
    await expect(assertNoOpenReceivingDocument(executor, 1, 7))
      .rejects.toThrow(/already open/);
  });
});

describe("assertNewSupplierInvoiceNumber", () => {
  test("blocks a duplicate active invoice number", async () => {
    const executor = fakeExecutor([[supplierInvoices, [{ id: 22 }]]]);
    await expect(assertNewSupplierInvoiceNumber(executor, 1, " INV-100 ", "Invoice"))
      .rejects.toThrow(/already exists/);
  });

  test("does not block credit notes", async () => {
    const executor = fakeExecutor([[supplierInvoices, [{ id: 22 }]]]);
    await expect(assertNewSupplierInvoiceNumber(executor, 1, "INV-100", "CreditNote"))
      .resolves.toBeUndefined();
  });
});

describe("assertPurchaseOrderEditable", () => {
  test("blocks PO edits once a receiving document exists", async () => {
    const executor = fakeExecutor([[goodsDeliveryNotes, [{ id: 5, gdnNumber: "GRV-5" }]]]);
    await expect(assertPurchaseOrderEditable(executor, 1, 7))
      .rejects.toThrow(/receiving document GRV-5/);
  });
});

describe("findReceivingDocumentByReference", () => {
  const rows = [{
    id: 5,
    gdnNumber: "GDN-5",
    confirmedGrvNumber: "GRV-2026-001",
    status: "CONFIRMED",
    supplierId: 3,
    purchaseOrderId: 7,
  }];

  test("matches a confirmed GRV number with different case and whitespace", async () => {
    const executor = fakeExecutor([[goodsDeliveryNotes, rows]]);
    const gdn = await findReceivingDocumentByReference(executor, 1, "  grv-2026-001  ");
    expect(gdn?.id).toBe(5);
  });

  test("matches the displayed GDN number", async () => {
    const executor = fakeExecutor([[goodsDeliveryNotes, rows]]);
    const gdn = await findReceivingDocumentByReference(executor, 1, "gdn-5");
    expect(gdn?.id).toBe(5);
  });

  test("matches a numeric receiving document id", async () => {
    const executor = fakeExecutor([[goodsDeliveryNotes, rows]]);
    const gdn = await findReceivingDocumentByReference(executor, 1, "5");
    expect(gdn?.id).toBe(5);
  });

  test("returns null for an unknown reference", async () => {
    const executor = fakeExecutor([[goodsDeliveryNotes, rows]]);
    await expect(findReceivingDocumentByReference(executor, 1, "what"))
      .resolves.toBeNull();
  });
});
