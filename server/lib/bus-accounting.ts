import { and, eq, inArray } from "drizzle-orm";
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

async function getSettings(companyId: number, tx: any) {
  const [company] = await tx.select({ accountingSettings: companies.accountingSettings })
    .from(companies)
    .where(eq(companies.id, companyId));
  return resolveSettings(company?.accountingSettings);
}

async function findExistingJournal(companyId: number, referenceType: string, referenceId: string, tx: any) {
  const [existing] = await tx.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.referenceType, referenceType),
      eq(journalEntries.referenceId, referenceId)
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

async function markTicketPosting(ticketId: number, tx: any, status: "posted" | "skipped" | "failed" | "voided", journalEntryId?: number, error?: string) {
  await tx.update(busTickets)
    .set({
      accountingStatus: status,
      accountingError: error ? error.slice(0, 500) : null,
      postedJournalEntryId: journalEntryId ?? null,
      postedAt: status === "posted" ? new Date() : null,
    })
    .where(eq(busTickets.id, ticketId));
}

async function markReconciliationPosting(reconciliationId: number, tx: any, status: "posted" | "skipped" | "failed", journalEntryId?: number, error?: string) {
  await tx.update(busReconciliations)
    .set({
      accountingStatus: status,
      accountingError: error ? error.slice(0, 500) : null,
      postedJournalEntryId: journalEntryId ?? null,
      postedAt: status === "posted" ? new Date() : null,
    })
    .where(eq(busReconciliations.id, reconciliationId));
}

export async function postBusTicketAccounting(ticket: typeof busTickets.$inferSelect, tx: any) {
  if ((ticket.status || "active") !== "active") {
    await markTicketPosting(ticket.id, tx, "skipped", undefined, "Only active bus tickets are posted to revenue.");
    return;
  }

  const total = money(ticket.amount);
  if (total <= 0) {
    await markTicketPosting(ticket.id, tx, "skipped", undefined, "Ticket amount is zero.");
    return;
  }

  try {
    const referenceType = "BUS_TICKET";
    const referenceId = String(ticket.id);
    const existing = await findExistingJournal(ticket.companyId, referenceType, referenceId, tx);
    if (existing) {
      await markTicketPosting(ticket.id, tx, "posted", existing.id);
      return;
    }

    await ensureBusAccounts(ticket.companyId, tx);
    const settings = await getSettings(ticket.companyId, tx);
    const clearingAccountCode = paymentClearingAccountCode(ticket.paymentMethod, settings);
    await assertAccountCodes(ticket.companyId, [clearingAccountCode, settings.busRevenueAccountCode], tx);
    const entry = await storage.postToLedger(ticket.companyId, {
      entryDate: ticket.timestamp,
      description: `Bus ticket ${ticket.ticketNumber}`,
      referenceType,
      referenceId,
      lines: [
        {
          accountCode: clearingAccountCode,
          type: "DEBIT" as const,
          amount: total,
        },
        {
          accountCode: settings.busRevenueAccountCode,
          type: "CREDIT" as const,
          amount: total,
        },
      ],
    }, tx);

    await markTicketPosting(ticket.id, tx, "posted", entry.id);
  } catch (err: any) {
    await markTicketPosting(ticket.id, tx, "failed", undefined, err?.message || "Posting failed");
  }
}

export async function postBusReconciliationAccounting(reconciliation: typeof busReconciliations.$inferSelect, tx: any) {
  if ((reconciliation.status || "pending") !== "approved") {
    await markReconciliationPosting(reconciliation.id, tx, "skipped", undefined, "Cash-up is not approved yet.");
    return;
  }

  const expectedCash = money(reconciliation.expectedCash);
  const cashReceived = money(reconciliation.cashReceived);
  const variance = money(reconciliation.gap);

  if (expectedCash <= 0 && cashReceived <= 0) {
    await markReconciliationPosting(reconciliation.id, tx, "skipped", undefined, "Cash-up amount is zero.");
    return;
  }

  try {
    const referenceType = "BUS_RECONCILIATION";
    const referenceId = String(reconciliation.id);
    const existing = await findExistingJournal(reconciliation.companyId, referenceType, referenceId, tx);
    if (existing) {
      await markReconciliationPosting(reconciliation.id, tx, "posted", existing.id);
      return;
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
      {
        accountCode: settings.busCashOnHandAccountCode,
        type: "DEBIT" as const,
        amount: cashReceived,
      },
    ];
    const creditLines: JournalLine[] = [
      {
        accountCode: settings.busConductorCashAccountCode,
        type: "CREDIT" as const,
        amount: expectedCash,
      },
    ];

    if (variance < 0) {
      debitLines.push({
        accountCode: settings.busCashShortageAccountCode,
        type: "DEBIT" as const,
        amount: Math.abs(variance),
      });
    } else if (variance > 0) {
      creditLines.push({
        accountCode: settings.busCashOverageAccountCode,
        type: "CREDIT" as const,
        amount: variance,
      });
    }

    const entry = await storage.postToLedger(reconciliation.companyId, {
      entryDate: new Date(`${reconciliation.date}T00:00:00.000Z`),
      description: `Bus conductor cash-up ${reconciliation.date}`,
      referenceType,
      referenceId,
      createdBy: reconciliation.signedOffBy || undefined,
      lines: [...debitLines, ...creditLines],
    }, tx);

    await markReconciliationPosting(reconciliation.id, tx, "posted", entry.id);
  } catch (err: any) {
    await markReconciliationPosting(reconciliation.id, tx, "failed", undefined, err?.message || "Posting failed");
  }
}

export async function voidBusTicketAccounting(ticket: typeof busTickets.$inferSelect, tx: any) {
  if (!ticket.postedJournalEntryId) return;

  try {
    const referenceType = "BUS_TICKET_VOID";
    const referenceId = String(ticket.id);
    const existing = await findExistingJournal(ticket.companyId, referenceType, referenceId, tx);
    if (existing) return;

    const originalLines = await tx.select({
      accountCode: accounts.code,
      type: ledgerEntries.type,
      amount: ledgerEntries.amount,
    })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(eq(ledgerEntries.journalEntryId, ticket.postedJournalEntryId));

    if (originalLines.length === 0) return;

    const entry = await storage.postToLedger(ticket.companyId, {
      entryDate: new Date(),
      description: `Void bus ticket ${ticket.ticketNumber}${ticket.voidReason ? ` (${ticket.voidReason})` : ""}`,
      referenceType,
      referenceId,
      lines: originalLines.map((line: { accountCode: string; type: string; amount: unknown }) => ({
        accountCode: line.accountCode,
        type: line.type === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
        amount: Number(line.amount),
      })),
    }, tx);

    await markTicketPosting(ticket.id, tx, "voided", entry.id);
  } catch (err: any) {
    await markTicketPosting(ticket.id, tx, "failed", undefined, err?.message || "Void posting failed");
  }
}
