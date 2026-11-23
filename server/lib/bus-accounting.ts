import { and, eq, inArray, or, sql } from "drizzle-orm";
import { accounts, busReconciliations, busTickets, companies, journalEntries, ledgerEntries } from "../../shared/schema.js";
import { storage } from "../storage.js";

const BUS_DEFAULT_ACCOUNTS: Array<{ code: string; name: string; type: string; category: string }> = [
  { code: "1000", name: "Cash on Hand", type: "ASSET", category: "Current Assets" },
  { code: "1060", name: "Conductor Cash Clearing", type: "ASSET", category: "Current Assets" },
  { code: "1070", name: "Mobile Money Clearing", type: "ASSET", category: "Current Assets" },
  { code: "4110", name: "Passenger Transport Revenue", type: "REVENUE", category: "Revenue" },
  { code: "4920", name: "Cash Overage Income", type: "REVENUE", category: "Other Income" },
  { code: "5920", name: "Cash Shortage Expense", type: "EXPENSE", category: "Other Expenses" },
];

const BUS_ACCOUNTING_DEFAULTS = {
  busConductorCashAccountCode: "1060",
  busCashOnHandAccountCode: "1000",
  busMobileMoneyAccountCode: "1070",
  busCardClearingAccountCode: "1070",
  busRevenueAccountCode: "4110",
  busCashShortageAccountCode: "5920",
  busCashOverageAccountCode: "4920",
} as const;

type BusAccountingSettings = typeof BUS_ACCOUNTING_DEFAULTS;
type JournalLine = {
  accountCode: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
};

/** Explicit result so callers can turn a failed GL post into a non-2xx response. */
export type BusPostingResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; journalEntryId?: number }
  | { ok: false; error: string };

function amount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return Math.round(amount(value) * 100) / 100;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function resolveSettings(rawSettings: unknown): BusAccountingSettings {
  const raw = rawSettings && typeof rawSettings === "object" ? rawSettings as Record<string, unknown> : {};
  const nested = raw.busTicketing && typeof raw.busTicketing === "object" ? raw.busTicketing as Record<string, unknown> : {};

  return Object.fromEntries(
    Object.entries(BUS_ACCOUNTING_DEFAULTS).map(([key, fallback]) => [
      key,
      firstText(raw[key], nested[key], fallback),
    ])
  ) as BusAccountingSettings;
}

/** FX is stored as base = foreign / exchangeRate; default to 1 when not supplied. */
function fxMeta(source: unknown, fallbackCurrency?: string) {
  const record = source && typeof source === "object" ? source as Record<string, unknown> : {};
  const currency = firstText(record.currency, fallbackCurrency) || "USD";
  const rawRate = amount(record.exchangeRate);
  return { currency, exchangeRate: rawRate > 0 ? rawRate : undefined };
}

function withFx<T extends JournalLine>(lines: T[], fx: ReturnType<typeof fxMeta>) {
  return lines.map((line) => ({ ...line, currency: fx.currency, exchangeRate: fx.exchangeRate }));
}

function paymentClearingAccountCode(paymentMethod: unknown, settings: BusAccountingSettings) {
  const method = String(paymentMethod || "CASH").trim().toUpperCase();
  if (["ECOCASH", "MOBILE", "MOBILE_MONEY", "MOBILE MONEY", "WALLET"].includes(method)) {
    return settings.busMobileMoneyAccountCode;
  }
  if (["CARD", "SWIPE", "VISA", "MASTERCARD"].includes(method)) {
    return settings.busCardClearingAccountCode;
  }
  if (["BANK", "BANK_TRANSFER", "BANK TRANSFER", "TRANSFER"].includes(method)) {
    return settings.busCardClearingAccountCode;
  }
  return settings.busConductorCashAccountCode;
}

async function ensureBusAccounts(companyId: number, tx: any) {
  for (const account of BUS_DEFAULT_ACCOUNTS) {
    await tx.insert(accounts).values({
      companyId,
      ...account,
      isSystem: true,
      isActive: true,
    }).onConflictDoUpdate({
      target: [accounts.companyId, accounts.code],
      set: {
        name: account.name,
        type: account.type,
        category: account.category,
        isSystem: true,
        isActive: true,
      },
    });
  }
}

