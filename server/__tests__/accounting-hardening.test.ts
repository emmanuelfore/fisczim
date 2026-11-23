/**
 * Regression tests for the accounting hardening pass.
 *
 * These are pure/unit tests: no database is contacted, so they are safe to run
 * against a developer machine with production DATABASE_URL values in the env.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("../storage.js", () => ({ storage: {} }));
vi.mock("../lib/permissions.js", () => ({ userHasPermission: vi.fn() }));

const { sanitizeManualJournalPayload, sanitizeBankStatementLines, requireAccountingPermission } =
  await import("../lib/accounting-guards.js");
const { userHasPermission } = await import("../lib/permissions.js");
const { DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS, mergeAccountingSystemAccounts } =
  await import("../../shared/accounting-defaults.js");

function mockRes() {
  return {
    statusCode: 0,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
}

describe("manual journal sanitization", () => {
  test("forces MANUAL and strips control fields supplied by the client", () => {
    const clean = sanitizeManualJournalPayload({
      companyId: 99,
      status: "POSTED",
      approvalStatus: "APPROVED",
      referenceType: "INVOICE",
      referenceId: "fake-invoice",
      reference: "fake",
      deduplicate: true,
      postingKey: "client-chosen",
      entryDate: "2026-01-01",
      description: "Adjustment",
      lines: [{ accountCode: "1000", debit: 10, credit: 0, referenceType: "INVOICE", status: "POSTED" }],
    });

    expect(clean.referenceType).toBe("MANUAL");
    expect(clean.companyId).toBeUndefined();
    expect(clean.status).toBeUndefined();
    expect(clean.approvalStatus).toBeUndefined();
    expect(clean.deduplicate).toBeUndefined();
    expect(clean.reference).toBeUndefined();
    expect(clean.postingKey).toBe("client-chosen");
    expect(clean.lines[0]).toEqual({ accountCode: "1000", debit: 10, credit: 0 });
  });

  test("turns a client idempotency key into a server posting key", () => {
    const clean = sanitizeManualJournalPayload({
      idempotencyKey: "abc123",
      description: "Adjustment",
      lines: [],
    });
    expect(clean.postingKey).toBe("manual-journal:abc123");
    expect(clean.idempotencyKey).toBeUndefined();
  });
});

describe("bank statement import sanitization", () => {
  test("strips reconciliation state from imported lines", () => {
    const lines = sanitizeBankStatementLines([
      {
        date: "2026-01-01",
        description: "Payment",
        amount: 12.5,
        isReconciled: true,
        matchedLedgerEntryId: 42,
        statementId: 7,
      },
    ]);
    expect(lines).toEqual([{ date: "2026-01-01", description: "Payment", amount: 12.5 }]);
  });
});

describe("requireAccountingPermission", () => {
  test("always denies API-key contexts", async () => {
    vi.mocked(userHasPermission).mockResolvedValue(true);
    const res = mockRes();
    const allowed = await requireAccountingPermission(
      { apiKeyCompanyId: 1, user: { id: "u1" } },
      res,
      1,
      "accounting.view"
    );
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(userHasPermission).not.toHaveBeenCalled();
  });

  test("denies a user without the permission", async () => {
    vi.mocked(userHasPermission).mockResolvedValue(false);
    const res = mockRes();
    const allowed = await requireAccountingPermission({ user: { id: "u1" } }, res, 1, "accounting.view");
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test("allows a user with the permission", async () => {
    vi.mocked(userHasPermission).mockResolvedValue(true);
    const res = mockRes();
    const allowed = await requireAccountingPermission({ user: { id: "u1" } }, res, 1, "accounting.view");
    expect(allowed).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});

describe("accounting defaults", () => {
  test("persisted settings win over defaults, missing keys fall back", () => {
    const merged = mergeAccountingSystemAccounts({ cashAccountCode: "1010" });
    expect(merged.cashAccountCode).toBe("1010");
    expect(merged.vatInputAccountCode).toBe(DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS.vatInputAccountCode);
    expect(DEFAULT_ACCOUNTING_SYSTEM_ACCOUNTS.fxLossAccountCode).toBe("5300");
  });
});

describe("migration 0103 invariants", () => {
  const sql = readFileSync(
    new URL("../../migrations/0103_accounting_integrity_hardening.sql", import.meta.url),
    "utf8"
  );

  test("does not renumber or delete legacy ledger rows", () => {
    expect(sql).not.toMatch(/UPDATE\s+"?ledger_entries"?\s+SET\s+"?id"?/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"?ledger_entries"?/i);
  });

  test("backfills base amount with the foreign / rate convention", () => {
    expect(sql).toMatch(/ROUND\(\s*"amount"\s*\/\s*COALESCE\(\s*"exchange_rate"/i);
  });

  test("adds balance enforcement and partial line ordinal uniqueness", () => {
    expect(sql).toMatch(/CONSTRAINT TRIGGER "ledger_entries_balance_check"/i);
    expect(sql).toMatch(/"ledger_entries_journal_line_ordinal_unique"/i);
    expect(sql).toMatch(/WHERE\s+"line_ordinal"\s+IS NOT NULL/i);
  });
});
