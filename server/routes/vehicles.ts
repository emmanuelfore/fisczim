import { Router } from "express";
import { db } from "../db.js";
import {
  vehicles,
  vehicleCosts,
  vehicleStageEvents,
  vehiclePaymentSchedules,
  vehicleReminders,
  vehicleStockCounters,
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
import { enquiries, invoices } from "../../shared/schema.js";
import { userHasPermission } from "../lib/permissions.js";
import { storage } from "../storage.js";
import { processInvoiceFiscalization } from "../lib/fiscalization.js";
import {
  ensureEnquiryCustomer,
  logEnquiryVehicleActivity,
  markEnquiryWon,
} from "../lib/crm-vehicles.js";

/**
 * Vehicle imports: per-unit landed costing, profitability, import tracking
 * and deposit/part-payment tracking.
 *
 * Money in base currency (USD). Cost lines carry their own currency and
 * exchange rate; base_amount = amount * exchange_rate is frozen at entry so
 * later rate moves don't rewrite historical landed cost.
 */

const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;

export function summariseVehicle(
  vehicle: { salePrice: string | null; targetPrice: string | null; saleExchangeRate?: string | null },
  costs: { category: string; baseAmount: string; status?: string | null }[],
  paid: number,
  invoiceTotalBase?: number | null,
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
  // salePrice is in saleCurrency; saleExchangeRate converts it to base (USD).
  const saleRate = Number(vehicle.saleExchangeRate || 1) || 1;
  const sellingPrice = vehicle.salePrice != null ? money(Number(vehicle.salePrice) * saleRate) : money(vehicle.targetPrice ?? 0);
  const profit = money(sellingPrice - landedCost);
  const margin = sellingPrice > 0 ? Math.round((profit / sellingPrice) * 10000) / 100 : 0;
  // Statements and schedules follow the actual invoice, because that carries
  // the tax the customer owes. Before invoicing, fall back to the agreed sale.
  const amountDue = invoiceTotalBase != null ? money(invoiceTotalBase) : sellingPrice;
  const balance = vehicle.salePrice != null || invoiceTotalBase != null ? money(amountDue - paid) : 0;
  return {
    purchasePrice,
    landedCost,
    importCosts: money(landedCost - purchasePrice),
    sellingPrice,
    amountDue,
    isProjected: vehicle.salePrice == null,
    profit,
    marginPercent: margin,
    paid: money(paid),
    balance,
    costsByCategory: byCategory,
    pendingCosts,
    paidCosts,
    disputedCosts,
    // Alert flags consumed by the reports UI.
    negativeMargin: sellingPrice > 0 && profit < 0,
    lowMargin: sellingPrice > 0 && profit >= 0 && margin < 10,
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
    const { summary, costs, cogsAmount, ...rest } = row as any;
    const s = summary ? { sellingPrice: summary.sellingPrice, isProjected: summary.isProjected, paid: summary.paid, balance: summary.balance } : undefined;
    return { ...rest, ...(s ? { summary: s } : {}), ...(costs ? { costs: [] } : {}) } as T;
  }

  /** Reject customer/enquiry ids that belong to another company. */
  async function assertOwnedRefs(companyId: number, body: { customerId?: number | null; enquiryId?: number | null; invoiceId?: number | null; consignmentId?: number | null; supplierId?: number | null; salespersonId?: string | null }) {
    if (body.invoiceId) {
      const [i] = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.id, body.invoiceId), eq(invoices.companyId, companyId)));
      if (!i) return "Invoice not found";
    }
    if (body.consignmentId) {
      const [c] = await db.select({ id: consignments.id }).from(consignments).where(and(eq(consignments.id, body.consignmentId), eq(consignments.companyId, companyId)));
      if (!c) return "Consignment not found";
    }
    if (body.supplierId) {
      const [s] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, body.supplierId), eq(suppliers.companyId, companyId)));
      if (!s) return "Supplier not found";
    }
    if (body.salespersonId) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, body.salespersonId), sql`EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id = ${body.salespersonId} AND cu.company_id = ${companyId})`));
      if (!u) return "Staff member not found";
    }
    if (body.customerId) {
      const [c] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, body.customerId), eq(customers.companyId, companyId)));
      if (!c) return "Customer not found";
    }
    if (body.enquiryId) {
      const [e] = await db.select({ id: enquiries.id }).from(enquiries).where(and(eq(enquiries.id, body.enquiryId), eq(enquiries.companyId, companyId)));
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
    if (!ids.length) return { costs: new Map<number, any[]>(), paid: new Map<number, number>(), invoiceBase: new Map<number, number>() };
    const costRows = await db.select().from(vehicleCosts).where(inArray(vehicleCosts.vehicleId, ids));
    const paidRows = await db
      .select({ vehicleId: payments.vehicleId, total: sql<string>`COALESCE(SUM(${payments.amount} * COALESCE(${payments.exchangeRate}, 1)), 0)` })
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
    const costs = new Map<number, any[]>();
    for (const c of costRows) costs.set(c.vehicleId, [...(costs.get(c.vehicleId) || []), c]);
    const paid = new Map<number, number>();
    for (const p of paidRows) if (p.vehicleId != null) paid.set(p.vehicleId, Number(p.total));
    const invoiceBase = new Map<number, number>();
    for (const i of invoiceRows) invoiceBase.set(i.vehicleId, money(Number(i.total) * (Number(i.exchangeRate) || 1)));
    return { costs, paid, invoiceBase };
  }

  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const baseAmountOf = (p: any) => round2(Number(p.amount || 0) * Number(p.exchangeRate || 1));

  /** Add whole months to a YYYY-MM-DD date, clamping to the last day of the month. */
  function addMonthsIso(iso: string, months: number): string {
    const [y, m, d] = iso.split("-").map(Number);
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, daysInMonth));
    return target.toISOString().slice(0, 10);
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
  ) {
    const lines = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.journalEntryId, journalEntryId));
    if (!lines.length) throw new Error(`Journal entry ${journalEntryId} has no lines to reverse`);

    const reversal = await storage.postToLedger(companyId, {
      entryDate: new Date(),
      description,
      referenceType: "REVERSAL",
      referenceId: String(journalEntryId),
      createdBy: userId,
      lines: lines.map((line: any) => ({
        accountId: line.accountId,
        type: line.type === "DEBIT" ? "CREDIT" : "DEBIT",
        amount: Number(line.amount),
        memo: `Reversal of journal ${journalEntryId}`,
        vatTypeId: line.vatTypeId ?? undefined,
        vatAmount: line.vatAmount != null ? Number(line.vatAmount) : undefined,
      })),
    }, tx);

    await tx
      .update(journalEntries)
      .set({ reversalOfJournalEntryId: journalEntryId })
      .where(eq(journalEntries.id, reversal.id));
    await tx
      .update(journalEntries)
      .set({ status: "REVERSED" })
      .where(eq(journalEntries.id, journalEntryId));
    return reversal;
  }

  /** Reverse a journal once; a reversed journal is left alone. */
  async function reverseJournalIfPosted(tx: any, companyId: number, journalEntryId: number, description: string, userId?: string) {
    const [entry] = await tx
      .select({ status: journalEntries.status })
      .from(journalEntries)
      .where(eq(journalEntries.id, journalEntryId));
    if (!entry || entry.status === "REVERSED") return null;
    return reverseJournalEntry(tx, companyId, journalEntryId, description, userId);
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
      createdBy: userId,
      lines: [
        { accountCode: cogsCode, type: "DEBIT", amount: total },
        { accountCode: inventoryCode, type: "CREDIT", amount: total },
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
          state: open <= 0.004 ? "paid" : line.dueDate <= today ? "overdue" : "upcoming",
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
    // Invoice totals/allocations are in the invoice currency; exchangeRate is
    // base USD per 1 unit of that currency.
    const invoiceRate = Number(invoice.exchangeRate || 1) || 1;
    let allocatedTotal = 0;
    let postedTotal = 0;
    const depositsAccountCode = await storage.getSystemAccountCode(companyId, "customerDepositsAccountCode", tx) || "2010";
    const arAccountCode = await storage.getSystemAccountCode(companyId, "accountsReceivableCode", tx);

    for (const p of rows) {
      const baseAmount = baseAmountOf(p);
      const paymentValue = round2(baseAmount / invoiceRate);
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
            createdBy: userId,
            lines: [
              { accountCode: receiptAccountCode, type: "DEBIT", amount: baseAmount },
              { accountCode: depositsAccountCode, type: "CREDIT", amount: baseAmount },
            ],
          }, tx);
          journalEntryId = je.id;
          await tx.update(payments).set({ journalEntryId }).where(eq(payments.id, p.id));
        }

        // Clear only the part of the deposit actually applied to this invoice;
        // any excess stays a customer liability (refundable/transferable).
        if (journalEntryId && !p.clearedAt && toAllocate > 0.004) {
          const clearingAmount = Math.min(baseAmount, round2(toAllocate * invoiceRate));
          if (clearingAmount > 0.004) {
            const clearingJe = await storage.postToLedger(companyId, {
              entryDate: invoice.issueDate || new Date(),
              description: `Clear deposit ${p.reference || p.id} against invoice ${invoice.invoiceNumber}`,
              referenceType: "DEPOSIT_CLEARING",
              referenceId: String(p.id),
              createdBy: userId,
              lines: [
                { accountCode: depositsAccountCode, type: "DEBIT", amount: clearingAmount },
                { accountCode: arAccountCode, type: "CREDIT", amount: clearingAmount },
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
          createdBy: userId,
          lines: [
            { accountCode: receiptAccountCode, type: "DEBIT", amount: baseAmount },
            { accountCode: arAccountCode, type: "CREDIT", amount: baseAmount },
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
        conds.push(or(ilike(vehicles.stockNumber, q), ilike(vehicles.vin, q), ilike(vehicles.make, q), ilike(vehicles.model, q), ilike(vehicles.containerNumber, q))!);
      }
      const rows = await db
        .select({ vehicle: vehicles, customerName: customers.name })
        .from(vehicles)
        .leftJoin(customers, eq(customers.id, vehicles.customerId))
        .where(and(...conds))
        .orderBy(desc(vehicles.createdAt));
      const { costs, paid, invoiceBase } = await totalsFor(rows.map((r) => r.vehicle.id));
      const showCosts = await can(req, "vehicles.costs");
      res.json(
        rows.map((r) =>
          redact(
            {
              ...r.vehicle,
              customerName: r.customerName,
              summary: summariseVehicle(r.vehicle, costs.get(r.vehicle.id) || [], paid.get(r.vehicle.id) || 0, invoiceBase.get(r.vehicle.id)),
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
        v.invoiceId ? db.select().from(invoices).where(eq(invoices.id, v.invoiceId)).then((r) => r[0] ?? null) : Promise.resolve(null),
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
      const paid = paymentRows.reduce((s, p) => s + Number(p.amount) * Number(p.exchangeRate || 1), 0);
      const invoiceBase = invoice ? money(Number(invoice.total) * (Number(invoice.exchangeRate) || 1)) : null;
      res.json(redact({
        ...v,
        customer,
        supplier,
        salesperson,
        enquiry,
        costs,
        stages,
        schedule,
        openSchedule: openScheduleLines(schedule, paid),
        payments: paymentRows,
        invoice,
        reminders,
        summary: summariseVehicle(v, costs, paid, invoiceBase),
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
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (v.invoiceId || ["sold", "delivered", "cancelled"].includes(v.status)) {
        return res.status(409).json({ error: "This vehicle is already sold, delivered or cancelled and cannot be reserved" });
      }

      const body = z
        .object({
          enquiryId: z.coerce.number().int().positive().optional(),
          customerId: z.coerce.number().int().positive().optional(),
          salePrice: z.coerce.number().nonnegative().optional(),
          saleCurrency: z.string().min(1).max(8).optional(),
          saleExchangeRate: z.coerce.number().positive().optional(),
          salespersonId: z.string().uuid().nullable().optional(),
        })
        .parse(req.body ?? {});

      const enquiry = body.enquiryId
        ? await db
            .select()
            .from(enquiries)
            .where(and(eq(enquiries.id, body.enquiryId), eq(enquiries.companyId, companyId)))
            .then((r) => r[0] ?? null)
        : null;
      if (body.enquiryId && !enquiry) return res.status(404).json({ error: "Enquiry not found" });
      if (!enquiry && !body.customerId && !v.customerId) {
        return res.status(400).json({ error: "Choose a customer or a CRM enquiry to reserve this vehicle" });
      }

      const result = await db.transaction(async (tx: any) => {
        let customerId = body.customerId ?? v.customerId ?? enquiry?.customerId ?? null;
        let customerCreated = false;
        if (!customerId && enquiry) {
          const ensured = await ensureEnquiryCustomer(tx, companyId, enquiry);
          customerId = ensured.customerId;
          customerCreated = ensured.created;
        }
        if (!customerId) throw new Error("A customer is required to reserve this vehicle");

        const salespersonId = body.salespersonId !== undefined
          ? body.salespersonId
          : enquiry?.assignedTo ?? v.salespersonId ?? null;
        const salePrice = body.salePrice ?? Number(v.salePrice ?? v.targetPrice ?? 0);
        const saleCurrency = body.saleCurrency ?? v.saleCurrency ?? "USD";
        const saleExchangeRate = body.saleExchangeRate ?? Number(v.saleExchangeRate ?? 1);

        // Conditional UPDATE: only change status to reserved if currently
        // available. A vehicle already reserved may have its deal terms amended
        // before invoicing, but the state transition itself stays conditional so
        // two salespeople cannot reserve the same unit.
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
          .where(and(
            eq(vehicles.id, v.id),
            inArray(vehicles.status, ["available", "reserved"]),
          ))
          .returning();

        if (!updated) {
          throw new Error("Vehicle is no longer available and cannot be reserved");
        }

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
      res.status(400).json({ error: error.message || "Failed to reserve vehicle" });
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

      const baseAmount = money(Number(data.amount) * Number(data.exchangeRate ?? 1));
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
      const baseAmount = money(amount * exchangeRate);
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
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete cost" });
    }
  });

  // ── import tracking ────────────────────────────────────────────────────────

  router.post("/companies/:companyId/vehicles/:id/stage", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const body = z
        .object({
          stage: z.enum(VEHICLE_STAGES),
          notes: z.string().optional().nullable(),
          eventDate: z.coerce.date().optional(),
          notifyCustomer: z.boolean().optional(),
          notifiedVia: z.string().optional().nullable(),
        })
        .parse(req.body);
      
      // Require invoice before marking as delivered
      if (body.stage === "delivered" && !v.invoiceId) {
        return res.status(400).json({ error: "Create or attach an invoice before marking the vehicle as delivered" });
      }
      
      const notified = body.notifyCustomer && body.notifiedVia ? new Date() : null;
      const event = await db.transaction(async (tx: any) => {
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
        const statusPatch = body.stage === "delivered" ? { status: "delivered" } : {};
        await tx.update(vehicles).set({ stage: body.stage, ...statusPatch, updatedAt: new Date() }).where(eq(vehicles.id, v.id));
        // A stage move only records the stage. The enquiry is marked won when
        // the vehicle is actually invoiced, not when a card is dragged.
        return saved;
      });
      res.status(201).json(event);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
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

        // Immediate posting for deposits (before invoice exists): the customer
        // holds a credit until the invoice clears it against AR.
        if (isDeposit) {
          const baseAmount = baseAmountOf(created);
          const depositsAccountCode = await storage.getSystemAccountCode(companyId, "customerDepositsAccountCode", tx) || "2010";
          const je = await storage.postToLedger(companyId, {
            entryDate: created.paymentDate,
            description: `Vehicle deposit ${created.reference || created.id} for ${v.stockNumber}`,
            referenceType: "CUSTOMER_DEPOSIT",
            referenceId: String(created.id),
            createdBy: req.user?.id,
            lines: [
              { accountCode: bankAccount.code, type: "DEBIT", amount: baseAmount },
              { accountCode: depositsAccountCode, type: "CREDIT", amount: baseAmount },
            ],
          }, tx);
          await tx.update(payments).set({ journalEntryId: je.id }).where(eq(payments.id, created.id));
        }

        let allocation = null;
        if (v.invoiceId) {
          const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, v.invoiceId), eq(invoices.companyId, companyId)));
          if (invoice) allocation = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, invoice, req.user?.id);
        }
        if (v.status === "available") {
          await tx.update(vehicles).set({ status: "reserved", updatedAt: new Date() }).where(eq(vehicles.id, v.id));
        }
        const [saved] = await tx.select().from(payments).where(eq(payments.id, created.id));
        return { ...saved, allocation };
      });
      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 500).json({ error: error.message || "Failed to record payment" });
    }
  });

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

        // salePrice is the agreed net sale in the sale currency. Tax is added
        // on top and must come from a real tax type, not a free-text rate.
        const subtotal = round2(Number(v.salePrice));
        if (subtotal <= 0) throw Object.assign(new Error("The agreed sale price must be greater than zero"), { status: 400 });

        let taxType: any = null;
        if (body.taxTypeId) {
          const { taxType: found, error } = await ownedTaxType(tx, companyId, body.taxTypeId);
          if (error || !found) throw Object.assign(new Error(error || "Tax type not found"), { status: 400 });
          taxType = found;
        }
        const taxRate = taxType ? Number(taxType.rate) : 0;
        const taxAmount = round2(subtotal * (taxRate / 100));
        const total = round2(subtotal + taxAmount);
        const currency = v.saleCurrency || "USD";
        const exchangeRate = Number(v.saleExchangeRate || 1) || 1;

        const description = [
          `${v.year ?? ""} ${v.make} ${v.model}`.replace(/\s+/g, " ").trim(),
          `Stock ${v.stockNumber}`,
          v.vin ? `VIN ${v.vin}` : null,
        ].filter(Boolean).join(" — ");

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

        const paymentResult = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, created, req.user?.id);
        const cogs = await postVehicleCogs(tx, companyId, v.id, req.user?.id);
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
        return { invoice: created, ...paymentResult, cogs, enquiry };
      });

      // Runs after commit: fiscalization talks to the device and re-reads the
      // invoice, so it cannot share the sale transaction.
      const invoice = await ensureVehicleInvoiceFiscalized(
        result.invoice.id,
        companyId,
        req.user?.id,
        req.user?.isSuperAdmin,
      );

      res.status(201).json({ ...result, invoice });
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
        // Accept either a net (subtotal) or tax-inclusive invoice amount equal
        // to the agreed sale. Anything else is a different deal.
        const agreed = round2(Number(v.salePrice));
        const matchesAgreed =
          Math.abs(round2(Number(invoice.subtotal)) - agreed) <= 0.01 ||
          Math.abs(round2(Number(invoice.total)) - agreed) <= 0.01;
        if (!matchesAgreed) {
          throw Object.assign(new Error("The invoice total does not match the agreed sale price"), { status: 400 });
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

        const paymentResult = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, invoice, req.user?.id);
        const cogs = await postVehicleCogs(tx, companyId, v.id, req.user?.id);
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

      res.json({ ...result, invoice });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(error.status || 400).json({ error: error.message || "Failed to attach invoice" });
    }
  });

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
                await reverseJournalIfPosted(tx, companyId, entry.id, `Cancel invoice ${invoice.invoiceNumber}`, req.user?.id);
              }
            }
          }

          if (v.cogsJournalEntryId) {
            await reverseJournalIfPosted(tx, companyId, v.cogsJournalEntryId, `Reverse COGS for ${v.stockNumber}`, req.user?.id);
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
      const paid = paymentRows.reduce((s, p) => s + Number(p.amount) * Number(p.exchangeRate || 1), 0);
      const allOpen = openScheduleLines(schedule, paid).filter((l) => l.open > 0.004);
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
   * Build a deposit-plus-instalments payment plan automatically.
   * A deposit is mandatory; 1–4 monthly instalments cover the remainder.
   */
  router.post("/companies/:companyId/vehicles/:id/schedule/generate", ...need("vehicles.payments"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.customerId) return res.status(400).json({ error: "Assign a customer to this vehicle first" });
      if (v.salePrice == null) return res.status(400).json({ error: "Set the agreed sale price first" });

      const body = z
        .object({
          months: z.coerce.number().int().min(1).max(4),
          deposit: z.coerce.number().positive(),
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
        })
        .parse(req.body ?? {});

      const rate = Number(v.saleExchangeRate || 1) || 1;
      // Once invoiced, the customer owes the invoice total including tax, so the
      // plan must cover that - not the pre-tax agreed sale.
      let total = round2(Number(v.salePrice) * rate);
      if (v.invoiceId) {
        const [invoice] = await db
          .select()
          .from(invoices)
          .where(and(eq(invoices.id, v.invoiceId), eq(invoices.companyId, companyId)));
        if (invoice) {
          total = round2(Number(invoice.total) * (Number(invoice.exchangeRate) || 1));
        }
      }
      if (total <= 0) return res.status(400).json({ error: "The agreed sale price must be greater than zero" });

      const deposit = round2(body.deposit);
      if (deposit >= total) {
        return res.status(400).json({ error: "The deposit must be less than the sale price" });
      }

      const startDate = body.startDate || new Date().toISOString().slice(0, 10);
      const totalCents = Math.round(total * 100);
      const depositCents = Math.round(deposit * 100);
      const remainingCents = totalCents - depositCents;
      if (remainingCents < body.months) {
        return res.status(400).json({ error: "The deposit leaves too little outstanding for this many instalments" });
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
          dueDate: addMonthsIso(startDate, i),
          amount: cents / 100,
        });
      }

      const rows = await db.transaction(async (tx: any) => {
        await tx.delete(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id));
        return tx
          .insert(vehiclePaymentSchedules)
          .values(planLines.map((l) => ({ vehicleId: v.id, type: l.type, dueDate: l.dueDate, amount: l.amount.toFixed(2) })))
          .returning();
      });

      res.status(201).json({
        plan: {
          total,
          deposit,
          months: body.months,
          monthly: baseCents / 100,
          finalAmount: (remainingCents - baseCents * (body.months - 1)) / 100,
          startDate,
          currency: "USD",
        },
        lines: rows,
      });
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: error.message || "Failed to generate payment plan" });
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
   * Outstanding balances: schedule lines due on/before today that are not yet
   * covered by cumulative payments (payments are applied to lines in due order).
   */
  router.get("/companies/:companyId/vehicles-reports/outstanding", ...need("vehicles.view"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const rows = await db
        .select({ vehicle: vehicles, customerName: customers.name, customerPhone: customers.phone, customerEmail: customers.email })
        .from(vehicles)
        .leftJoin(customers, eq(customers.id, vehicles.customerId))
        .where(and(eq(vehicles.companyId, companyId), sql`${vehicles.salePrice} IS NOT NULL`, sql`${vehicles.status} <> 'cancelled'`));
      const ids = rows.map((r) => r.vehicle.id);
      const { costs, paid, invoiceBase } = await totalsFor(ids);
      const schedules = ids.length
        ? await db.select().from(vehiclePaymentSchedules).where(inArray(vehiclePaymentSchedules.vehicleId, ids)).orderBy(asc(vehiclePaymentSchedules.dueDate))
        : [];
      const result = rows
        .map((r) => {
          const summary = summariseVehicle(r.vehicle, costs.get(r.vehicle.id) || [], paid.get(r.vehicle.id) || 0, invoiceBase.get(r.vehicle.id));
          const lines = openScheduleLines(schedules.filter((s) => s.vehicleId === r.vehicle.id), summary.paid);
          const openLines = lines.filter((l) => l.open > 0.004);
          const overdue = money(openLines.filter((l) => l.state === "overdue").reduce((s, l) => s + l.open, 0));
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
            paid: summary.paid,
            balance: summary.balance,
            overdue,
            nextDue: next ? { dueDate: next.dueDate, amount: next.open } : null,
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
    const { costs, paid, invoiceBase } = await totalsFor(ids);
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
      const summary = summariseVehicle(r.vehicle, lines, paid.get(r.vehicle.id) || 0, invoiceBase.get(r.vehicle.id));
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
        revenue: money(sold.reduce((s, i) => s + i.sellingPrice, 0)),
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