async function getSettings(companyId: number, tx: any): Promise<BusAccountingSettings & { currency: string }> {
  const [company] = await tx.select({
    accountingSettings: companies.accountingSettings,
    currency: companies.currency,
  })
    .from(companies)
    .where(eq(companies.id, companyId));
  return {
    ...resolveSettings(company?.accountingSettings),
    currency: firstText(company?.currency) || "USD",
  };
}

async function findExistingJournal(
  companyId: number,
  { postingKey, referenceType, referenceId }: { postingKey: string; referenceType: string; referenceId: string },
  tx: any
) {
  const [existing] = await tx.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      or(
        eq(journalEntries.postingKey, postingKey),
        and(
          eq(journalEntries.referenceType, referenceType),
          eq(journalEntries.referenceId, referenceId)
        )
      )
    ));
  return existing;
}

async function assertAccountCodes(companyId: number, codes: string[], tx: any) {
  const uniqueCodes = Array.from(new Set(codes.filter(Boolean)));
  if (uniqueCodes.length === 0) return;

  const found = await tx.select({ code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.companyId, companyId), inArray(accounts.code, uniqueCodes)));
  const foundCodes = new Set(found.map((account: { code: string }) => account.code));
  const missing = uniqueCodes.filter((code) => !foundCodes.has(code));
  if (missing.length > 0) {
    throw new Error(`Bus accounting account code(s) not found: ${missing.join(", ")}`);
  }
}

async function markTicketPosting(
  ticketId: number,
  tx: any,
  status: "posted" | "skipped" | "failed" | "voided",
  journalEntryId?: number,
  error?: string
) {
  const set: Record<string, unknown> = {
    accountingStatus: status,
    accountingError: error ? error.slice(0, 500) : null,
  };

  if (status === "posted") {
    // First successful sale post is the immutable original; later retries must not replace it.
    set.postedJournalEntryId = journalEntryId ?? null;
    set.originalJournalEntryId = sql`coalesce(${busTickets.originalJournalEntryId}, ${journalEntryId ?? null})`;
    set.postedAt = new Date();
  } else if (status === "voided") {
    // Keep the original sale link intact; only the void journal link changes.
    set.voidJournalEntryId = journalEntryId ?? null;
  } else if (status === "failed") {
    // Preserve any previously recorded original/void journal links for retry traceability.
    set.postedAt = null;
  }

  await tx.update(busTickets).set(set).where(eq(busTickets.id, ticketId));
}

async function markReconciliationPosting(
  reconciliationId: number,
  tx: any,
  status: "posted" | "skipped" | "failed",
  journalEntryId?: number,
  error?: string
) {
  const set: Record<string, unknown> = {
    accountingStatus: status,
    accountingError: error ? error.slice(0, 500) : null,
  };
  if (status === "posted") {
    set.postedJournalEntryId = journalEntryId ?? null;
    set.originalJournalEntryId = sql`coalesce(${busReconciliations.originalJournalEntryId}, ${journalEntryId ?? null})`;
    set.postedAt = new Date();
  } else if (status === "failed") {
    set.postedAt = null;
  }
  await tx.update(busReconciliations).set(set).where(eq(busReconciliations.id, reconciliationId));
}

