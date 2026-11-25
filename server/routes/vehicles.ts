import { Router } from "express";
import { addVehiclePaymentMonths, calculateVehiclePaymentPlan } from "../../shared/vehicle-payment-plan.js";
import { db } from "../db.js";
import {
  vehicles,
  vehicleCosts,
  vehicleStageEvents,
  vehicleDocuments,
  vehiclePaymentSchedules,
  vehicleReminders,
  vehicleStockCounters,
  vehicleCustomerAccounts,
  vehicleCustomerPaymentAllocations,
  vehicleThirdPartyPayments,
  insertVehicleSchema,
  insertVehicleCostSchema,
  payments,
  paymentAllocations,
  journalEntries,
  ledgerEntries,
  accounts,
  taxTypes,
  supplierInvoices,
  supplierInvoiceItems,
  supplierPayments,
  invoiceItems,
  crmStages,
  customers,
  companies,
  suppliers,
  users,
  consignments,
  freightForwarders,
  VEHICLE_STAGES,
  VEHICLE_COST_CATEGORIES,
  VEHICLE_COST_STATUSES,
} from "../../shared/schema.js";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { enquiries, invoices, vehicleSalesAgreements, vehicleAgreementCounters } from "../../shared/schema.js";
import { userHasPermission } from "../lib/permissions.js";
import { storage } from "../storage.js";
import { processInvoiceFiscalization } from "../lib/fiscalization.js";
import {
  ensureEnquiryCustomer,
  logEnquiryVehicleActivity,
  markEnquiryWon,
} from "../lib/crm-vehicles.js";
import { accrueVehicleCommission, cancelVehicleCommission } from "../lib/commissions.js";
import { baseCurrencyOf } from "../../shared/currency.js";

/**
 * Vehicle imports: per-unit landed costing, profitability, import tracking
 * and deposit/part-payment tracking.
 *
 * Money in base currency (USD). Cost lines carry their own currency and
 * exchange rate; following the GL convention base = foreign / exchangeRate,
 * so later rate moves don't rewrite historical landed cost.
 */

const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
/** base = foreign / exchangeRate (the convention used by the GL). */
const toBase = (amount: unknown, exchangeRate: unknown) =>
  roundGuard(Number(amount || 0) / (Number(exchangeRate || 1) || 1));
const roundGuard = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** Foreign = base * rate — used when comparing base-currency receipts to sale-currency schedules. */
const fromBase = (base: unknown, exchangeRate: unknown) =>
  roundGuard(Number(base || 0) * (Number(exchangeRate || 1) || 1));
/** Any value other than `principal` is treated as the default agency model. */
function isAgencyVehicle(v: any): boolean {
  return String(v?.accountingModel || "agent") !== "principal";
}

type AgencyLedgerInput = {
  entryDate: any;
  description: string;
  referenceType: string;
  referenceId: string;
  postingKey: string;
  createdBy?: string;
  lines: Array<{ accountCode: string; type: "DEBIT" | "CREDIT"; amount: number; memo?: string }>;
};

/**
 * Agency movements are internal settlements of amounts already converted into
 * base currency. Posting them in the company's base currency with rate 1 keeps
 * the GL's `amount` and `baseAmount` columns consistent; the source receipt and
 * third-party payment rows retain the original foreign currency for audit.
 */
async function postAgencyLedger(companyId: number, data: AgencyLedgerInput, tx: any) {
  const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  // A 100%-fee receipt produces a zero Customer Funds Held credit. Zero-value
  // lines carry no accounting meaning and some ledgers reject them outright.
  const lines = data.lines
    .map((line) => ({ ...line, amount: Math.round((Number(line.amount) + Number.EPSILON) * 100) / 100 }))
    .filter((line) => line.amount !== 0);
  if (!lines.length) return { id: null } as any;
  return storage.postToLedger(companyId, {
    entryDate: data.entryDate,
    description: data.description,
    referenceType: data.referenceType,
    referenceId: data.referenceId,
    postingKey: data.postingKey,
    createdBy: data.createdBy,
    currency: baseCurrencyOf(company),
    exchangeRate: 1,
    lines: lines.map((line) => ({
      accountCode: line.accountCode,
      type: line.type,
      amount: line.amount,
      baseAmount: line.amount,
      memo: line.memo,
    })),
  }, tx);
}

export function summariseVehicle(
  vehicle: { salePrice: string | null; targetPrice: string | null; saleExchangeRate?: string | null; accountingModel?: string | null },
  costs: { category: string; baseAmount: string; status?: string | null }[],
  paid: number,
  invoiceTotalBase?: number | null,
  processingFeeBase: number = 0,
) {
  const byCategory: Record<string, number> = {};
  for (const c of costs) {
    if (c.status === "cancelled") continue;
    byCategory[c.category] = money((byCategory[c.category] || 0) + Number(c.baseAmount));
  }
  const purchasePrice = byCategory.purchase || 0;
  // Status is a lifecycle marker, not a valuation: pending, paid and disputed
  // costs all form part of landed cost; cancelled lines are excluded.
  const activeCosts = costs.filter((c) => c.status !== "cancelled");
  const landedCost = money(activeCosts.reduce((s, c) => s + Number(c.baseAmount), 0));
  const pendingCosts = money(activeCosts.filter((c) => (c.status ?? "pending") === "pending").reduce((s, c) => s + Number(c.baseAmount), 0));
  const paidCosts = money(activeCosts.filter((c) => c.status === "paid").reduce((s, c) => s + Number(c.baseAmount), 0));
  const disputedCosts = money(activeCosts.filter((c) => c.status === "disputed").reduce((s, c) => s + Number(c.baseAmount), 0));
  // salePrice is in saleCurrency; GL convention is base = foreign / rate.
  const saleRate = Number(vehicle.saleExchangeRate || 1) || 1;
  const sellingPrice = vehicle.salePrice != null ? toBase(vehicle.salePrice, saleRate) : money(vehicle.targetPrice ?? 0);
  const isAgency = isAgencyVehicle(vehicle);
  // Agency earnings are the processing fee only; third-party disbursements are
  // never revenue. Principal deals keep the sale-minus-COGS margin.
  const profit = isAgency ? money(processingFeeBase) : money(sellingPrice - landedCost);
  const marginBase = isAgency ? processingFeeBase : sellingPrice;
  const margin = marginBase > 0 ? Math.round((profit / marginBase) * 10000) / 100 : 0;
  // Agency schedules follow the whole customer deal; the fee-only invoice is
  // Prime Imports' own revenue document, not the customer's total obligation.
  // Principal schedules follow the issued invoice (which carries the tax).
  const amountDue = !isAgency && invoiceTotalBase != null ? money(invoiceTotalBase) : sellingPrice;
  const balance = vehicle.salePrice != null || invoiceTotalBase != null ? money(amountDue - paid) : 0;
  return {
    purchasePrice,
    landedCost,
    importCosts: money(landedCost - purchasePrice),
    sellingPrice,
    amountDue,
    isProjected: vehicle.salePrice == null,
    accountingModel: isAgency ? "agent" : "principal",
    processingFee: money(processingFeeBase),
    profit,
    marginPercent: margin,
    paid: money(paid),
    balance,
    costsByCategory: byCategory,
    pendingCosts,
    paidCosts,
    disputedCosts,
    // Alert flags consumed by the reports UI.
    negativeMargin: marginBase > 0 && profit < 0,
    lowMargin: marginBase > 0 && profit >= 0 && margin < 10,
    hasUnpaidCosts: pendingCosts + disputedCosts > 0.004,
  };
}

