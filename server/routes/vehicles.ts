import { Router } from "express";
import { db } from "../db.js";
import {
  vehicles,
  vehicleCosts,
  vehicleStageEvents,
  vehiclePaymentSchedules,
  vehicleReminders,
  insertVehicleSchema,
  insertVehicleCostSchema,
  payments,
  paymentAllocations,
  journalEntries,
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
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { enquiries, invoices } from "../../shared/schema.js";
import { userHasPermission } from "../lib/permissions.js";
import { storage } from "../storage.js";

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
  const balance = vehicle.salePrice != null ? money(sellingPrice - paid) : 0;
  return {
    purchasePrice,
    landedCost,
    importCosts: money(landedCost - purchasePrice),
    sellingPrice,
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
    if (!ids.length) return { costs: new Map<number, any[]>(), paid: new Map<number, number>() };
    const costRows = await db.select().from(vehicleCosts).where(inArray(vehicleCosts.vehicleId, ids));
    const paidRows = await db
      .select({ vehicleId: payments.vehicleId, total: sql<string>`COALESCE(SUM(${payments.amount} * COALESCE(${payments.exchangeRate}, 1)), 0)` })
      .from(payments)
      .where(inArray(payments.vehicleId, ids))
      .groupBy(payments.vehicleId);
    const costs = new Map<number, any[]>();
    for (const c of costRows) costs.set(c.vehicleId, [...(costs.get(c.vehicleId) || []), c]);
    const paid = new Map<number, number>();
    for (const p of paidRows) if (p.vehicleId != null) paid.set(p.vehicleId, Number(p.total));
    return { costs, paid };
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

  /**
   * Capitalises every active vehicle cost to inventory in transit (paid from
   * cash/bank because imports are settled immediately) and posts the COGS
   * entry when the vehicle is sold.
   *
   * Runs inside the invoice transaction, so the sale, the cost capitalisation
   * and COGS all commit together. Safe to re-run: costs that already carry a
   * journal link are skipped, and an existing COGS entry is returned untouched.
   */
  async function postVehicleCogs(tx: any, companyId: number, vehicle: any, userId?: string) {
    if (vehicle.cogsJournalEntryId) {
      return {
        posted: false,
        alreadyPosted: true,
        journalEntryId: vehicle.cogsJournalEntryId,
        amount: Number(vehicle.cogsAmount || 0),
      };
    }

    const costs = await tx.select().from(vehicleCosts).where(eq(vehicleCosts.vehicleId, vehicle.id));
    const active = costs.filter((c: any) => c.status !== "cancelled");
    const total = money(active.reduce((sum: number, c: any) => sum + Number(c.baseAmount), 0));
    if (!(total > 0)) {
      return { posted: false, alreadyPosted: false, journalEntryId: null, amount: 0 };
    }

    const inventoryCode = await storage.getSystemAccountCode(companyId, "inventoryInTransitCode", tx);
    const cashCode = await storage.getSystemAccountCode(companyId, "cashAccountCode", tx);
    const cogsCode = await storage.getSystemAccountCode(companyId, "cogsAccountCode", tx);
    const today = new Date().toISOString().slice(0, 10);

    for (const cost of active) {
      if (cost.costJournalEntryId) continue;
      const amount = money(Number(cost.baseAmount));
      if (!(amount > 0)) continue;
      const je = await storage.postToLedger(companyId, {
        entryDate: cost.costDate ? new Date(cost.costDate) : new Date(),
        description: `Vehicle cost capitalised: ${vehicle.stockNumber} ${cost.category}${cost.description ? ` — ${cost.description}` : ""}`,
        referenceType: "VEHICLE_COST",
        referenceId: String(cost.id),
        createdBy: userId,
        lines: [
          { accountCode: inventoryCode, type: "DEBIT", amount },
          { accountCode: cashCode, type: "CREDIT", amount },
        ],
      }, tx);
      await tx
        .update(vehicleCosts)
        .set({ costJournalEntryId: je.id, status: "paid", paidAt: cost.paidAt ?? today })
        .where(eq(vehicleCosts.id, cost.id));
    }

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

    return { posted: true, alreadyPosted: false, journalEntryId: cogs.id, amount: total };
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

      let journalEntryId = p.journalEntryId;
      if (!journalEntryId) {
        // Backfill-safe: a receipt posted by another route may not have stamped
        // the payment row yet, so look up the journal by its receipt reference.
        const [existingJe] = await tx
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(and(
            eq(journalEntries.companyId, companyId),
            eq(journalEntries.referenceType, "CUSTOMER_RECEIPT"),
            eq(journalEntries.referenceId, String(p.id)),
          ))
          .limit(1);

        if (existingJe) {
          journalEntryId = existingJe.id;
        } else if (baseAmount > 0) {
          const cashAccountCode = await storage.getSystemAccountCode(companyId, "cashAccountCode", tx);
          const arAccountCode = await storage.getSystemAccountCode(companyId, "accountsReceivableCode", tx);
          const je = await storage.postToLedger(companyId, {
            entryDate: p.paymentDate,
            description: `Vehicle receipt ${p.reference || p.id}`,
            referenceType: "CUSTOMER_RECEIPT",
            referenceId: String(p.id),
            createdBy: userId,
            lines: [
              { accountCode: cashAccountCode, type: "DEBIT", amount: baseAmount },
              { accountCode: arAccountCode, type: "CREDIT", amount: baseAmount },
            ],
          }, tx);
          journalEntryId = je.id;
          postedTotal = round2(postedTotal + baseAmount);
        }

        if (journalEntryId) {
          await tx.update(payments).set({ journalEntryId }).where(eq(payments.id, p.id));
        }
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
      const { costs, paid } = await totalsFor(rows.map((r) => r.vehicle.id));
      const showCosts = await can(req, "vehicles.costs");
      res.json(
        rows.map((r) =>
          redact(
            {
              ...r.vehicle,
              customerName: r.customerName,
              summary: summariseVehicle(r.vehicle, costs.get(r.vehicle.id) || [], paid.get(r.vehicle.id) || 0),
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
      const [costs, stages, schedule, paymentRows, customer, invoice, reminders, supplier, salesperson] = await Promise.all([
        db.select().from(vehicleCosts).where(eq(vehicleCosts.vehicleId, v.id)).orderBy(asc(vehicleCosts.costDate), asc(vehicleCosts.id)),
        db.select().from(vehicleStageEvents).where(eq(vehicleStageEvents.vehicleId, v.id)).orderBy(asc(vehicleStageEvents.eventDate)),
        db.select().from(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id)).orderBy(asc(vehiclePaymentSchedules.dueDate)),
        db.select().from(payments).where(and(eq(payments.vehicleId, v.id), eq(payments.companyId, companyId))).orderBy(asc(payments.paymentDate)),
        v.customerId ? db.select().from(customers).where(eq(customers.id, v.customerId)).then((r) => r[0] ?? null) : Promise.resolve(null),
        v.invoiceId ? db.select().from(invoices).where(eq(invoices.id, v.invoiceId)).then((r) => r[0] ?? null) : Promise.resolve(null),
        db.select().from(vehicleReminders).where(eq(vehicleReminders.vehicleId, v.id)).orderBy(desc(vehicleReminders.sentAt)).limit(25),
        v.supplierId ? db.select().from(suppliers).where(eq(suppliers.id, v.supplierId)).then((r) => r[0] ?? null) : Promise.resolve(null),
        v.salespersonId ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, v.salespersonId)).then((r) => r[0] ?? null) : Promise.resolve(null),
      ]);
      const paid = paymentRows.reduce((s, p) => s + Number(p.amount) * Number(p.exchangeRate || 1), 0);
      res.json(redact({
        ...v,
        customer,
        supplier,
        salesperson,
        costs,
        stages,
        schedule,
        openSchedule: openScheduleLines(schedule, paid),
        payments: paymentRows,
        invoice,
        reminders,
        summary: summariseVehicle(v, costs, paid),
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
      if (!body.stockNumber) {
        const [{ n }] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(vehicles).where(eq(vehicles.companyId, companyId));
        body.stockNumber = `VH-${String(Number(n) + 1).padStart(4, "0")}`;
      }
      const data = insertVehicleSchema.parse({ ...body, companyId, createdBy: req.user?.id });
      const refError = await assertOwnedRefs(companyId, data);
      if (refError) return res.status(400).json({ error: refError });
      const [created] = await db.insert(vehicles).values(data).returning();
      await db.insert(vehicleStageEvents).values({ vehicleId: created.id, stage: created.stage, notes: "Vehicle recorded", createdBy: req.user?.id });
      res.status(201).json(created);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      if (error?.code === "23505") return res.status(409).json({ error: "Stock number already exists" });
      res.status(500).json({ error: "Failed to create vehicle" });
    }
  });

  router.patch("/companies/:companyId/vehicles/:id", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const updates = insertVehicleSchema.partial().parse(req.body);
      delete (updates as any).companyId;
      delete (updates as any).stage; // stage changes go through /stage so they're logged
      delete (updates as any).createdBy;
      // COGS links are only written by the ledger posting helper.
      delete (updates as any).cogsJournalEntryId;
      delete (updates as any).cogsAmount;
      delete (updates as any).cogsPostedAt;

      // Commercial terms are frozen once they have been used on a document:
      //  - the sale price/currency/FX rate drive the invoice, so they lock as soon
      //    as an invoice exists;
      //  - the customer can no longer change once an invoice or any payment exists,
      //    because receipts and statements are already addressed to them.
      const frozenAfterInvoice = ["salePrice", "saleCurrency", "saleExchangeRate"] as const;
      const unchangedCommercial = (f: (typeof frozenAfterInvoice)[number]) => {
        const next = (updates as any)[f];
        const current = (v as any)[f];
        if (f === "saleCurrency") return String(next ?? "") === String(current ?? "");
        if (f === "saleExchangeRate") return Number(next ?? 1) === Number(current ?? 1);
        if (next == null && current == null) return true;
        return Number(next) === Number(current);
      };
      const invoiceLockHit = frozenAfterInvoice.some(
        (f) => (updates as any)[f] !== undefined && !unchangedCommercial(f),
      );
      const customerChanged =
        (updates as any).customerId !== undefined && (updates as any).customerId !== v.customerId;
      if (invoiceLockHit || customerChanged) {
        const [anyPayment] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.vehicleId, v.id))
          .limit(1);
        if (v.invoiceId && invoiceLockHit) {
          return res.status(409).json({
            error: "Sale price, currency and exchange rate cannot be changed after the invoice is created",
          });
        }
        if ((v.invoiceId || anyPayment) && customerChanged) {
          return res.status(409).json({
            error: "Customer cannot be changed after an invoice or payment exists",
          });
        }
      }

      const refError = await assertOwnedRefs(companyId, updates);
      if (refError) return res.status(400).json({ error: refError });
      const [updated] = await db.update(vehicles).set({ ...updates, updatedAt: new Date() }).where(eq(vehicles.id, v.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  });

  router.delete("/companies/:companyId/vehicles/:id", ...need("vehicles.delete"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      const [hasPayment] = await db.select({ id: payments.id }).from(payments).where(eq(payments.vehicleId, v.id)).limit(1);
      if (hasPayment || v.invoiceId) return res.status(409).json({ error: "Vehicle has payments or an invoice; cancel it instead" });
      await db.delete(vehicles).where(eq(vehicles.id, v.id));
      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete vehicle" });
    }
  });

  // ── costs ──────────────────────────────────────────────────────────────────

  router.post("/companies/:companyId/vehicles/:id/costs", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "COGS has already been posted for this vehicle; costs are locked." });
      }
      const data = insertVehicleCostSchema.parse({
        ...req.body,
        vehicleId: v.id,
        source: "manual",
        sourceId: null,
        createdBy: req.user?.id,
      });
      if (!(VEHICLE_COST_CATEGORIES as readonly string[]).includes(data.category)) {
        return res.status(400).json({ error: `Unknown cost category ${data.category}` });
      }
      delete (data as any).costJournalEntryId;
      const status = String(data.status ?? "pending");
      if (!(VEHICLE_COST_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: `Unknown cost status ${status}` });
      }
      const supplierError = await assertOwnedSupplier(companyId, data.supplierId ?? null);
      if (supplierError) return res.status(400).json({ error: supplierError });
      const baseAmount = money(Number(data.amount) * Number(data.exchangeRate ?? 1)).toFixed(2);
      const [created] = await db
        .insert(vehicleCosts)
        .values({
          ...data,
          status,
          paidAt: status === "paid" ? data.paidAt ?? data.costDate ?? new Date().toISOString().slice(0, 10) : data.paidAt ?? null,
          baseAmount,
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

      const body = z
        .object({
          category: z.string().optional(),
          description: z.string().nullable().optional(),
          amount: z.coerce.number().positive().optional(),
          currency: z.string().optional(),
          exchangeRate: z.coerce.number().positive().optional(),
          payee: z.string().nullable().optional(),
          reference: z.string().nullable().optional(),
          costDate: z.string().nullable().optional(),
          dueDate: z.string().nullable().optional(),
          paidAt: z.string().nullable().optional(),
          status: z.string().optional(),
          supplierId: z.coerce.number().int().positive().nullable().optional(),
        })
        .parse(req.body);

      if (
        v.cogsJournalEntryId ||
        (existing.costJournalEntryId &&
          (body.amount !== undefined ||
            body.currency !== undefined ||
            body.exchangeRate !== undefined ||
            body.supplierId !== undefined ||
            body.status !== undefined))
      ) {
        return res.status(409).json({
          error: existing.costJournalEntryId
            ? "This cost is already posted to inventory. Reverse the journal entry before changing its amount, supplier or status."
            : "COGS has already been posted for this vehicle; costs are locked.",
        });
      }

      if (body.category && !(VEHICLE_COST_CATEGORIES as readonly string[]).includes(body.category)) {
        return res.status(400).json({ error: `Unknown cost category ${body.category}` });
      }
      if (body.status && !(VEHICLE_COST_STATUSES as readonly string[]).includes(body.status)) {
        return res.status(400).json({ error: `Unknown cost status ${body.status}` });
      }
      const supplierError = await assertOwnedSupplier(companyId, body.supplierId);
      if (supplierError) return res.status(400).json({ error: supplierError });

      const amount = body.amount ?? Number(existing.amount);
      const exchangeRate = body.exchangeRate ?? Number(existing.exchangeRate ?? 1);
      const updates: Record<string, any> = {
        ...body,
        baseAmount: money(amount * exchangeRate).toFixed(2),
      };
      // Keep the paid date sane when the lifecycle status is changed on its own.
      if (body.status === "paid" && body.paidAt === undefined && !existing.paidAt) {
        updates.paidAt = existing.costDate ?? new Date().toISOString().slice(0, 10);
      }
      if (body.status === "pending" && body.paidAt === undefined) updates.paidAt = null;

      const [updated] = await db.update(vehicleCosts).set(updates).where(eq(vehicleCosts.id, existing.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update cost" });
    }
  });

  /**
   * Vehicle costs are settled immediately by cash or bank transfer, so posting
   * a cost capitalises it to inventory in transit and credits cash/bank in one
   * journal. No supplier invoice or accounts-payable entry is created.
   */
  router.post("/companies/:companyId/vehicles/:id/costs/:costId/post", ...need("vehicles.costs"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (v.cogsJournalEntryId) {
        return res.status(409).json({ error: "COGS has already been posted for this vehicle; costs are locked." });
      }
      const [cost] = await db
        .select()
        .from(vehicleCosts)
        .where(and(eq(vehicleCosts.id, parseInt(req.params.costId)), eq(vehicleCosts.vehicleId, v.id)));
      if (!cost) return res.status(404).json({ error: "Cost line not found" });
      if (cost.costJournalEntryId) return res.status(409).json({ error: "This cost has already been posted to inventory" });
      if (cost.status === "cancelled") return res.status(400).json({ error: "Cancelled costs cannot be posted" });

      const amount = Number(cost.baseAmount);
      if (!(amount > 0)) return res.status(400).json({ error: "The cost amount must be greater than zero" });

      const inventoryCode = await storage.getSystemAccountCode(companyId, "inventoryInTransitCode");
      const cashCode = await storage.getSystemAccountCode(companyId, "cashAccountCode");

      const result = await db.transaction(async (tx: any) => {
        const je = await storage.postToLedger(companyId, {
          entryDate: cost.costDate ? new Date(cost.costDate) : new Date(),
          description: `Vehicle cost capitalised: ${v.stockNumber} ${cost.category}${cost.description ? ` — ${cost.description}` : ""}`,
          referenceType: "VEHICLE_COST",
          referenceId: String(cost.id),
          createdBy: req.user?.id,
          lines: [
            { accountCode: inventoryCode, type: "DEBIT", amount },
            { accountCode: cashCode, type: "CREDIT", amount },
          ],
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
      res.status(500).json({ error: error.message || "Failed to post cost to inventory" });
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
        .select({ costJournalEntryId: vehicleCosts.costJournalEntryId })
        .from(vehicleCosts)
        .where(and(eq(vehicleCosts.id, parseInt(req.params.costId)), eq(vehicleCosts.vehicleId, v.id)));
      if (cost?.costJournalEntryId) {
        return res.status(409).json({ error: "This cost is already posted to inventory. Reverse the journal entry before deleting it." });
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
      const notified = body.notifyCustomer && body.notifiedVia ? new Date() : null;
      const [event] = await db
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
      await db.update(vehicles).set({ stage: body.stage, ...statusPatch, updatedAt: new Date() }).where(eq(vehicles.id, v.id));
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
          reference: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
        })
        .parse(req.body);
      const result = await db.transaction(async (tx: any) => {
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
            reference: body.reference ?? null,
            notes: body.notes ?? `Vehicle ${v.stockNumber} ${v.make} ${v.model}`,
            createdBy: req.user?.id,
          })
          .returning();

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
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to record payment" });
    }
  });

  // ── sales invoice ──────────────────────────────────────────────────────────

  /**
   * Creates a sales invoice from the vehicle's agreed sale price, links it to
   * the vehicle and backfills any payments already taken against the deal.
   */
  router.post("/companies/:companyId/vehicles/:id/invoice", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (v.invoiceId) return res.status(409).json({ error: "Vehicle already has an invoice" });
      if (!v.customerId) return res.status(400).json({ error: "Assign a customer to this vehicle first" });
      if (v.salePrice == null) return res.status(400).json({ error: "Set an agreed sale price before invoicing" });

      const body = z
        .object({
          dueDate: z.coerce.date().optional(),
          notes: z.string().optional().nullable(),
          taxRate: z.coerce.number().min(0).max(100).default(0),
        })
        .parse(req.body ?? {});

      const saleRate = Number(v.saleExchangeRate || 1) || 1;
      const subtotal = round2(Number(v.salePrice) * saleRate);
      if (subtotal <= 0) return res.status(400).json({ error: "The agreed sale price must be greater than zero" });

      const taxAmount = round2(subtotal * (body.taxRate / 100));
      const total = round2(subtotal + taxAmount);
      const description = [
        `${v.year ?? ""} ${v.make} ${v.model}`.replace(/\s+/g, " ").trim(),
        `Stock ${v.stockNumber}`,
        v.vin ? `VIN ${v.vin}` : null,
      ].filter(Boolean).join(" — ");

      const result = await db.transaction(async (tx: any) => {
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
          currency: "USD",
          exchangeRate: "1.000000",
          isFiscalized: false,
          notes: body.notes ?? description,
          createdBy: req.user?.id,
          items: [{
            description,
            quantity: "1",
            unitPrice: subtotal.toFixed(2),
            discountAmount: "0.00",
            taxRate: body.taxRate.toFixed(2),
            lineTotal: subtotal.toFixed(2),
          }],
        } as any, tx);

        await tx.update(vehicles).set({
          invoiceId: created.id,
          status: ["available", "reserved"].includes(v.status) ? "sold" : v.status,
          updatedAt: new Date(),
        }).where(eq(vehicles.id, v.id));

        const paymentResult = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, created, req.user?.id);
        const cogs = await postVehicleCogs(tx, companyId, { ...v, invoiceId: created.id }, req.user?.id);
        return { invoice: created, ...paymentResult, cogs };
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(400).json({ error: error.message || "Failed to create vehicle invoice" });
    }
  });

  /** Attaches an existing invoice (by id or invoice number) to this vehicle. */
  router.put("/companies/:companyId/vehicles/:id/invoice", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.customerId) return res.status(400).json({ error: "Assign a customer to this vehicle first" });

      const body = z.object({
        invoiceId: z.coerce.number().int().positive().optional(),
        invoiceNumber: z.string().trim().min(1).optional(),
      }).refine((b) => b.invoiceId || b.invoiceNumber, { message: "Provide an invoice id or invoice number" }).parse(req.body ?? {});

      const [invoice] = await db.select().from(invoices).where(and(
        eq(invoices.companyId, companyId),
        body.invoiceId ? eq(invoices.id, body.invoiceId) : eq(invoices.invoiceNumber, body.invoiceNumber!),
      ));
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      if (invoice.customerId !== v.customerId) return res.status(400).json({ error: "The invoice belongs to a different customer" });
      if (v.invoiceId && v.invoiceId !== invoice.id) return res.status(409).json({ error: "Vehicle already has a different invoice" });

      const [otherVehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(and(
        eq(vehicles.companyId, companyId),
        eq(vehicles.invoiceId, invoice.id),
        sql`${vehicles.id} <> ${v.id}`,
      )).limit(1);
      if (otherVehicle) return res.status(409).json({ error: "This invoice is already linked to another vehicle" });

      const result = await db.transaction(async (tx: any) => {
        await tx.update(vehicles).set({
          invoiceId: invoice.id,
          status: ["available", "reserved"].includes(v.status) ? "sold" : v.status,
          updatedAt: new Date(),
        }).where(eq(vehicles.id, v.id));
        const paymentResult = await applyVehiclePaymentsToInvoice(tx, companyId, v.id, invoice, req.user?.id);
        const cogs = await postVehicleCogs(tx, companyId, { ...v, invoiceId: invoice.id }, req.user?.id);
        return { invoice, ...paymentResult, cogs };
      });

      res.json(result);
    } catch (error: any) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(400).json({ error: error.message || "Failed to attach invoice" });
    }
  });

  /**
   * Posts COGS for a vehicle that was invoiced before the automatic COGS
   * posting existed (or before all its costs were captured). Safe to call more
   * than once: an existing COGS entry is returned untouched.
   */
  router.post("/companies/:companyId/vehicles/:id/cogs", ...need("vehicles.manage"), async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const v = await loadVehicle(companyId, parseInt(req.params.id));
      if (!v) return res.status(404).json({ error: "Vehicle not found" });
      if (!v.invoiceId) return res.status(400).json({ error: "Create or attach the vehicle invoice before posting COGS" });

      const result = await db.transaction(async (tx: any) => {
        const cogs = await postVehicleCogs(tx, companyId, v, req.user?.id);
        const [updated] = await tx.select().from(vehicles).where(eq(vehicles.id, v.id));
        return { cogs, vehicle: updated };
      });

      res.status(result.cogs.posted ? 201 : 200).json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to post COGS" });
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
      const total = round2(Number(v.salePrice) * rate);
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
      await db.delete(vehiclePaymentSchedules).where(eq(vehiclePaymentSchedules.vehicleId, v.id));
      const rows = lines.length
        ? await db
            .insert(vehiclePaymentSchedules)
            .values(lines.map((l) => ({ vehicleId: v.id, type: l.type, dueDate: l.dueDate, amount: l.amount.toFixed(2) })))
            .returning()
        : [];
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
      const { costs, paid } = await totalsFor(ids);
      const schedules = ids.length
        ? await db.select().from(vehiclePaymentSchedules).where(inArray(vehiclePaymentSchedules.vehicleId, ids)).orderBy(asc(vehiclePaymentSchedules.dueDate))
        : [];
      const result = rows
        .map((r) => {
          const summary = summariseVehicle(r.vehicle, costs.get(r.vehicle.id) || [], paid.get(r.vehicle.id) || 0);
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
    const { costs, paid } = await totalsFor(ids);
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
      const summary = summariseVehicle(r.vehicle, lines, paid.get(r.vehicle.id) || 0);
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