export async function postBusTicketAccounting(
  ticket: typeof busTickets.$inferSelect,
  tx: any
): Promise<BusPostingResult> {
  if ((ticket.status || "active") !== "active") {
    const reason = "Only active bus tickets are posted to revenue.";
    await markTicketPosting(ticket.id, tx, "skipped", undefined, reason);
    return { ok: true, skipped: true, reason };
  }

  const total = money(ticket.amount);
  if (total <= 0) {
    const reason = "Ticket amount is zero.";
    await markTicketPosting(ticket.id, tx, "skipped", undefined, reason);
    return { ok: true, skipped: true, reason };
  }

  const postingKey = `bus-ticket:${ticket.id}:sale`;
  const referenceType = "BUS_TICKET";
  const referenceId = String(ticket.id);

  try {
    const existing = await findExistingJournal(ticket.companyId, { postingKey, referenceType, referenceId }, tx);
    if (existing) {
      await markTicketPosting(ticket.id, tx, "posted", existing.id);
      return { ok: true, skipped: false, journalEntryId: existing.id };
    }

    await ensureBusAccounts(ticket.companyId, tx);
    const settings = await getSettings(ticket.companyId, tx);
    const clearingAccountCode = paymentClearingAccountCode(ticket.paymentMethod, settings);
    await assertAccountCodes(ticket.companyId, [clearingAccountCode, settings.busRevenueAccountCode], tx);

    const fx = fxMeta(ticket, settings.currency);
    const lines: JournalLine[] = [
      { accountCode: clearingAccountCode, type: "DEBIT", amount: total },
      { accountCode: settings.busRevenueAccountCode, type: "CREDIT", amount: total },
    ];
    const entry = await storage.postToLedger(ticket.companyId, {
      entryDate: ticket.timestamp,
      description: `Bus ticket ${ticket.ticketNumber}`,
      referenceType,
      referenceId,
      postingKey,
      currency: fx.currency,
      exchangeRate: fx.exchangeRate,
      lines: withFx(lines, fx),
    }, tx);

    await markTicketPosting(ticket.id, tx, "posted", entry.id);
    return { ok: true, skipped: false, journalEntryId: entry.id };
  } catch (err: any) {
    const message = err?.message || "Posting failed";
    await markTicketPosting(ticket.id, tx, "failed", undefined, message);
    // Returned (not swallowed): the route maps this to a non-2xx response.
    return { ok: false, error: message };
  }
}

export async function postBusReconciliationAccounting(
  reconciliation: typeof busReconciliations.$inferSelect,
  tx: any
): Promise<BusPostingResult> {
  if ((reconciliation.status || "pending") !== "approved") {
    const reason = "Cash-up is not approved yet.";
    await markReconciliationPosting(reconciliation.id, tx, "skipped", undefined, reason);
    return { ok: true, skipped: true, reason };
  }

  const expectedCash = money(reconciliation.expectedCash);
  const cashReceived = money(reconciliation.cashReceived);
  // Always derive the variance; a submitted value is only trusted as a cross-check.
  const variance = money(cashReceived - expectedCash);
  if (reconciliation.gap != null && Math.abs(amount(reconciliation.gap) - variance) > 0.01) {
    const message = `Submitted cash-up gap ${reconciliation.gap} does not match cashReceived - expectedCash (${variance}).`;
    await markReconciliationPosting(reconciliation.id, tx, "failed", undefined, message);
    return { ok: false, error: message };
  }

  if (expectedCash <= 0 && cashReceived <= 0) {
    const reason = "Cash-up amount is zero.";
    await markReconciliationPosting(reconciliation.id, tx, "skipped", undefined, reason);
    return { ok: true, skipped: true, reason };
  }

  const postingKey = `bus-reconciliation:${reconciliation.id}:approval`;
  const referenceType = "BUS_RECONCILIATION";
  const referenceId = String(reconciliation.id);

  try {
    const existing = await findExistingJournal(reconciliation.companyId, { postingKey, referenceType, referenceId }, tx);
    if (existing) {
      await markReconciliationPosting(reconciliation.id, tx, "posted", existing.id);
      return { ok: true, skipped: false, journalEntryId: existing.id };
    }

    await ensureBusAccounts(reconciliation.companyId, tx);
    const settings = await getSettings(reconciliation.companyId, tx);
    await assertAccountCodes(reconciliation.companyId, [
      settings.busCashOnHandAccountCode,
      settings.busConductorCashAccountCode,
      settings.busCashShortageAccountCode,
      settings.busCashOverageAccountCode,
    ], tx);
    const debitLines: JournalLine[] = [
      { accountCode: settings.busCashOnHandAccountCode, type: "DEBIT", amount: cashReceived },
    ];
    const creditLines: JournalLine[] = [
      { accountCode: settings.busConductorCashAccountCode, type: "CREDIT", amount: expectedCash },
    ];

    if (variance < 0) {
      debitLines.push({
        accountCode: settings.busCashShortageAccountCode,
        type: "DEBIT",
        amount: Math.abs(variance),
      });
    } else if (variance > 0) {
      creditLines.push({
        accountCode: settings.busCashOverageAccountCode,
        type: "CREDIT",
        amount: variance,
      });
    }

    const fx = fxMeta(reconciliation, settings.currency);
    const entry = await storage.postToLedger(reconciliation.companyId, {
      entryDate: new Date(`${reconciliation.date}T00:00:00.000Z`),
      description: `Bus conductor cash-up ${reconciliation.date}`,
      referenceType,
      referenceId,
      postingKey,
      currency: fx.currency,
      exchangeRate: fx.exchangeRate,
      createdBy: reconciliation.signedOffBy || undefined,
      lines: withFx([...debitLines, ...creditLines], fx),
    }, tx);

    await markReconciliationPosting(reconciliation.id, tx, "posted", entry.id);
    return { ok: true, skipped: false, journalEntryId: entry.id };
  } catch (err: any) {
    const message = err?.message || "Posting failed";
    await markReconciliationPosting(reconciliation.id, tx, "failed", undefined, message);
    return { ok: false, error: message };
  }
}