export function createVehiclesRouter(requireAuth: any, requireCompanyAccess: any) {
  const router = Router();
  const base = [requireAuth, requireCompanyAccess];

  async function can(req: any, permission: string) {
    if (!req.user?.id) return false;
    return userHasPermission(req.user.id, parseInt(req.params.companyId), permission, Boolean(req.user?.isSuperAdmin));
  }
  const need = (permission: string) => [
    ...base,
    async (req: any, res: any, next: any) => {
      if (await can(req, permission)) return next();
      res.status(403).json({ error: `Permission required: ${permission}` });
    },
  ];

  /** Strip cost and margin data for users without vehicles.costs. */
  function redact<T extends Record<string, any>>(row: T, showCosts: boolean): T {
    if (showCosts) return row;
    const { summary, costs, cogsAmount, invoice, ...rest } = row as any;
    const s = summary ? { sellingPrice: summary.sellingPrice, isProjected: summary.isProjected, paid: summary.paid, balance: summary.balance } : undefined;
    const redInv = invoice ? {
      ...invoice,
      vehicleCosts: invoice.vehicle && isAgencyVehicle(invoice.vehicle)
        ? (invoice.vehicleCosts ?? [])
            .filter((cost: typeof vehicleCosts.$inferSelect) => cost.includeInCustomerStatement && cost.status !== "cancelled")
            .map((cost: typeof vehicleCosts.$inferSelect) => ({
              id: cost.id,
              category: cost.category,
              description: cost.description,
              includeInCustomerStatement: true,
              customerChargeBaseAmount: cost.customerChargeBaseAmount ?? cost.baseAmount,
            }))
        : [],
    } : undefined;
    return { ...rest, ...(s ? { summary: s } : {}), ...(costs ? { costs: [] } : {}), ...(redInv !== undefined ? { invoice: redInv } : {}) } as T;
  }

  /** Reject customer/enquiry ids that belong to another company. */
  async function assertOwnedRefs(companyId: number, body: { customerId?: number | null; enquiryId?: number | null; invoiceId?: number | null; consignmentId?: number | null; supplierId?: number | null; salespersonId?: string | null }, executor: Pick<typeof db, "select"> = db) {
    if (body.invoiceId) {
      const [i] = await executor.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.id, body.invoiceId), eq(invoices.companyId, companyId)));
      if (!i) return "Invoice not found";
    }
    if (body.consignmentId) {
      const [c] = await executor.select({ id: consignments.id }).from(consignments).where(and(eq(consignments.id, body.consignmentId), eq(consignments.companyId, companyId)));
      if (!c) return "Consignment not found";
    }
    if (body.supplierId) {
      const [s] = await executor.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, body.supplierId), eq(suppliers.companyId, companyId)));
      if (!s) return "Supplier not found";
    }
    if (body.salespersonId) {
      const [u] = await executor
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, body.salespersonId), sql`EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id = ${body.salespersonId} AND cu.company_id = ${companyId})`));
      if (!u) return "Staff member not found";
    }
    if (body.customerId) {
      const [c] = await executor.select({ id: customers.id }).from(customers).where(and(eq(customers.id, body.customerId), eq(customers.companyId, companyId)));
      if (!c) return "Customer not found";
    }
    if (body.enquiryId) {
      const [e] = await executor.select({ id: enquiries.id }).from(enquiries).where(and(eq(enquiries.id, body.enquiryId), eq(enquiries.companyId, companyId)));
      if (!e) return "Enquiry not found";
    }
    return null;
  }

  /** Reject supplier ids that belong to another company. */
  async function assertOwnedSupplier(companyId: number, supplierId?: number | null) {
    if (!supplierId) return null;
    const [s] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, companyId)));
    return s ? null : "Supplier not found";
  }

  async function loadVehicle(companyId: number, id: number) {
    const [v] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
    return v ?? null;
  }

  async function totalsFor(ids: number[]) {
    if (!ids.length) return { costs: new Map<number, any[]>(), paid: new Map<number, number>(), invoiceBase: new Map<number, number>(), fees: new Map<number, number>() };
    const costRows = await db.select().from(vehicleCosts).where(inArray(vehicleCosts.vehicleId, ids));
    const paidRows = await db
      .select({ vehicleId: payments.vehicleId, total: sql<string>`COALESCE(SUM(${payments.amount} / NULLIF(COALESCE(${payments.exchangeRate}, 1), 0)), 0)` })
      .from(payments)
      .where(inArray(payments.vehicleId, ids))
      .groupBy(payments.vehicleId);
    // Balance/statement figures must follow the invoice total (tax included),
    // not the pre-tax agreed sale price.
    const invoiceRows = await db
      .select({ vehicleId: vehicles.id, total: invoices.total, exchangeRate: invoices.exchangeRate })
      .from(vehicles)
      .innerJoin(invoices, eq(vehicles.invoiceId, invoices.id))
      .where(inArray(vehicles.id, ids));
    const agreementRows = await db
      .select({ vehicleId: vehicleSalesAgreements.vehicleId, processingFeeAmount: vehicleSalesAgreements.processingFeeAmount, exchangeRate: vehicleSalesAgreements.exchangeRate })
      .from(vehicleSalesAgreements)
      .where(inArray(vehicleSalesAgreements.vehicleId, ids));
    const costs = new Map<number, any[]>();
    for (const c of costRows) costs.set(c.vehicleId, [...(costs.get(c.vehicleId) || []), c]);
    const paid = new Map<number, number>();
    for (const p of paidRows) if (p.vehicleId != null) paid.set(p.vehicleId, Number(p.total));
    const invoiceBase = new Map<number, number>();
    for (const i of invoiceRows) invoiceBase.set(i.vehicleId, toBase(i.total, i.exchangeRate));
    const fees = new Map<number, number>();
    for (const a of agreementRows) fees.set(a.vehicleId, toBase(a.processingFeeAmount, a.exchangeRate));
    return { costs, paid, invoiceBase, fees };
  }

  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const baseAmountOf = (p: any) => toBase(p.amount, p.exchangeRate);
  /** FX metadata for GL calls. Pass baseAmount explicitly for already-base amounts so storage does not convert twice. */
  const fxOf = (source: any, fallbackCurrency = "USD") => ({
    currency: String(source?.currency || fallbackCurrency),
    exchangeRate: Number(source?.exchangeRate || 1) || 1,
  });
  /** vehicle_payment_schedules has no currency column: amounts are in vehicle.saleCurrency. */
  const schedulePaid = (vehicle: any, paidBase: number) => fromBase(paidBase, vehicle?.saleExchangeRate);

  async function refreshScheduleSettlement(tx: any, companyId: number, vehicleId: number) {
    const [lines, paidRows] = await Promise.all([
      tx.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, vehicleId)).orderBy(asc(vehiclePaymentSchedules.dueDate), asc(vehiclePaymentSchedules.id)),
      tx.select().from(payments).where(and(eq(payments.companyId, companyId), eq(payments.vehicleId, vehicleId))),
    ]);
    const [vehicle] = await tx.select({ saleExchangeRate: vehicles.saleExchangeRate, saleCurrency: vehicles.saleCurrency })
      .from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId))).limit(1);
    // Schedule amounts have no currency column; they are stored in the vehicle's
    // saleCurrency. Convert base-currency receipts before comparing.
    const paidBase = round2(paidRows.reduce((sum: number, p: any) => sum + baseAmountOf(p), 0));
    let remaining = schedulePaid(vehicle, paidBase);
    const today = new Date().toISOString().slice(0, 10);
    for (const line of lines) {
      const paid = round2(Math.min(remaining, Number(line.amount))); remaining = round2(remaining - paid);
      const status = paid >= Number(line.amount) - .004 ? "paid" : paid > .004 ? "partial" : line.dueDate < today ? "overdue" : "scheduled";
      await tx.update(vehiclePaymentSchedules).set({ paidAmount: paid.toFixed(2), paidAt: paid > 0 ? new Date().toISOString().slice(0, 10) : null, status }).where(eq(vehiclePaymentSchedules.id, line.id));
    }
  }

  async function lockedVehicle(tx: any, companyId: number, id: number) {
    const [v] = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)))
      .for("update");
    return v ?? null;
  }

  async function accountCodeById(tx: any, companyId: number, accountId: number, label: string) {
    const [account] = await tx
      .select({ code: accounts.code })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)));
    if (!account) throw new Error(`${label} not found for this company`);
    return account.code;
  }

  /** Reverse a posted journal by posting the mirror image, linked for audit. */
  async function reverseJournalEntry(
    tx: any,
    companyId: number,
    journalEntryId: number,
    description: string,
    userId?: string,
    postingKey?: string,
  ) {
    const lines = await tx
      .select({
        accountId: ledgerEntries.accountId,
        type: ledgerEntries.type,
        amount: ledgerEntries.amount,
        baseAmount: ledgerEntries.baseAmount,
        currency: ledgerEntries.currency,
        exchangeRate: ledgerEntries.exchangeRate,
        memo: ledgerEntries.memo,
        vatTypeId: ledgerEntries.vatTypeId,
        vatAmount: ledgerEntries.vatAmount,
      })
      .from(ledgerEntries)
      .innerJoin(journalEntries, eq(ledgerEntries.journalEntryId, journalEntries.id))
      .where(and(
        eq(ledgerEntries.journalEntryId, journalEntryId),
        eq(journalEntries.companyId, companyId),
      ));
    if (!lines.length) throw new Error(`Journal entry ${journalEntryId} has no lines to reverse`);

    const reversal = await storage.postToLedger(companyId, {
      entryDate: new Date(),
      description,
      referenceType: "REVERSAL",
      referenceId: String(journalEntryId),
      postingKey: postingKey || `vehicle-journal-reversal:${journalEntryId}`,
      currency: lines[0]?.currency || "USD",
      exchangeRate: Number(lines[0]?.exchangeRate || 1) || 1,
      createdBy: userId,
      lines: lines.map((line: any) => ({
        accountId: line.accountId,
        type: line.type === "DEBIT" ? "CREDIT" : "DEBIT",
        amount: Number(line.amount),
        // Ledger amount is foreign; baseAmount is the frozen base-currency value.
        baseAmount: Number(line.baseAmount ?? line.amount),
        currency: line.currency || "USD",
        exchangeRate: Number(line.exchangeRate || 1) || 1,
        memo: `Reversal of journal ${journalEntryId}`,
        vatTypeId: line.vatTypeId ?? undefined,
        vatAmount: line.vatAmount != null ? Number(line.vatAmount) : undefined,
      })),
    }, tx);

    await tx
      .update(journalEntries)
      .set({ reversalOfJournalEntryId: journalEntryId })
      .where(and(eq(journalEntries.id, reversal.id), eq(journalEntries.companyId, companyId)));
    await tx
      .update(journalEntries)
      .set({ status: "REVERSED" })
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId)));
    return reversal;
  }

  /** Reverse a journal once; a reversed journal is left alone. */
  async function reverseJournalIfPosted(
    tx: any,
    companyId: number,
    journalEntryId: number,
    description: string,
    userId?: string,
    postingKey?: string,
  ) {
    const [entry] = await tx
      .select({ status: journalEntries.status })
      .from(journalEntries)
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId)));
    if (!entry || entry.status === "REVERSED") return null;
    return reverseJournalEntry(tx, companyId, journalEntryId, description, userId, postingKey);
  }

  /** Total of cost lines actually capitalised to inventory (journal posted). */
  async function postedCostTotal(tx: any, vehicleId: number) {
    const rows = await tx
      .select({ baseAmount: vehicleCosts.baseAmount })
      .from(vehicleCosts)
      .where(and(
        eq(vehicleCosts.vehicleId, vehicleId),
        isNotNull(vehicleCosts.costJournalEntryId),
        ne(vehicleCosts.status, "cancelled"),
      ));
    return money(rows.reduce((sum: number, row: any) => sum + Number(row.baseAmount), 0));
  }

  async function refreshVehicleCogsAmount(tx: any, vehicleId: number) {
    const total = await postedCostTotal(tx, vehicleId);
    await tx
      .update(vehicles)
      .set({ cogsAmount: total.toFixed(2), updatedAt: new Date() })
      .where(eq(vehicles.id, vehicleId));
    return total;
  }

  /**
   * Capitalise the posted cost lines and record COGS.
   *
   * Only cost lines with a journal entry are included: pending/disputed lines
   * have not entered inventory, so they must not be relieved to COGS. The
   * vehicle row is locked by the caller (or here) so two concurrent invoices
   * cannot double-post. A second COGS post is refused.
   */
  async function postVehicleCogs(tx: any, companyId: number, vehicleId: number, userId?: string) {
    const vehicle = await lockedVehicle(tx, companyId, vehicleId);
    if (!vehicle) throw new Error("Vehicle not found");
    if (vehicle.cogsJournalEntryId) {
      throw new Error("COGS has already been posted for this vehicle");
    }

    const total = await postedCostTotal(tx, vehicle.id);
    if (!(total > 0)) {
      return { posted: false, journalEntryId: null, amount: 0 };
    }

    const inventoryCode = await storage.getSystemAccountCode(companyId, "inventoryInTransitCode", tx);
    const cogsCode = await storage.getSystemAccountCode(companyId, "cogsAccountCode", tx);
    const cogs = await storage.postToLedger(companyId, {
      entryDate: new Date(),
      description: `COGS: vehicle ${vehicle.stockNumber} ${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.replace(/\s+/g, " ").trim(),
      referenceType: "VEHICLE_COGS",
      referenceId: String(vehicle.id),
      postingKey: `vehicle-sale:${vehicle.id}:cogs`,
      currency: vehicle.saleCurrency || "USD",
      exchangeRate: Number(vehicle.saleExchangeRate || 1) || 1,
      createdBy: userId,
      lines: [
        { accountCode: cogsCode, type: "DEBIT", amount: total, baseAmount: total, currency: vehicle.saleCurrency || "USD", exchangeRate: Number(vehicle.saleExchangeRate || 1) || 1 },
        { accountCode: inventoryCode, type: "CREDIT", amount: total, baseAmount: total, currency: vehicle.saleCurrency || "USD", exchangeRate: Number(vehicle.saleExchangeRate || 1) || 1 },
      ],
    }, tx);

    await tx
      .update(vehicles)
      .set({
        cogsJournalEntryId: cogs.id,
        cogsAmount: total.toFixed(2),
        cogsPostedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicle.id));

    return { posted: true, journalEntryId: cogs.id, amount: total };
  }

  // ── Agency accounting helpers ─────────────────────────────────────────────
  // All account/allocation amounts are base currency. Cash journals use the
  // bank account selected by the cashier and the payment's own FX metadata.

  type AgencyAllocationInput = {
    costId?: number | null;
    allocationType?: "cost" | "fee";
    amount: number;
  };

  async function customerStatementCosts(tx: any, vehicleId: number) {
    return tx
      .select()
      .from(vehicleCosts)
      .where(and(
        eq(vehicleCosts.vehicleId, vehicleId),
        ne(vehicleCosts.status, "cancelled"),
        eq(vehicleCosts.includeInCustomerStatement, true),
      ))
      .orderBy(asc(vehicleCosts.dueDate), asc(vehicleCosts.id));
  }

  async function customerCostSheetTotal(tx: any, vehicleId: number) {
    const costs = await customerStatementCosts(tx, vehicleId);
    return round2(costs.reduce(
      (sum: number, c: any) => sum + Number(c.customerChargeBaseAmount || c.baseAmount || 0),
      0,
    ));
  }
  const chargeOf = (cost: any) => round2(Number(cost.customerChargeBaseAmount || cost.baseAmount || 0));
  const estimateOf = (cost: any) => round2(Number(cost.estimatedBaseAmount || cost.baseAmount || 0));

  async function upsertCustomerAccount(
    tx: any,
    companyId: number,
    v: any,
    agreement: any,
  ) {
    const costSheetTotal = await customerCostSheetTotal(tx, v.id);
    const values = {
      companyId,
      vehicleId: v.id,
      agreementId: agreement?.id ?? null,
      customerId: agreement?.customerId ?? v.customerId ?? null,
      currency: agreement?.currency ?? v.saleCurrency ?? "USD",
      exchangeRate: String(agreement?.exchangeRate ?? v.saleExchangeRate ?? 1),
      totalPrice: Number(agreement?.agreedPrice ?? v.salePrice ?? 0).toFixed(2),
      costSheetTotal: costSheetTotal.toFixed(2),
      processingFeeAmount: Number(agreement?.processingFeeAmount ?? 0).toFixed(2),
      updatedAt: new Date(),
    };
    const [existing] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, v.id));
    if (existing) {
      const [updated] = await tx.update(vehicleCustomerAccounts).set(values).where(eq(vehicleCustomerAccounts.id, existing.id)).returning();
      return updated;
    }
    const [created] = await tx.insert(vehicleCustomerAccounts).values(values).returning();
    return created;
  }

  async function refreshCustomerAccountTotals(tx: any, accountId: number) {
    const [account] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.id, accountId));
    if (!account) return null;

    const [collectedRow] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${payments.amount} / NULLIF(COALESCE(${payments.exchangeRate}, 1), 0)), 0)` })
      .from(payments)
      .where(and(eq(payments.companyId, account.companyId), eq(payments.vehicleId, account.vehicleId)));
    const [allocatedCosts] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${vehicleCustomerPaymentAllocations.amount}), 0)` })
      .from(vehicleCustomerPaymentAllocations)
      .where(and(
        eq(vehicleCustomerPaymentAllocations.accountId, accountId),
        eq(vehicleCustomerPaymentAllocations.allocationType, "cost"),
      ));
    const [allocatedFee] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${vehicleCustomerPaymentAllocations.amount}), 0)` })
      .from(vehicleCustomerPaymentAllocations)
      .where(and(
        eq(vehicleCustomerPaymentAllocations.accountId, accountId),
        eq(vehicleCustomerPaymentAllocations.allocationType, "fee"),
      ));
    const [thirdParty] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${vehicleThirdPartyPayments.baseAmount}), 0)` })
      .from(vehicleThirdPartyPayments)
      .where(eq(vehicleThirdPartyPayments.accountId, accountId));

    const costRows = await tx.select().from(vehicleCosts).where(and(
      eq(vehicleCosts.vehicleId, account.vehicleId),
      ne(vehicleCosts.status, "cancelled"),
    ));
    for (const cost of costRows) {
      const [costAlloc] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${vehicleCustomerPaymentAllocations.amount}), 0)` })
        .from(vehicleCustomerPaymentAllocations)
        .where(and(
          eq(vehicleCustomerPaymentAllocations.accountId, accountId),
          eq(vehicleCustomerPaymentAllocations.costId, cost.id),
        ));
      const [costSettled] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${vehicleThirdPartyPayments.baseAmount}), 0)` })
        .from(vehicleThirdPartyPayments)
        .where(and(
          eq(vehicleThirdPartyPayments.accountId, accountId),
          eq(vehicleThirdPartyPayments.costId, cost.id),
        ));
      await tx.update(vehicleCosts).set({
        customerAllocatedAmount: round2(Number(costAlloc?.total || 0)).toFixed(2),
        thirdPartyPaidAmount: round2(Number(costSettled?.total || 0)).toFixed(2),
      }).where(eq(vehicleCosts.id, cost.id));
    }

    const [updated] = await tx.update(vehicleCustomerAccounts).set({
      costSheetTotal: await customerCostSheetTotal(tx, account.vehicleId).then((n: number) => n.toFixed(2)),
      amountCollected: round2(Number(collectedRow?.total || 0)).toFixed(2),
      amountAllocatedToCosts: round2(Number(allocatedCosts?.total || 0)).toFixed(2),
      amountAllocatedToFee: round2(Number(allocatedFee?.total || 0)).toFixed(2),
      amountPaidToThirdParties: round2(Number(thirdParty?.total || 0)).toFixed(2),
      updatedAt: new Date(),
    }).where(eq(vehicleCustomerAccounts.id, accountId)).returning();
    return updated;
  }

  async function refreshAccountForVehicle(tx: any, companyId: number, vehicleId: number) {
    const [account] = await tx.select().from(vehicleCustomerAccounts).where(and(
      eq(vehicleCustomerAccounts.companyId, companyId),
      eq(vehicleCustomerAccounts.vehicleId, vehicleId),
    ));
    if (account) await refreshCustomerAccountTotals(tx, account.id);
  }

  async function buildAgencyAllocations(
    tx: any,
    account: any,
    paymentBase: number,
    explicit: AgencyAllocationInput[] | undefined,
  ) {
    const costs = await customerStatementCosts(tx, account.vehicleId);
    const feeOutstanding = round2(Number(account.processingFeeAmount || 0) - Number(account.amountAllocatedToFee || 0));
    const allocations: Array<{ costId: number | null; allocationType: "cost" | "fee"; amount: number }> = [];
    let remaining = round2(paymentBase);

    if (explicit && explicit.length) {
      // Track usage inside this payment as well as the persisted balances, so
      // two lines cannot each claim the same outstanding cost or fee.
      let usedFee = 0;
      const usedCosts = new Map<number, number>();
      for (const item of explicit) {
        const amount = round2(item.amount);
        if (!(amount > 0)) throw Object.assign(new Error("Allocation amounts must be positive"), { status: 400 });
        if (item.allocationType === "fee") {
          const open = round2(feeOutstanding - usedFee);
          if (amount > open + 0.01) throw Object.assign(new Error("Fee allocation exceeds the outstanding processing fee"), { status: 400 });
          usedFee = round2(usedFee + amount);
          allocations.push({ costId: null, allocationType: "fee", amount });
          continue;
        }
        const cost = costs.find((c: any) => c.id === item.costId);
        if (!cost) throw Object.assign(new Error("Cost line not found on this cost sheet"), { status: 400 });
        const used = usedCosts.get(cost.id) ?? 0;
        const open = round2(chargeOf(cost) - Number(cost.customerAllocatedAmount || 0) - used);
        if (amount > open + 0.01) throw Object.assign(new Error(`Allocation exceeds the outstanding amount on ${cost.category}`), { status: 400 });
        usedCosts.set(cost.id, round2(used + amount));
        allocations.push({ costId: cost.id, allocationType: "cost", amount });
      }
    } else {
      // Default suggestion: fee first, then cost lines in due-date order.
      if (feeOutstanding > 0 && remaining > 0) {
        const feePart = round2(Math.min(feeOutstanding, remaining));
        allocations.push({ costId: null, allocationType: "fee", amount: feePart });
        remaining = round2(remaining - feePart);
      }
      for (const cost of costs) {
        if (remaining <= 0.01) break;
        const open = round2(chargeOf(cost) - Number(cost.customerAllocatedAmount || 0));
        if (open <= 0) continue;
        const part = round2(Math.min(open, remaining));
        allocations.push({ costId: cost.id, allocationType: "cost", amount: part });
        remaining = round2(remaining - part);
      }
    }

    const totalAllocated = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
    // Customer money can exceed the current obligations; the remainder stays in
    // Customer Funds Held as unallocated credit rather than being forced onto a
    // cost line.
    if (totalAllocated > round2(paymentBase) + 0.01) {
      throw Object.assign(new Error("Payment allocations cannot exceed the payment amount"), { status: 400 });
    }
    return allocations;
  }

  async function postAgencyReceipt(
    tx: any,
    companyId: number,
    v: any,
    account: any,
    payment: any,
    bankAccount: any,
    allocations: Array<{ costId: number | null; allocationType: "cost" | "fee"; amount: number }>,
    feeRecognition: string,
    agreementStatus?: string | null,
    userId?: string,
  ) {
    const baseAmount = round2(baseAmountOf(payment));
    const costBase = round2(allocations.filter(a => a.allocationType === "cost").reduce((s, a) => s + a.amount, 0));
    const feeBase = round2(allocations.filter(a => a.allocationType === "fee").reduce((s, a) => s + a.amount, 0));
    const unallocatedBase = round2(baseAmount - costBase - feeBase);
    const fundsHeldCode = await storage.getSystemAccountCode(companyId, "customerFundsHeldAccountCode", tx);
    const deferredCode = await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx);

    const lines: AgencyLedgerInput["lines"] = [
      { accountCode: bankAccount.code, type: "DEBIT", amount: baseAmount },
      { accountCode: fundsHeldCode, type: "CREDIT", amount: round2(costBase + unallocatedBase) },
    ];
    if (feeBase > 0) {
      lines.push({ accountCode: deferredCode, type: "CREDIT", amount: feeBase });
    }

    const je = await postAgencyLedger(companyId, {
      entryDate: payment.paymentDate,
      description: `Vehicle ${v.stockNumber} customer funds received`,
      referenceType: "VEHICLE_CUSTOMER_FUNDS",
      referenceId: String(payment.id),
      postingKey: `vehicle-agency-receipt:${payment.id}`,
      createdBy: userId,
      lines,
    }, tx);

    await tx.update(payments).set({ journalEntryId: je.id }).where(eq(payments.id, payment.id));
    for (const allocation of allocations) {
      await tx.insert(vehicleCustomerPaymentAllocations).values({
        companyId,
        accountId: account.id,
        paymentId: payment.id,
        costId: allocation.costId,
        allocationType: allocation.allocationType,
        amount: allocation.amount.toFixed(2),
        createdBy: userId,
      });
    }
    // The fee always lands in deferred income first. It is earned immediately
    // for on_collection deals, and immediately for late receipts on a deal that
    // has already been handed over; otherwise handover posts the recognition.
    const earnNow = feeBase > 0 && (feeRecognition === "on_collection" || agreementStatus === "completed");
    if (earnNow) {
      await postFeeRecognition(
        tx, companyId,
        `Vehicle ${v.stockNumber} processing fee earned on collection`,
        feeBase,
        String(payment.id),
        `vehicle-fee-recognition:${agreementStatus === "completed" ? "handover-payment" : "payment"}:${payment.id}`,
        payment.paymentDate,
        Number(account.feeRecognisedAmount || 0) + feeBase,
        account,
        userId,
      );
    }
    await refreshCustomerAccountTotals(tx, account.id);
    return je;
  }

  async function postAgencyThirdPartyPayment(
    tx: any,
    companyId: number,
    v: any,
    account: any,
    bankAccount: any,
    amountBase: number,
    paymentDate: Date,
    reference: string | null,
    settlementId: number,
    userId?: string,
  ) {
    const fundsHeldCode = await storage.getSystemAccountCode(companyId, "customerFundsHeldAccountCode", tx);
    return postAgencyLedger(companyId, {
      entryDate: paymentDate,
      description: `Vehicle ${v.stockNumber} third-party settlement${reference ? ` — ${reference}` : ""}`,
      referenceType: "VEHICLE_THIRD_PARTY_SETTLEMENT",
      referenceId: String(settlementId),
      postingKey: `vehicle-third-party-settlement:${settlementId}`,
      createdBy: userId,
      lines: [
        { accountCode: fundsHeldCode, type: "DEBIT", amount: amountBase },
        { accountCode: bankAccount.code, type: "CREDIT", amount: amountBase },
      ],
    }, tx);
  }

  /** Move a collected fee out of deferred income into processing-fee revenue. */
  async function postFeeRecognition(
    tx: any,
    companyId: number,
    description: string,
    amount: number,
    referenceId: string,
    postingKey: string,
    entryDate: any,
    recognisedAmount: number,
    account: any,
    userId?: string,
  ) {
    const deferredCode = await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx);
    const revenueCode = await storage.getSystemAccountCode(companyId, "vehicleProcessingFeeRevenueAccountCode", tx);
    const je = await postAgencyLedger(companyId, {
      entryDate,
      description,
      referenceType: "VEHICLE_FEE_RECOGNITION",
      referenceId,
      postingKey,
      createdBy: userId,
      lines: [
        { accountCode: deferredCode, type: "DEBIT", amount },
        { accountCode: revenueCode, type: "CREDIT", amount },
      ],
    }, tx);
    await tx.update(vehicleCustomerAccounts)
      .set({ feeRecognisedAmount: round2(recognisedAmount).toFixed(2), updatedAt: new Date() })
      .where(eq(vehicleCustomerAccounts.id, account.id));
    return je;
  }

  async function recogniseAgencyFee(tx: any, companyId: number, agreement: any, userId?: string) {
    const [account] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, agreement.vehicleId));
    if (!account) return null;
    const outstanding = round2(Number(account.amountAllocatedToFee || 0) - Number(account.feeRecognisedAmount || 0));
    if (outstanding <= 0) return null;
    const je = await postFeeRecognition(
      tx, companyId,
      `Vehicle ${agreement.agreementNumber} processing fee earned`,
      outstanding,
      String(agreement.id),
      `vehicle-fee-recognition:${agreement.id}`,
      new Date(),
      Number(account.amountAllocatedToFee || 0),
      account,
      userId,
    );
    await tx.update(vehicleSalesAgreements)
      .set({ feeRecognitionJournalEntryId: je.id, updatedAt: new Date() })
      .where(eq(vehicleSalesAgreements.id, agreement.id));
    return je;
  }

  type OpenScheduleLine = {
    id: number;
    type: string;
    dueDate: string;
    amount: number;
    open: number;
    state: "paid" | "overdue" | "upcoming";
    lastReminderAt: Date | null;
  };

  /** Payments are applied to schedule lines in due order. */
  function openScheduleLines(schedules: any[], paid: number): OpenScheduleLine[] {
    const today = new Date().toISOString().slice(0, 10);
    let remaining = Number(paid) || 0;
    return [...schedules]
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || Number(a.id) - Number(b.id))
      .map((line) => {
        const amount = Number(line.amount || 0);
        const covered = Math.min(remaining, amount);
        remaining -= covered;
        const open = round2(amount - covered);
        return {
          id: line.id,
          type: line.type,
          dueDate: line.dueDate,
          amount,
          open,
          state: open <= 0.004 ? "paid" : line.dueDate < today ? "overdue" : "upcoming",
          lastReminderAt: line.lastReminderAt ?? null,
        };
      });
  }

  /**
   * Attach every vehicle payment to the invoice, update its paid balance and
   * post each receipt to the ledger exactly once. Payments are converted to
   * base USD (the invoice currency) using their captured exchange rate.
   * Deposits posted to liability are cleared against AR at invoice time.
   */
  async function applyVehiclePaymentsToInvoice(
    tx: any,
    companyId: number,
    vehicleId: number,
    invoice: any,
    userId?: string,
  ) {
    const rows = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.companyId, companyId), eq(payments.vehicleId, vehicleId)))
      .orderBy(asc(payments.paymentDate), asc(payments.id));

    let invoicePaid = round2(Number(invoice.paidAmount || 0));
    const invoiceTotal = round2(Number(invoice.total || 0));
    // Invoice totals/allocations are in the invoice currency; GL convention is
    // base = foreign / exchangeRate, so foreign = base * rate.
    const invoiceRate = Number(invoice.exchangeRate || 1) || 1;
    const invoiceFx = fxOf(invoice);
    let allocatedTotal = 0;
    let postedTotal = 0;
    const depositsAccountCode = await storage.getSystemAccountCode(companyId, "customerDepositsAccountCode", tx) || "2010";
    const arAccountCode = await storage.getSystemAccountCode(companyId, "accountsReceivableCode", tx);

    for (const p of rows) {
      const baseAmount = baseAmountOf(p);
      const paymentFx = fxOf(p);
      // Normalise the receipt to the invoice currency before allocation.
      const paymentValue = round2(fromBase(baseAmount, invoiceRate));
      const existingAllocations = await tx
        .select()
        .from(paymentAllocations)
        .where(and(eq(paymentAllocations.paymentId, p.id), isNull(paymentAllocations.reversedAt)));
      const alreadyAllocated = round2(existingAllocations.reduce((s: number, a: any) => s + Number(a.amount || 0), 0));
      const openOnInvoice = Math.max(0, round2(invoiceTotal - invoicePaid));
      const toAllocate = round2(Math.min(Math.max(0, paymentValue - alreadyAllocated), openOnInvoice));

      if (toAllocate > 0.004) {
        await tx.insert(paymentAllocations).values({
          companyId,
          paymentId: p.id,
          invoiceId: invoice.id,
          amount: toAllocate.toFixed(2),
        });
        invoicePaid = round2(invoicePaid + toAllocate);
        allocatedTotal = round2(allocatedTotal + toAllocate);
      }

      if (p.invoiceId == null) {
        await tx.update(payments).set({ invoiceId: invoice.id }).where(eq(payments.id, p.id));
      }

      const receiptAccountCode = p.bankAccountId
        ? await accountCodeById(tx, companyId, Number(p.bankAccountId), "Bank/cash account")
        : await storage.getSystemAccountCode(companyId, "cashAccountCode", tx);
      let journalEntryId = p.journalEntryId;
      if (!journalEntryId) {
        const [existingJe] = await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(and(
            eq(journalEntries.companyId, companyId),
            or(eq(journalEntries.referenceType, "CUSTOMER_DEPOSIT"), eq(journalEntries.referenceType, "CUSTOMER_RECEIPT")),
            eq(journalEntries.referenceId, String(p.id)),
          ))
          .limit(1);
        if (existingJe) journalEntryId = existingJe.id;
      }

      if (p.isDeposit) {
        // Deposits were posted immediately to the liability account. If a
        // legacy row has no journal, post that liability now so clearing is
        // still a two-sided movement (Dr deposits / Cr AR).
        if (!journalEntryId && baseAmount > 0) {
          const je = await storage.postToLedger(companyId, {
            entryDate: p.paymentDate,
            description: `Vehicle deposit ${p.reference || p.id}`,
            referenceType: "CUSTOMER_DEPOSIT",
            referenceId: String(p.id),
            postingKey: `vehicle-deposit:${p.id}`,
            currency: paymentFx.currency,
            exchangeRate: paymentFx.exchangeRate,
            createdBy: userId,
            lines: [
              { accountCode: receiptAccountCode, type: "DEBIT", amount: baseAmount, baseAmount, currency: paymentFx.currency, exchangeRate: paymentFx.exchangeRate },
              { accountCode: depositsAccountCode, type: "CREDIT", amount: baseAmount, baseAmount, currency: paymentFx.currency, exchangeRate: paymentFx.exchangeRate },
            ],
          }, tx);
          journalEntryId = je.id;
          await tx.update(payments).set({ journalEntryId }).where(eq(payments.id, p.id));
        }

        // Clear only the part of the deposit actually applied to this invoice;
        // any excess stays a customer liability (refundable/transferable).
        if (journalEntryId && !p.clearedAt && toAllocate > 0.004) {
          const clearingAmount = Math.min(baseAmount, toBase(toAllocate, invoiceRate));
          if (clearingAmount > 0.004) {
            const clearingJe = await storage.postToLedger(companyId, {
              entryDate: invoice.issueDate || new Date(),
              description: `Clear deposit ${p.reference || p.id} against invoice ${invoice.invoiceNumber}`,
              referenceType: "DEPOSIT_CLEARING",
              referenceId: String(p.id),
              postingKey: `vehicle-deposit-clearing:${p.id}:${invoice.id}`,
              currency: invoiceFx.currency,
              exchangeRate: invoiceFx.exchangeRate,
              createdBy: userId,
              lines: [
                { accountCode: depositsAccountCode, type: "DEBIT", amount: clearingAmount, baseAmount: clearingAmount, currency: invoiceFx.currency, exchangeRate: invoiceFx.exchangeRate },
                { accountCode: arAccountCode, type: "CREDIT", amount: clearingAmount, baseAmount: clearingAmount, currency: invoiceFx.currency, exchangeRate: invoiceFx.exchangeRate },
              ],
            }, tx);
            await tx.update(payments).set({
              clearingJournalEntryId: clearingJe.id,
              clearedAt: new Date(),
            }).where(eq(payments.id, p.id));
          }
        }
      } else if (!journalEntryId && baseAmount > 0) {
        // A receipt taken after invoicing settles AR directly.
        const je = await storage.postToLedger(companyId, {
          entryDate: p.paymentDate,
          description: `Vehicle receipt ${p.reference || p.id}`,
          referenceType: "CUSTOMER_RECEIPT",
          referenceId: String(p.id),
          postingKey: `vehicle-receipt:${p.id}`,
          currency: paymentFx.currency,
          exchangeRate: paymentFx.exchangeRate,
          createdBy: userId,
          lines: [
            { accountCode: receiptAccountCode, type: "DEBIT", amount: baseAmount, baseAmount, currency: paymentFx.currency, exchangeRate: paymentFx.exchangeRate },
            { accountCode: arAccountCode, type: "CREDIT", amount: baseAmount, baseAmount, currency: paymentFx.currency, exchangeRate: paymentFx.exchangeRate },
          ],
        }, tx);
        journalEntryId = je.id;
        postedTotal = round2(postedTotal + baseAmount);
        await tx.update(payments).set({ journalEntryId }).where(eq(payments.id, p.id));
      }
    }

    if (allocatedTotal > 0.004) {
      await tx.update(invoices).set({
        paidAmount: invoicePaid.toFixed(2),
        status: invoicePaid >= invoiceTotal - 0.005 ? "paid" : "partial",
      }).where(eq(invoices.id, invoice.id));
    }

    return { allocatedTotal, postedTotal, paidAmount: invoicePaid };
  }

  async function ownedBankAccount(executor: any, companyId: number, accountId?: number | null) {
    if (!accountId) return { account: null, error: "Choose the bank or cash account the money moved through" };
    const [account] = await executor
      .select({ id: accounts.id, code: accounts.code, type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)));
    if (!account) return { account: null, error: "Bank/cash account not found for this company" };
    if (account.type !== "ASSET") return { account: null, error: "Costs can only be paid from a bank or cash asset account" };
    return { account, error: null };
  }

  async function ownedTaxType(executor: any, companyId: number, taxTypeId?: number | null) {
    if (!taxTypeId) return { taxType: null, error: null };
    const [taxType] = await executor
      .select()
      .from(taxTypes)
      .where(and(eq(taxTypes.id, taxTypeId), or(eq(taxTypes.companyId, companyId), isNull(taxTypes.companyId))));
    if (!taxType) return { taxType: null, error: "Tax type not found for this company" };
    if (taxType.isActive === false) return { taxType: null, error: "Tax type is inactive" };
    return { taxType, error: null };
  }

  /**
   * Put a vehicle invoice through the same VAT/fiscal path as a normal sale.
   * With a registered ZIMRA device the invoice is fiscalised; without one it is
   * still marked as counted so the VAT return includes it (the previous vehicle
   * route left `synced_with_fdms` false, silently dropping the sale from VAT).
   */
  async function ensureVehicleInvoiceFiscalized(
    invoiceId: number,
    companyId: number,
    userId?: string,
    isSuperAdmin?: boolean,
  ) {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.syncedWithFdms) return invoice;

    const [company] = await db
      .select({
        fdmsDeviceId: companies.fdmsDeviceId,
        fdmsDeviceSerialNo: companies.fdmsDeviceSerialNo,
        zimraPrivateKey: companies.zimraPrivateKey,
        zimraCertificate: companies.zimraCertificate,
      })
      .from(companies)
      .where(eq(companies.id, companyId));

    const hasDevice = Boolean(
      company?.fdmsDeviceId && company?.fdmsDeviceSerialNo && company?.zimraPrivateKey && company?.zimraCertificate,
    );
    if (hasDevice) {
      await processInvoiceFiscalization(invoiceId, companyId, userId, Boolean(isSuperAdmin));
    } else {
      await db.update(invoices).set({
        syncedWithFdms: true,
        fdmsStatus: "issued",
        status: invoice.status === "draft" ? "issued" : invoice.status,
        lastValidationAttempt: new Date(),
      }).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
    }

    const [refreshed] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    return refreshed ?? invoice;
  }

  function reminderMessage(v: any, lines: OpenScheduleLine[], amount: number) {
    const description = `${v.year ?? ""} ${v.make} ${v.model}`.replace(/\s+/g, " ").trim();
    const greeting = v.customer?.name ? `Hi ${v.customer.name},` : "Hello,";
    const detail = lines.map((l) => `${l.type} of ${money(l.open)} due ${l.dueDate}`).join("; ");
    return `${greeting} this is a friendly payment reminder for your ${description} (Stock ${v.stockNumber}). ${detail}. Total outstanding: ${money(amount)}. Please contact us to arrange payment.`;
  }

  // ── vehicles ───────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/vehicles", ...need("vehicles.view"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const { stage, status, search } = req.query as Record<string, string | undefined>;
      const conds = [eq(vehicles.companyId, companyId)];
      if (stage) conds.push(eq(vehicles.stage, stage));
      if (status) conds.push(eq(vehicles.status, status));
      if (search) {
        const q = `%${search}%`;
        conds.push(or(ilike(vehicles.stockNumber, q), ilike(vehicles.vin, q), ilike(vehicles.make, q), ilike(vehicles.model, q), ilike(vehicles.containerNumber, q), ilike(customers.name, q))!);
      }
      const rows = await db
        .select({ vehicle: vehicles, customerName: customers.name })
        .from(vehicles)
        .leftJoin(customers, and(eq(customers.id, vehicles.customerId), eq(customers.companyId, companyId)))
        .where(and(...conds))
        .orderBy(desc(vehicles.createdAt));
      const { costs, paid, invoiceBase, fees } = await totalsFor(rows.map((r) => r.vehicle.id));
      const showCosts = await can(req, "vehicles.costs");
      res.json(
        rows.map((r) =>
          redact(
            {
              ...r.vehicle,
              customerName: r.customerName,
              summary: summariseVehicle(r.vehicle, costs.get(r.vehicle.id) || [], paid.get(r.vehicle.id) || 0, invoiceBase.get(r.vehicle.id), fees.get(r.vehicle.id) || 0),
            },
            showCosts,
          ),
        ),
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  });

  router.get("/companies/:companyId/vehicles/:id", ...need("vehicles.view"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const [costs, stages, schedule, paymentRows, customer, invoice, reminders, supplier, salesperson, enquiry] = await Promise.all([
        db.select().from(vehicleCosts).where(eq(vehicleCosts.vehicleId, v.id)).orderBy(asc(vehicleCosts.costDate), asc(vehicleCosts.id)),
        db.select().from(vehicleStageEvents).where(eq(vehicleStageEvents.vehicleId, v.id)).orderBy(asc(vehicleStageEvents.eventDate)),
        db.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id)).orderBy(asc(vehiclePaymentSchedules.dueDate)),
        db.select().from(payments).where(and(eq(payments.vehicleId, v.id), eq(payments.companyId, companyId))).orderBy(asc(payments.paymentDate)),
        v.customerId ? db.select().from(customers).where(eq(customers.id, v.customerId)).then((r) => r[0] ?? null) : Promise.resolve(null),
        v.invoiceId ? db.select().from(invoices).where(eq(invoices.id, v.invoiceId)).then(async (r) => {
          const invoice = r[0];
          return invoice ? { ...invoice, items: await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id)) } : null;
        }) : Promise.resolve(null),
        db.select().from(vehicleReminders).where(eq(vehicleReminders.vehicleId, v.id)).orderBy(desc(vehicleReminders.sentAt)).limit(25),
        v.supplierId ? db.select().from(suppliers).where(eq(suppliers.id, v.supplierId)).then((r) => r[0] ?? null) : Promise.resolve(null),
        v.salespersonId ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, v.salespersonId)).then((r) => r[0] ?? null) : Promise.resolve(null),
        v.enquiryId
          ? db
              .select({
                id: enquiries.id,
                name: enquiries.name,
                phone: enquiries.phone,
                email: enquiries.email,
                interest: enquiries.interest,
                status: enquiries.status,
                stageName: crmStages.name,
                assigneeName: users.name,
              })
              .from(enquiries)
              .leftJoin(crmStages, eq(enquiries.stageId, crmStages.id))
              .leftJoin(users, eq(enquiries.assignedTo, users.id))
              .where(and(eq(enquiries.id, v.enquiryId), eq(enquiries.companyId, companyId)))
              .then((r) => r[0] ?? null)
          : Promise.resolve(null),
      ]);
      const paid = paymentRows.reduce((s, p) => s + baseAmountOf(p), 0);
      const invoiceBase = invoice ? toBase(invoice.total, invoice.exchangeRate) : null;
      const [agreementRow] = await db
        .select({ processingFeeAmount: vehicleSalesAgreements.processingFeeAmount, exchangeRate: vehicleSalesAgreements.exchangeRate })
        .from(vehicleSalesAgreements)
        .where(eq(vehicleSalesAgreements.vehicleId, v.id));
      const feeBase = agreementRow ? toBase(agreementRow.processingFeeAmount, agreementRow.exchangeRate) : 0;
      const enrichedInvoice = invoice
        ? {
            ...invoice,
            vehicleCosts: costs.filter((c: any) => c.status !== "cancelled"),
            vehicle: v,
          }
        : null;
      res.json(redact({
        ...v,
        customer,
        supplier,
        salesperson,
        enquiry,
        costs,
        stages,
        schedule,
        // Schedule amounts are in saleCurrency; convert base receipts before comparison.
        openSchedule: openScheduleLines(schedule, schedulePaid(v, paid)),
        payments: paymentRows,
        invoice: enrichedInvoice,
        reminders,
        summary: summariseVehicle(v, costs, paid, invoiceBase, feeBase),
      }, await can(req, "vehicles.costs")));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  });

  router.post("/companies/:companyId/vehicles", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const body = { ...req.body };
      const result = await db.transaction(async (tx: any) => {
        if (!body.stockNumber) {
          // Claim the next number atomically. The counter stores the *next*
          // number, so the claim returns the current one and leaves +1 behind.
          const [claimed] = await tx
            .insert(vehicleStockCounters)
            .values({ companyId, nextNumber: 2, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: vehicleStockCounters.companyId,
              set: {
                nextNumber: sql`${vehicleStockCounters.nextNumber} + 1`,
                updatedAt: new Date(),
              },
            })
            .returning({ nextNumber: vehicleStockCounters.nextNumber });
          const issued = Number(claimed?.nextNumber ?? 1) - 1;
          body.stockNumber = `VH-${String(issued).padStart(4, "0")}`;
        }

        const data = insertVehicleSchema.parse({ ...body, companyId, createdBy: req.user?.id });
        const refError = await assertOwnedRefs(companyId, data);
        if (refError) throw new Error(refError);

        const [created] = await tx.insert(vehicles).values(data).returning();
        await tx.insert(vehicleStageEvents).values({ vehicleId: created.id, stage: created.stage, notes: "Vehicle recorded", createdBy: req.user?.id });
        return created;
      });

      if (result.enquiryId) {
        await logEnquiryVehicleActivity(
          db,
          result.enquiryId,
          `Stock ${result.stockNumber} ${result.year ?? ""} ${result.make} ${result.model}`.replace(/\s+/g, " ").trim() + " added to the vehicle list.",
          { vehicleId: result.id },
          req.user?.id,
        );
      }
      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      if (error?.code === "23505") return res.status(409).json({ error: "Stock number or VIN already exists for this company" });
      res.status(500).json({ error: error.message || "Failed to create vehicle" });
    }
  });

  router.patch("/companies/:companyId/vehicles/:id", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      
      // Block modifications if COGS has been posted
      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "Vehicle has posted COGS; modifications are locked" });
      }
      
      const updates = insertVehicleSchema.partial().parse(req.body);
      // Fields that drive documents are never writable through a generic PATCH.
      // Status changes go through reserve/invoice/deliver/cancel, and the
      // commercial terms are set by the reserve (deal) route so they cannot be
      // edited out from under an existing invoice or receipt.
      for (const key of [
        "companyId", "stage", "createdBy", "invoiceId", "status", "customerId",
        "salePrice", "saleCurrency", "saleExchangeRate",
        "cogsJournalEntryId", "cogsAmount", "cogsPostedAt",
      ]) {
        delete (updates as any)[key];
      }
      // The accounting model changes posting behaviour, so it is locked once
      // an agreement/invoice exists.
      const [linkedAgreement] = await db.select({ id: vehicleSalesAgreements.id })
        .from(vehicleSalesAgreements).where(eq(vehicleSalesAgreements.vehicleId, v.id));
      if ((v.invoiceId || linkedAgreement) && (updates as any).accountingModel !== undefined) {
        delete (updates as any).accountingModel;
      }
      const enquiryChanged =
        (updates as any).enquiryId !== undefined && (updates as any).enquiryId !== v.enquiryId;
      if (enquiryChanged && (v.invoiceId || v.cogsJournalEntryId)) {
        return res.status(409).json({
          error: "The linked enquiry cannot be changed after the vehicle has been invoiced",
        });
      }

      const refError = await assertOwnedRefs(companyId, updates);
      if (refError) return res.status(400).json({ error: refError });
      const [updated] = await db.update(vehicles).set({ ...updates, updatedAt: new Date() }).where(eq(vehicles.id, v.id)).returning();
      if (enquiryChanged && updated.enquiryId) {
        const label = `${updated.year ?? ""} ${updated.make} ${updated.model}`.replace(/\s+/g, " ").trim();
        await logEnquiryVehicleActivity(
          db,
          updated.enquiryId,
          `Stock ${updated.stockNumber} ${label} linked to this lead.`,
          { vehicleId: updated.id },
          req.user?.id,
        );
      }
      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  });

  /**
   * Reserves an available vehicle for a CRM enquiry. This is the "won lead →
   * deal" hand-off: it links the customer (creating one from the captured
   * contact details when needed), the enquiry and the salesperson, agrees the
   * sale price and moves the vehicle to reserved. The enquiry stays open until
   * the invoice is raised.
   */
  router.post("/companies/:companyId/vehicles/:id/reserve", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);

      const body = z
        .object({
          enquiryId: z.coerce.number().int().positive().optional(),
          customerId: z.coerce.number().int().positive().optional(),
          salePrice: z.coerce.number().nonnegative().optional(),
          saleCurrency: z.string().min(1).max(8).optional(),
          saleExchangeRate: z.coerce.number().positive().optional(),
          salespersonId: z.string().uuid().nullable().optional(),
          amendReservation: z.boolean().default(false),
        })
        .parse(req.body ?? {});

      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, parseInt(req.params.id));
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (v.invoiceId || v.status !== (body.amendReservation ? "reserved" : "available")) {
          throw Object.assign(new Error("The vehicle deal has changed. Reload it before saving."), { status: 409 });
        }
        const [enquiry] = body.enquiryId
          ? await tx.select().from(enquiries)
              .where(and(eq(enquiries.id, body.enquiryId), eq(enquiries.companyId, companyId)))
              .for("update")
          : [];
        if (body.enquiryId && !enquiry) throw Object.assign(new Error("Enquiry not found"), { status: 404 });

        let customerId = body.customerId ?? v.customerId ?? enquiry?.customerId ?? null;
        const salespersonId = body.salespersonId !== undefined
          ? body.salespersonId
          : enquiry?.assignedTo ?? v.salespersonId ?? null;
        const refError = await assertOwnedRefs(companyId, { customerId, salespersonId }, tx);
        if (refError) throw new Error(refError);
        let customerCreated = false;
        if (!customerId && enquiry) {
          const ensured = await ensureEnquiryCustomer(tx, companyId, enquiry);
          customerId = ensured.customerId;
          customerCreated = ensured.created;
        }
        if (!customerId) throw new Error("A customer is required to reserve this vehicle");

        const salePrice = body.salePrice ?? Number(v.salePrice ?? v.targetPrice ?? 0);
        const saleCurrency = body.saleCurrency ?? v.saleCurrency ?? "USD";
        const saleExchangeRate = body.saleExchangeRate ?? Number(v.saleExchangeRate ?? 1);

        const [updated] = await tx
          .update(vehicles)
          .set({
            status: "reserved",
            customerId,
            enquiryId: body.enquiryId ?? v.enquiryId,
            salespersonId,
            salePrice: salePrice.toFixed(2),
            saleCurrency,
            saleExchangeRate: saleExchangeRate.toFixed(6),
            updatedAt: new Date(),
          })
          .where(eq(vehicles.id, v.id))
          .returning();

        if (enquiry) {
          await tx
            .update(enquiries)
            .set({
              customerId,
              assignedTo: enquiry.assignedTo ?? salespersonId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(enquiries.id, enquiry.id));
          const label = `${updated.year ?? ""} ${updated.make} ${updated.model}`.replace(/\s+/g, " ").trim();
          await logEnquiryVehicleActivity(
            tx,
            enquiry.id,
            `Reserved ${updated.stockNumber} ${label} at ${saleCurrency} ${salePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
            { vehicleId: updated.id, salePrice, saleCurrency, status: updated.status },
            req.user?.id,
          );
        }

        return { vehicle: updated, customerId, customerCreated, enquiry };
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 400).json({ error: error.message || "Failed to reserve vehicle" });
    }
  });

  router.delete("/companies/:companyId/vehicles/:id", ...need("vehicles.delete"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      
      // Block deletion if COGS has been posted
      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "Vehicle has posted COGS; cannot delete. Reverse the journal entry first." });
      }
      
      const [hasPayment] = await db.select({ id: payments.id }).from(payments).where(eq(payments.vehicleId, v.id)).limit(1);
      if (hasPayment || v.invoiceId) return res.status(409).json({ error: "Vehicle has payments or an invoice; cancel it instead" });

      // A cost line that has hit the ledger is a posted accounting document.
      // Deleting the vehicle would cascade the cost and orphan the journal.
      const [postedCost] = await db
        .select({ id: vehicleCosts.id })
        .from(vehicleCosts)
        .where(and(
          eq(vehicleCosts.vehicleId, v.id),
          or(
            isNotNull(vehicleCosts.costJournalEntryId),
            isNotNull(vehicleCosts.paymentJournalEntryId),
            isNotNull(vehicleCosts.supplierInvoiceId),
          ),
        ))
        .limit(1);
      if (postedCost) {
        return res.status(409).json({ error: "Vehicle costs have journal entries; reverse them before deleting" });
      }

      await db.delete(vehicles).where(eq(vehicles.id, v.id));
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete vehicle" });
    }
  });

  // ── costs ──────────────────────────────────────────────────────────────────

  const costBodySchema = z.object({
    category: z.enum(VEHICLE_COST_CATEGORIES),
    description: z.string().max(2000).nullable().optional(),
    amount: z.coerce.number().positive(),
    estimatedBaseAmount: z.coerce.number().min(0).optional(),
    customerChargeBaseAmount: z.coerce.number().min(0).optional(),
    includeInCustomerStatement: z.boolean().optional(),
    currency: z.string().min(1).max(8).default("USD"),
    exchangeRate: z.coerce.number().positive().default(1),
    payee: z.string().max(255).nullable().optional(),
    reference: z.string().max(255).nullable().optional(),
    costDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    paidAt: z.string().nullable().optional(),
    status: z.enum(VEHICLE_COST_STATUSES).default("pending"),
    supplierId: z.coerce.number().int().positive().nullable().optional(),
    settlementMethod: z.enum(["cash", "bank_transfer", "supplier_bill"]).default("cash"),
    bankAccountId: z.coerce.number().int().positive().nullable().optional(),
    inputVatAmount: z.coerce.number().min(0).default(0),
    inputVatTypeId: z.coerce.number().int().positive().nullable().optional(),
  });

  router.post("/companies/:companyId/vehicles/:id/costs", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "COGS has already been posted for this vehicle; costs are locked." });
      }

      const data = costBodySchema.parse(req.body ?? {});
      const supplierError = await assertOwnedSupplier(companyId, data.supplierId ?? null);
      if (supplierError) return res.status(400).json({ error: supplierError });
      if (data.settlementMethod === "supplier_bill" && !data.supplierId) {
        return res.status(400).json({ error: "Choose the supplier for a supplier-bill cost" });
      }

      const baseAmount = toBase(data.amount, data.exchangeRate);
      if (baseAmount <= 0) return res.status(400).json({ error: "The cost amount must be greater than zero" });
      const vatAmount = money(data.inputVatAmount);
      if (vatAmount > baseAmount) {
        return res.status(400).json({ error: "Input VAT cannot exceed the total cost amount" });
      }

      if (data.settlementMethod !== "supplier_bill") {
        const { error } = await ownedBankAccount(db, companyId, data.bankAccountId ?? null);
        if (error) return res.status(400).json({ error });
      }
      const { error: taxError } = await ownedTaxType(db, companyId, data.inputVatTypeId ?? null);
      if (taxError) return res.status(400).json({ error: taxError });
      if (vatAmount > 0 && !data.inputVatTypeId) {
        return res.status(400).json({ error: "Choose a tax type for the recoverable input VAT" });
      }

      const status = data.settlementMethod === "supplier_bill" && data.status === "paid"
        ? "pending"
        : data.status;
      const [created] = await db
        .insert(vehicleCosts)
        .values({
          vehicleId: v.id,
          category: data.category,
          description: data.description ?? null,
          amount: data.amount.toFixed(2),
          currency: data.currency.toUpperCase(),
          exchangeRate: data.exchangeRate.toFixed(6),
          baseAmount: baseAmount.toFixed(2),
          estimatedBaseAmount: (data.estimatedBaseAmount ?? baseAmount).toFixed(2),
          customerChargeBaseAmount: (data.customerChargeBaseAmount ?? baseAmount).toFixed(2),
          includeInCustomerStatement: data.includeInCustomerStatement ?? true,
          payee: data.payee ?? null,
          reference: data.reference ?? null,
          costDate: data.costDate ?? null,
          dueDate: data.dueDate ?? null,
          paidAt: status === "paid" ? data.paidAt ?? data.costDate ?? new Date().toISOString().slice(0, 10) : null,
          status,
          supplierId: data.supplierId ?? null,
          settlementMethod: data.settlementMethod,
          bankAccountId: data.bankAccountId ?? null,
          inputVatAmount: vatAmount.toFixed(2),
          inputVatTypeId: data.inputVatTypeId ?? null,
          source: "manual",
          sourceId: null,
          createdBy: req.user?.id,
        })
        .returning();
      await refreshAccountForVehicle(db, companyId, v.id);
      res.status(201).json(created);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to add cost" });
    }
  });

  router.patch("/companies/:companyId/vehicles/:id/costs/:costId", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const [existing] = await db
        .select()
        .from(vehicleCosts)
        .where(and(eq(vehicleCosts.id, parseInt(req.params.costId)), eq(vehicleCosts.vehicleId, v.id)));
      if (!existing) return res.status(404).json({ error: "Cost line not found" });

      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "COGS has already been posted for this vehicle; costs are locked." });
      }
      if (existing.costJournalEntryId || existing.paymentJournalEntryId || existing.supplierInvoiceId) {
        return res.status(409).json({
          error: "This cost has journal entries. Reverse it before changing its amount, settlement or tax.",
        });
      }

      const body = costBodySchema.partial().parse(req.body ?? {});
      const supplierError = await assertOwnedSupplier(companyId, body.supplierId);
      if (supplierError) return res.status(400).json({ error: supplierError });

      const amount = body.amount ?? Number(existing.amount);
      const exchangeRate = body.exchangeRate ?? Number(existing.exchangeRate ?? 1);
      const baseAmount = toBase(amount, exchangeRate);
      const vatAmount = body.inputVatAmount !== undefined
        ? money(body.inputVatAmount)
        : money(Number(existing.inputVatAmount || 0));
      if (vatAmount > baseAmount) {
        return res.status(400).json({ error: "Input VAT cannot exceed the total cost amount" });
      }
      const settlementMethod = body.settlementMethod ?? existing.settlementMethod ?? "cash";
      if (settlementMethod === "supplier_bill" && !(body.supplierId ?? existing.supplierId)) {
        return res.status(400).json({ error: "Choose the supplier for a supplier-bill cost" });
      }
      const bankAccountId = body.bankAccountId !== undefined ? body.bankAccountId : existing.bankAccountId;
      if (settlementMethod !== "supplier_bill") {
        const { error } = await ownedBankAccount(db, companyId, bankAccountId ?? null);
        if (error) return res.status(400).json({ error });
      }
      const taxTypeId = body.inputVatTypeId !== undefined ? body.inputVatTypeId : existing.inputVatTypeId;
      const { error: taxError } = await ownedTaxType(db, companyId, taxTypeId ?? null);
      if (taxError) return res.status(400).json({ error: taxError });
      if (vatAmount > 0 && !taxTypeId) {
        return res.status(400).json({ error: "Choose a tax type for the recoverable input VAT" });
      }

      const status = body.status ?? existing.status;
      const updates: Record<string, any> = {
        ...body,
        baseAmount: baseAmount.toFixed(2),
        estimatedBaseAmount: (body.estimatedBaseAmount ?? Number(existing.estimatedBaseAmount || baseAmount)).toFixed(2),
        customerChargeBaseAmount: (body.customerChargeBaseAmount ?? Number(existing.customerChargeBaseAmount || baseAmount)).toFixed(2),
        inputVatAmount: vatAmount.toFixed(2),
        settlementMethod,
        bankAccountId: bankAccountId ?? null,
        inputVatTypeId: taxTypeId ?? null,
      };
      // Keep the paid date sane when the lifecycle status is changed on its own.
      if (status === "paid" && body.paidAt === undefined && !existing.paidAt) {
        updates.paidAt = existing.costDate ?? new Date().toISOString().slice(0, 10);
      }
      if (status === "pending" && body.paidAt === undefined) updates.paidAt = null;

      const [updated] = await db.update(vehicleCosts).set(updates).where(eq(vehicleCosts.id, existing.id)).returning();
      await refreshAccountForVehicle(db, companyId, v.id);
      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update cost" });
    }
  });

  /**
   * Settle and capitalise a cost line.
   *
   * Cash/bank costs post only once the line is actually paid, and the bank/cash
   * account captured on the line is the one credited. Supplier costs create a
   * real supplier bill (Dr inventory in transit / Dr input VAT / Cr AP); the
   * separate /pay route later clears AP from the chosen bank account. Nothing
   * is posted while the line is pending, disputed or cancelled.
   */
  router.post("/companies/:companyId/vehicles/:id/costs/:costId/post", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const costId = parseInt(req.params.costId);

      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, parseInt(req.params.id));
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (v.cogsJournalEntryId) {
          throw Object.assign(new Error("COGS has already been posted for this vehicle; costs are locked."), { status: 409 });
        }
        if (isAgencyVehicle(v)) {
          throw Object.assign(new Error("Agency cost lines are settled through third-party payments, not capitalised to inventory"), { status: 409 });
        }

        const [cost] = await tx
          .select()
          .from(vehicleCosts)
          .where(and(eq(vehicleCosts.id, costId), eq(vehicleCosts.vehicleId, v.id)))
          .for("update");
        if (!cost) throw Object.assign(new Error("Cost line not found"), { status: 404 });
        if (cost.costJournalEntryId) throw Object.assign(new Error("This cost has already been posted"), { status: 409 });
        if (cost.status === "cancelled") throw Object.assign(new Error("Cancelled costs cannot be posted"), { status: 400 });
        if (cost.status === "disputed") throw Object.assign(new Error("Disputed costs cannot be posted until the dispute is resolved"), { status: 400 });

        const gross = money(Number(cost.baseAmount));
        if (!(gross > 0)) throw Object.assign(new Error("The cost amount must be greater than zero"), { status: 400 });
        const vat = Math.min(gross, money(Number(cost.inputVatAmount || 0)));
        if (vat > 0 && !cost.inputVatTypeId) {
          throw Object.assign(new Error("Choose a tax type for the recoverable input VAT"), { status: 400 });
        }
        const net = round2(gross - vat);

        const inventoryCode = await storage.getSystemAccountCode(companyId, "inventoryInTransitCode", tx);
        const inputVatCode = await storage.getSystemAccountCode(companyId, "vatInputAccountCode", tx);
        const entryDate = cost.costDate ? new Date(cost.costDate) : new Date();

        if (cost.settlementMethod === "supplier_bill") {
          if (!cost.supplierId) {
            throw Object.assign(new Error("Choose the supplier for a supplier-bill cost"), { status: 400 });
          }
          const apCode = await storage.getSystemAccountCode(companyId, "accountsPayableCode", tx);
          const invoiceNumber = cost.reference?.trim() || `VC-${cost.id}`;

          const [bill] = await tx.insert(supplierInvoices).values({
            companyId,
            supplierId: cost.supplierId,
            invoiceNumber,
            date: entryDate,
            dueDate: cost.dueDate ? new Date(cost.dueDate) : null,
            transactionType: "Invoice",
            subtotalAmount: net.toFixed(2),
            totalAmount: gross.toFixed(2),
            taxAmount: vat.toFixed(2),
            taxInclusive: true,
            currency: cost.currency,
            exchangeRate: cost.exchangeRate,
            status: "unpaid",
            notes: `Vehicle cost ${v.stockNumber} — ${cost.category}${cost.description ? `: ${cost.description}` : ""}`,
          }).returning();

          await tx.insert(supplierInvoiceItems).values({
            supplierInvoiceId: bill.id,
            description: cost.description || `Vehicle cost — ${cost.category}`,
            quantity: "1",
            unitPrice: net.toFixed(2),
            totalPrice: net.toFixed(2),
            taxTypeId: vat > 0 ? cost.inputVatTypeId : null,
            taxRate: vat > 0 && net > 0 ? ((vat / net) * 100).toFixed(2) : "0.00",
            taxAmount: vat.toFixed(2),
            isRecoverable: true,
          });

          const lines: any[] = [
            { accountCode: inventoryCode, type: "DEBIT", amount: net },
            { accountCode: apCode, type: "CREDIT", amount: gross },
          ];
          if (vat > 0) {
            lines.splice(1, 0, { accountCode: inputVatCode, type: "DEBIT", amount: vat, vatTypeId: cost.inputVatTypeId });
          }

          const je = await storage.postToLedger(companyId, {
            entryDate,
            description: `Supplier bill: vehicle ${v.stockNumber} ${cost.category}`,
            referenceType: "VEHICLE_COST",
            referenceId: String(cost.id),
            createdBy: req.user?.id,
            lines,
          }, tx);

          const [updated] = await tx
            .update(vehicleCosts)
            .set({ costJournalEntryId: je.id, supplierInvoiceId: bill.id })
            .where(eq(vehicleCosts.id, cost.id))
            .returning();
          return { cost: updated, journalEntry: je, supplierInvoice: bill };
        }

        // Cash / bank transfer: only an actually paid line reaches the ledger.
        if (cost.status !== "paid") {
          throw Object.assign(new Error("Mark the cost as paid before posting it to inventory"), { status: 400 });
        }
        const { account: bankAccount, error } = await ownedBankAccount(tx, companyId, cost.bankAccountId);
        if (error || !bankAccount) throw Object.assign(new Error(error || "Bank account not found"), { status: 400 });

        const lines: any[] = [
          { accountCode: inventoryCode, type: "DEBIT", amount: net },
          { accountCode: bankAccount.code, type: "CREDIT", amount: gross },
        ];
        if (vat > 0) {
          lines.splice(1, 0, { accountCode: inputVatCode, type: "DEBIT", amount: vat, vatTypeId: cost.inputVatTypeId });
        }

        const je = await storage.postToLedger(companyId, {
          entryDate,
          description: `Vehicle cost capitalised: ${v.stockNumber} ${cost.category}${cost.description ? ` — ${cost.description}` : ""}`,
          referenceType: "VEHICLE_COST",
          referenceId: String(cost.id),
          createdBy: req.user?.id,
          lines,
        }, tx);

        const [updated] = await tx
          .update(vehicleCosts)
          .set({
            costJournalEntryId: je.id,
            status: "paid",
            paidAt: cost.paidAt ?? new Date().toISOString().slice(0, 10),
          })
          .where(eq(vehicleCosts.id, cost.id))
          .returning();
        return { cost: updated, journalEntry: je };
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      res.status(error.status || 500).json({ error: error.message || "Failed to post cost to inventory" });
    }
  });

  /** Pay a supplier-bill cost and clear the AP it created. */
  router.post("/companies/:companyId/vehicles/:id/costs/:costId/pay", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const costId = parseInt(req.params.costId);
      const body = z.object({
        bankAccountId: z.coerce.number().int().positive(),
        paymentDate: z.coerce.date().optional(),
        reference: z.string().max(255).nullable().optional(),
      }).parse(req.body ?? {});

      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, parseInt(req.params.id));
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });

        const [cost] = await tx
          .select()
          .from(vehicleCosts)
          .where(and(eq(vehicleCosts.id, costId), eq(vehicleCosts.vehicleId, v.id)))
          .for("update");
        if (!cost) throw Object.assign(new Error("Cost line not found"), { status: 404 });
        if (cost.settlementMethod !== "supplier_bill" || !cost.supplierInvoiceId) {
          throw Object.assign(new Error("Only posted supplier-bill costs can be paid here"), { status: 400 });
        }
        if (cost.paymentJournalEntryId) {
          throw Object.assign(new Error("This supplier bill has already been paid"), { status: 409 });
        }

        const { account: bankAccount, error } = await ownedBankAccount(tx, companyId, body.bankAccountId);
        if (error || !bankAccount) throw Object.assign(new Error(error || "Bank account not found"), { status: 400 });

        const [bill] = await tx
          .select()
          .from(supplierInvoices)
          .where(and(eq(supplierInvoices.id, cost.supplierInvoiceId), eq(supplierInvoices.companyId, companyId)))
          .for("update");
        if (!bill) throw Object.assign(new Error("Supplier bill not found"), { status: 404 });
        if (bill.status === "cancelled") {
          throw Object.assign(new Error("This supplier bill has been cancelled"), { status: 409 });
        }

        const outstanding = round2(Number(bill.totalAmount) - Number(bill.paidAmount || 0));
        if (!(outstanding > 0)) throw Object.assign(new Error("This supplier bill is already settled"), { status: 409 });

        const apCode = await storage.getSystemAccountCode(companyId, "accountsPayableCode", tx);
        const je = await storage.postToLedger(companyId, {
          entryDate: body.paymentDate ?? new Date(),
          description: `Pay supplier bill ${bill.invoiceNumber} — vehicle ${v.stockNumber}`,
          referenceType: "VEHICLE_COST_PAYMENT",
          referenceId: String(cost.id),
          createdBy: req.user?.id,
          lines: [
            { accountCode: apCode, type: "DEBIT", amount: outstanding },
            { accountCode: bankAccount.code, type: "CREDIT", amount: outstanding },
          ],
        }, tx);

        await tx.insert(supplierPayments).values({
          companyId,
          supplierId: cost.supplierId!,
          supplierInvoiceId: bill.id,
          amount: outstanding.toFixed(2),
          currency: bill.currency ?? "USD",
          paymentDate: body.paymentDate ?? new Date(),
          method: "Bank",
          reference: body.reference ?? cost.reference ?? null,
          notes: `Vehicle ${v.stockNumber} — ${cost.category}`,
          createdBy: req.user?.id ?? null,
        });

        await tx.update(supplierInvoices).set({
          paidAmount: Number(bill.totalAmount).toFixed(2),
          status: "paid",
        }).where(eq(supplierInvoices.id, bill.id));

        const [updated] = await tx
          .update(vehicleCosts)
          .set({
            paymentJournalEntryId: je.id,
            status: "paid",
            paidAt: (body.paymentDate ?? new Date()).toISOString().slice(0, 10),
          })
          .where(eq(vehicleCosts.id, cost.id))
          .returning();

        return { cost: updated, journalEntry: je };
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to pay supplier bill" });
    }
  });

  /** Reverse a posted cost and, for supplier bills, its payment and bill. */
  router.post("/companies/:companyId/vehicles/:id/costs/:costId/reverse", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const costId = parseInt(req.params.costId);
      const body = z.object({ reason: z.string().max(500).nullable().optional() }).parse(req.body ?? {});

      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, parseInt(req.params.id));
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (v.cogsJournalEntryId) {
          throw Object.assign(new Error("COGS has already been posted for this vehicle; reverse the sale before reversing costs"), { status: 409 });
        }

        const [cost] = await tx
          .select()
          .from(vehicleCosts)
          .where(and(eq(vehicleCosts.id, costId), eq(vehicleCosts.vehicleId, v.id)))
          .for("update");
        if (!cost) throw Object.assign(new Error("Cost line not found"), { status: 404 });
        if (!cost.costJournalEntryId && !cost.paymentJournalEntryId && !cost.supplierInvoiceId) {
          throw Object.assign(new Error("This cost has not been posted, so there is nothing to reverse"), { status: 400 });
        }

        const detail = `${v.stockNumber} ${cost.category}${body.reason ? ` — ${body.reason}` : ""}`;
        if (cost.paymentJournalEntryId) {
          await reverseJournalEntry(tx, companyId, cost.paymentJournalEntryId, `Reverse cost payment: ${detail}`, req.user?.id);
        }
        if (cost.costJournalEntryId) {
          await reverseJournalEntry(tx, companyId, cost.costJournalEntryId, `Reverse vehicle cost: ${detail}`, req.user?.id);
        }
        if (cost.supplierInvoiceId) {
          await tx.update(supplierInvoices).set({
            status: "cancelled",
            paidAmount: "0.00",
            notes: sql`COALESCE(${supplierInvoices.notes} || E'\n', '') || ${`Reversed with vehicle cost ${cost.id}: ${body.reason || "no reason given"}`}`,
          }).where(and(eq(supplierInvoices.id, cost.supplierInvoiceId), eq(supplierInvoices.companyId, companyId)));
        }

        const [updated] = await tx
          .update(vehicleCosts)
          .set({
            costJournalEntryId: null,
            paymentJournalEntryId: null,
            supplierInvoiceId: null,
            status: "cancelled",
            paidAt: null,
          })
          .where(eq(vehicleCosts.id, cost.id))
          .returning();

        await refreshAccountForVehicle(tx, companyId, v.id);
        return { cost: updated };
      });

      res.json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to reverse cost" });
    }
  });

  router.delete("/companies/:companyId/vehicles/:id/costs/:costId", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "COGS has already been posted for this vehicle; costs are locked." });
      }
      const [cost] = await db
        .select({
          costJournalEntryId: vehicleCosts.costJournalEntryId,
          paymentJournalEntryId: vehicleCosts.paymentJournalEntryId,
          supplierInvoiceId: vehicleCosts.supplierInvoiceId,
        })
        .from(vehicleCosts)
        .where(and(eq(vehicleCosts.id, parseInt(req.params.costId)), eq(vehicleCosts.vehicleId, v.id)));
      if (cost?.costJournalEntryId || cost?.paymentJournalEntryId || cost?.supplierInvoiceId) {
        return res.status(409).json({ error: "This cost has journal entries. Reverse it before deleting it." });
      }
      await db.delete(vehicleCosts).where(and(eq(vehicleCosts.id, parseInt(req.params.costId)), eq(vehicleCosts.vehicleId, v.id)));
      await refreshAccountForVehicle(db, companyId, v.id);
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete cost" });
    }
  });

  // ── import tracking ────────────────────────────────────────────────────────

  const documentMetadata = {
    id: vehicleDocuments.id, name: vehicleDocuments.name, kind: vehicleDocuments.kind,
    mimeType: vehicleDocuments.mimeType, createdAt: vehicleDocuments.createdAt,
  };
  const maxDocumentBytes = 5 * 1024 * 1024;
  const documentPath = "/companies/:companyId/vehicles/:id/documents";

  router.get(documentPath, ...need("vehicles.view"), async (req, res, next) => {
    try {
      const vehicle = await loadVehicle(Number(req.params.companyId), Number(req.params.id));
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      const rows = await db.select(documentMetadata).from(vehicleDocuments)
        .where(eq(vehicleDocuments.vehicleId, vehicle.id)).orderBy(desc(vehicleDocuments.id));
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.post(documentPath, ...need("vehicles.manage"), async (req, res, next) => {
    try {
      const vehicle = await loadVehicle(Number(req.params.companyId), Number(req.params.id));
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      const input = z.object({
        name: z.string().trim().min(1).max(180),
        kind: z.enum(["Supplier invoice", "Shipping", "Customs", "Signed agreement", "Other"]),
        contentBase64: z.string().min(4).max(Math.ceil(maxDocumentBytes / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
      }).parse(req.body);
      const bytes = Buffer.from(input.contentBase64, "base64");
      if (bytes.length > maxDocumentBytes) return res.status(400).json({ error: "The document exceeds 5 MB" });
      const mimeType = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
        : bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? "image/png"
        : bytes.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg" : null;
      if (!mimeType) return res.status(400).json({ error: "Choose a PDF, PNG, or JPEG document" });
      const [document] = await db.insert(vehicleDocuments).values({ ...input, mimeType, vehicleId: vehicle.id })
        .returning(documentMetadata);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Enter a document name, type, and a file up to 5 MB" });
      next(error);
    }
  });

  router.get(documentPath + "/:documentId", ...need("vehicles.view"), async (req, res, next) => {
    try {
      const vehicle = await loadVehicle(Number(req.params.companyId), Number(req.params.id));
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      const [document] = await db.select().from(vehicleDocuments).where(and(
        eq(vehicleDocuments.vehicleId, vehicle.id), eq(vehicleDocuments.id, Number(req.params.documentId)),
      ));
      if (!document) return res.status(404).json({ error: "Document not found" });
      res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" })
        .type(document.mimeType).send(Buffer.from(document.contentBase64, "base64"));
    } catch (error) { next(error); }
  });

  const earlyHandoverReason = z.string().trim().min(1).max(1000).nullish();

  async function completeHandover(
    tx: any,
    companyId: number,
    vehicle: typeof vehicles.$inferSelect,
    details: { notes?: string | null; eventDate?: Date; notifyCustomer?: boolean; notifiedVia?: string | null; createdBy?: string; earlyHandoverReason?: string | null },
    requireAgreement = false,
  ) {
    const [existing] = await tx.select().from(vehicleSalesAgreements).where(and(
      eq(vehicleSalesAgreements.companyId, companyId),
      eq(vehicleSalesAgreements.vehicleId, vehicle.id),
    ));
    if (requireAgreement && !existing) throw Object.assign(new Error("Sales agreement not found"), { status: 404 });
    if (vehicle.status === "cancelled" || existing?.status === "cancelled") {
      throw Object.assign(new Error("A cancelled deal cannot be handed over"), { status: 409 });
    }
    // Agency services can finish before the processing-fee invoice is raised.
    if ((!existing || !isAgencyVehicle(vehicle)) && !vehicle.invoiceId && vehicle.status !== "delivered") {
      throw Object.assign(new Error("Create or attach an invoice before marking the vehicle as delivered"), { status: 400 });
    }

    let notes = details.notes ?? null;
    if (vehicle.status !== "delivered") {
      const [schedule, receipts, invoiceRows] = await Promise.all([
        tx.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, vehicle.id)),
        tx.select().from(payments).where(and(eq(payments.vehicleId, vehicle.id), eq(payments.companyId, companyId))),
        vehicle.invoiceId && !isAgencyVehicle(vehicle) ? tx.select().from(invoices)
          .where(and(eq(invoices.id, vehicle.invoiceId), eq(invoices.companyId, companyId))) : [],
      ]);
      const toVehicleCurrency = (amount: unknown, rate: unknown) => schedulePaid(vehicle, toBase(amount, rate));
      const invoice = invoiceRows[0];
      const total = Math.max(
        Number(existing?.agreedPrice ?? vehicle.salePrice ?? 0),
        schedule.reduce((sum: number, line: { amount: string }) => sum + Number(line.amount), 0),
        invoice ? toVehicleCurrency(invoice.total, invoice.exchangeRate) : 0,
      );
      const paid = Math.max(
        schedulePaid(vehicle, receipts.reduce((sum: number, receipt: typeof payments.$inferSelect) => sum + baseAmountOf(receipt), 0)),
        invoice ? toVehicleCurrency(invoice.paidAmount, invoice.exchangeRate) : 0,
      );
      const outstanding = round2(total - paid);
      if (outstanding > 0) {
        if (!details.earlyHandoverReason) {
          throw Object.assign(new Error(`The customer still owes ${vehicle.saleCurrency || "USD"} ${outstanding.toFixed(2)}. Enter a reason to hand over before full payment.`), { status: 409 });
        }
        notes = [notes, `Early handover with ${vehicle.saleCurrency || "USD"} ${outstanding.toFixed(2)} outstanding: ${details.earlyHandoverReason}`].filter(Boolean).join("\n");
      }
    }

    let agreement = existing;
    if (existing && existing.status !== "completed") {
      [agreement] = await tx.update(vehicleSalesAgreements).set({
        handoverAt: details.eventDate ?? new Date(),
        handoverBy: details.createdBy,
        handoverNotes: notes,
        status: "completed",
        updatedAt: new Date(),
      }).where(eq(vehicleSalesAgreements.id, existing.id)).returning();
      if (isAgencyVehicle(agreement) && agreement.feeRecognition === "on_handover") {
        const journal = await recogniseAgencyFee(tx, companyId, agreement, details.createdBy);
        if (journal) agreement.feeRecognitionJournalEntryId = journal.id;
      }
    }

    const [priorEvent] = vehicle.stage === "delivered" && vehicle.status === "delivered"
      ? await tx.select().from(vehicleStageEvents).where(and(
          eq(vehicleStageEvents.vehicleId, vehicle.id),
          eq(vehicleStageEvents.stage, "delivered"),
        )).orderBy(desc(vehicleStageEvents.id)).limit(1)
      : [];
    if (priorEvent) return { agreement, event: priorEvent };

    const notified = details.notifyCustomer && details.notifiedVia;
    const [event] = await tx.insert(vehicleStageEvents).values({
      vehicleId: vehicle.id,
      stage: "delivered",
      eventDate: agreement?.handoverAt ?? details.eventDate ?? new Date(),
      notes: notes ?? agreement?.handoverNotes ?? null,
      notifyCustomer: !!details.notifyCustomer,
      notifiedAt: notified ? new Date() : null,
      notifiedVia: notified ? details.notifiedVia : null,
      createdBy: details.createdBy,
    }).returning();
    await tx.update(vehicles).set({ stage: "delivered", status: "delivered", updatedAt: new Date() })
      .where(eq(vehicles.id, vehicle.id));
    return { agreement, event };
  }

  router.post("/companies/:companyId/vehicles/:id/stage", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const body = z
        .object({
          stage: z.enum(VEHICLE_STAGES),
          notes: z.string().optional().nullable(),
          eventDate: z.coerce.date().optional(),
          notifyCustomer: z.boolean().optional(),
          notifiedVia: z.string().optional().nullable(),
          earlyHandoverReason,
        })
        .parse(req.body);
      
      const notified = body.notifyCustomer && body.notifiedVia ? new Date() : null;
      const event = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, parseInt(req.params.id));
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (body.stage === "delivered") {
          return (await completeHandover(tx, companyId, v, { ...body, createdBy: req.user?.id })).event;
        }
        if (v.status === "delivered") {
          throw Object.assign(new Error("Import tracking is complete for this vehicle"), { status: 409 });
        }
        const [saved] = await tx
          .insert(vehicleStageEvents)
          .values({
            vehicleId: v.id,
            stage: body.stage,
            notes: body.notes ?? null,
            eventDate: body.eventDate ?? new Date(),
            notifyCustomer: !!body.notifyCustomer,
            notifiedAt: notified,
            notifiedVia: notified ? body.notifiedVia : null,
            createdBy: req.user?.id,
          })
          .returning();
        await tx.update(vehicles).set({ stage: body.stage, updatedAt: new Date() }).where(eq(vehicles.id, v.id));
        // A stage move only records the stage. The enquiry is marked won when
        // the vehicle is actually invoiced, not when a card is dragged.
        return saved;
      });
      res.status(201).json(event);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: "Failed to update stage" });
    }
  });

  /** Marks a pending customer notification as sent (e.g. after WhatsApp click-to-chat). */
  router.post("/companies/:companyId/vehicles/:id/stage/:eventId/notified", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const [event] = await db
        .update(vehicleStageEvents)
        .set({ notifiedAt: new Date(), notifiedVia: String(req.body?.via || "manual") })
        .where(and(eq(vehicleStageEvents.id, parseInt(req.params.eventId)), eq(vehicleStageEvents.vehicleId, v.id)))
        .returning();
      res.json(event);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to mark notified" });
    }
  });

  // ── payments ───────────────────────────────────────────────────────────────

  router.post("/companies/:companyId/vehicles/:id/payments", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.customerId) return res.status(400).json({ error: "Assign a customer to this vehicle first" });
      const body = z
        .object({
          amount: z.coerce.number().positive(),
          currency: z.string().default("USD"),
          exchangeRate: z.coerce.number().positive().default(1),
          paymentDate: z.coerce.date().optional(),
          paymentMethod: z.string().min(1),
          bankAccountId: z.coerce.number().int().positive().nullable().optional(),
          reference: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
          allocations: z.array(z.object({
            costId: z.coerce.number().int().positive().nullable().optional(),
            allocationType: z.enum(["cost", "fee"]).default("cost"),
            amount: z.coerce.number().positive(),
          })).optional(),
        })
        .parse(req.body);
      const result = await db.transaction(async (tx: any) => {
        // The money actually landed in the account the cashier picked, so the
        // receipt must debit that account rather than a hard-coded cash till.
        const { account: bankAccount, error: bankError } = await ownedBankAccount(tx, companyId, body.bankAccountId);
        if (bankError || !bankAccount) {
          throw Object.assign(new Error(bankError || "Bank account not found"), { status: 400 });
        }
        const isDeposit = !v.invoiceId;
        const [created] = await tx
          .insert(payments)
          .values({
            companyId,
            customerId: v.customerId,
            vehicleId: v.id,
            invoiceId: v.invoiceId ?? null,
            amount: body.amount.toFixed(2),
            currency: body.currency,
            exchangeRate: body.exchangeRate.toFixed(6),
            paymentDate: body.paymentDate ?? new Date(),
            paymentMethod: body.paymentMethod,
            bankAccountId: bankAccount.id,
            reference: body.reference ?? null,
            notes: body.notes ?? `Vehicle ${v.stockNumber} ${v.make} ${v.model}`,
            isDeposit,
            createdBy: req.user?.id,
          })
          .returning();

        const isAgency = isAgencyVehicle(v);
        let agencyAllocation: any[] | null = null;
        if (isAgency) {
          const [agreement] = await tx.select().from(vehicleSalesAgreements).where(and(
            eq(vehicleSalesAgreements.companyId, companyId),
            eq(vehicleSalesAgreements.vehicleId, v.id),
          ));
          const [existingAccount] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, v.id));
          const account = existingAccount ?? await upsertCustomerAccount(tx, companyId, v, agreement);
          agencyAllocation = await buildAgencyAllocations(tx, account, baseAmountOf(created), body.allocations);
          await postAgencyReceipt(
            tx,
            companyId,
            v,
            account,
            created,
            bankAccount,
            agencyAllocation,
            agreement?.feeRecognition ?? "on_handover",
            agreement?.status ?? null,
            req.user?.id,
          );
        } else {
          // Principal model: deposits remain a customer credit until invoiced.
          if (isDeposit) {
            const baseAmount = baseAmountOf(created);
            const depositsAccountCode = await storage.getSystemAccountCode(companyId, "customerDepositsAccountCode", tx) || "2010";
            const je = await storage.postToLedger(companyId, {
              entryDate: created.paymentDate,
              description: `Vehicle deposit ${created.reference || created.id} for ${v.stockNumber}`,
              referenceType: "CUSTOMER_DEPOSIT",
              referenceId: String(created.id),
              postingKey: `vehicle-deposit:${created.id}`,
              currency: fxOf(created).currency,
              exchangeRate: fxOf(created).exchangeRate,
              createdBy: req.user?.id,
              lines: [
                { accountCode: bankAccount.code, type: "DEBIT", amount: baseAmount, baseAmount, currency: fxOf(created).currency, exchangeRate: fxOf(created).exchangeRate },
                { accountCode: depositsAccountCode, type: "CREDIT", amount: baseAmount, baseAmount, currency: fxOf(created).currency, exchangeRate: fxOf(created).exchangeRate },
              ],
            }, tx);
            await tx.update(payments).set({ journalEntryId: je.id }).where(eq(payments.id, created.id));
          }
        }

        let allocation = null;
        if (v.invoiceId && !isAgency) {
          const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, v.invoiceId), eq(invoices.companyId, companyId)));
          if (invoice) allocation = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, invoice, req.user?.id);
        }
        if (v.status === "available") {
          await tx.update(vehicles).set({ status: "reserved", updatedAt: new Date() }).where(eq(vehicles.id, v.id));
        }
        await refreshScheduleSettlement(tx, companyId, v.id);
        const [saved] = await tx.select().from(payments).where(eq(payments.id, created.id));
        return { ...saved, allocation, agencyAllocation };
      });
      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to record payment" });
    }
  });

  // ── customer account (agency model) ──────────────────────────────────────

  router.get("/companies/:companyId/vehicles/:id/statement", ...need("vehicles.view"), async (req, res, next) => {
    try {
      const companyId = Number(req.params.companyId);
      const vehicle = await loadVehicle(companyId, Number(req.params.id));
      if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
      const agency = isAgencyVehicle(vehicle);
      const [agreements, customersFound, schedule, invoiceRows, receipts, costs] = await Promise.all([
        db.select().from(vehicleSalesAgreements).where(and(eq(vehicleSalesAgreements.companyId, companyId), eq(vehicleSalesAgreements.vehicleId, vehicle.id))),
        vehicle.customerId ? db.select({ name: customers.name }).from(customers)
          .where(and(eq(customers.companyId, companyId), eq(customers.id, vehicle.customerId))) : [],
        db.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, vehicle.id)),
        vehicle.invoiceId ? db.select({ number: invoices.invoiceNumber, total: invoices.total, currency: invoices.currency, rate: invoices.exchangeRate })
          .from(invoices).where(and(eq(invoices.id, vehicle.invoiceId), eq(invoices.companyId, companyId))) : [],
        db.select().from(payments).where(and(eq(payments.companyId, companyId),
          !agency && vehicle.invoiceId
            ? or(eq(payments.vehicleId, vehicle.id), eq(payments.invoiceId, vehicle.invoiceId))
            : eq(payments.vehicleId, vehicle.id),
        )).orderBy(asc(payments.paymentDate), asc(payments.id)),
        agency ? customerStatementCosts(db, vehicle.id) : [],
      ]);
      const [agreement] = agreements;
      const [invoice] = invoiceRows;
      const currency = agreement?.currency ?? vehicle.saleCurrency ?? "USD";
      const rate = agreement?.exchangeRate ?? vehicle.saleExchangeRate;
      const received = round2(receipts.reduce((sum, receipt) => sum + fromBase(baseAmountOf(receipt), rate), 0));
      const lines = openScheduleLines(schedule, received);
      const agreedPrice = Number(agreement?.agreedPrice ?? vehicle.salePrice ?? 0);
      const scheduledTotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
      const payable = Math.max(agreedPrice, scheduledTotal, !agency && invoice ? fromBase(toBase(invoice.total, invoice.rate), rate) : 0);
      const adminFee = Number(agreement?.adminFee ?? 0);
      const deposit = Number(agreement?.depositAmount ?? lines.find(line => line.type === "deposit")?.amount ?? 0);
      const financingCharges = agreement && agreement.months >= 1 && deposit <= agreedPrice
        ? calculateVehiclePaymentPlan({
          agreedPrice, depositAmount: deposit, months: agreement.months, interestType: agreement.interestType,
          interestRate: Number(agreement.interestRate), adminFee, startDate: agreement.startDate,
        }).interest : 0;
      res.json({
        stockNumber: vehicle.stockNumber, description: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
        customerName: customersFound[0]?.name ?? null, currency,
        agreementNumber: agreement?.agreementNumber ?? null, agreementStatus: agreement?.status ?? null,
        agreedPrice, scheduledTotal, payable, received, balance: round2(payable - received),
        deposit, adminFee, financingCharges,
        processingFee: agency ? Number(agreement?.processingFeeAmount ?? 0) : null,
        invoice: invoice ?? null,
        schedule: lines,
        receipts: receipts.map(receipt => ({
          id: receipt.id, date: receipt.paymentDate, reference: receipt.reference, method: receipt.paymentMethod,
          amount: fromBase(baseAmountOf(receipt), rate),
        })),
        costs: costs.map((cost: typeof vehicleCosts.$inferSelect) => ({
          id: cost.id, category: cost.category, description: cost.description, amount: fromBase(chargeOf(cost), rate),
        })),
      });
    } catch (error) { next(error); }
  });

  router.get("/companies/:companyId/vehicles/:id/customer-account", ...need("vehicles.view"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id);
      const v = await loadVehicle(companyId, vehicleId);
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const [agreement] = await db.select().from(vehicleSalesAgreements).where(and(
        eq(vehicleSalesAgreements.companyId, companyId),
        eq(vehicleSalesAgreements.vehicleId, vehicleId),
      ));
      const [account] = await db.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, vehicleId));
      const costs = await customerStatementCosts(db, vehicleId);
      const costTotal = round2(costs.reduce((s: number, c: any) => s + chargeOf(c), 0));
      const accountData = account ?? {
        id: 0,
        companyId,
        vehicleId,
        agreementId: agreement?.id ?? null,
        customerId: v.customerId,
        currency: agreement?.currency ?? v.saleCurrency ?? "USD",
        exchangeRate: String(agreement?.exchangeRate ?? v.saleExchangeRate ?? 1),
        totalPrice: String(agreement?.agreedPrice ?? v.salePrice ?? 0),
        costSheetTotal: costTotal.toFixed(2),
        processingFeeAmount: String(agreement?.processingFeeAmount ?? 0),
        amountCollected: "0.00",
        amountAllocatedToCosts: "0.00",
        amountAllocatedToFee: "0.00",
        feeInvoiceSettledAmount: "0.00",
        amountPaidToThirdParties: "0.00",
        feeRecognisedAmount: "0.00",
        status: "open",
      };

      const paymentRows = await db.select().from(payments).where(and(
        eq(payments.companyId, companyId),
        eq(payments.vehicleId, vehicleId),
      )).orderBy(asc(payments.paymentDate), asc(payments.id));
      const allocationRows = account
        ? await db.select().from(vehicleCustomerPaymentAllocations).where(eq(vehicleCustomerPaymentAllocations.accountId, account.id))
        : [];
      const thirdPartyRows = account
        ? await db.select().from(vehicleThirdPartyPayments).where(eq(vehicleThirdPartyPayments.accountId, account.id)).orderBy(asc(vehicleThirdPartyPayments.paymentDate), asc(vehicleThirdPartyPayments.id))
        : [];

      const costSheet = costs.map((c: any) => {
        const actual = round2(Number(c.baseAmount || 0));
        const estimated = estimateOf(c);
        const customerCharge = chargeOf(c);
        const allocated = round2(Number(c.customerAllocatedAmount || 0));
        const settled = round2(Number(c.thirdPartyPaidAmount || 0));
        return {
          ...c,
          actual,
          estimated,
          customerCharge,
          allocated,
          settled,
          held: round2(allocated - settled),
          outstanding: round2(customerCharge - allocated),
          supplierOutstanding: round2(actual - settled),
        };
      });
      const collected = Number(accountData.amountCollected || 0);
      const allocatedCosts = Number(accountData.amountAllocatedToCosts || 0);
      const allocatedFee = Number(accountData.amountAllocatedToFee || 0);
      const settled = Number(accountData.amountPaidToThirdParties || 0);
      const totalPrice = Number(accountData.totalPrice || 0);

      res.json({
        vehicle: v,
        agreement: agreement ?? null,
        account: accountData,
        costSheet,
        payments: paymentRows.map(p => ({
          ...p,
          baseAmount: baseAmountOf(p),
          allocations: allocationRows.filter(a => a.paymentId === p.id),
        })),
        thirdPartyPayments: thirdPartyRows,
        totals: {
          totalPrice: round2(totalPrice),
          costSheetTotal: round2(Number(accountData.costSheetTotal || 0)),
          processingFee: round2(Number(accountData.processingFeeAmount || 0)),
          collected: round2(collected),
          allocatedToCosts: round2(allocatedCosts),
          allocatedToFee: round2(allocatedFee),
          paidToThirdParties: round2(settled),
          supplierOutstanding: round2(costSheet.reduce((s: number, c: any) => s + c.supplierOutstanding, 0)),
          fundsHeld: round2(allocatedCosts - settled),
          unallocatedCollected: round2(collected - allocatedCosts - allocatedFee),
          balanceDue: round2(totalPrice - collected),
          feeOutstanding: round2(Number(accountData.processingFeeAmount || 0) - allocatedFee),
          feeRecognised: round2(Number(accountData.feeRecognisedAmount || 0)),
        },
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to load customer account" });
    }
  });

  /**
   * Reversals are append-only: the original allocation is stamped and a
   * negative adjustment row is added. Supplier-funded cost allocations stay in
   * Customer Funds Held; fee reversals move the money back there from deferred
   * income. Recognised or invoiced fees cannot be reversed here.
   */
  router.post("/companies/:companyId/vehicles/:id/customer-account/allocations/:allocationId/reverse", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id);
      const allocationId = Number(req.params.allocationId);
      const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, vehicleId);
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (!isAgencyVehicle(v)) throw Object.assign(new Error("Allocations only apply to agency vehicles"), { status: 400 });
        const [account] = await tx.select().from(vehicleCustomerAccounts)
          .where(and(eq(vehicleCustomerAccounts.companyId, companyId), eq(vehicleCustomerAccounts.vehicleId, vehicleId)))
          .for("update");
        if (!account) throw Object.assign(new Error("No customer account exists for this vehicle"), { status: 404 });
        const [allocation] = await tx.select().from(vehicleCustomerPaymentAllocations)
          .where(and(
            eq(vehicleCustomerPaymentAllocations.id, allocationId),
            eq(vehicleCustomerPaymentAllocations.accountId, account.id),
          )).for("update");
        if (!allocation) throw Object.assign(new Error("Allocation not found"), { status: 404 });
        if (allocation.reversedAt || allocation.reversesAllocationId || Number(allocation.amount) <= 0) {
          throw Object.assign(new Error("This allocation has already been reversed"), { status: 409 });
        }
        const amount = round2(Number(allocation.amount));
        if (allocation.allocationType === "fee" && (
          Number(account.feeRecognisedAmount || 0) > 0.004 || Number(account.feeInvoiceSettledAmount || 0) > 0.004
        )) {
          throw Object.assign(new Error("A recognised or invoiced processing fee cannot be reversed"), { status: 409 });
        }
        const [reversed] = await tx.update(vehicleCustomerPaymentAllocations).set({
          reversedAt: new Date(),
          reversalReason: body.reason ?? null,
        }).where(eq(vehicleCustomerPaymentAllocations.id, allocation.id)).returning();
        const [adjustment] = await tx.insert(vehicleCustomerPaymentAllocations).values({
          companyId,
          accountId: account.id,
          paymentId: allocation.paymentId,
          costId: allocation.costId,
          allocationType: allocation.allocationType,
          amount: (-amount).toFixed(2),
          reversesAllocationId: allocation.id,
          reversalReason: body.reason ?? null,
          createdBy: req.user?.id,
        }).returning();
        if (allocation.allocationType === "fee") {
          const deferredCode = await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx);
          const fundsHeldCode = await storage.getSystemAccountCode(companyId, "customerFundsHeldAccountCode", tx);
          await postAgencyLedger(companyId, {
            entryDate: new Date(),
            description: `Reverse fee allocation on vehicle ${v.stockNumber}`,
            referenceType: "VEHICLE_ALLOCATION_REVERSAL",
            referenceId: String(adjustment.id),
            postingKey: `vehicle-allocation-reversal:${allocation.id}`,
            createdBy: req.user?.id,
            lines: [
              { accountCode: deferredCode, type: "DEBIT", amount },
              { accountCode: fundsHeldCode, type: "CREDIT", amount },
            ],
          }, tx);
        }
        await refreshCustomerAccountTotals(tx, account.id);
        return { reversed, adjustment };
      });
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to reverse allocation" });
    }
  });

  /** Allocate an agency receipt that was recorded before its cost sheet existed. */
  router.post("/companies/:companyId/vehicles/:id/customer-account/payments/:paymentId/allocate", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      const body = z.object({
        allocations: z.array(z.object({
          costId: z.coerce.number().int().positive().nullable().optional(),
          allocationType: z.enum(["cost", "fee"]).default("cost"),
          amount: z.coerce.number().positive(),
        })).min(1),
      }).parse(req.body ?? {});
      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, vehicleId);
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (!isAgencyVehicle(v)) throw Object.assign(new Error("Allocations only apply to agency vehicles"), { status: 400 });
        const [payment] = await tx.select().from(payments).where(and(
          eq(payments.id, paymentId),
          eq(payments.companyId, companyId),
          eq(payments.vehicleId, vehicleId),
        )).for("update");
        if (!payment) throw Object.assign(new Error("Payment not found"), { status: 404 });
        const [account] = await tx.select().from(vehicleCustomerAccounts)
          .where(and(eq(vehicleCustomerAccounts.companyId, companyId), eq(vehicleCustomerAccounts.vehicleId, vehicleId)))
          .for("update");
        if (!account) throw Object.assign(new Error("No customer account exists for this vehicle"), { status: 404 });
        const [existingAllocation] = await tx.select({ id: vehicleCustomerPaymentAllocations.id })
          .from(vehicleCustomerPaymentAllocations)
          .where(eq(vehicleCustomerPaymentAllocations.paymentId, payment.id)).limit(1);
        if (existingAllocation) {
          throw Object.assign(new Error("This receipt already has allocations; reverse them before reallocating"), { status: 409 });
        }
        const allocations = await buildAgencyAllocations(tx, account, baseAmountOf(payment), body.allocations);
        const feeBase = round2(allocations.filter(a => a.allocationType === "fee").reduce((s, a) => s + a.amount, 0));
        for (const allocation of allocations) {
          await tx.insert(vehicleCustomerPaymentAllocations).values({
            companyId,
            accountId: account.id,
            paymentId: payment.id,
            costId: allocation.costId,
            allocationType: allocation.allocationType,
            amount: allocation.amount.toFixed(2),
            createdBy: req.user?.id,
          });
        }
        if (feeBase > 0) {
          const [agreement] = await tx.select().from(vehicleSalesAgreements).where(and(
            eq(vehicleSalesAgreements.companyId, companyId),
            eq(vehicleSalesAgreements.vehicleId, vehicleId),
          ));
          const fundsHeldCode = await storage.getSystemAccountCode(companyId, "customerFundsHeldAccountCode", tx);
          const deferredCode = await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx);
          await postAgencyLedger(companyId, {
            entryDate: payment.paymentDate,
            description: `Vehicle ${v.stockNumber} fee allocation from existing receipt`,
            referenceType: "VEHICLE_FEE_ALLOCATION",
            referenceId: String(payment.id),
            postingKey: `vehicle-fee-allocation:${payment.id}`,
            createdBy: req.user?.id,
            lines: [
              { accountCode: fundsHeldCode, type: "DEBIT", amount: feeBase },
              { accountCode: deferredCode, type: "CREDIT", amount: feeBase },
            ],
          }, tx);
          if (agreement?.feeRecognition === "on_collection" || agreement?.status === "completed") {
            await postFeeRecognition(
              tx, companyId,
              `Vehicle ${v.stockNumber} processing fee earned on collection`,
              feeBase,
              String(payment.id),
              `vehicle-fee-recognition:allocation:${payment.id}`,
              payment.paymentDate,
              Number(account.feeRecognisedAmount || 0) + feeBase,
              account,
              req.user?.id,
            );
          }
        }
        await refreshCustomerAccountTotals(tx, account.id);
        return allocations;
      });
      res.json({ allocations: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to allocate receipt" });
    }
  });

  router.post("/companies/:companyId/vehicles/:id/third-party-payments", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id);
      const v = await loadVehicle(companyId, vehicleId);
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!isAgencyVehicle(v)) return res.status(400).json({ error: "Third-party settlement is only used for agency vehicles" });
      const body = z.object({
        costId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive(),
        currency: z.string().default("USD"),
        exchangeRate: z.coerce.number().positive().default(1),
        paymentDate: z.coerce.date().optional(),
        paymentMethod: z.string().default("bank_transfer"),
        bankAccountId: z.coerce.number().int().positive().nullable().optional(),
        supplierId: z.coerce.number().int().positive().nullable().optional(),
        reference: z.string().nullable().optional(),
      }).parse(req.body ?? {});
      const result = await db.transaction(async (tx: any) => {
        const supplierError = await assertOwnedSupplier(companyId, body.supplierId ?? null);
        if (supplierError) throw Object.assign(new Error(supplierError), { status: 400 });
        const { account: bankAccount, error: bankError } = await ownedBankAccount(tx, companyId, body.bankAccountId);
        if (bankError || !bankAccount) throw Object.assign(new Error(bankError || "Bank account not found"), { status: 400 });
        const [account] = await tx.select().from(vehicleCustomerAccounts)
          .where(eq(vehicleCustomerAccounts.vehicleId, vehicleId)).for("update");
        if (!account) throw Object.assign(new Error("No customer account exists for this vehicle"), { status: 404 });
        const [cost] = await tx.select().from(vehicleCosts).where(and(
          eq(vehicleCosts.id, body.costId),
          eq(vehicleCosts.vehicleId, vehicleId),
          ne(vehicleCosts.status, "cancelled"),
        )).for("update");
        if (!cost) throw Object.assign(new Error("Cost line not found on this vehicle"), { status: 400 });
        if (cost.includeInCustomerStatement === false) {
          throw Object.assign(new Error("This cost is excluded from the customer statement"), { status: 400 });
        }

        const amountBase = round2(Number(body.amount) / (Number(body.exchangeRate) || 1));
        // Prime Imports can settle the full supplier obligation even before the
        // customer has funded that cost line. Anything paid beyond allocated
        // customer funds is carried as a debit balance in Customer Funds Held
        // (money advanced by Prime Imports), never as company revenue or COGS.
        const actualCost = round2(Number(cost.baseAmount || 0));
        const settled = round2(Number(cost.thirdPartyPaidAmount || 0));
        const outstanding = round2(actualCost - settled);
        if (outstanding <= 0) {
          throw Object.assign(new Error("This cost line has no outstanding supplier obligation"), { status: 400 });
        }
        if (amountBase > outstanding + 0.01) {
          throw Object.assign(new Error(`Settlement exceeds the outstanding cost of ${outstanding.toFixed(2)}`), { status: 400 });
        }

        const [created] = await tx.insert(vehicleThirdPartyPayments).values({
          companyId,
          accountId: account.id,
          vehicleId,
          costId: cost.id,
          supplierId: body.supplierId ?? cost.supplierId ?? null,
          amount: body.amount.toFixed(2),
          baseAmount: amountBase.toFixed(2),
          currency: body.currency,
          exchangeRate: Number(body.exchangeRate).toFixed(6),
          paymentDate: body.paymentDate ?? new Date(),
          paymentMethod: body.paymentMethod,
          bankAccountId: bankAccount.id,
          reference: body.reference ?? null,
          createdBy: req.user?.id,
        }).returning();

        const je = await postAgencyThirdPartyPayment(
          tx,
          companyId,
          v,
          account,
          bankAccount,
          amountBase,
          created.paymentDate,
          body.reference ?? null,
          created.id,
          req.user?.id,
        );
        await tx.update(vehicleThirdPartyPayments).set({ journalEntryId: je.id }).where(eq(vehicleThirdPartyPayments.id, created.id));
        await refreshCustomerAccountTotals(tx, account.id);
        const [savedCost] = await tx.select().from(vehicleCosts).where(eq(vehicleCosts.id, cost.id));
        const fullySettled = Number(savedCost.thirdPartyPaidAmount || 0) + 0.01 >= Number(savedCost.baseAmount || 0);
        await tx.update(vehicleCosts).set({
          status: fullySettled ? "paid" : (cost.status === "disputed" ? "disputed" : "pending"),
          paidAt: fullySettled ? new Date(created.paymentDate).toISOString().slice(0, 10) : null,
          paymentJournalEntryId: cost.paymentJournalEntryId ?? je.id,
          bankAccountId: bankAccount.id,
        }).where(eq(vehicleCosts.id, cost.id));
        const [saved] = await tx.select().from(vehicleThirdPartyPayments).where(eq(vehicleThirdPartyPayments.id, created.id));
        return saved;
      });
      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to record third-party payment" });
    }
  });

  /** Clear the already-collected fee against the agency fee invoice's AR. */
  async function clearAgencyFeeInvoice(
    tx: any,
    companyId: number,
    invoice: any,
    account: any,
    userId?: string,
  ) {
    // Settlement of the fee invoice is independent of revenue recognition.
    // on_collection deals have already recognised the fee but their invoice AR
    // still has to be cleared against the fee the customer paid.
    const available = round2(Number(account.amountAllocatedToFee || 0) - Number(account.feeInvoiceSettledAmount || 0));
    // Only the net fee was reclassified into deferred income. Never debit that
    // account more than the net fee, even if the invoice carries VAT, and never
    // settle the same invoice twice.
    const netFee = round2(Number(invoice.subtotal ?? invoice.total ?? 0));
    const alreadySettled = round2(Number(account.feeInvoiceSettledAmount || 0));
    if (alreadySettled + 0.01 >= netFee) return null;
    const amount = round2(Math.min(netFee - alreadySettled, available));
    if (amount <= 0) return null;
    const deferredCode = await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx);
    const arCode = await storage.getSystemAccountCode(companyId, "accountsReceivableCode", tx);
    const je = await postAgencyLedger(companyId, {
      entryDate: new Date(),
      description: `Apply collected processing fee to invoice ${invoice.invoiceNumber}`,
      referenceType: "VEHICLE_FEE_INVOICE_SETTLEMENT",
      referenceId: String(invoice.id),
      postingKey: `vehicle-fee-invoice-settlement:${invoice.id}`,
      createdBy: userId,
      lines: [
        { accountCode: deferredCode, type: "DEBIT", amount },
        { accountCode: arCode, type: "CREDIT", amount },
      ],
    }, tx);
    const paidAmount = round2(Number(invoice.paidAmount || 0) + amount);
    await tx.update(invoices).set({
      paidAmount: paidAmount.toFixed(2),
      status: paidAmount + 0.01 >= Number(invoice.total || 0) ? "paid" : "partial",
    }).where(eq(invoices.id, invoice.id));
    await tx.update(vehicleCustomerAccounts).set({
      feeInvoiceSettledAmount: round2(Number(account.feeInvoiceSettledAmount || 0) + amount).toFixed(2),
      updatedAt: new Date(),
    }).where(eq(vehicleCustomerAccounts.id, account.id));
    return je;
  }

  // ── sales invoice ──────────────────────────────────────────────────────────

  /**
   * Creates a sales invoice from the vehicle's agreed sale price, links it to
   * the vehicle, clears any deposits and posts COGS in the same transaction.
   *
   * The vehicle row is locked and `invoiceId` is re-checked inside the lock, so
   * two concurrent clicks cannot create two invoices (and two COGS postings).
   */
  router.post("/companies/:companyId/vehicles/:id/invoice", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const vehicleId = parseInt(req.params.id);

      const body = z
        .object({
          dueDate: z.coerce.date().optional(),
          notes: z.string().max(4000).optional().nullable(),
          taxTypeId: z.coerce.number().int().positive().nullable().optional(),
        })
        .parse(req.body ?? {});

      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, vehicleId);
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (v.invoiceId) throw Object.assign(new Error("Vehicle already has an invoice"), { status: 409 });
        if (!v.customerId) throw Object.assign(new Error("Assign a customer to this vehicle first"), { status: 400 });
        if (v.salePrice == null) throw Object.assign(new Error("Set an agreed sale price before invoicing"), { status: 400 });

        const [agreement] = await tx.select().from(vehicleSalesAgreements).where(and(
          eq(vehicleSalesAgreements.companyId, companyId),
          eq(vehicleSalesAgreements.vehicleId, v.id),
        ));
        const isAgency = isAgencyVehicle(v);
        // Agency deals invoice only Prime Imports' fee. The cost sheet is a
        // customer statement, not company revenue. Principal deals keep the
        // existing gross sale invoice and COGS flow.
        const subtotal = round2(isAgency ? Number(agreement?.processingFeeAmount ?? 0) : Number(v.salePrice));
        if (subtotal <= 0) throw Object.assign(
          new Error(isAgency ? "Set a processing fee on the sales agreement before invoicing" : "The agreed sale price must be greater than zero"),
          { status: 400 },
        );

        let taxType: any = null;
        if (!isAgency && body.taxTypeId) {
          const { taxType: found, error } = await ownedTaxType(tx, companyId, body.taxTypeId);
          if (error || !found) throw Object.assign(new Error(error || "Tax type not found"), { status: 400 });
          taxType = found;
        }
        const taxRate = taxType ? Number(taxType.rate) : 0;
        const taxAmount = round2(subtotal * (taxRate / 100));
        const total = round2(subtotal + taxAmount);
        const currency = v.saleCurrency || "USD";
        const exchangeRate = Number(v.saleExchangeRate || 1) || 1;

        const vehicleLabel = [
          `${v.year ?? ""} ${v.make} ${v.model}`.replace(/\s+/g, " ").trim(),
          `Stock ${v.stockNumber}`,
          v.vin ? `VIN ${v.vin}` : null,
        ].filter(Boolean).join(" — ");
        const description = isAgency ? `Vehicle import processing fee — ${vehicleLabel}` : vehicleLabel;

        const created = await storage.createInvoice({
          companyId,
          customerId: v.customerId!,
          branchId: null,
          issueDate: new Date(),
          dueDate: body.dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          subtotal: subtotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          total: total.toFixed(2),
          status: "issued",
          paidAmount: "0.00",
          currency,
          exchangeRate: exchangeRate.toFixed(6),
          isFiscalized: false,
          notes: body.notes ?? description,
          createdBy: req.user?.id,
          // One invoice per vehicle deal; agency deals post only the fee.
          postingKey: isAgency ? `vehicle-fee-invoice:${v.id}:invoice` : `vehicle-sale:${v.id}:invoice`,
          // storage.createInvoice otherwise credits sales revenue directly.
          // Agency invoices credit deferred fee income; collection/handover
          // journals move it to revenue at the right time.
          ...(isAgency
            ? { revenueAccountCode: await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx) }
            : {}),
          items: [{
            description,
            quantity: "1",
            unitPrice: subtotal.toFixed(2),
            discountAmount: "0.00",
            taxRate: taxRate.toFixed(2),
            taxTypeId: taxType?.id ?? null,
            lineTotal: subtotal.toFixed(2),
          }],
        } as any, tx);

        await tx.update(vehicles).set({
          invoiceId: created.id,
          status: ["available", "reserved"].includes(v.status) ? "sold" : v.status,
          updatedAt: new Date(),
        }).where(eq(vehicles.id, v.id));

        let paymentResult: any = null;
        let cogs: any = { posted: false, journalEntryId: null, amount: 0 };
        if (isAgency) {
          const [account] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, v.id));
          if (account) {
            paymentResult = { feeSettlement: await clearAgencyFeeInvoice(tx, companyId, created, account, req.user?.id) };
            await refreshCustomerAccountTotals(tx, account.id);
          }
        } else {
          paymentResult = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, created, req.user?.id);
          cogs = await postVehicleCogs(tx, companyId, v.id, req.user?.id);
        }
        const enquiry = v.enquiryId
          ? await markEnquiryWon(
              tx,
              companyId,
              v.enquiryId,
              `Invoice ${created.invoiceNumber} raised for ${description}.`,
              { vehicleId: v.id, invoiceId: created.id },
              req.user?.id,
            )
          : null;
        // Auto-accrue the salesperson's commission statement when AR is posted.
        let commission: any = null;
        try {
          commission = await accrueVehicleCommission(tx, { companyId, vehicleId: v.id, userId: req.user?.id });
        } catch (error) {
          console.error(`[CRM] Failed to accrue commission for vehicle ${v.id}`, error);
        }
        return { invoice: created, ...paymentResult, cogs, enquiry, commission };
      });

      // Fiscalization runs after the sale commits. Report a saved invoice
      // separately from a failed submission so staff don't retry creation.
      let invoice: typeof invoices.$inferSelect;
      let fiscalizationWarning: string | undefined;
      try {
        invoice = await ensureVehicleInvoiceFiscalized(
          result.invoice.id,
          companyId,
          req.user?.id,
          req.user?.isSuperAdmin,
        );
      } catch (error) {
        console.error("Vehicle invoice fiscalization failed after creation", { companyId, vehicleId, invoiceId: result.invoice.id }, error);
        const [savedInvoice] = await db.select().from(invoices).where(and(
          eq(invoices.id, result.invoice.id), eq(invoices.companyId, companyId),
        ));
        if (!savedInvoice) {
          throw Object.assign(new Error("Could not confirm that the vehicle invoice was saved. Refresh the vehicle before retrying."), { status: 500 });
        }
        invoice = savedInvoice;
        if (!savedInvoice.isFiscalized && !savedInvoice.syncedWithFdms) {
          fiscalizationWarning = "The invoice was saved. Open it to review or retry fiscalization.";
        }
      }

      const vehicleCostsRows = await db
        .select()
        .from(vehicleCosts)
        .where(and(eq(vehicleCosts.vehicleId, vehicleId), ne(vehicleCosts.status, "cancelled")))
        .orderBy(asc(vehicleCosts.costDate), asc(vehicleCosts.id));

      const [vehicleRow] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId)));

      const fullInvoice = {
        ...invoice,
        vehicle: vehicleRow ?? null,
        vehicleCosts: vehicleCostsRows,
      };

      res.status(201).json({ ...result, invoice: fullInvoice, fiscalizationWarning });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 400).json({ error: error.message || "Failed to create vehicle invoice" });
    }
  });

  /** Attaches an existing invoice (by id or invoice number) to this vehicle. */
  router.put("/companies/:companyId/vehicles/:id/invoice", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const vehicleId = parseInt(req.params.id);

      const body = z.object({
        invoiceId: z.coerce.number().int().positive().optional(),
        invoiceNumber: z.string().trim().min(1).optional(),
      }).refine((b) => b.invoiceId || b.invoiceNumber, { message: "Provide an invoice id or invoice number" }).parse(req.body ?? {});

      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, vehicleId);
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (v.invoiceId) throw Object.assign(new Error("Vehicle already has an invoice"), { status: 409 });
        if (!v.customerId) throw Object.assign(new Error("Assign a customer to this vehicle first"), { status: 400 });
        if (v.salePrice == null) throw Object.assign(new Error("Set an agreed sale price before attaching an invoice"), { status: 400 });
        const [agreement] = await tx.select().from(vehicleSalesAgreements).where(and(
          eq(vehicleSalesAgreements.companyId, companyId),
          eq(vehicleSalesAgreements.vehicleId, vehicleId),
        ));
        const isAgency = isAgencyVehicle(v) || isAgencyVehicle(agreement);

        const [invoice] = await tx.select().from(invoices).where(and(
          eq(invoices.companyId, companyId),
          body.invoiceId ? eq(invoices.id, body.invoiceId) : eq(invoices.invoiceNumber, body.invoiceNumber!),
        )).for("update");
        if (!invoice) throw Object.assign(new Error("Invoice not found"), { status: 404 });
        if (["cancelled", "void"].includes(String(invoice.status))) {
          throw Object.assign(new Error("Cancelled or void invoices cannot be attached to a vehicle"), { status: 409 });
        }
        if (invoice.customerId !== v.customerId) {
          throw Object.assign(new Error("The invoice belongs to a different customer"), { status: 400 });
        }
        const invoiceCurrency = String(invoice.currency || "USD").toUpperCase();
        const saleCurrency = String(v.saleCurrency || "USD").toUpperCase();
        if (invoiceCurrency !== saleCurrency) {
          throw Object.assign(new Error(`The invoice currency (${invoiceCurrency}) does not match the agreed sale currency (${saleCurrency})`), { status: 400 });
        }
        // Agency invoices carry only the processing fee; principal invoices
        // carry the whole sale. Accept either net subtotal or tax-inclusive total.
        const expected = round2(isAgency ? Number(agreement?.processingFeeAmount ?? 0) : Number(v.salePrice));
        if (isAgency && expected <= 0) {
          throw Object.assign(new Error("Set a processing fee on the sales agreement before attaching a fee invoice"), { status: 400 });
        }
        const matchesAgreed =
          Math.abs(round2(Number(invoice.subtotal)) - expected) <= 0.01 ||
          Math.abs(round2(Number(invoice.total)) - expected) <= 0.01;
        if (!matchesAgreed) {
          throw Object.assign(new Error(isAgency ? "The invoice total does not match the processing fee" : "The invoice total does not match the agreed sale price"), { status: 400 });
        }
        if (Number(invoice.taxAmount) > 0) {
          const itemRows = await tx
            .select({ taxTypeId: invoiceItems.taxTypeId })
            .from(invoiceItems)
            .where(eq(invoiceItems.invoiceId, invoice.id));
          if (!itemRows.some((item: any) => item.taxTypeId)) {
            throw Object.assign(new Error("Taxed invoices must use a real tax type before they can be attached"), { status: 400 });
          }
        }

        const [otherVehicle] = await tx.select({ id: vehicles.id }).from(vehicles).where(and(
          eq(vehicles.companyId, companyId),
          eq(vehicles.invoiceId, invoice.id),
          sql`${vehicles.id} <> ${v.id}`,
        )).limit(1);
        if (otherVehicle) throw Object.assign(new Error("This invoice is already linked to another vehicle"), { status: 409 });

        await tx.update(vehicles).set({
          invoiceId: invoice.id,
          status: ["available", "reserved"].includes(v.status) ? "sold" : v.status,
          updatedAt: new Date(),
        }).where(eq(vehicles.id, v.id));

        // Agency: the fee invoice is settled from the fee allocation already
        // held on the customer account; there is no AR cash receipt or COGS.
        let paymentResult: any = null;
        let cogs: any = { posted: false, journalEntryId: null, amount: 0 };
        if (isAgency) {
          // An invoice created outside the vehicle flow credited sales revenue.
          // On an agency deal reclassify the net fee to deferred income first.
          const netFee = round2(Number(invoice.subtotal || 0));
          if (netFee > 0) {
            const salesCode = await storage.getSystemAccountCode(companyId, "salesRevenueAccountCode", tx);
            const deferredCode = await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx);
            await postAgencyLedger(companyId, {
              entryDate: new Date(),
              description: `Reclassify agency fee invoice ${invoice.invoiceNumber} to deferred revenue`,
              referenceType: "VEHICLE_FEE_INVOICE_RECLASS",
              referenceId: String(invoice.id),
              postingKey: `vehicle-fee-invoice-reclass:${invoice.id}`,
              createdBy: req.user?.id,
              lines: [
                { accountCode: salesCode, type: "DEBIT", amount: netFee },
                { accountCode: deferredCode, type: "CREDIT", amount: netFee },
              ],
            }, tx);
          }
          const [account] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, v.id));
          if (account) {
            paymentResult = { feeSettlement: await clearAgencyFeeInvoice(tx, companyId, invoice, account, req.user?.id) };
            await refreshCustomerAccountTotals(tx, account.id);
          }
        } else {
          paymentResult = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, invoice, req.user?.id);
          cogs = await postVehicleCogs(tx, companyId, v.id, req.user?.id);
        }
        const enquiry = v.enquiryId
          ? await markEnquiryWon(
              tx,
              companyId,
              v.enquiryId,
              `Invoice ${invoice.invoiceNumber} linked to ${v.stockNumber}.`,
              { vehicleId: v.id, invoiceId: invoice.id },
              req.user?.id,
            )
          : null;
        return { invoice, ...paymentResult, cogs, enquiry };
      });

      const invoice = await ensureVehicleInvoiceFiscalized(
        result.invoice.id,
        companyId,
        req.user?.id,
        req.user?.isSuperAdmin,
      );

      const vehicleCostsRows = await db
        .select()
        .from(vehicleCosts)
        .where(and(eq(vehicleCosts.vehicleId, vehicleId), ne(vehicleCosts.status, "cancelled")))
        .orderBy(asc(vehicleCosts.costDate), asc(vehicleCosts.id));

      const [vehicleRow] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, vehicleId), eq(vehicles.companyId, companyId)));

      const fullInvoice = {
        ...invoice,
        vehicle: vehicleRow ?? null,
        vehicleCosts: vehicleCostsRows,
      };

      res.json({ ...result, invoice: fullInvoice });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 400).json({ error: error.message || "Failed to attach invoice" });
    }
  });

  /**
   * Agency deals move customer money through several internal journals. On
   * cancellation the fee/reclassification journals are reversed and every
   * active allocation gets an append-only negative row, leaving the customer's
   * cash unallocated for refund. Third-party settlements stay posted because
   * those suppliers have already been paid; the receipt journals likewise stay
   * in place so held funds remain a customer credit.
   */
  async function unwindAgencyOnCancellation(tx: any, companyId: number, v: any, invoice: any, reason: string | null | undefined, userId?: string) {
    if (!isAgencyVehicle(v)) return;
    const targets: Array<{ type: string; refId: string; description: string }> = [];
    if (invoice) {
      targets.push({ type: "VEHICLE_FEE_INVOICE_SETTLEMENT", refId: String(invoice.id), description: `Reverse fee invoice settlement ${invoice.invoiceNumber}` });
      targets.push({ type: "VEHICLE_FEE_INVOICE_RECLASS", refId: String(invoice.id), description: `Reverse fee invoice reclassification ${invoice.invoiceNumber}` });
    }
    const [agreement] = await tx.select().from(vehicleSalesAgreements).where(and(
      eq(vehicleSalesAgreements.companyId, companyId),
      eq(vehicleSalesAgreements.vehicleId, v.id),
    ));
    if (agreement) targets.push({ type: "VEHICLE_FEE_RECOGNITION", refId: String(agreement.id), description: `Reverse fee recognition for ${agreement.agreementNumber}` });
    const receipts = await tx.select({ id: payments.id }).from(payments).where(and(eq(payments.companyId, companyId), eq(payments.vehicleId, v.id)));
    for (const p of receipts) {
      targets.push({ type: "VEHICLE_FEE_RECOGNITION", refId: String(p.id), description: `Reverse fee recognition for receipt ${p.id}` });
      targets.push({ type: "VEHICLE_FEE_ALLOCATION", refId: String(p.id), description: `Reverse fee allocation for receipt ${p.id}` });
    }
    for (const target of targets) {
      const entries = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(
        eq(journalEntries.companyId, companyId),
        eq(journalEntries.referenceType, target.type),
        eq(journalEntries.referenceId, target.refId),
      ));
      for (const entry of entries) {
        await reverseJournalIfPosted(
          tx, companyId, entry.id, target.description, userId,
          `vehicle-cancel:${v.id}:${target.type.toLowerCase().replace(/_/g, "-")}:${entry.id}`,
        );
      }
    }

    const [account] = await tx.select().from(vehicleCustomerAccounts).where(and(
      eq(vehicleCustomerAccounts.companyId, companyId),
      eq(vehicleCustomerAccounts.vehicleId, v.id),
    ));
    if (!account) return;
    const active = await tx.select().from(vehicleCustomerPaymentAllocations).where(and(
      eq(vehicleCustomerPaymentAllocations.accountId, account.id),
      isNull(vehicleCustomerPaymentAllocations.reversedAt),
      isNull(vehicleCustomerPaymentAllocations.reversesAllocationId),
    ));
    for (const allocation of active) {
      await tx.update(vehicleCustomerPaymentAllocations).set({
        reversedAt: new Date(),
        reversalReason: reason || "Vehicle sale cancelled",
      }).where(eq(vehicleCustomerPaymentAllocations.id, allocation.id));
      await tx.insert(vehicleCustomerPaymentAllocations).values({
        companyId,
        accountId: account.id,
        paymentId: allocation.paymentId,
        costId: allocation.costId,
        allocationType: allocation.allocationType,
        amount: (-Math.abs(Number(allocation.amount || 0))).toFixed(2),
        reversesAllocationId: allocation.id,
        reversalReason: reason || "Vehicle sale cancelled",
        createdBy: userId,
      });
    }
    await tx.update(vehicleCustomerAccounts).set({
      feeRecognisedAmount: "0.00",
      feeInvoiceSettledAmount: "0.00",
      updatedAt: new Date(),
    }).where(eq(vehicleCustomerAccounts.id, account.id));
    await refreshCustomerAccountTotals(tx, account.id);
  }

  /**
   * Cancel a sold vehicle and unwind the accounting in one transaction:
   * invoice revenue/AR, COGS and deposit clearing are reversed; payment
   * allocations are released and the invoice is marked cancelled. The receipt
   * journals stay in place, so any money held becomes a customer credit/refund.
   */
  router.post(
    ["/companies/:companyId/vehicles/:id/cancel", "/companies/:companyId/vehicles/:id/reverse-sale"],
    ...need("vehicles.manage"),
    async (req: any, res) => {
      try {
        const companyId = parseInt(req.params.companyId);
        const vehicleId = parseInt(req.params.id);
        const body = z.object({ reason: z.string().max(1000).nullable().optional() }).parse(req.body ?? {});

        const result = await db.transaction(async (tx: any) => {
          const v = await lockedVehicle(tx, companyId, vehicleId);
          if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
          if (!v.invoiceId && v.status === "cancelled") {
            throw Object.assign(new Error("This vehicle is already cancelled"), { status: 409 });
          }

          // Commission unwind must share the sale-cancellation transaction; a
          // GL failure here aborts the whole cancellation instead of being lost.
          const commissionResult = await cancelVehicleCommission(
            tx,
            companyId,
            v.id,
            body.reason || "Vehicle sale cancelled",
          );
          if (!commissionResult.ok) {
            throw new Error(commissionResult.error || "Failed to cancel the linked sales commission");
          }

          let invoice: any = null;
          if (v.invoiceId) {
            [invoice] = await tx
              .select()
              .from(invoices)
              .where(and(eq(invoices.id, v.invoiceId), eq(invoices.companyId, companyId)))
              .for("update");

            if (invoice) {
              const revenueJournals = await tx
                .select({ id: journalEntries.id })
                .from(journalEntries)
                .where(and(
                  eq(journalEntries.companyId, companyId),
                  eq(journalEntries.referenceType, "INVOICE"),
                  eq(journalEntries.referenceId, String(invoice.id)),
                ));
              for (const entry of revenueJournals) {
                await reverseJournalIfPosted(
                  tx,
                  companyId,
                  entry.id,
                  `Cancel invoice ${invoice.invoiceNumber}`,
                  req.user?.id,
                  `vehicle-cancel:${v.id}:invoice-${invoice.id}:journal-${entry.id}`,
                );
              }
            }
          }

          if (v.cogsJournalEntryId) {
            await reverseJournalIfPosted(
              tx,
              companyId,
              v.cogsJournalEntryId,
              `Reverse COGS for ${v.stockNumber}`,
              req.user?.id,
              `vehicle-cancel:${v.id}:cogs`,
            );
          }

          const vehiclePayments = await tx
            .select()
            .from(payments)
            .where(and(eq(payments.companyId, companyId), eq(payments.vehicleId, v.id)));

          for (const payment of vehiclePayments) {
            if (payment.clearingJournalEntryId) {
              await reverseJournalIfPosted(
                tx,
                companyId,
                payment.clearingJournalEntryId,
                `Reverse deposit clearing for payment ${payment.id}`,
                req.user?.id,
                `vehicle-cancel:${v.id}:deposit-clearing-${payment.id}`,
              );
              await tx.update(payments).set({
                clearingJournalEntryId: null,
                clearedAt: null,
              }).where(eq(payments.id, payment.id));
            }
            if (invoice) {
              await tx.update(paymentAllocations).set({ reversedAt: new Date() }).where(and(
                eq(paymentAllocations.invoiceId, invoice.id),
                eq(paymentAllocations.paymentId, payment.id),
                isNull(paymentAllocations.reversedAt),
              ));
            }
          }

          if (invoice) {
            await tx.update(invoices).set({
              status: "cancelled",
              paidAmount: "0.00",
              notes: sql`COALESCE(${invoices.notes} || E'\n', '') || ${`Cancelled with vehicle ${v.stockNumber}${body.reason ? `: ${body.reason}` : ""}`}`,
            }).where(and(eq(invoices.id, invoice.id), eq(invoices.companyId, companyId)));
          }

          await unwindAgencyOnCancellation(tx, companyId, v, invoice, body.reason, req.user?.id);

          const [updated] = await tx.update(vehicles).set({
            status: "cancelled",
            cogsJournalEntryId: null,
            cogsAmount: null,
            cogsPostedAt: null,
            updatedAt: new Date(),
          }).where(eq(vehicles.id, v.id)).returning();

          if (v.enquiryId) {
            await logEnquiryVehicleActivity(
              tx,
              v.enquiryId,
              `Sale of ${v.stockNumber} was cancelled${body.reason ? ` — ${body.reason}` : ""}.`,
              { vehicleId: v.id, invoiceId: invoice?.id ?? null },
              req.user?.id,
            );
          }

          return { vehicle: updated, invoice };
        });

        res.json(result);
      } catch (error: any) {
        console.error(error);
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(error.status || 500).json({ error: error.message || "Failed to cancel vehicle sale" });
      }
    },
  );

  /**
   * Posts COGS for a vehicle that was invoiced before the automatic COGS
   * posting existed. Refuses a second COGS post; only capitalised costs are
   * relieved, so unposted pending/disputed lines are never expensed early.
   */
  router.post("/companies/:companyId/vehicles/:id/cogs", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.invoiceId) return res.status(400).json({ error: "Create or attach the vehicle invoice before posting COGS" });

      const result = await db.transaction(async (tx: any) => {
        const cogs = await postVehicleCogs(tx, companyId, v.id, req.user?.id);
        const enquiry = v.enquiryId
          ? await markEnquiryWon(
              tx,
              companyId,
              v.enquiryId,
              `${v.stockNumber} invoiced.`,
              { vehicleId: v.id, invoiceId: v.invoiceId },
              req.user?.id,
            )
          : null;
        const [updated] = await tx.select().from(vehicles).where(eq(vehicles.id, v.id));
        return { cogs, vehicle: updated, enquiry };
      });

      res.status(result.cogs.posted ? 201 : 200).json(result);
    } catch (error: any) {
      console.error(error);
      res.status(error.status || 500).json({ error: error.message || "Failed to post COGS" });
    }
  });

  // ── payment reminders ─────────────────────────────────────────────────────

  router.get("/companies/:companyId/vehicles/:id/reminders", ...need("vehicles.view"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const rows = await db.select().from(vehicleReminders)
        .where(eq(vehicleReminders.vehicleId, v.id))
        .orderBy(desc(vehicleReminders.sentAt))
        .limit(50);
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch reminders" });
    }
  });

  /**
   * Sends or logs a payment reminder for selected open schedule lines (all
   * overdue/upcoming open lines when no ids are supplied) and stamps
   * last_reminder_at on each line.
   */
  router.post("/companies/:companyId/vehicles/:id/reminders", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.customerId) return res.status(400).json({ error: "Assign a customer to this vehicle first" });

      const body = z.object({
        channel: z.enum(["whatsapp", "email", "sms", "manual"]).default("whatsapp"),
        scheduleIds: z.array(z.coerce.number().int().positive()).optional(),
        message: z.string().trim().max(2000).optional().nullable(),
      }).parse(req.body ?? {});

      const [customer] = await db.select().from(customers).where(eq(customers.id, v.customerId));
      if (!customer) return res.status(400).json({ error: "Customer not found" });
      const [company] = await db.select({ name: companies.name, emailSettings: companies.emailSettings })
        .from(companies).where(eq(companies.id, companyId));

      const [schedule, paymentRows] = await Promise.all([
        db.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id)).orderBy(asc(vehiclePaymentSchedules.dueDate)),
        db.select().from(payments).where(and(eq(payments.vehicleId, v.id), eq(payments.companyId, companyId))),
      ]);
      const paid = paymentRows.reduce((s, p) => s + baseAmountOf(p), 0);
      const allOpen = openScheduleLines(schedule, schedulePaid(v, paid)).filter((l) => l.open > 0.004);
      const wanted = body.scheduleIds?.length ? new Set(body.scheduleIds) : null;
      const lines = wanted ? allOpen.filter((l) => wanted.has(l.id)) : allOpen;
      if (!lines.length) return res.status(400).json({ error: "No outstanding schedule lines to remind" });

      const amount = round2(lines.reduce((s, l) => s + l.open, 0));
      const message = body.message || reminderMessage({ ...v, customer }, lines, amount);
      const subject = `Payment reminder — ${v.stockNumber} ${v.make} ${v.model}`;
      const whatsappUrl = customer.phone
        ? `https://wa.me/${String(customer.phone).replace(/\D/g, "").replace(/^0/, "263")}?text=${encodeURIComponent(message)}`
        : null;
      const mailtoUrl = customer.email
        ? `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
        : null;

      let status = "logged";
      let error: string | null = null;

      if (body.channel === "email") {
        if (!customer.email) return res.status(400).json({ error: "Customer has no email address" });
        const settings = (company?.emailSettings || {}) as any;
        const apiKey = settings.apiKey || process.env.RESEND_API_KEY;
        if (apiKey) {
          try {
            const { Resend } = await import("resend");
            const fromEmail = settings.fromEmail || "noreply@fisczim.com";
            const fromName = settings.fromName || company?.name || "FiscZim";
            const from = fromEmail.includes("<") ? fromEmail : `${fromName} <${fromEmail}>`;
            const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
            await new Resend(apiKey).emails.send({
              from,
              to: [customer.email],
              subject,
              text: message,
              html: `<p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
            });
            status = "sent";
          } catch (e: any) {
            status = "failed";
            error = e?.message || "Email send failed";
          }
        }
      }

      const reminder = await db.transaction(async (tx: any) => {
        const [created] = await tx.insert(vehicleReminders).values({
          companyId,
          vehicleId: v.id,
          channel: body.channel,
          status,
          scheduleIds: lines.map((l) => l.id),
          amount: amount.toFixed(2),
          message,
          error,
          createdBy: req.user?.id,
        }).returning();
        await tx.update(vehiclePaymentSchedules)
          .set({ lastReminderAt: new Date() })
          .where(inArray(vehiclePaymentSchedules.id, lines.map((l) => l.id)));
        return created;
      });

      res.status(201).json({
        reminder,
        message,
        amount,
        lines,
        whatsappUrl,
        mailtoUrl,
      });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: error.message || "Failed to send reminder" });
    }
  });

  /**
   * Resolve the WhatsApp "thank you for your payment" context for a customer
   * receipt. Works for any invoice: when the invoice is a vehicle's sale
   * invoice the message names the vehicle ref (stock number), otherwise it
   * names the invoice number. The prefilled wa.me link is returned so the
   * client can open it synchronously inside the click handler — opening it
   * after an await is eaten by popup blockers.
   */
  router.get("/companies/:companyId/invoices/:invoiceId/payment-thankyou", ...base, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const invoiceId = parseInt(req.params.invoiceId);
      const amount = Math.max(0, Number(req.query.amount ?? 0));
      const currency = String(req.query.currency || "USD");

      const [invoice] = await db.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const customer = invoice.customerId
        ? (await db.select().from(customers).where(eq(customers.id, invoice.customerId)))[0] ?? null
        : null;

      // A vehicle is linked when this invoice is the vehicle's sale invoice.
      const vehicle = (await db.select().from(vehicles)
        .where(and(eq(vehicles.invoiceId, invoice.id), eq(vehicles.companyId, companyId)))
        .limit(1))[0] ?? null;

      const stockNumber = vehicle?.stockNumber ?? null;
      const moneyLabel = currency === "USD" ? `$${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
      const message = stockNumber
        ? `Thank you for your payment of ${moneyLabel} on your vehicle ref ${stockNumber}.`
        : `Thank you for your payment of ${moneyLabel} on invoice ${invoice.invoiceNumber}.`;

      const phone = customer?.phone || customer?.mobile || null;
      const digits = phone ? String(phone).replace(/\D/g, "").replace(/^0/, "263") : null;
      const waLink = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;

      res.json({
        message,
        phone: phone ?? null,
        waLink,
        vehicleRef: stockNumber,
        stockNumber,
        vehicleId: vehicle?.id ?? null,
        customerName: customer?.name ?? null,
        hasPhone: Boolean(digits),
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to build payment thank-you" });
    }
  });

  /**
   * Record that a payment thank-you was sent on WhatsApp, so it appears in the
   * vehicle's reminder history alongside payment reminders. Only logs when the
   * invoice is linked to a vehicle; generic invoices have nothing to attach to.
   */
  router.post("/companies/:companyId/invoices/:invoiceId/payment-thankyou", ...base, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const invoiceId = parseInt(req.params.invoiceId);
      const body = z.object({
        amount: z.coerce.number().min(0).optional(),
        currency: z.string().max(8).optional(),
        message: z.string().trim().max(2000).optional(),
      }).parse(req.body ?? {});

      const [invoice] = await db.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const [vehicle] = await db.select().from(vehicles)
        .where(and(eq(vehicles.invoiceId, invoice.id), eq(vehicles.companyId, companyId)))
        .limit(1);
      if (!vehicle) return res.status(200).json({ logged: false, reason: "Invoice is not linked to a vehicle" });

      const amount = Math.max(0, Number(body.amount ?? 0));
      const currency = String(body.currency || invoice.currency || "USD");
      const moneyLabel = currency === "USD" ? `$${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
      const message = body.message
        || `Thank you for your payment of ${moneyLabel} on your vehicle ref ${vehicle.stockNumber}.`;

      const [created] = await db.insert(vehicleReminders).values({
        companyId,
        vehicleId: vehicle.id,
        channel: "whatsapp",
        status: "thankyou",
        amount: amount > 0 ? amount.toFixed(2) : null,
        message,
        createdBy: req.user?.id,
      }).returning();

      res.status(201).json({ logged: true, reminder: created });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: error.message || "Failed to log payment thank-you" });
    }
  });

  // ── sales agreements ────────────────────────────────────────────────────
  const agreementInput = z.object({
    customerId: z.coerce.number().int().positive().optional(), salespersonId: z.string().uuid().nullable().optional(),
    agreedPrice: z.coerce.number().positive(), currency: z.string().max(8).default("USD"), exchangeRate: z.coerce.number().positive().default(1),
    priceType: z.enum(["fixed", "variable"]).default("fixed"), depositAmount: z.coerce.number().min(0).default(0), months: z.coerce.number().int().min(1).max(120),
    interestType: z.enum(["none", "fixed_amount", "percent_pa", "flat_rate"]).default("none"), interestRate: z.coerce.number().min(0).default(0), adminFee: z.coerce.number().min(0).default(0), lateFee: z.coerce.number().min(0).default(0),
    accountingModel: z.enum(["agent", "principal"]).optional(), processingFeeAmount: z.coerce.number().min(0).optional(), feeRecognition: z.enum(["on_collection", "on_handover"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), estimatedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z.string().max(4000).nullable().optional(), termsText: z.string().max(12000).nullable().optional(),
  });
  function agreementCollected(receipts: Pick<typeof payments.$inferSelect, "amount" | "exchangeRate">[], exchangeRate: string | null) {
    return round2(receipts.reduce((sum, receipt) => sum + fromBase(baseAmountOf(receipt), exchangeRate), 0));
  }

  async function agreementPayload(companyId: number, vehicleId: number) {
    const [agreement] = await db.select().from(vehicleSalesAgreements).where(and(eq(vehicleSalesAgreements.companyId, companyId), eq(vehicleSalesAgreements.vehicleId, vehicleId)));
    if (!agreement) return null;
    const [schedule, history] = await Promise.all([
      db.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, vehicleId)).orderBy(asc(vehiclePaymentSchedules.dueDate), asc(vehiclePaymentSchedules.id)),
      db.select().from(payments).where(and(eq(payments.companyId, companyId), eq(payments.vehicleId, vehicleId))).orderBy(asc(payments.paymentDate), asc(payments.id)),
    ]);
    // Agreement schedules are in the agreement currency: convert base receipts back.
    const collected = agreementCollected(history, agreement.exchangeRate);
    return { agreement, schedule, payments: history, collected };
  }
  router.get("/companies/:companyId/vehicles/:id/agreement", ...need("vehicles.view"), async (req: any, res) => {
    const data = await agreementPayload(Number(req.params.companyId), Number(req.params.id));
    if (!data) return res.status(404).json({ error: "Sales agreement not found" }); res.json(data);
  });
  router.post("/companies/:companyId/vehicles/:id/agreement", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id), body = agreementInput.parse(req.body ?? {});
      const result = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, vehicleId); if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        if (v.customerId && body.customerId && v.customerId !== body.customerId) throw Object.assign(new Error("Agreement customer must match the vehicle customer"), { status: 400 });
        if (v.invoiceId || v.cogsJournalEntryId || ["sold", "delivered", "cancelled"].includes(v.status)) {
          throw Object.assign(new Error("Agreement terms are locked after invoicing, posting COGS, or closing the vehicle deal"), { status: 409 });
        }
        const customerId = body.customerId || v.customerId;
        if (!customerId) throw Object.assign(new Error("Assign a customer first"), { status: 400 });
        const refError = await assertOwnedRefs(companyId, { customerId, salespersonId: body.salespersonId ?? v.salespersonId }, tx);
        if (refError) throw Object.assign(new Error(refError), { status: 400 });
        const plan = calculateVehiclePaymentPlan(body);
        let [existing] = await tx.select().from(vehicleSalesAgreements).where(eq(vehicleSalesAgreements.vehicleId, vehicleId)).for("update");
        if (existing && existing.status !== "draft") throw Object.assign(new Error("Only draft agreements can be replaced"), { status: 409 });
        // An existing vehicle/agreement model wins: saving a draft agreement must
        // never silently turn a principal buy/resale into an agency deal.
        const accountingModel = String(existing?.accountingModel ?? v.accountingModel ?? body.accountingModel ?? "agent");
        const agencyDeal = isAgencyVehicle({ accountingModel });
        // adminFee is a financing charge already built into the schedule; it is
        // not Prime Imports' processing-fee revenue unless entered explicitly.
        const processingFee = body.processingFeeAmount ?? Number(existing?.processingFeeAmount ?? 0);
        const costSheetTotal = await customerCostSheetTotal(tx, vehicleId);
        const feeRecognition = body.feeRecognition ?? existing?.feeRecognition ?? "on_handover";
        const agencyFields = {
          accountingModel,
          processingFeeAmount: processingFee.toFixed(2),
          costSheetTotal: costSheetTotal.toFixed(2),
          feeRecognition,
        };
        if (!existing) {
          const [counter] = await tx.insert(vehicleAgreementCounters).values({ companyId, nextNumber: 2, updatedAt: new Date() }).onConflictDoUpdate({ target: vehicleAgreementCounters.companyId, set: { nextNumber: sql`${vehicleAgreementCounters.nextNumber} + 1`, updatedAt: new Date() } }).returning({ nextNumber: vehicleAgreementCounters.nextNumber });
          const number = `SA-${String(Number(counter.nextNumber) - 1).padStart(4, "0")}`;
          [existing] = await tx.insert(vehicleSalesAgreements).values({ ...body, ...agencyFields, companyId, vehicleId, customerId, agreementNumber: number, agreedPrice: body.agreedPrice.toFixed(2), exchangeRate: body.exchangeRate.toFixed(6), depositAmount: body.depositAmount.toFixed(2), interestRate: body.interestRate.toFixed(4), adminFee: body.adminFee.toFixed(2), lateFee: body.lateFee.toFixed(2), createdBy: req.user?.id }).returning();
        } else {
          [existing] = await tx.update(vehicleSalesAgreements).set({ ...body, ...agencyFields, customerId, agreedPrice: body.agreedPrice.toFixed(2), exchangeRate: body.exchangeRate.toFixed(6), depositAmount: body.depositAmount.toFixed(2), interestRate: body.interestRate.toFixed(4), adminFee: body.adminFee.toFixed(2), lateFee: body.lateFee.toFixed(2), updatedAt: new Date() }).where(eq(vehicleSalesAgreements.id, existing.id)).returning();
        }
        await tx.update(vehicles).set({ customerId, salespersonId: body.salespersonId ?? v.salespersonId, salePrice: body.agreedPrice.toFixed(2), saleCurrency: body.currency, saleExchangeRate: body.exchangeRate.toFixed(6), accountingModel, status: v.status === "available" ? "reserved" : v.status, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
        if (agencyDeal) {
          await upsertCustomerAccount(tx, companyId, { ...v, customerId, salePrice: body.agreedPrice.toFixed(2), saleCurrency: body.currency, saleExchangeRate: body.exchangeRate.toFixed(6), accountingModel }, existing);
        }
        await tx.delete(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, vehicleId));
        await tx.insert(vehiclePaymentSchedules).values(plan.lines.map(l => ({ vehicleId, type: l.type, dueDate: l.dueDate, amount: l.amount.toFixed(2) })));
        await refreshScheduleSettlement(tx, companyId, vehicleId);
        return existing;
      });
      res.status(201).json({ agreement: result, ...(await agreementPayload(companyId, vehicleId)) });
    } catch (error: any) { if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors }); res.status(error.status || 500).json({ error: error.message || "Failed to save agreement" }); }
  });
  router.patch("/companies/:companyId/vehicles/:id/agreement", ...need("vehicles.manage"), async (req: any, res) => { req.method = "POST"; return (router as any).handle(req, res); });
  router.post("/companies/:companyId/vehicles/:id/agreement/handover", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id);
      const notes = z.object({ notes: z.string().max(4000).nullable().optional(), earlyHandoverReason }).parse(req.body ?? {});
      const agreement = await db.transaction(async (tx: any) => {
        const v = await lockedVehicle(tx, companyId, vehicleId);
        if (!v) throw Object.assign(new Error("Vehicle not found"), { status: 404 });
        const completed = await completeHandover(tx, companyId, v, { ...notes, createdBy: req.user?.id }, true);
        return completed.agreement;
      });
      res.json({ agreement });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to complete handover" });
    }
  });
  router.get("/companies/:companyId/agreements", ...need("vehicles.view"), async (req: any, res) => {
    const companyId = Number(req.params.companyId), status = req.query.status as string | undefined;
    const rows = await db.select({ agreement: vehicleSalesAgreements, vehicle: vehicles, customer: customers })
      .from(vehicleSalesAgreements)
      .innerJoin(vehicles, and(eq(vehicles.id, vehicleSalesAgreements.vehicleId), eq(vehicles.companyId, companyId)))
      .leftJoin(customers, and(eq(customers.id, vehicleSalesAgreements.customerId), eq(customers.companyId, companyId)))
      .where(and(eq(vehicleSalesAgreements.companyId, companyId), status ? eq(vehicleSalesAgreements.status, status) : undefined));
    const ids = rows.map(row => row.vehicle.id);
    const receipts = ids.length ? await db.select({
      vehicleId: payments.vehicleId,
      amount: payments.amount,
      exchangeRate: payments.exchangeRate,
    }).from(payments).where(and(eq(payments.companyId, companyId), inArray(payments.vehicleId, ids))) : [];
    const receiptsByVehicle = new Map<number | null, typeof receipts>();
    for (const receipt of receipts) {
      const group = receiptsByVehicle.get(receipt.vehicleId);
      if (group) group.push(receipt);
      else receiptsByVehicle.set(receipt.vehicleId, [receipt]);
    }
    const scheduleTotals = ids.length ? await db.select({
      vehicleId: vehiclePaymentSchedules.vehicleId,
      total: sql<string>`sum(${vehiclePaymentSchedules.amount})`,
    }).from(vehiclePaymentSchedules).where(inArray(vehiclePaymentSchedules.vehicleId, ids))
      .groupBy(vehiclePaymentSchedules.vehicleId) : [];
    const scheduledByVehicle = new Map(scheduleTotals.map(row => [row.vehicleId, Number(row.total)]));
    res.json(rows.map(row => {
      const collected = agreementCollected(receiptsByVehicle.get(row.vehicle.id) ?? [], row.agreement.exchangeRate);
      const scheduledTotal = scheduledByVehicle.get(row.vehicle.id);
      return {
        ...row, collected,
        balance: round2(Number(row.agreement.agreedPrice) - collected),
        scheduledTotal,
        scheduledBalance: scheduledTotal == null ? undefined : round2(scheduledTotal - collected),
      };
    }));
  });
  router.get("/companies/:companyId/vehicles/overdue-schedule", ...need("vehicles.view"), async (req: any, res) => { const rows = await db.select({ count: sql<number>`count(*)` }).from(vehiclePaymentSchedules).innerJoin(vehicles, eq(vehicles.id, vehiclePaymentSchedules.vehicleId)).where(and(eq(vehicles.companyId, Number(req.params.companyId)), eq(vehiclePaymentSchedules.status, "overdue"))); res.json({ count: Number(rows[0]?.count || 0) }); });
  router.get("/companies/:companyId/vehicles/:id/payments/:paymentId/receipt", ...need("vehicles.view"), async (req: any, res) => {
    const companyId = Number(req.params.companyId), vehicleId = Number(req.params.id), paymentId = Number(req.params.paymentId);
    const [row] = await db.select({ payment: payments, vehicle: vehicles, customer: customers }).from(payments).innerJoin(vehicles, eq(vehicles.id, payments.vehicleId)).leftJoin(customers, eq(customers.id, payments.customerId)).where(and(eq(payments.id, paymentId), eq(payments.companyId, companyId), eq(payments.vehicleId, vehicleId)));
    if (!row) return res.status(404).json({ error: "Payment not found" });
    const history = await db.select().from(payments).where(and(eq(payments.companyId, companyId), eq(payments.vehicleId, vehicleId)));
    const [agreement] = await db.select().from(vehicleSalesAgreements).where(eq(vehicleSalesAgreements.vehicleId, vehicleId));
    // Normalise base receipts to the sale/agreement currency before comparing balances.
    const paid = history.reduce((sum, p) => sum + fromBase(baseAmountOf(p), row.vehicle.saleExchangeRate), 0);
    const allocationRows = await db
      .select({ allocation: vehicleCustomerPaymentAllocations, cost: vehicleCosts })
      .from(vehicleCustomerPaymentAllocations)
      .leftJoin(vehicleCosts, eq(vehicleCosts.id, vehicleCustomerPaymentAllocations.costId))
      .where(eq(vehicleCustomerPaymentAllocations.paymentId, paymentId))
      .orderBy(asc(vehicleCustomerPaymentAllocations.id));
    const allocations = allocationRows.map((r: any) => ({
      id: r.allocation.id,
      allocationType: r.allocation.allocationType,
      amount: Number(r.allocation.amount),
      reversed: Boolean(r.allocation.reversedAt),
      reversesAllocationId: r.allocation.reversesAllocationId,
      label: r.allocation.allocationType === "fee"
        ? "Processing fee (Prime Imports revenue)"
        : `${r.cost?.category ?? "cost"}${r.cost?.description ? ` · ${r.cost.description}` : ""}`,
    }));
    res.json({ receiptNumber: `VR-${row.payment.id}`, payment: row.payment, vehicle: row.vehicle, customer: row.customer, agreementNumber: agreement?.agreementNumber ?? null, remainingBalance: round2(Number(agreement?.agreedPrice ?? row.vehicle.salePrice ?? 0) - paid), allocations });
  });

  /**
   * Build a deposit-plus-instalments payment plan automatically.
   * A deposit is mandatory; 2–36 monthly instalments (2, 4, 6, 12, 18, 24,
   * 30 or 36) cover the remainder.
   */
  router.post("/companies/:companyId/vehicles/:id/schedule/generate", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.customerId) return res.status(400).json({ error: "Assign a customer to this vehicle first" });
      // Invoice creation requires the agreed sale price — the target retail
      // price is a planning figure only and cannot anchor a binding invoice.
      if (v.salePrice == null) return res.status(400).json({ error: "Set the agreed sale price on the Details tab before generating a payment schedule" });

      const body = z
        .object({
          months: z.coerce
            .number()
            .int()
            .refine((m) => [2, 4, 6, 12, 18, 24, 30, 36].includes(m), {
              message: "Months must be one of 2, 4, 6, 12, 18, 24, 30 or 36",
            }),
          deposit: z.coerce.number().positive(),
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
        })
        .parse(req.body ?? {});

      const rate = Number(v.saleExchangeRate || 1) || 1;
      const isAgency = isAgencyVehicle(v);
      const [agreement] = await db.select().from(vehicleSalesAgreements).where(and(
        eq(vehicleSalesAgreements.companyId, companyId),
        eq(vehicleSalesAgreements.vehicleId, v.id),
      ));
      // Schedule instalments always follow the customer's total price. For
      // agency deals that is the full cost sheet + fee; the auto-created
      // invoice is only the fee and must not shrink the schedule.
      const subtotal = round2(Number(v.salePrice));
      const invoiceSubtotal = round2(isAgency ? Number(agreement?.processingFeeAmount ?? 0) : subtotal);
      if (subtotal <= 0) return res.status(400).json({ error: "The agreed sale price must be greater than zero" });

      const startDate = body.startDate || new Date().toISOString().slice(0, 10);

      // Build the schedule line dates first so we can use the last one as
      // the invoice due date.
      const baseCentsEstimate = Math.floor(Math.round((subtotal - body.deposit) * 100) / body.months);
      const lastInstalmentDate = addVehiclePaymentMonths(startDate, body.months);

      // ── Run everything in one transaction ──────────────────────────────
      const result = await db.transaction(async (tx: any) => {
        // Lock the vehicle row so a concurrent request cannot double-invoice.
        const locked = await lockedVehicle(tx, companyId, v.id);
        if (!locked) throw Object.assign(new Error("Vehicle not found"), { status: 404 });

        // ── 1. Auto-create invoice if not already present ────────────────
        let invoice: any = null;
        let invoiceCreated = false;

        if (locked.invoiceId) {
          // Vehicle already has an invoice — use it as the schedule basis.
          const [existing] = await tx
            .select()
            .from(invoices)
            .where(and(eq(invoices.id, locked.invoiceId), eq(invoices.companyId, companyId)));
          invoice = existing ?? null;
        } else {
          // No invoice yet — create one now (zero-tax; user edits on invoice page).
          const currency = locked.saleCurrency || "USD";
          const exchangeRate = Number(locked.saleExchangeRate || 1) || 1;
          const taxAmount = 0;
          const total = round2(invoiceSubtotal + taxAmount);
          const invoicePostingKey = isAgency
            ? `vehicle-fee-invoice:${locked.id}:invoice`
            : `vehicle-sale:${locked.id}:invoice`;

          const vehicleLabel = [
            `${locked.year ?? ""} ${locked.make} ${locked.model}`.replace(/\s+/g, " ").trim(),
            `Stock ${locked.stockNumber}`,
            locked.vin ? `VIN ${locked.vin}` : null,
          ].filter(Boolean).join(" — ");
          const description = isAgency ? `Vehicle import processing fee — ${vehicleLabel}` : vehicleLabel;

          invoice = await storage.createInvoice({
            companyId,
            customerId: locked.customerId!,
            branchId: null,
            issueDate: new Date(),
            // Due date is the last instalment — that's when the full balance is owed.
            dueDate: new Date(lastInstalmentDate),
            subtotal: invoiceSubtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
            status: "issued",
            paidAmount: "0.00",
            currency,
            exchangeRate: exchangeRate.toFixed(6),
            isFiscalized: false,
            notes: description,
            createdBy: req.user?.id,
            postingKey: invoicePostingKey,
            ...(isAgency
              ? { revenueAccountCode: await storage.getSystemAccountCode(companyId, "deferredVehicleFeeRevenueAccountCode", tx) }
              : {}),
            items: [{
              description,
              quantity: "1",
              unitPrice: invoiceSubtotal.toFixed(2),
              discountAmount: "0.00",
              taxRate: "0.00",
              taxTypeId: null,
              lineTotal: invoiceSubtotal.toFixed(2),
            }],
          } as any, tx);

          await tx.update(vehicles).set({
            invoiceId: invoice.id,
            status: ["available", "reserved"].includes(locked.status) ? "sold" : locked.status,
            updatedAt: new Date(),
          }).where(eq(vehicles.id, locked.id));

          invoiceCreated = true;

          if (isAgency) {
            const [account] = await tx.select().from(vehicleCustomerAccounts).where(eq(vehicleCustomerAccounts.vehicleId, locked.id));
            if (account) {
              await clearAgencyFeeInvoice(tx, companyId, invoice, account, req.user?.id);
              await refreshCustomerAccountTotals(tx, account.id);
            }
          } else {
            // Apply any pre-existing deposits / part-payments to the new invoice.
            await applyVehiclePaymentsToInvoice(tx, companyId, locked.id, invoice, req.user?.id);
            // Post COGS (Dr COGS / Cr Inventory) for all capitalised cost lines.
            await postVehicleCogs(tx, companyId, locked.id, req.user?.id);
          }

          // Mark the linked CRM enquiry as won.
          if (locked.enquiryId) {
            await markEnquiryWon(
              tx,
              companyId,
              locked.enquiryId,
              `Invoice ${invoice.invoiceNumber} raised for ${description}.`,
              { vehicleId: locked.id, invoiceId: invoice.id },
              req.user?.id,
            );
          }

          // Accrue salesperson commission.
          try {
            await accrueVehicleCommission(tx, { companyId, vehicleId: locked.id, userId: req.user?.id });
          } catch (err) {
            console.error(`[CRM] Failed to accrue commission for vehicle ${locked.id}`, err);
          }
        }

        // ── 2. Use the invoice total (tax-inclusive) as the schedule basis ─
        // Schedule lines carry the sale currency, matching invoice.total and
        // body.deposit. Base conversion is handled at receipt time.
        const total = invoice && !isAgency ? round2(Number(invoice.total)) : round2(subtotal);

        if (total <= 0) throw Object.assign(new Error("The agreed sale price must be greater than zero"), { status: 400 });

        const deposit = round2(body.deposit);
        if (deposit >= total) throw Object.assign(new Error("The deposit must be less than the sale price"), { status: 400 });

        const totalCents = Math.round(total * 100);
        const depositCents = Math.round(deposit * 100);
        const remainingCents = totalCents - depositCents;
        if (remainingCents < body.months) {
          throw Object.assign(new Error("The deposit leaves too little outstanding for this many instalments"), { status: 400 });
        }

        const baseCents = Math.floor(remainingCents / body.months);
        const planLines: { type: "deposit" | "instalment" | "balance"; dueDate: string; amount: number }[] = [
          { type: "deposit", dueDate: startDate, amount: depositCents / 100 },
        ];
        let allocated = 0;
        for (let i = 1; i <= body.months; i += 1) {
          const cents = i === body.months ? remainingCents - allocated : baseCents;
          allocated += cents;
          planLines.push({
            type: i === body.months ? "balance" : "instalment",
            dueDate: addVehiclePaymentMonths(startDate, i),
            amount: cents / 100,
          });
        }

        // ── 3. Replace schedule lines ────────────────────────────────────
        await tx.delete(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id));
        const rows = await tx
          .insert(vehiclePaymentSchedules)
          .values(planLines.map((l) => ({ vehicleId: v.id, type: l.type, dueDate: l.dueDate, amount: l.amount.toFixed(2) })))
          .returning();

        return {
          rows,
          total,
          deposit,
          baseCents,
          remainingCents,
          invoice,
          invoiceCreated,
        };
      });

      // ── Fiscalise invoice after the transaction (talks to external device) ─
      let finalInvoice = result.invoice;
      if (result.invoiceCreated && result.invoice) {
        try {
          finalInvoice = await ensureVehicleInvoiceFiscalized(
            result.invoice.id,
            companyId,
            req.user?.id,
            req.user?.isSuperAdmin,
          );
        } catch (err) {
          console.error("[FDMS] Fiscalization failed for auto-created vehicle invoice", err);
          // Non-fatal — the invoice and schedule are already committed.
        }
      }

      if (finalInvoice) {
        const vehicleCostsRows = await db
          .select()
          .from(vehicleCosts)
          .where(and(eq(vehicleCosts.vehicleId, parseInt(req.params.id)), ne(vehicleCosts.status, "cancelled")))
          .orderBy(asc(vehicleCosts.costDate), asc(vehicleCosts.id));
        finalInvoice = {
          ...finalInvoice,
          vehicle: v,
          vehicleCosts: vehicleCostsRows,
        };
      }

      res.status(201).json({
        plan: {
          total: result.total,
          deposit: result.deposit,
          months: body.months,
          monthly: result.baseCents / 100,
          finalAmount: (result.remainingCents - result.baseCents * (body.months - 1)) / 100,
          startDate,
          currency: v.saleCurrency || "USD",
        },
        lines: result.rows,
        invoice: finalInvoice ?? null,
        invoiceCreated: result.invoiceCreated,
      });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to generate payment plan" });
    }
  });


  router.put("/companies/:companyId/vehicles/:id/schedule", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const lines = z
        .array(z.object({ type: z.enum(["deposit", "instalment", "balance"]), dueDate: z.string(), amount: z.coerce.number().positive() }))
        .parse(req.body?.lines ?? []);
      const rows = await db.transaction(async (tx: any) => {
        await tx.delete(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id));
        return lines.length
          ? await tx
              .insert(vehiclePaymentSchedules)
              .values(lines.map((l) => ({ vehicleId: v.id, type: l.type, dueDate: l.dueDate, amount: l.amount.toFixed(2) })))
              .returning()
          : [];
      });
      res.json(rows);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to save schedule" });
    }
  });

  /**
   * Outstanding balances include financing in the payment schedule.
   * Report totals use base currency and the next payment uses the deal currency.
   */
  router.get("/companies/:companyId/vehicles-reports/outstanding", ...need("vehicles.view"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const rows = await db
        .select({ vehicle: vehicles, customerName: customers.name, customerPhone: customers.phone, customerEmail: customers.email })
        .from(vehicles)
        .leftJoin(customers, and(eq(customers.id, vehicles.customerId), eq(customers.companyId, companyId)))
        .where(and(eq(vehicles.companyId, companyId), sql`${vehicles.salePrice} IS NOT NULL`, sql`${vehicles.status} <> 'cancelled'`));
      const ids = rows.map((r) => r.vehicle.id);
      const { costs, paid, invoiceBase, fees } = await totalsFor(ids);
      const schedules = ids.length
        ? await db.select().from(vehiclePaymentSchedules).where(inArray(vehiclePaymentSchedules.vehicleId, ids)).orderBy(asc(vehiclePaymentSchedules.dueDate))
        : [];
      const result = rows
        .map((r) => {
          const summary = summariseVehicle(r.vehicle, costs.get(r.vehicle.id) || [], paid.get(r.vehicle.id) || 0, invoiceBase.get(r.vehicle.id), fees.get(r.vehicle.id) || 0);
          // summary.paid is base currency; schedules carry saleCurrency amounts.
          const lines = openScheduleLines(
            schedules.filter((s) => s.vehicleId === r.vehicle.id),
            schedulePaid(r.vehicle, summary.paid),
          );
          const openLines = lines.filter((l) => l.open > 0.004);
          const rate = r.vehicle.saleExchangeRate;
          const overdue = toBase(openLines.filter(l => l.state === "overdue").reduce((sum, line) => sum + line.open, 0), rate);
          const scheduledTotal = toBase(lines.reduce((sum, line) => sum + line.amount, 0), rate);
          const totalPayable = Math.max(summary.amountDue, scheduledTotal);
          const next = openLines.find((l) => l.state === "upcoming");
          const lastReminderAt = openLines
            .map((l) => l.lastReminderAt)
            .filter(Boolean)
            .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
          return {
            vehicleId: r.vehicle.id,
            stockNumber: r.vehicle.stockNumber,
            description: `${r.vehicle.year ?? ""} ${r.vehicle.make} ${r.vehicle.model}`.trim(),
            customerId: r.vehicle.customerId,
            customerName: r.customerName,
            customerPhone: r.customerPhone,
            customerEmail: r.customerEmail,
            salePrice: summary.sellingPrice,
            totalPayable,
            paid: summary.paid,
            balance: money(totalPayable - summary.paid),
            overdue,
            nextDue: next ? { dueDate: next.dueDate, amount: next.open, currency: r.vehicle.saleCurrency || "USD" } : null,
            lastReminderAt,
            schedule: openLines,
          };
        })
        .filter((r) => r.balance > 0)
        .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to build outstanding report" });
    }
  });

  // ── costing & profitability reports ────────────────────────────────────────

  type ReportRow = {
    vehicle: any;
    customerName: string | null;
    lines: any[];
    summary: ReturnType<typeof summariseVehicle>;
    costSuppliers: { id: number; name: string | null }[];
  };

  /** Load vehicles, cost lines, supplier names and payment totals in one pass. */
  async function buildVehicleReport(companyId: number): Promise<ReportRow[]> {
    const rows = await db
      .select({ vehicle: vehicles, customerName: customers.name })
      .from(vehicles)
      .leftJoin(customers, eq(customers.id, vehicles.customerId))
      .where(and(eq(vehicles.companyId, companyId), sql`${vehicles.status} <> 'cancelled'`))
      .orderBy(desc(vehicles.createdAt));
    const ids = rows.map((r) => r.vehicle.id);
    const { costs, paid, invoiceBase, fees } = await totalsFor(ids);
    const supplierIds = Array.from(
      new Set(Array.from(costs.values()).flat().map((c: any) => c.supplierId).filter((x: any) => x != null)),
    ).map(Number);
    const supplierRows = supplierIds.length
      ? await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(inArray(suppliers.id, supplierIds))
      : [];
    const supplierMap = new Map<number, string | null>(supplierRows.map((s) => [s.id, s.name]));
    return rows.map((r) => {
      const lines = (costs.get(r.vehicle.id) || []).map((c: any) => ({
        ...c,
        supplierName: c.supplierId ? supplierMap.get(Number(c.supplierId)) ?? null : null,
      }));
      const summary = summariseVehicle(r.vehicle, lines, paid.get(r.vehicle.id) || 0, invoiceBase.get(r.vehicle.id), fees.get(r.vehicle.id) || 0);
      const costSuppliers = Array.from(new Set(lines.map((l: any) => l.supplierId).filter((x: any) => x != null))).map((id: any) => ({
        id: Number(id),
        name: supplierMap.get(Number(id)) ?? null,
      }));
      return { vehicle: r.vehicle, customerName: r.customerName, lines, summary, costSuppliers };
    });
  }

  function reportFilters(query: any) {
    const q = query as Record<string, string | undefined>;
    return {
      status: q.status && q.status !== "all" ? q.status : undefined,
      stage: q.stage && q.stage !== "all" ? q.stage : undefined,
      supplierId: q.supplierId && q.supplierId !== "all" ? Number(q.supplierId) : undefined,
      customerId: q.customerId && q.customerId !== "all" ? Number(q.customerId) : undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      search: (q.search || "").trim().toLowerCase() || undefined,
    };
  }

  function filterReportRows(rows: ReportRow[], f: ReturnType<typeof reportFilters>) {
    const fromTs = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null;
    const toTs = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : null;
    return rows.filter((row) => {
      const v = row.vehicle;
      if (f.status && v.status !== f.status) return false;
      if (f.stage && v.stage !== f.stage) return false;
      if (f.customerId && Number(v.customerId) !== f.customerId) return false;
      if (f.supplierId && !row.lines.some((l) => Number(l.supplierId) === f.supplierId)) return false;
      if (fromTs != null || toTs != null) {
        const ts = v.createdAt ? new Date(v.createdAt).getTime() : null;
        if (ts == null) return false;
        if (fromTs != null && ts < fromTs) return false;
        if (toTs != null && ts > toTs) return false;
      }
      if (f.search) {
        const hay = `${v.stockNumber} ${v.vin ?? ""} ${v.make} ${v.model} ${v.containerNumber ?? ""}`.toLowerCase();
        if (!hay.includes(f.search)) return false;
      }
      return true;
    });
  }

  function categoryTotals(items: { costsByCategory?: Record<string, number> }[]) {
    const totals: Record<string, number> = {};
    for (const i of items) {
      for (const [k, v] of Object.entries(i.costsByCategory || {})) totals[k] = money((totals[k] || 0) + v);
    }
    return totals;
  }

  function toReportItem(row: ReportRow) {
    const v = row.vehicle;
    return {
      id: v.id,
      stockNumber: v.stockNumber,
      description: `${v.year ?? ""} ${v.make} ${v.model}`.trim(),
      vin: v.vin,
      status: v.status,
      stage: v.stage,
      customerId: v.customerId,
      customerName: row.customerName,
      purchasePrice: row.summary.purchasePrice,
      landedCost: row.summary.landedCost,
      importCosts: row.summary.importCosts,
      sellingPrice: row.summary.sellingPrice,
      isProjected: row.summary.isProjected,
      accountingModel: row.summary.accountingModel,
      processingFee: row.summary.processingFee,
      profit: row.summary.profit,
      marginPercent: row.summary.marginPercent,
      costsByCategory: row.summary.costsByCategory,
      pendingCosts: row.summary.pendingCosts,
      paidCosts: row.summary.paidCosts,
      disputedCosts: row.summary.disputedCosts,
      negativeMargin: row.summary.negativeMargin,
      lowMargin: row.summary.lowMargin,
      hasUnpaidCosts: row.summary.hasUnpaidCosts,
      costCount: row.lines.length,
      costSuppliers: row.costSuppliers,
    };
  }

  /**
   * Vehicle costing report: full landed cost per vehicle with a column per
   * category. Filters mirror the profitability report so the two views agree.
   */
  router.get("/companies/:companyId/vehicles-reports/costing", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const filters = reportFilters(req.query);
      const rows = filterReportRows(await buildVehicleReport(companyId), filters);
      const items = rows.map(toReportItem);
      const totals = {
        vehicles: items.length,
        purchasePrice: money(items.reduce((s, i) => s + i.purchasePrice, 0)),
        landedCost: money(items.reduce((s, i) => s + i.landedCost, 0)),
        importCosts: money(items.reduce((s, i) => s + i.importCosts, 0)),
        pendingCosts: money(items.reduce((s, i) => s + i.pendingCosts, 0)),
        paidCosts: money(items.reduce((s, i) => s + i.paidCosts, 0)),
        disputedCosts: money(items.reduce((s, i) => s + i.disputedCosts, 0)),
        sellingPrice: money(items.reduce((s, i) => s + i.sellingPrice, 0)),
        profit: money(items.reduce((s, i) => s + i.profit, 0)),
        byCategory: categoryTotals(items),
        negativeMarginCount: items.filter((i) => i.negativeMargin).length,
        lowMarginCount: items.filter((i) => i.lowMargin).length,
        unpaidCostCount: items.filter((i) => i.hasUnpaidCosts).length,
      };
      res.json({ totals, items });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to build costing report" });
    }
  });

  router.get("/companies/:companyId/vehicles-reports/profitability", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const filters = reportFilters(req.query);
      const rows = filterReportRows(await buildVehicleReport(companyId), filters);
      const items = rows.map(toReportItem);
      const sold = items.filter((i) => !i.isProjected);
      const stock = items.filter((i) => i.isProjected);
      const totals = {
        vehicles: items.length,
        sold: sold.length,
        // Agency revenue is the processing fee only; the customer-funded cost
        // sheet is a disbursement, not turnover.
        revenue: money(sold.reduce((s, i) => s + (isAgencyVehicle(i) ? i.processingFee : i.sellingPrice), 0)),
        customerFundedCosts: money(sold.filter(isAgencyVehicle).reduce((s, i) => s + i.landedCost, 0)),
        landedCost: money(sold.reduce((s, i) => s + i.landedCost, 0)),
        profit: money(sold.reduce((s, i) => s + i.profit, 0)),
        projectedProfit: money(stock.reduce((s, i) => s + i.profit, 0)),
        stockValue: money(stock.reduce((s, i) => s + i.landedCost, 0)),
        pendingCosts: money(items.reduce((s, i) => s + i.pendingCosts, 0)),
        paidCosts: money(items.reduce((s, i) => s + i.paidCosts, 0)),
        byCategory: categoryTotals(items),
        negativeMarginCount: items.filter((i) => i.negativeMargin).length,
        lowMarginCount: items.filter((i) => i.lowMargin).length,
        unpaidCostCount: items.filter((i) => i.hasUnpaidCosts).length,
      };
      res.json({ totals, items });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to build profitability report" });
    }
  });

  /**
   * Consignments with their vehicle allocation status, and a one-click
   * allocation of freight/insurance/duty/handling onto the linked vehicles.
   */
  router.get("/companies/:companyId/vehicles-reports/consignments", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const rows = await db
        .select({ consignment: consignments, forwarderName: freightForwarders.name, supplierName: suppliers.name })
        .from(consignments)
        .leftJoin(freightForwarders, eq(freightForwarders.id, consignments.forwarderId))
        .leftJoin(suppliers, eq(suppliers.id, consignments.supplierId))
        .where(eq(consignments.companyId, companyId))
        .orderBy(desc(consignments.createdAt));
      const vehicleRows = await db
        .select({ id: vehicles.id, consignmentId: vehicles.consignmentId })
        .from(vehicles)
        .where(and(eq(vehicles.companyId, companyId), sql`${vehicles.consignmentId} IS NOT NULL`, sql`${vehicles.status} <> 'cancelled'`));
      const vehicleIds = vehicleRows.map((v) => v.id);
      const purchaseRows = vehicleIds.length
        ? await db
            .select({ vehicleId: vehicleCosts.vehicleId, baseAmount: vehicleCosts.baseAmount })
            .from(vehicleCosts)
            .where(and(inArray(vehicleCosts.vehicleId, vehicleIds), eq(vehicleCosts.category, "purchase"), sql`${vehicleCosts.status} <> 'cancelled'`))
        : [];
      const purchaseByVehicle = new Map<number, number>();
      for (const p of purchaseRows) purchaseByVehicle.set(p.vehicleId, money((purchaseByVehicle.get(p.vehicleId) || 0) + Number(p.baseAmount)));
      const allocatedRows = await db
        .select({ vehicleId: vehicleCosts.vehicleId, sourceId: vehicleCosts.sourceId, baseAmount: vehicleCosts.baseAmount })
        .from(vehicleCosts)
        .innerJoin(vehicles, eq(vehicles.id, vehicleCosts.vehicleId))
        .where(and(eq(vehicles.companyId, companyId), eq(vehicleCosts.source, "consignment"), sql`${vehicleCosts.sourceId} IS NOT NULL`));
      const vehiclesByConsignment = new Map<number, any[]>();
      for (const v of vehicleRows) {
        if (v.consignmentId == null) continue;
        vehiclesByConsignment.set(v.consignmentId, [...(vehiclesByConsignment.get(v.consignmentId) || []), v]);
      }
      const allocatedByConsignment = new Map<number, { rows: number; total: number }>();
      for (const a of allocatedRows) {
        if (a.sourceId == null) continue;
        const cur = allocatedByConsignment.get(a.sourceId) || { rows: 0, total: 0 };
        allocatedByConsignment.set(a.sourceId, { rows: cur.rows + 1, total: money(cur.total + Number(a.baseAmount)) });
      }
      const items = rows.map((r) => {
        const c = r.consignment;
        const linked = vehiclesByConsignment.get(c.id) || [];
        const allocated = allocatedByConsignment.get(c.id) || { rows: 0, total: 0 };
        const purchaseValue = money(linked.reduce((s, v) => s + (purchaseByVehicle.get(v.id) || 0), 0));
        const totalCost = money(
          Number(c.shippingCost || 0) + Number(c.insuranceCost || 0) + Number(c.customsDuty || 0) + Number(c.handlingCharges || 0),
        );
        return {
          id: c.id,
          referenceNumber: c.referenceNumber,
          shippingMethod: c.shippingMethod,
          status: c.status,
          forwarderId: c.forwarderId,
          forwarderName: r.forwarderName,
          supplierId: c.supplierId,
          supplierName: r.supplierName,
          currency: c.currency || "USD",
          containerNumber: c.containerNumber,
          flightNumber: c.flightNumber,
          shippingCost: money(Number(c.shippingCost || 0)),
          insuranceCost: money(Number(c.insuranceCost || 0)),
          customsDuty: money(Number(c.customsDuty || 0)),
          handlingCharges: money(Number(c.handlingCharges || 0)),
          totalCost,
          vehicleCount: linked.length,
          purchaseValue,
          allocatedRows: allocated.rows,
          allocatedTotal: allocated.total,
          canAllocate: linked.length > 0 && totalCost > 0,
        };
      });
      res.json({ items });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch consignment costing" });
    }
  });

  router.post("/companies/:companyId/vehicles-reports/consignments/:consignmentId/allocate", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const [c] = await db
        .select()
        .from(consignments)
        .where(and(eq(consignments.id, parseInt(req.params.consignmentId)), eq(consignments.companyId, companyId)));
      if (!c) return res.status(404).json({ error: "Consignment not found" });

      const weightMode = req.body?.weights === "equal" ? "equal" : "purchase";
      const status = (VEHICLE_COST_STATUSES as readonly string[]).includes(req.body?.status) ? req.body.status : "pending";
      const linked = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.companyId, companyId), eq(vehicles.consignmentId, c.id), sql`${vehicles.status} <> 'cancelled'`));
      if (!linked.length) return res.status(400).json({ error: "No vehicles are linked to this consignment" });
      const ids = linked.map((v) => v.id);

      const purchaseRows = await db
        .select({ vehicleId: vehicleCosts.vehicleId, baseAmount: vehicleCosts.baseAmount })
        .from(vehicleCosts)
        .where(and(inArray(vehicleCosts.vehicleId, ids), eq(vehicleCosts.category, "purchase"), sql`${vehicleCosts.status} <> 'cancelled'`));
      const purchaseByVehicle = new Map<number, number>();
      for (const p of purchaseRows) purchaseByVehicle.set(p.vehicleId, money((purchaseByVehicle.get(p.vehicleId) || 0) + Number(p.baseAmount)));

      const weights = ids.map((vehicleId) => ({ vehicleId, weight: purchaseByVehicle.get(vehicleId) || 0 }));
      let totalWeight = weights.reduce((s, w) => s + w.weight, 0);
      if (weightMode === "equal" || totalWeight <= 0) {
        totalWeight = weights.length;
        for (const w of weights) w.weight = 1;
      }

      const mapping = [
        { field: "shippingCost", category: "shipping", label: "Shipping" },
        { field: "insuranceCost", category: "insurance", label: "Insurance" },
        { field: "customsDuty", category: "duty", label: "Customs duty" },
        { field: "handlingCharges", category: "clearing", label: "Handling / clearing" },
      ] as const;
      const referenceDate = c.actualArrivalDate ?? c.expectedArrivalDate ?? c.dispatchDate ?? c.createdAt ?? new Date();
      const costDate = new Date(referenceDate).toISOString().slice(0, 10);
      const currency = c.currency || "USD";
      const rows: any[] = [];

      for (const m of mapping) {
        const total = money(Number((c as any)[m.field] || 0));
        if (total <= 0.004) continue;
        let allocated = 0;
        weights.forEach((w, index) => {
          const isLast = index === weights.length - 1;
          const amount = isLast ? money(total - allocated) : money(total * (w.weight / totalWeight));
          allocated = money(allocated + amount);
          if (amount <= 0.004) return;
          rows.push({
            vehicleId: w.vehicleId,
            category: m.category,
            description: `Consignment ${c.referenceNumber} – ${m.label}`,
            amount: amount.toFixed(2),
            currency,
            exchangeRate: "1.000000",
            baseAmount: amount.toFixed(2),
            payee: null,
            reference: c.referenceNumber,
            costDate,
            status,
            supplierId: c.supplierId ?? null,
            source: "consignment",
            sourceId: c.id,
            createdBy: req.user?.id,
          });
        });
      }

      await db.transaction(async (tx: any) => {
        await tx
          .delete(vehicleCosts)
          .where(and(inArray(vehicleCosts.vehicleId, ids), eq(vehicleCosts.source, "consignment"), eq(vehicleCosts.sourceId, c.id)));
        if (rows.length) await tx.insert(vehicleCosts).values(rows);
      });

      res.status(201).json({
        created: rows.length,
        vehicles: ids.length,
        weights: weightMode === "equal" ? "equal" : "purchase",
        allocatedTotal: money(rows.reduce((s, r) => s + Number(r.baseAmount), 0)),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to allocate consignment costs" });
    }
  });

  return router;
}