export async function voidBusTicketAccounting(
  ticket: typeof busTickets.$inferSelect,
  tx: any
): Promise<BusPostingResult> {
  const originalJournalEntryId = ticket.originalJournalEntryId ?? ticket.postedJournalEntryId;
  if (!originalJournalEntryId) {
    const reason = "Ticket has no posted sale journal to reverse.";
    await markTicketPosting(ticket.id, tx, "skipped", undefined, reason);
    return { ok: true, skipped: true, reason };
  }

  const postingKey = `bus-ticket:${ticket.id}:void`;
  const referenceType = "BUS_TICKET_VOID";
  const referenceId = String(ticket.id);

  try {
    const existing = await findExistingJournal(ticket.companyId, { postingKey, referenceType, referenceId }, tx);
    if (existing) {
      await markTicketPosting(ticket.id, tx, "voided", existing.id);
      return { ok: true, skipped: false, journalEntryId: existing.id };
    }

    // Reverse the ACTUAL posted journal lines, including their FX metadata.
    const originalLines = await tx.select({
      accountCode: accounts.code,
      type: ledgerEntries.type,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      exchangeRate: ledgerEntries.exchangeRate,
    })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(eq(ledgerEntries.journalEntryId, originalJournalEntryId));

    if (originalLines.length === 0) {
      const reason = "Original sale journal has no ledger lines to reverse.";
      await markTicketPosting(ticket.id, tx, "failed", undefined, reason);
      return { ok: false, error: reason };
    }

    const settings = await getSettings(ticket.companyId, tx);
    // bus_tickets has no exchange_rate column: the posted sale ledger line is
    // the source of truth for FX. Fall back to 1 (base currency) only when no
    // rate was recorded on the original journal.
    const voidCurrency = firstText(originalLines[0]?.currency, ticket.currency, settings.currency) || "USD";
    const voidExchangeRate = amount(originalLines[0]?.exchangeRate) || 1;
    const entry = await storage.postToLedger(ticket.companyId, {
      entryDate: new Date(),
      description: `Void bus ticket ${ticket.ticketNumber}${ticket.voidReason ? ` (${ticket.voidReason})` : ""}`,
      referenceType,
      referenceId,
      postingKey,
      currency: voidCurrency,
      exchangeRate: voidExchangeRate,
      lines: originalLines.map((line: {
        accountCode: string;
        type: string;
        amount: unknown;
        currency: string | null;
        exchangeRate: unknown;
      }) => ({
        accountCode: line.accountCode,
        type: line.type === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
        amount: amount(line.amount),
        currency: firstText(line.currency, settings.currency) || "USD",
        exchangeRate: amount(line.exchangeRate) > 0 ? amount(line.exchangeRate) : undefined,
      })),
    }, tx);

    await markTicketPosting(ticket.id, tx, "voided", entry.id);
    return { ok: true, skipped: false, journalEntryId: entry.id };
  } catch (err: any) {
    const message = err?.message || "Void posting failed";
    await markTicketPosting(ticket.id, tx, "failed", undefined, message);
    return { ok: false, error: message };
  }
}
