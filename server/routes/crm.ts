import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db.js";
import {
  enquiries,
  enquiryFollowUps,
  enquiryActivities,
  crmStages,
  insertEnquirySchema,
  insertEnquiryFollowUpSchema,
  insertCrmStageSchema,
  customers,
  products,
  quotations,
  quotationItems,
  users,
  companyUsers,
  vehicles,
  socialLeads,
  socialComments,
  crmPublicLeadTokens,
  crmPublicLeadRateLimits,
  crmCommissionSettings,
  crmCommissionRules,
  crmCommissions,
  crmTasks,
  crmTaskPenalties,
} from "../../shared/schema.js";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  captureLead,
  ensureStages,
  findPriorEnquiry,
  linkCustomer,
} from "../lib/lead-capture.js";
import { userHasPermission } from "../lib/permissions.js";
import { resolveActionAccess } from "../lib/approval-policies.js";
import { approveRequest, createApprovalRequest, rejectRequest } from "../lib/approvals.js";
import { APPROVAL_TYPES } from "../../shared/permissions.js";
import {
  accrueVehicleCommission,
  applyCommissionDecision,
  computeCommissionAmounts,
  consumePendingPenalties,
  getCommissionSettings,
  netOf,
  penaliseLateTask,
  pendingPenaltyTotal,
  resolveCommissionRule,
  settingsForClient,
  sweepOverdueTaskPenalties,
  taskResponseDeadline,
  workingPolicyOf,
} from "../lib/commissions.js";
import { serializeWorkingDays, workingHoursBetween } from "../../shared/working-hours.js";

/**
 * Route-level write shapes. The generated insert schemas describe storage, not
 * what a client may set: actor, timestamps, status and cross-module references
 * are owned by the server and never taken from a request body.
 */
const createEnquiryInput = insertEnquirySchema
  .omit({
    companyId: true,
    createdBy: true,
    lastActivityAt: true,
    quotationId: true,
    status: true,
  })
  .extend({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).nullish(),
    email: z.union([z.string().trim().email().max(200), z.literal("")]).nullish(),
    interest: z.string().trim().max(500).nullish(),
    notes: z.string().max(5000).nullish(),
    source: z.string().max(40).nullish(),
  });

const updateEnquiryInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(50).nullish(),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).nullish(),
  source: z.string().trim().max(40).nullish(),
  interest: z.string().trim().max(500).nullish(),
  notes: z.string().max(5000).nullish(),
  tags: z.array(z.string().max(50)).max(50).nullish(),
  expectedRevenue: z.coerce.number().finite().min(0).max(100000000).nullish(),
  expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  utmSource: z.string().max(100).nullish(),
  utmMedium: z.string().max(100).nullish(),
  utmCampaign: z.string().max(200).nullish(),
  lostReason: z.string().max(500).nullish(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  stageId: z.coerce.number().int().positive().optional(),
});

const createFollowUpInput = insertEnquiryFollowUpSchema
  .omit({ enquiryId: true, createdBy: true, completedAt: true })
  .extend({
    dueAt: z.coerce.date().nullish(),
    channel: z.string().max(40).nullish(),
    notes: z.string().max(2000).nullish(),
    outcome: z.string().max(500).nullish(),
  });

const updateFollowUpInput = z.object({
  dueAt: z.coerce.date().nullish(),
  completedAt: z.coerce.date().nullish(),
  channel: z.string().max(40).nullish(),
  notes: z.string().max(2000).nullish(),
  outcome: z.string().max(500).nullish(),
});

const createQuotationInput = z.object({
  items: z.array(z.object({
    productId: z.coerce.number().int().positive().nullish(),
    description: z.string().trim().min(1).max(500),
    quantity: z.coerce.number().finite().positive().max(100000),
    unitPrice: z.coerce.number().finite().min(0).max(100000000),
    taxRate: z.coerce.number().finite().min(0).max(100).default(0),
  })).min(1).max(200),
});

const publicLeadInput = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).nullish(),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).nullish(),
  interest: z.string().trim().max(500).nullish(),
  message: z.string().trim().max(5000).nullish(),
  utmSource: z.string().trim().max(100).nullish(),
  utmMedium: z.string().trim().max(100).nullish(),
  utmCampaign: z.string().trim().max(200).nullish(),
});

/** Public lead tokens are stored as hashes; only the prefix is displayable. */
const hashLeadToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * CRM: configurable lead pipeline, chatter trail and the sale loop.
 *
 * Deliberately thin where the platform already has an answer:
 *   customers   - linked by phone/email so a prospect returning months later
 *                 resolves to their existing record
 *   users       - assignment
 *   quotations  - "won" funnels into the existing quotation module
 *   audit_logs  - not duplicated; enquiry_activities is the per-lead chatter
 */

/**
 * Status after a manual stage move. A card dragged into a won column records
 * the stage only: the deal becomes won when a vehicle invoice is raised (see
 * `markEnquiryWon`), never because of the board. Closing as lost is still a
 * manual decision, and a real won is never reopened by a drag.
 */
function statusAfterStageMove(
  stage: { isWon: boolean; isLost: boolean } | null | undefined,
  currentStatus: string | null | undefined,
) {
  if (stage?.isLost) return "lost";
  if (currentStatus === "won") return "won";
  return "open";
}

export function createCrmRouter(requireAuth: any, requireCompanyAccess: any) {
  const router = Router();

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Permission check used by every CRM route. Super admins bypass the
   * company-scoped permission table, which is why the flag has to be passed
   * through rather than dropped at the call site.
   */
  async function can(req: any, companyId: number, permission: any) {
    return userHasPermission(req.user.id, companyId, permission, Boolean(req.user?.isSuperAdmin));
  }

  /** Quotation numbers are allocated per company, inside the caller's tx. */
  async function allocateQuotationNumber(companyId: number, tx: any): Promise<string> {
    // Serialise allocators for this company so two concurrent quotes cannot
    // read the same MAX() and collide on the unique (company, number) index.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`crm:quotation:${companyId}`}))`);
    const rows = await tx
      .select({ quotationNumber: quotations.quotationNumber })
      .from(quotations)
      .where(eq(quotations.companyId, companyId));
    const max = rows
      .filter((r: any) => r.quotationNumber?.startsWith("QT-"))
      .map((r: any) => parseInt(r.quotationNumber.slice(3), 10))
      .filter((n: number) => Number.isFinite(n))
      .reduce((a: number, b: number) => Math.max(a, b), 0);
    return `QT-${max + 1}`;
  }

  async function getStage(companyId: number, stageId: number) {
    const [stage] = await db
      .select()
      .from(crmStages)
      .where(and(eq(crmStages.id, stageId), eq(crmStages.companyId, companyId)));
    return stage ?? null;
  }

  async function logActivity(
    enquiryId: number,
    type: string,
    body: string | null,
    metadata: unknown,
    userId?: string | null,
    executor: any = db,
  ) {
    await executor.insert(enquiryActivities).values({
      enquiryId,
      type,
      body,
      metadata: metadata ?? null,
      userId: userId ?? null,
    });
    await executor.update(enquiries).set({ lastActivityAt: new Date() }).where(eq(enquiries.id, enquiryId));
  }

  async function nextQuotationNumber(companyId: number, tx?: any): Promise<string> {
    const executor = tx || db;
    const rows = await executor
      .select({ quotationNumber: quotations.quotationNumber })
      .from(quotations)
      .where(eq(quotations.companyId, companyId));
    const max = rows
      .filter((r: any) => r.quotationNumber?.startsWith("QT-"))
      .map((r: any) => parseInt(r.quotationNumber.split("-")[1] ?? "0", 10))
      .filter((n: number) => !isNaN(n))
      .reduce((a: number, b: number) => Math.max(a, b), 0);
    return `QT-${max + 1}`;
  }

  // Prospects gone quiet: open, no activity for N days (default 30) and no
  // pending follow-up. The reactivation call list.
  router.get("/companies/:companyId/crm/dormant", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const days = Math.max(1, parseInt(String(req.query.days ?? "30")) || 30);
      const cutoff = new Date(Date.now() - days * 86400000);
      const rows = await db
        .select({ enquiry: enquiries, assignee: { id: users.id, name: users.name } })
        .from(enquiries)
        .leftJoin(users, eq(enquiries.assignedTo, users.id))
        .where(
          and(
            eq(enquiries.companyId, companyId),
            eq(enquiries.status, "open"),
            lte(enquiries.lastActivityAt, cutoff),
            sql`NOT EXISTS (SELECT 1 FROM enquiry_follow_ups f WHERE f.enquiry_id = ${enquiries.id} AND f.completed_at IS NULL)`,
          ),
        )
        .orderBy(asc(enquiries.lastActivityAt));
      res.json(rows.map((r) => ({ ...r.enquiry, assignee: r.assignee?.id ? r.assignee : null })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch dormant enquiries" });
    }
  });

  // ── stages ─────────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/stages", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const stages = await ensureStages(companyId);
      res.json(stages.sort((a, b) => a.sequence - b.sequence));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch stages" });
    }
  });

  router.post("/companies/:companyId/crm/stages", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.stages.manage"))) {
        return res.status(403).json({ error: "CRM stages manage permission required" });
      }
      const data = insertCrmStageSchema.parse({ ...req.body, companyId });
      const existing = await ensureStages(companyId);
      const [created] = await db
        .insert(crmStages)
        .values({ ...data, sequence: data.sequence ?? existing.length })
        .returning();
      res.status(201).json(created);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to create stage" });
    }
  });

  router.patch("/companies/:companyId/crm/stages/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.stages.manage"))) {
        return res.status(403).json({ error: "CRM stages manage permission required" });
      }
      const id = parseInt(req.params.id);
      // Only stage configuration is writable here. Spreading req.body previously
      // let a caller rewrite sequence/probability arbitrarily and injected
      // columns the route never intended to expose.
      const updates = z
        .object({
          name: z.string().trim().min(1).max(80).optional(),
          sequence: z.coerce.number().int().min(0).max(10000).optional(),
          probability: z.coerce.number().int().min(0).max(100).optional(),
          color: z.string().max(40).nullish(),
          isActive: z.boolean().optional(),
          isWon: z.boolean().optional(),
          isLost: z.boolean().optional(),
        })
        .parse(req.body ?? {});

      const [updated] = await db
        .update(crmStages)
        .set(updates)
        .where(and(eq(crmStages.id, id), eq(crmStages.companyId, companyId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Stage not found" });

      // A stage may not be both won and lost.
      if (updated.isWon && updated.isLost) {
        const [fixed] = await db
          .update(crmStages)
          .set({ isWon: true, isLost: false })
          .where(eq(crmStages.id, id))
          .returning();
        return res.json(fixed);
      }

      // A stage labelled won must not close deals by itself. Only a lost stage
      // rewrites the status of the enquiries sitting in it, and an already-won
      // deal is never reopened by a configuration change.
      if (updated.isLost) {
        await db
          .update(enquiries)
          .set({ status: "lost" })
          .where(and(
            eq(enquiries.companyId, companyId),
            eq(enquiries.stageId, id),
            ne(enquiries.status, "won"),
          ));
      }

      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update stage" });
    }
  });

  router.delete("/companies/:companyId/crm/stages/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.stages.manage"))) {
        return res.status(403).json({ error: "CRM stages manage permission required" });
      }
      const id = parseInt(req.params.id);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enquiries)
        .where(and(eq(enquiries.companyId, companyId), eq(enquiries.stageId, id)));

      if (count > 0) {
        await db
          .update(crmStages)
          .set({ isActive: false })
          .where(and(eq(crmStages.id, id), eq(crmStages.companyId, companyId)));
        return res.json({ archived: true, inUse: count });
      }

      await db.delete(crmStages).where(and(eq(crmStages.id, id), eq(crmStages.companyId, companyId)));
      res.json({ deleted: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete stage" });
    }
  });

  // ── enquiries ──────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/enquiries", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const { stageId, assignedTo, search, status } = req.query as Record<string, string | undefined>;

      const conditions = [eq(enquiries.companyId, companyId)];
      if (stageId) conditions.push(eq(enquiries.stageId, parseInt(stageId)));
      if (assignedTo) conditions.push(eq(enquiries.assignedTo, assignedTo));
      if (status) conditions.push(eq(enquiries.status, status));
      if (search) {
        const term = `%${search}%`;
        conditions.push(
          or(
            ilike(enquiries.name, term),
            ilike(enquiries.phone, term),
            ilike(enquiries.email, term),
            ilike(enquiries.interest, term),
          )!,
        );
      }

      const rows = await db
        .select({
          enquiry: enquiries,
          stage: crmStages,
          assignee: { id: users.id, name: users.name, email: users.email },
          customer: { id: customers.id, name: customers.name },
        })
        .from(enquiries)
        .leftJoin(crmStages, eq(enquiries.stageId, crmStages.id))
        .leftJoin(users, eq(enquiries.assignedTo, users.id))
        .leftJoin(customers, eq(enquiries.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(desc(enquiries.lastActivityAt), desc(enquiries.createdAt));

      const ids = rows.map((r) => r.enquiry.id);
      const followUps = ids.length
        ? await db
            .select()
            .from(enquiryFollowUps)
            .where(inArray(enquiryFollowUps.enquiryId, ids))
            .orderBy(asc(enquiryFollowUps.dueAt))
        : [];

      const byEnquiry = new Map<number, typeof followUps>();
      for (const f of followUps) {
        const list = byEnquiry.get(f.enquiryId) ?? [];
        list.push(f);
        byEnquiry.set(f.enquiryId, list);
      }

      res.json(
        rows.map((r) => {
          const list = byEnquiry.get(r.enquiry.id) ?? [];
          return {
            ...r.enquiry,
            stage: r.stage ?? null,
            assignee: r.assignee?.id ? r.assignee : null,
            customer: r.customer?.id ? r.customer : null,
            followUps: list,
            nextFollowUp: list.find((f) => !f.completedAt) ?? null,
          };
        }),
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch enquiries" });
    }
  });

  /**
   * Open leads whose free-text interest matches a stock item being added.
   * Deliberately a broad OR: sales teams write "Hilux 2019" or "Toyota double
   * cab", so matching either the make or the model finds more real leads than a
   * strict AND would.
   */
  router.get("/companies/:companyId/crm/matching-enquiries", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const make = String(req.query.make ?? "").trim();
      const model = String(req.query.model ?? "").trim();
      const year = String(req.query.year ?? "").trim();
      if (!make && !model) return res.json([]);

      const terms = [make, model, year].filter(Boolean);
      const conditions = [
        eq(enquiries.companyId, companyId),
        eq(enquiries.status, "open"),
        or(...terms.map((term) => ilike(enquiries.interest, `%${term}%`)))!,
      ];

      const rows = await db
        .select({
          enquiry: enquiries,
          stage: crmStages,
          assignee: { id: users.id, name: users.name, email: users.email },
          customer: { id: customers.id, name: customers.name },
        })
        .from(enquiries)
        .leftJoin(crmStages, eq(enquiries.stageId, crmStages.id))
        .leftJoin(users, eq(enquiries.assignedTo, users.id))
        .leftJoin(customers, eq(enquiries.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(desc(enquiries.lastActivityAt))
        .limit(25);

      res.json(
        rows.map((r) => ({
          ...r.enquiry,
          stage: r.stage ?? null,
          assignee: r.assignee?.id ? r.assignee : null,
          customer: r.customer?.id ? r.customer : null,
        })),
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to match enquiries" });
    }
  });

  router.get("/companies/:companyId/crm/enquiries/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const id = parseInt(req.params.id);

      const [row] = await db
        .select({
          enquiry: enquiries,
          stage: crmStages,
          assignee: { id: users.id, name: users.name, email: users.email },
          customer: { id: customers.id, name: customers.name, phone: customers.phone, email: customers.email },
        })
        .from(enquiries)
        .leftJoin(crmStages, eq(enquiries.stageId, crmStages.id))
        .leftJoin(users, eq(enquiries.assignedTo, users.id))
        .leftJoin(customers, eq(enquiries.customerId, customers.id))
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));

      if (!row) return res.status(404).json({ error: "Enquiry not found" });

      const [activities, followUps, linkedVehicles] = await Promise.all([
        db
          .select()
          .from(enquiryActivities)
          .where(eq(enquiryActivities.enquiryId, id))
          .orderBy(desc(enquiryActivities.createdAt)),
        db.select().from(enquiryFollowUps).where(eq(enquiryFollowUps.enquiryId, id)).orderBy(asc(enquiryFollowUps.dueAt)),
        db
          .select({
            id: vehicles.id,
            stockNumber: vehicles.stockNumber,
            make: vehicles.make,
            model: vehicles.model,
            year: vehicles.year,
            status: vehicles.status,
            stage: vehicles.stage,
            salePrice: vehicles.salePrice,
            saleCurrency: vehicles.saleCurrency,
            invoiceId: vehicles.invoiceId,
            customerId: vehicles.customerId,
          })
          .from(vehicles)
          .where(and(eq(vehicles.companyId, companyId), eq(vehicles.enquiryId, id)))
          .orderBy(desc(vehicles.createdAt)),
      ]);

      res.json({
        ...row.enquiry,
        stage: row.stage ?? null,
        assignee: row.assignee?.id ? row.assignee : null,
        customer: row.customer?.id ? row.customer : null,
        activities,
        followUps,
        vehicles: linkedVehicles,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch enquiry" });
    }
  });

  router.post("/companies/:companyId/crm/enquiries", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const data = createEnquiryInput.parse(req.body ?? {});

      const stages = await ensureStages(companyId);
      const openingStage = stages.find((s) => s.sequence === Math.min(...stages.map((x) => x.sequence))) ?? stages[0];
      const stageId = (data.stageId ?? openingStage?.id) ?? null;

      // References captured from the client must belong to this company; a
      // stage, customer or salesperson from another tenant would otherwise be
      // attached to the lead.
      if (data.stageId != null) {
        const stage = await getStage(companyId, data.stageId);
        if (!stage) return res.status(400).json({ error: "Stage does not belong to this company" });
      }
      if (data.customerId != null) {
        const [ownedCustomer] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, data.customerId), eq(customers.companyId, companyId)));
        if (!ownedCustomer) return res.status(400).json({ error: "Customer does not belong to this company" });
      }
      if (data.assignedTo) {
        const [member] = await db
          .select({ id: companyUsers.id })
          .from(companyUsers)
          .where(and(eq(companyUsers.userId, data.assignedTo), eq(companyUsers.companyId, companyId)));
        if (!member) return res.status(400).json({ error: "User does not belong to this company" });
      }

      const customerId = data.customerId ?? (await linkCustomer(companyId, data.phone, data.email));

      // Returning prospect: same phone/email seen before. An open enquiry is
      // re-used (no duplicate in the pipeline); a closed one spawns a new
      // enquiry that keeps the previous salesperson and links back.
      const prior = await findPriorEnquiry(companyId, data.phone, data.email);
      if (prior && prior.status === "open") {
        await logActivity(
          prior.id,
          "returned",
          `Prospect made contact again${data.interest ? ` - interested in ${data.interest}` : ""}.`,
          { source: data.source ?? null, notes: data.notes ?? null },
          req.user?.id,
        );
        const [refreshed] = await db.select().from(enquiries).where(eq(enquiries.id, prior.id));
        return res.status(200).json({ ...refreshed, returning: true, reusedExisting: true });
      }

      const tags = new Set<string>(Array.isArray(data.tags) ? (data.tags as string[]) : []);
      if (prior) tags.add("returning");

      const [created] = await db
        .insert(enquiries)
        .values({
          ...data,
          companyId,
          stageId,
          customerId,
          tags: [...tags],
          assignedTo: data.assignedTo ?? prior?.assignedTo ?? null,
          status: statusAfterStageMove(stages.find((s) => s.id === stageId), "open"),
          createdBy: req.user?.id ?? null,
        })
        .returning();

      const createdBody = prior
        ? `Returning prospect - previous enquiry #${prior.id} (${prior.status}) from ${prior.createdAt ? new Date(prior.createdAt).toDateString() : "earlier"}.`
        : customerId
          ? "Enquiry captured and matched to an existing customer."
          : "Enquiry captured.";
      await db.insert(enquiryActivities).values({
        enquiryId: created.id,
        type: "created",
        body: createdBody,
        metadata: { source: created.source, previousEnquiryId: prior?.id ?? null },
        userId: req.user?.id ?? null,
      });

      res.status(201).json({ ...created, returning: !!prior });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to create enquiry" });
    }
  });

  router.patch("/companies/:companyId/crm/enquiries/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const id = parseInt(req.params.id);

      const [existing] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!existing) return res.status(404).json({ error: "Enquiry not found" });

      const body = updateEnquiryInput.parse(req.body ?? {});
      const updates: Record<string, unknown> = {};
      const editable = [
        "name", "phone", "email", "source", "interest", "notes", "tags",
        "expectedRevenue", "expectedCloseDate", "utmSource", "utmMedium", "utmCampaign",
        // Editable on its own: the sheet lets you restate why an enquiry was lost
        // after the move that closed it.
        "lostReason",
      ] as const;
      for (const key of editable) if (key in body) updates[key] = body[key];

      // Validate that customerId belongs to the same company
      if ("customerId" in body && body.customerId !== existing.customerId) {
        if (body.customerId) {
          const [customer] = await db.select({ companyId: customers.companyId }).from(customers).where(eq(customers.id, body.customerId)).limit(1);
          if (!customer || customer.companyId !== companyId) {
            return res.status(400).json({ error: "Customer does not belong to this company" });
          }
        }
        updates.customerId = body.customerId || null;
      }

      // Validate that assignedTo user belongs to the same company
      if ("assignedTo" in body && body.assignedTo !== existing.assignedTo) {
        if (body.assignedTo) {
          const [companyUser] = await db
            .select({ companyId: companyUsers.companyId })
            .from(companyUsers)
            .where(and(eq(companyUsers.userId, body.assignedTo), eq(companyUsers.companyId, companyId)))
            .limit(1);
          if (!companyUser) {
            return res.status(400).json({ error: "User does not belong to this company" });
          }
        }
        updates.assignedTo = body.assignedTo || null;
        const [assignee] = body.assignedTo
          ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, body.assignedTo))
          : [];
        await logActivity(
          id,
          "assignment",
          assignee ? `Assigned to ${assignee.name || assignee.email}.` : "Unassigned.",
          { assignedTo: body.assignedTo ?? null },
          req.user?.id,
        );
      }

      // Stage change carries the lost-reason rule and the derived status.
      if ("stageId" in body && Number(body.stageId) !== existing.stageId) {
        const stage = await getStage(companyId, Number(body.stageId));
        if (!stage) return res.status(400).json({ error: "Unknown stage" });
        if (stage.isLost && !body.lostReason) {
          return res.status(400).json({ error: "A lost reason is required to close an enquiry as lost" });
        }
        updates.stageId = stage.id;
        updates.status = statusAfterStageMove(stage, existing.status);
        if (stage.isLost) updates.lostReason = body.lostReason;
        await logActivity(
          id,
          "stage",
          `Moved to ${stage.name}${stage.isLost && body.lostReason ? ` - ${body.lostReason}` : ""}.`,
          { from: existing.stageId, to: stage.id, probability: stage.probability },
          req.user?.id,
        );
      }

      if (!Object.keys(updates).length) return res.json(existing);

      updates.updatedAt = new Date();
      const [updated] = await db
        .update(enquiries)
        .set(updates)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update enquiry" });
    }
  });

  // Kanban drag-and-drop lands here: a focused stage move.
  router.post("/companies/:companyId/crm/enquiries/:id/stage", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const id = parseInt(req.params.id);
      const body = z.object({
        stageId: z.coerce.number().int().positive(),
        lostReason: z.string().trim().max(500).nullish(),
      }).parse(req.body ?? {});
      const stageId = body.stageId;

      const [existing] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!existing) return res.status(404).json({ error: "Enquiry not found" });

      const stage = await getStage(companyId, stageId);
      if (!stage) return res.status(400).json({ error: "Unknown stage" });
      if (stage.isLost && !body.lostReason) {
        return res.status(400).json({ error: "A lost reason is required to close an enquiry as lost" });
      }

      const [updated] = await db
        .update(enquiries)
        .set({
          stageId: stage.id,
          status: statusAfterStageMove(stage, existing.status),
          lostReason: stage.isLost ? body.lostReason : null,
          updatedAt: new Date(),
        })
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)))
        .returning();

      await logActivity(
        id,
        "stage",
        `Moved to ${stage.name}${stage.isLost ? ` - ${body.lostReason}` : ""}.`,
        { from: existing.stageId, to: stage.id },
        req.user?.id,
      );

      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to move enquiry" });
    }
  });

  // Link the enquiry to a customer record, creating one if none exists.
  router.post("/companies/:companyId/crm/enquiries/:id/convert", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const id = parseInt(req.params.id);

      const [enquiry] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!enquiry) return res.status(404).json({ error: "Enquiry not found" });

      let customerId = enquiry.customerId ?? (await linkCustomer(companyId, enquiry.phone, enquiry.email));
      let createdNew = false;

      if (!customerId) {
        const [customer] = await db
          .insert(customers)
          .values({
            companyId,
            name: enquiry.name,
            phone: enquiry.phone,
            email: enquiry.email,
            notes: enquiry.notes,
          })
          .returning();
        customerId = customer.id;
        createdNew = true;
      }

      const [updated] = await db
        .update(enquiries)
        .set({ customerId, updatedAt: new Date() })
        .where(eq(enquiries.id, id))
        .returning();

      await logActivity(
        id,
        "customer",
        createdNew ? "Customer record created." : "Linked to an existing customer record.",
        { customerId },
        req.user?.id,
      );

      // Vehicles already linked to this lead inherit the resolved customer and
      // salesperson, so the CRM hand-off does not need a second data entry.
      await db
        .update(vehicles)
        .set({ customerId, updatedAt: new Date() })
        .where(and(eq(vehicles.companyId, companyId), eq(vehicles.enquiryId, id), isNull(vehicles.customerId)));
      if (enquiry.assignedTo) {
        await db
          .update(vehicles)
          .set({ salespersonId: enquiry.assignedTo, updatedAt: new Date() })
          .where(and(eq(vehicles.companyId, companyId), eq(vehicles.enquiryId, id), isNull(vehicles.salespersonId)));
      }

      res.json({ enquiry: updated, customerId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to convert enquiry" });
    }
  });

  // Won work funnels into the platform's existing quotation module.
  router.post("/companies/:companyId/crm/enquiries/:id/quotation", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.quotation.create"))) {
        return res.status(403).json({ error: "CRM quotation create permission required" });
      }
      const id = parseInt(req.params.id);

      const [enquiry] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!enquiry) return res.status(404).json({ error: "Enquiry not found" });

      const { items } = createQuotationInput.parse(req.body ?? {});

      // A product id from another tenant must never be copied into a quote.
      const productIds = [...new Set(items.map((i) => i.productId).filter((p): p is number => !!p))];
      if (productIds.length) {
        const owned = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));
        if (owned.length !== productIds.length) {
          return res.status(400).json({ error: "A product does not belong to this company" });
        }
      }

      const computed = items.map((item) => {
        const lineTotal = item.quantity * item.unitPrice;
        return {
          productId: item.productId ?? null,
          description: item.description,
          quantity: item.quantity.toFixed(2),
          unitPrice: item.unitPrice.toFixed(2),
          taxRate: item.taxRate.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
          taxTotal: lineTotal * (item.taxRate / 100),
        };
      });
      const subtotal = computed.reduce((sum, i) => sum + Number(i.lineTotal), 0);
      const taxAmount = computed.reduce((sum, i) => sum + i.taxTotal, 0);

      const { quotation, updated } = await db.transaction(async (tx) => {
        // Resolve or create the customer inside the same transaction so a
        // failed quote cannot leave behind a half-created contact.
        let customerId = enquiry.customerId;
        if (!customerId && (enquiry.phone?.trim() || enquiry.email?.trim())) {
          const [match] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(
              and(
                eq(customers.companyId, companyId),
                or(
                  enquiry.phone?.trim() ? eq(customers.phone, enquiry.phone.trim()) : undefined,
                  enquiry.phone?.trim() ? eq(customers.mobile, enquiry.phone.trim()) : undefined,
                  enquiry.email?.trim() ? ilike(customers.email, enquiry.email.trim()) : undefined,
                ),
              ),
            )
            .limit(1);
          customerId = match?.id ?? null;
        }
        if (!customerId) {
          const [customer] = await tx
            .insert(customers)
            .values({ companyId, name: enquiry.name, phone: enquiry.phone, email: enquiry.email })
            .returning();
          customerId = customer.id;
        }

        // Allocate and insert under the advisory lock so two concurrent quotes
        // cannot take the same number, and point the enquiry at the new quote
        // in the same transaction. Older quotes are kept.
        const quotationNumber = await allocateQuotationNumber(companyId, tx);
        const [created] = await tx
          .insert(quotations)
          .values({
            companyId,
            branchId: enquiry.branchId ?? null,
            customerId,
            quotationNumber,
            status: "draft",
            subtotal: subtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            total: (subtotal + taxAmount).toFixed(2),
            notes: enquiry.interest ? `Raised from CRM enquiry: ${enquiry.interest}` : "Raised from CRM enquiry",
          })
          .returning();

        await tx.insert(quotationItems).values(
          computed.map(({ taxTotal, ...item }) => ({ ...item, quotationId: created.id })),
        );

        const [enq] = await tx
          .update(enquiries)
          .set({ quotationId: created.id, customerId, updatedAt: new Date() })
          .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)))
          .returning();

        await logActivity(
          id,
          "quotation",
          `Quotation ${quotationNumber} raised.`,
          { quotationId: created.id },
          req.user?.id,
          tx,
        );

        return { quotation: created, updated: enq };
      });

      res.status(201).json({ enquiry: updated, quotation });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to raise quotation" });
    }
  });

  // ── duplicates & merge ─────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/duplicates", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const rows = await db
        .select({
          id: enquiries.id,
          name: enquiries.name,
          phone: enquiries.phone,
          email: enquiries.email,
          stageId: enquiries.stageId,
          createdAt: enquiries.createdAt,
        })
        .from(enquiries)
        .where(eq(enquiries.companyId, companyId));

      const groups = new Map<string, typeof rows>();
      const key = (r: (typeof rows)[number]) =>
        r.phone?.trim() ? `p:${r.phone.trim()}` : r.email?.trim() ? `e:${r.email.trim().toLowerCase()}` : "";
      for (const r of rows) {
        const k = key(r);
        if (!k) continue;
        const list = groups.get(k) ?? [];
        list.push(r);
        groups.set(k, list);
      }

      res.json([...groups.entries()].filter(([, list]) => list.length > 1).map(([k, list]) => ({ matchKey: k, enquiries: list })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to scan duplicates" });
    }
  });

  router.post("/companies/:companyId/crm/enquiries/:id/merge", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.duplicates.merge"))) {
        return res.status(403).json({ error: "CRM duplicates merge permission required" });
      }
      const id = parseInt(req.params.id);
      const sourceIds: number[] = (Array.isArray(req.body?.sourceIds) ? req.body.sourceIds : [])
        .map((n: any) => parseInt(n))
        .filter((n: number) => !isNaN(n) && n !== id);
      if (!sourceIds.length) return res.status(400).json({ error: "No enquiries selected to merge" });

      const [target] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!target) return res.status(404).json({ error: "Enquiry not found" });

      const valid = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.companyId, companyId), inArray(enquiries.id, sourceIds)));

      const result = await db.transaction(async (tx) => {
        const ids = valid.map((v) => v.id);
        if (!ids.length) return { merged: 0 };

        // Everything that points at a duplicate follows the survivor, in the
        // same transaction as the delete so no row is ever orphaned.
        await tx.update(vehicles).set({ enquiryId: id }).where(inArray(vehicles.enquiryId, ids));
        await tx.update(socialLeads).set({ enquiryId: id }).where(inArray(socialLeads.enquiryId, ids));
        await tx.update(socialComments).set({ enquiryId: id }).where(inArray(socialComments.enquiryId, ids));
        await tx.update(enquiryActivities).set({ enquiryId: id }).where(inArray(enquiryActivities.enquiryId, ids));
        await tx.update(enquiryFollowUps).set({ enquiryId: id }).where(inArray(enquiryFollowUps.enquiryId, ids));
        // Tasks and their penalty ledger rows cascade on enquiry delete, so they
        // must move with everything else or a merge silently erases both open
        // work and the authoritative deductions attached to it. Commission
        // attribution uses SET NULL, which would otherwise lose the deal link.
        await tx.update(crmTasks).set({ enquiryId: id }).where(inArray(crmTasks.enquiryId, ids));
        await tx.update(crmCommissions).set({ enquiryId: id }).where(inArray(crmCommissions.enquiryId, ids));

        // Quotations are never deleted: the survivor points at the most recent
        // one raised across the merged leads, and older quotes stay on record.
        const quotationIds = [target.quotationId, ...valid.map((v) => v.quotationId)]
          .filter((q): q is number => typeof q === "number");
        if (quotationIds.length) {
          const [latest] = await tx
            .select({ id: quotations.id })
            .from(quotations)
            .where(and(eq(quotations.companyId, companyId), inArray(quotations.id, quotationIds)))
            .orderBy(desc(quotations.createdAt), desc(quotations.id))
            .limit(1);
          if (latest && latest.id !== target.quotationId) {
            await tx.update(enquiries).set({ quotationId: latest.id }).where(eq(enquiries.id, id));
          }
        }

        // Keep the survivor usable when it was the emptier record.
        const donor = valid.find((v) => v.customerId) ?? valid[0];
        const fill: Record<string, unknown> = {};
        if (!target.customerId && donor?.customerId) fill.customerId = donor.customerId;
        if (!target.assignedTo && donor?.assignedTo) fill.assignedTo = donor.assignedTo;
        if (!target.phone && donor?.phone) fill.phone = donor.phone;
        if (!target.email && donor?.email) fill.email = donor.email;
        if (!target.branchId && donor?.branchId) fill.branchId = donor.branchId;
        if (Object.keys(fill).length) {
          await tx.update(enquiries).set(fill).where(eq(enquiries.id, id));
        }

        await tx.delete(enquiries).where(inArray(enquiries.id, ids));
        await logActivity(
          id,
          "merge",
          `Merged ${ids.length} duplicate enquiry(ies) into this record.`,
          { sourceIds: ids },
          req.user?.id,
          tx,
        );
        return { merged: ids.length };
      });

      res.json({ merged: result.merged });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to merge enquiries" });
    }
  });

  // ── activity timeline (chatter) ────────────────────────────────────────────

  router.get("/companies/:companyId/crm/enquiries/:id/activities", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const id = parseInt(req.params.id);
      const [owned] = await db
        .select({ id: enquiries.id })
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!owned) return res.status(404).json({ error: "Enquiry not found" });

      const activities = await db
        .select()
        .from(enquiryActivities)
        .where(eq(enquiryActivities.enquiryId, id))
        .orderBy(desc(enquiryActivities.createdAt));
      res.json(activities);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  router.post("/companies/:companyId/crm/enquiries/:id/activities", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const id = parseInt(req.params.id);
      const [owned] = await db
        .select({ id: enquiries.id })
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!owned) return res.status(404).json({ error: "Enquiry not found" });

      const data = z.object({
        type: z.string().trim().min(1).max(40).default("note"),
        body: z.string().trim().min(1).max(5000),
      }).parse(req.body ?? {});

      await logActivity(id, data.type, data.body, null, req.user?.id);
      const activities = await db
        .select()
        .from(enquiryActivities)
        .where(eq(enquiryActivities.enquiryId, id))
        .orderBy(desc(enquiryActivities.createdAt));
      res.status(201).json(activities);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to log activity" });
    }
  });

  // ── follow-ups ─────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/follow-ups", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.view"))) {
        return res.status(403).json({ error: "CRM pipeline view permission required" });
      }
      const scope = (req.query.scope as string) || "due";

      const conditions = [eq(enquiries.companyId, companyId), isNull(enquiryFollowUps.completedAt)];
      if (scope === "due") conditions.push(lte(enquiryFollowUps.dueAt, new Date()));

      const rows = await db
        .select({
          followUp: enquiryFollowUps,
          enquiry: { id: enquiries.id, name: enquiries.name, phone: enquiries.phone, status: enquiries.status },
          assignee: { id: users.id, name: users.name },
        })
        .from(enquiryFollowUps)
        .innerJoin(enquiries, eq(enquiryFollowUps.enquiryId, enquiries.id))
        .leftJoin(users, eq(enquiries.assignedTo, users.id))
        .where(and(...conditions))
        .orderBy(asc(enquiryFollowUps.dueAt));

      res.json(rows.map((r) => ({ ...r.followUp, enquiry: r.enquiry, assignee: r.assignee?.id ? r.assignee : null })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch follow-ups" });
    }
  });

  router.post("/companies/:companyId/crm/enquiries/:id/follow-ups", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const id = parseInt(req.params.id);
      // Scope the lookup to the company in the URL: checking the enquiry's own
      // company allowed a member of A to write into B while being authorised in
      // B, desynchronising the audit context from the route.
      const [owned] = await db
        .select({ id: enquiries.id })
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)))
        .limit(1);
      if (!owned) return res.status(404).json({ error: "Enquiry not found" });
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      // Timestamps arrive over JSON as ISO strings, so coerce them here instead
      // of asking every caller to post a Date. The caller cannot set the actor.
      const data = createFollowUpInput.parse(req.body ?? {});

      const [created] = await db
        .insert(enquiryFollowUps)
        .values({
          ...data,
          enquiryId: id,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          createdBy: req.user?.id ?? null,
        })
        .returning();

      await logActivity(
        id,
        "follow_up",
        `Follow-up scheduled${created.dueAt ? ` for ${new Date(created.dueAt).toDateString()}` : ""}${created.channel ? ` (${created.channel})` : ""}.`,
        { followUpId: created.id },
        req.user?.id,
      );

      res.status(201).json(created);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to schedule follow-up" });
    }
  });

  router.patch("/companies/:companyId/crm/follow-ups/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const id = parseInt(req.params.id);

      // Whitelist mutable fields. The old spread let a caller rewrite createdBy,
      // completedAt and the outcome without passing through the route's logic.
      const updates = updateFollowUpInput.parse(req.body ?? {});

      const [existing] = await db.select().from(enquiryFollowUps).where(eq(enquiryFollowUps.id, id));
      if (!existing) return res.status(404).json({ error: "Follow-up not found" });

      const [owned] = await db
        .select({ id: enquiries.id })
        .from(enquiries)
        .where(and(eq(enquiries.id, existing.enquiryId), eq(enquiries.companyId, companyId)));
      if (!owned) return res.status(404).json({ error: "Follow-up not found" });

      const [updated] = await db
        .update(enquiryFollowUps)
        .set(updates)
        .where(eq(enquiryFollowUps.id, id))
        .returning();

      if (updates.completedAt) {
        await logActivity(existing.enquiryId, "follow_up", `Follow-up completed${updated.outcome ? `: ${updated.outcome}` : "."}`, { followUpId: id }, req.user?.id);
      }

      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update follow-up" });
    }
  });

  // ── public lead tokens ─────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/public-lead-tokens", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      // Only a prefix is listed. The raw secret is shown once at creation and
      // is stored as a SHA-256 hash, so a listing cannot mint new submissions.
      const rows = await db
        .select({
          id: crmPublicLeadTokens.id,
          tokenPrefix: crmPublicLeadTokens.tokenPrefix,
          isActive: crmPublicLeadTokens.isActive,
          expiresAt: crmPublicLeadTokens.expiresAt,
          createdAt: crmPublicLeadTokens.createdAt,
        })
        .from(crmPublicLeadTokens)
        .where(eq(crmPublicLeadTokens.companyId, companyId))
        .orderBy(desc(crmPublicLeadTokens.createdAt));
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch lead tokens" });
    }
  });

  router.post("/companies/:companyId/crm/public-lead-tokens", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const body = z
        .object({ expiresAt: z.coerce.date().nullable().optional() })
        .parse(req.body ?? {});
      const rawToken = randomBytes(24).toString("base64url");
      const [created] = await db
        .insert(crmPublicLeadTokens)
        .values({
          companyId,
          token: hashLeadToken(rawToken),
          tokenPrefix: rawToken.slice(0, 8),
          isActive: true,
          expiresAt: body.expiresAt ?? null,
          createdBy: req.user?.id ?? null,
        })
        .returning();
      // The plaintext exists only in this response; the stored row holds a hash.
      res.status(201).json({ ...created, token: rawToken });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to create lead token" });
    }
  });

  router.delete("/companies/:companyId/crm/public-lead-tokens/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      const [updated] = await db
        .update(crmPublicLeadTokens)
        .set({ isActive: false })
        .where(and(
          eq(crmPublicLeadTokens.id, parseInt(req.params.id)),
          eq(crmPublicLeadTokens.companyId, companyId),
        ))
        .returning();
      if (!updated) return res.status(404).json({ error: "Lead token not found" });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to revoke lead token" });
    }
  });

  // ── commission settings & rules ────────────────────────────────────────────

  const BASIS = z.enum(["gross_profit", "revenue", "fixed"]);

  async function userNameMap(companyId: number) {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(companyUsers)
      .innerJoin(users, eq(companyUsers.userId, users.id))
      .where(eq(companyUsers.companyId, companyId));
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.id, row.name || row.email || "User");
    return map;
  }

  async function isCompanyMember(companyId: number, userId: string) {
    const [member] = await db
      .select({ id: companyUsers.id })
      .from(companyUsers)
      .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
      .limit(1);
    return !!member;
  }

  router.get("/companies/:companyId/crm/commission-settings", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.view"))) {
        return res.status(403).json({ error: "Commission view permission required" });
      }
      const settings = await getCommissionSettings(companyId);
      const seeAll = await can(req, companyId, "crm.commission.manage");
      res.json({
        settings: settingsForClient(settings),
        pendingPenalties: await pendingPenaltyTotal(companyId, seeAll ? undefined : req.user.id),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch commission settings" });
    }
  });

  router.patch("/companies/:companyId/crm/commission-settings", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.manage"))) {
        return res.status(403).json({ error: "Commission manage permission required" });
      }
      const body = z
        .object({
          defaultBasis: BASIS.optional(),
          defaultRatePercent: z.coerce.number().min(0).max(100).optional(),
          defaultFixedAmount: z.coerce.number().min(0).optional(),
          responseWindowHours: z.coerce.number().int().min(1).max(168).optional(),
          penaltyPerLateTask: z.coerce.number().min(0).optional(),
          penaltyCapPercent: z.coerce.number().int().min(0).max(100).optional(),
          workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1).optional(),
          workdayStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          workdayEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          utcOffsetMinutes: z.coerce.number().int().min(-720).max(840).optional(),
        })
        .parse(req.body ?? {});

      await getCommissionSettings(companyId); // ensures the row exists
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.defaultBasis !== undefined) updates.defaultBasis = body.defaultBasis;
      if (body.defaultRatePercent !== undefined) updates.defaultRatePercent = String(body.defaultRatePercent);
      if (body.defaultFixedAmount !== undefined) updates.defaultFixedAmount = body.defaultFixedAmount.toFixed(2);
      if (body.responseWindowHours !== undefined) updates.responseWindowHours = body.responseWindowHours;
      if (body.penaltyPerLateTask !== undefined) updates.penaltyPerLateTask = body.penaltyPerLateTask.toFixed(2);
      if (body.penaltyCapPercent !== undefined) updates.penaltyCapPercent = body.penaltyCapPercent;
      if (body.workingDays !== undefined) updates.workingDays = serializeWorkingDays(body.workingDays);
      if (body.workdayStart !== undefined) updates.workdayStart = body.workdayStart;
      if (body.workdayEnd !== undefined) updates.workdayEnd = body.workdayEnd;
      if (body.utcOffsetMinutes !== undefined) updates.utcOffsetMinutes = body.utcOffsetMinutes;

      const [updated] = await db
        .update(crmCommissionSettings)
        .set(updates)
        .where(eq(crmCommissionSettings.companyId, companyId))
        .returning();

      res.json({ settings: settingsForClient(await getCommissionSettings(companyId)), row: updated });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update commission settings" });
    }
  });

  router.get("/companies/:companyId/crm/commission-rules", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.view"))) {
        return res.status(403).json({ error: "Commission view permission required" });
      }
      const rows = await db
        .select()
        .from(crmCommissionRules)
        .where(eq(crmCommissionRules.companyId, companyId))
        .orderBy(desc(crmCommissionRules.createdAt));
      const names = await userNameMap(companyId);
      res.json(rows.map((row) => ({ ...row, salespersonName: names.get(row.salespersonId) ?? "User" })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch commission rules" });
    }
  });

  router.post("/companies/:companyId/crm/commission-rules", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.manage"))) {
        return res.status(403).json({ error: "Commission manage permission required" });
      }
      const body = z
        .object({
          salespersonId: z.string().uuid(),
          basis: BASIS.default("gross_profit"),
          ratePercent: z.coerce.number().min(0).max(100).default(5),
          fixedAmount: z.coerce.number().min(0).default(0),
          isActive: z.boolean().default(true),
          notes: z.string().max(1000).nullish(),
        })
        .parse(req.body ?? {});

      if (!(await isCompanyMember(companyId, body.salespersonId))) {
        return res.status(400).json({ error: "User does not belong to this company" });
      }

      const [row] = await db
        .insert(crmCommissionRules)
        .values({
          companyId,
          salespersonId: body.salespersonId,
          basis: body.basis,
          ratePercent: body.ratePercent.toFixed(3),
          fixedAmount: body.fixedAmount.toFixed(2),
          isActive: body.isActive,
          notes: body.notes ?? null,
          createdBy: req.user?.id ?? null,
        })
        .onConflictDoUpdate({
          target: [crmCommissionRules.companyId, crmCommissionRules.salespersonId],
          set: {
            basis: body.basis,
            ratePercent: body.ratePercent.toFixed(3),
            fixedAmount: body.fixedAmount.toFixed(2),
            isActive: body.isActive,
            notes: body.notes ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.status(201).json(row);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to save commission rule" });
    }
  });

  router.patch("/companies/:companyId/crm/commission-rules/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.manage"))) {
        return res.status(403).json({ error: "Commission manage permission required" });
      }
      const body = z
        .object({
          basis: BASIS.optional(),
          ratePercent: z.coerce.number().min(0).max(100).optional(),
          fixedAmount: z.coerce.number().min(0).optional(),
          isActive: z.boolean().optional(),
          notes: z.string().max(1000).nullish(),
        })
        .parse(req.body ?? {});
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.basis !== undefined) updates.basis = body.basis;
      if (body.ratePercent !== undefined) updates.ratePercent = body.ratePercent.toFixed(3);
      if (body.fixedAmount !== undefined) updates.fixedAmount = body.fixedAmount.toFixed(2);
      if (body.isActive !== undefined) updates.isActive = body.isActive;
      if (body.notes !== undefined) updates.notes = body.notes ?? null;

      const [row] = await db
        .update(crmCommissionRules)
        .set(updates)
        .where(and(
          eq(crmCommissionRules.id, parseInt(req.params.id)),
          eq(crmCommissionRules.companyId, companyId),
        ))
        .returning();
      if (!row) return res.status(404).json({ error: "Commission rule not found" });
      res.json(row);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update commission rule" });
    }
  });

  router.delete("/companies/:companyId/crm/commission-rules/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.manage"))) {
        return res.status(403).json({ error: "Commission manage permission required" });
      }
      const [row] = await db
        .delete(crmCommissionRules)
        .where(and(
          eq(crmCommissionRules.id, parseInt(req.params.id)),
          eq(crmCommissionRules.companyId, companyId),
        ))
        .returning({ id: crmCommissionRules.id });
      if (!row) return res.status(404).json({ error: "Commission rule not found" });
      res.json({ deleted: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to delete commission rule" });
    }
  });

  // ── commissions ────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/commissions", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.view"))) {
        return res.status(403).json({ error: "Commission view permission required" });
      }
      const seeAll = (await can(req, companyId, "crm.commission.approve")) || (await can(req, companyId, "crm.commission.manage"));
      const status = String(req.query.status ?? "").trim();
      const periodMonth = String(req.query.periodMonth ?? "").trim();
      const requestedSalesperson = String(req.query.salespersonId ?? "").trim();

      const conditions = [eq(crmCommissions.companyId, companyId)];
      if (status) conditions.push(eq(crmCommissions.status, status));
      if (periodMonth) conditions.push(eq(crmCommissions.periodMonth, periodMonth));
      if (seeAll) {
        if (requestedSalesperson) conditions.push(eq(crmCommissions.salespersonId, requestedSalesperson));
      } else {
        conditions.push(eq(crmCommissions.salespersonId, req.user.id));
      }

      const rows = await db
        .select()
        .from(crmCommissions)
        .where(and(...conditions))
        .orderBy(desc(crmCommissions.createdAt), desc(crmCommissions.id))
        .limit(500);

      const ids = rows.map((row) => row.id);
      const penalties = ids.length
        ? await db
            .select()
            .from(crmTaskPenalties)
            .where(inArray(crmTaskPenalties.commissionId, ids))
            .orderBy(desc(crmTaskPenalties.createdAt))
        : [];
      const penaltiesByCommission = new Map<number, typeof penalties>();
      for (const penalty of penalties) {
        if (!penalty.commissionId) continue;
        const list = penaltiesByCommission.get(penalty.commissionId) ?? [];
        list.push(penalty);
        penaltiesByCommission.set(penalty.commissionId, list);
      }

      const names = await userNameMap(companyId);
      const withNames = rows.map((row) => ({
        ...row,
        salespersonName: names.get(row.salespersonId) ?? "User",
        penalties: penaltiesByCommission.get(row.id) ?? [],
      }));

      const summary = withNames.reduce(
        (acc, row) => {
          const gross = Number(row.grossAmount ?? 0);
          const penalty = Number(row.penaltyAmount ?? 0);
          const net = Number(row.netAmount ?? 0);
          acc.gross += gross;
          acc.penalties += penalty;
          acc.net += net;
          if (row.status === "pending_approval") {
            acc.pendingCount += 1;
            acc.pendingNet += net;
          }
          if (row.status === "approved") acc.approvedNet += net;
          if (row.status === "paid") acc.paidNet += net;
          if (row.status === "draft") acc.draftCount += 1;
          return acc;
        },
        {
          gross: 0,
          penalties: 0,
          net: 0,
          pendingCount: 0,
          pendingNet: 0,
          approvedNet: 0,
          paidNet: 0,
          draftCount: 0,
        },
      );

      res.json({
        rows: withNames,
        commissions: withNames,
        summary,
        seeAll,
        canApprove: await can(req, companyId, "crm.commission.approve"),
        pendingPenalties: await pendingPenaltyTotal(companyId, seeAll ? undefined : req.user.id),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch commissions" });
    }
  });

  // Create a statement by hand (a deal the vehicle module did not record).
  router.post("/companies/:companyId/crm/commissions", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const canManage = await can(req, companyId, "crm.commission.manage");
      if (!canManage && !(await can(req, companyId, "crm.commission.request"))) {
        return res.status(403).json({ error: "Commission permission required" });
      }
      const body = z
        .object({
          salespersonId: z.string().uuid().optional(),
          enquiryId: z.coerce.number().int().positive().nullable().optional(),
          vehicleId: z.coerce.number().int().positive().nullable().optional(),
          reference: z.string().max(200).nullish(),
          saleAmount: z.coerce.number().min(0),
          costAmount: z.coerce.number().min(0).default(0),
          basis: BASIS.optional(),
          ratePercent: z.coerce.number().min(0).max(100).optional(),
          fixedAmount: z.coerce.number().min(0).optional(),
          periodMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          notes: z.string().max(2000).nullish(),
        })
        .parse(req.body ?? {});

      const salespersonId = canManage && body.salespersonId ? body.salespersonId : req.user.id;
      if (!(await isCompanyMember(companyId, salespersonId))) {
        return res.status(400).json({ error: "User does not belong to this company" });
      }

      if (body.vehicleId) {
        const [vehicle] = await db
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(and(eq(vehicles.id, body.vehicleId), eq(vehicles.companyId, companyId)));
        if (!vehicle) return res.status(400).json({ error: "Vehicle does not belong to this company" });
        const [existing] = await db
          .select({ id: crmCommissions.id })
          .from(crmCommissions)
          .where(and(eq(crmCommissions.companyId, companyId), eq(crmCommissions.vehicleId, body.vehicleId)));
        if (existing) return res.status(409).json({ error: "This vehicle already has a commission statement" });
      }
      if (body.enquiryId) {
        const [enquiry] = await db
          .select({ id: enquiries.id })
          .from(enquiries)
          .where(and(eq(enquiries.id, body.enquiryId), eq(enquiries.companyId, companyId)));
        if (!enquiry) return res.status(400).json({ error: "Enquiry does not belong to this company" });
      }

      const resolved = await resolveCommissionRule(companyId, salespersonId);
      const rule = {
        basis: body.basis ?? resolved.basis,
        ratePercent: body.ratePercent ?? resolved.ratePercent,
        fixedAmount: body.fixedAmount ?? resolved.fixedAmount,
      };
      const amounts = computeCommissionAmounts({
        saleAmount: body.saleAmount,
        costAmount: body.costAmount,
        rule,
      });

      // Insert and carry-over deduction must succeed or fail together: a
      // committed statement with unapplied penalties would still pay gross.
      const saved = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(crmCommissions)
          .values({
            companyId,
            salespersonId,
            enquiryId: body.enquiryId ?? null,
            vehicleId: body.vehicleId ?? null,
            reference: body.reference ?? null,
            basis: rule.basis,
            saleAmount: amounts.saleAmount.toFixed(2),
            costAmount: amounts.costAmount.toFixed(2),
            basisAmount: amounts.basisAmount.toFixed(2),
            ratePercent: rule.ratePercent.toFixed(3),
            fixedAmount: rule.fixedAmount.toFixed(2),
            grossAmount: amounts.grossAmount.toFixed(2),
            penaltyAmount: "0.00",
            netAmount: amounts.grossAmount.toFixed(2),
            status: "draft",
            periodMonth: body.periodMonth ?? new Date().toISOString().slice(0, 7),
            notes: body.notes ?? null,
            requestedBy: req.user.id,
          })
          .returning();

        await consumePendingPenalties(tx, companyId, salespersonId, created.id, amounts.grossAmount);
        const [row] = await tx
          .select()
          .from(crmCommissions)
          .where(eq(crmCommissions.id, created.id));
        return row ?? created;
      });
      res.status(201).json(saved);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to create commission" });
    }
  });

  // Scan invoiced vehicles and accrue any statement that is missing.
  router.post("/companies/:companyId/crm/commissions/generate", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.manage"))) {
        return res.status(403).json({ error: "Commission manage permission required" });
      }
      const sold = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(
          eq(vehicles.companyId, companyId),
          isNotNull(vehicles.invoiceId),
          isNotNull(vehicles.salespersonId),
        ));

      // One transaction for the whole run: a statement whose carried penalties
      // were relinked but not deducted must never be left committed.
      const accrued = await db.transaction(async (tx) => {
        let count = 0;
        for (const vehicle of sold) {
          const commission = await accrueVehicleCommission(tx, {
            companyId,
            vehicleId: vehicle.id,
            userId: req.user?.id,
          });
          if (commission) count += 1;
        }
        return count;
      });

      res.json({ scanned: sold.length, accrued });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate commissions" });
    }
  });

  router.post("/companies/:companyId/crm/commissions/:id/submit", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.request"))) {
        return res.status(403).json({ error: "Commission request permission required" });
      }
      const id = parseInt(req.params.id);
      const [commission] = await db
        .select()
        .from(crmCommissions)
        .where(and(eq(crmCommissions.id, id), eq(crmCommissions.companyId, companyId)));
      if (!commission) return res.status(404).json({ error: "Commission not found" });
      if (commission.salespersonId !== req.user.id && !(await can(req, companyId, "crm.commission.manage"))) {
        return res.status(403).json({ error: "You can only submit your own commission" });
      }
      if (commission.status === "pending_approval") {
        return res.status(409).json({ error: "This statement is already awaiting approval" });
      }
      if (!["draft", "rejected"].includes(commission.status)) {
        return res.status(409).json({ error: `A ${commission.status} statement cannot be resubmitted` });
      }

      const access = await resolveActionAccess(
        req.user.id,
        companyId,
        APPROVAL_TYPES.SALES_COMMISSION,
        Boolean(req.user?.isSuperAdmin),
        { amount: Number(commission.netAmount) }
      );
      if (!access.allowed) {
        return res.status(403).json({ error: "Commission request permission required" });
      }

      if (!access.requiresApproval) {
        const [approved] = await db
          .update(crmCommissions)
          .set({
            status: "approved",
            approvalRequestId: null,
            requestedBy: req.user.id,
            requestedAt: new Date(),
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
            reviewNotes: "Approval not required by company policy",
            updatedAt: new Date(),
          })
          .where(eq(crmCommissions.id, commission.id))
          .returning();
        return res.json({ ...approved, requiresApproval: false });
      }

      const names = await userNameMap(companyId);
      const salespersonName = names.get(commission.salespersonId) ?? "Salesperson";
      const request = await createApprovalRequest({
        companyId,
        type: APPROVAL_TYPES.SALES_COMMISSION,
        title: `Sales commission — ${salespersonName} — ${commission.periodMonth ?? new Date().toISOString().slice(0, 7)}`,
        description: `Gross ${Number(commission.grossAmount).toFixed(2)}, penalties ${Number(commission.penaltyAmount).toFixed(2)}, net ${Number(commission.netAmount).toFixed(2)}. ${commission.reference ?? ""}`.trim(),
        payload: {
          commissionId: commission.id,
          salespersonId: commission.salespersonId,
          grossAmount: Number(commission.grossAmount),
          penaltyAmount: Number(commission.penaltyAmount),
          netAmount: Number(commission.netAmount),
        },
        referenceType: "crm_commission",
        referenceId: String(commission.id),
        requestedBy: req.user.id,
      });

      const [updated] = await db
        .update(crmCommissions)
        .set({
          status: "pending_approval",
          approvalRequestId: request.id,
          requestedBy: req.user.id,
          requestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(crmCommissions.id, commission.id))
        .returning();

      res.json({ ...updated, requiresApproval: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to submit commission for approval" });
    }
  });

  router.post("/companies/:companyId/crm/commissions/:id/approve", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.approve"))) {
        return res.status(403).json({ error: "Commission approval permission required" });
      }
      const notes = req.body?.reviewNotes ? String(req.body.reviewNotes) : undefined;
      const id = parseInt(req.params.id);
      const [commission] = await db
        .select()
        .from(crmCommissions)
        .where(and(eq(crmCommissions.id, id), eq(crmCommissions.companyId, companyId)));
      if (!commission) return res.status(404).json({ error: "Commission not found" });

      if (commission.approvalRequestId) {
        await approveRequest(commission.approvalRequestId, companyId, req.user.id, Boolean(req.user?.isSuperAdmin), notes);
      } else {
        await applyCommissionDecision(companyId, id, "approve", req.user.id, notes);
      }

      const [updated] = await db.select().from(crmCommissions).where(eq(crmCommissions.id, id));
      res.json(updated);
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message || "Failed to approve commission" });
    }
  });

  router.post("/companies/:companyId/crm/commissions/:id/reject", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.approve"))) {
        return res.status(403).json({ error: "Commission approval permission required" });
      }
      const notes = req.body?.reviewNotes ? String(req.body.reviewNotes) : undefined;
      const id = parseInt(req.params.id);
      const [commission] = await db
        .select()
        .from(crmCommissions)
        .where(and(eq(crmCommissions.id, id), eq(crmCommissions.companyId, companyId)));
      if (!commission) return res.status(404).json({ error: "Commission not found" });

      if (commission.approvalRequestId) {
        await rejectRequest(commission.approvalRequestId, companyId, req.user.id, Boolean(req.user?.isSuperAdmin), notes);
      } else {
        await applyCommissionDecision(companyId, id, "reject", req.user.id, notes);
      }

      const [updated] = await db.select().from(crmCommissions).where(eq(crmCommissions.id, id));
      res.json(updated);
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message || "Failed to reject commission" });
    }
  });

  router.post("/companies/:companyId/crm/commissions/:id/pay", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.commission.approve"))) {
        return res.status(403).json({ error: "Commission approval permission required" });
      }
      const id = parseInt(req.params.id);
      const [commission] = await db
        .select()
        .from(crmCommissions)
        .where(and(eq(crmCommissions.id, id), eq(crmCommissions.companyId, companyId)));
      if (!commission) return res.status(404).json({ error: "Commission not found" });
      if (commission.status !== "approved") {
        return res.status(409).json({ error: "Only an approved commission can be marked paid" });
      }
      const [updated] = await db
        .update(crmCommissions)
        .set({ status: "paid", paidAt: new Date(), paidBy: req.user.id, updatedAt: new Date() })
        .where(eq(crmCommissions.id, id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to mark commission paid" });
    }
  });

  // ── team tasks & response penalties ────────────────────────────────────────

  router.get("/companies/:companyId/crm/tasks", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.tasks.view"))) {
        return res.status(403).json({ error: "Task view permission required" });
      }
      // Penalties are applied by the scheduler (and by the explicit sweep
      // endpoint), never by a read: this route used to open up to 500 locking
      // transactions per page view.

      const seeAll = await can(req, companyId, "crm.tasks.manage");
      const scope = String(req.query.scope ?? "").trim();
      const status = String(req.query.status ?? "").trim();

      const conditions = [eq(crmTasks.companyId, companyId)];
      if (!seeAll || scope === "mine") conditions.push(eq(crmTasks.assignedTo, req.user.id));
      if (status) conditions.push(eq(crmTasks.status, status));

      const rows = await db
        .select()
        .from(crmTasks)
        .where(and(...conditions))
        .orderBy(asc(crmTasks.dueAt), desc(crmTasks.id))
        .limit(300);

      const settings = await getCommissionSettings(companyId);
      const policy = workingPolicyOf(settings);
      const now = new Date();

      const names = await userNameMap(companyId);
      const enriched = rows.map((task) => {
        const dueAt = new Date(task.dueAt);
        const finishedAt = task.respondedAt ? new Date(task.respondedAt) : now;
        const overdue = task.status === "pending" && dueAt.getTime() < now.getTime();
        const lateHours = dueAt.getTime() < finishedAt.getTime()
          ? workingHoursBetween(dueAt, finishedAt, policy)
          : 0;
        const remainingHours = task.status === "pending" && dueAt.getTime() > now.getTime()
          ? workingHoursBetween(now, dueAt, policy)
          : 0;
        return {
          ...task,
          assigneeName: names.get(task.assignedTo) ?? "User",
          creatorName: task.createdBy ? names.get(task.createdBy) ?? "User" : null,
          overdue,
          lateHours: Math.round(lateHours * 100) / 100,
          remainingHours: Math.round(remainingHours * 100) / 100,
        };
      });

      res.json({ tasks: enriched, settings: settingsForClient(settings) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  router.post("/companies/:companyId/crm/tasks", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.tasks.manage"))) {
        return res.status(403).json({ error: "Task manage permission required" });
      }
      const body = z
        .object({
          assignedTo: z.string().uuid(),
          title: z.string().min(2).max(200),
          body: z.string().max(4000).nullish(),
          priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
          enquiryId: z.coerce.number().int().positive().nullable().optional(),
        })
        .parse(req.body ?? {});

      if (!(await isCompanyMember(companyId, body.assignedTo))) {
        return res.status(400).json({ error: "User does not belong to this company" });
      }
      if (body.enquiryId) {
        const [enquiry] = await db
          .select({ id: enquiries.id })
          .from(enquiries)
          .where(and(eq(enquiries.id, body.enquiryId), eq(enquiries.companyId, companyId)));
        if (!enquiry) return res.status(400).json({ error: "Enquiry does not belong to this company" });
      }

      const deadline = await taskResponseDeadline(companyId);
      const [created] = await db
        .insert(crmTasks)
        .values({
          companyId,
          enquiryId: body.enquiryId ?? null,
          assignedTo: body.assignedTo,
          createdBy: req.user.id,
          title: body.title,
          body: body.body ?? null,
          priority: body.priority,
          status: "pending",
          dueAt: deadline.dueAt,
        })
        .returning();

      if (body.enquiryId) {
        await logActivity(
          body.enquiryId,
          "task",
          `Task assigned: ${body.title}. Respond within ${deadline.windowHours} working hours.`,
          { taskId: created.id, assignedTo: body.assignedTo, dueAt: deadline.dueAt },
          req.user?.id,
        );
      }

      res.status(201).json({ ...created, windowHours: deadline.windowHours, penaltyPerLateTask: deadline.penaltyPerLateTask });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to assign task" });
    }
  });

  router.patch("/companies/:companyId/crm/tasks/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.tasks.manage"))) {
        return res.status(403).json({ error: "Task manage permission required" });
      }
      const id = parseInt(req.params.id);
      const body = z
        .object({
          assignedTo: z.string().uuid().optional(),
          title: z.string().min(2).max(200).optional(),
          body: z.string().max(4000).nullish(),
          priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
          status: z.enum(["pending", "responded", "completed", "cancelled"]).optional(),
        })
        .parse(req.body ?? {});

      if (body.assignedTo && !(await isCompanyMember(companyId, body.assignedTo))) {
        return res.status(400).json({ error: "User does not belong to this company" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
      if (body.title !== undefined) updates.title = body.title;
      if (body.body !== undefined) updates.body = body.body ?? null;
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.status !== undefined) {
        updates.status = body.status;
        if (body.status === "completed") updates.completedAt = new Date();
        if (body.status === "pending") updates.completedAt = null;
      }

      const [updated] = await db
        .update(crmTasks)
        .set(updates)
        .where(and(eq(crmTasks.id, id), eq(crmTasks.companyId, companyId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Task not found" });
      res.json(updated);
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  router.post("/companies/:companyId/crm/tasks/:id/respond", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.tasks.respond"))) {
        return res.status(403).json({ error: "Task response permission required" });
      }
      const id = parseInt(req.params.id);
      const responseNote = req.body?.responseNote ? String(req.body.responseNote).slice(0, 4000) : null;
      const [task] = await db
        .select()
        .from(crmTasks)
        .where(and(eq(crmTasks.id, id), eq(crmTasks.companyId, companyId)));
      if (!task) return res.status(404).json({ error: "Task not found" });

      const canManage = await can(req, companyId, "crm.tasks.manage");
      if (task.assignedTo !== req.user.id && !canManage) {
        return res.status(403).json({ error: "This task is assigned to someone else" });
      }
      if (task.status === "cancelled") return res.status(409).json({ error: "A cancelled task cannot be answered" });

      // Crossing the deadline costs money, even if the answer arrives later.
      let penaltyAmount = Number(task.penaltyAmount ?? 0);
      if (!task.penaltyApplied && new Date(task.dueAt).getTime() < Date.now()) {
        const result = await penaliseLateTask(task);
        penaltyAmount = result.penaltyAmount;
      }

      const [updated] = await db
        .update(crmTasks)
        .set({
          status: "responded",
          respondedAt: new Date(),
          responseNote,
          updatedAt: new Date(),
        })
        .where(eq(crmTasks.id, id))
        .returning();

      if (task.enquiryId) {
        await logActivity(
          task.enquiryId,
          "task",
          `${req.user?.name || req.user?.email || "A team member"} responded to "${task.title}"${penaltyAmount > 0 ? ` (late - ${penaltyAmount.toFixed(2)} penalty applied)` : ""}.`,
          { taskId: id, penaltyAmount },
          req.user?.id,
        );
      }

      res.json({ ...updated, penaltyAmount: penaltyAmount.toFixed(2), penaltyApplied: task.penaltyApplied || penaltyAmount > 0 });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to respond to task" });
    }
  });

  router.post("/companies/:companyId/crm/tasks/sweep", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.tasks.manage"))) {
        return res.status(403).json({ error: "Task manage permission required" });
      }
      const applied = await sweepOverdueTaskPenalties(companyId);
      res.json({ applied });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to run the penalty sweep" });
    }
  });

  router.get("/companies/:companyId/crm/task-penalties", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.tasks.view"))) {
        return res.status(403).json({ error: "Task view permission required" });
      }
      const seeAll = await can(req, companyId, "crm.tasks.manage");
      const conditions = [eq(crmTaskPenalties.companyId, companyId)];
      if (!seeAll) conditions.push(eq(crmTaskPenalties.salespersonId, req.user.id));

      const rows = await db
        .select()
        .from(crmTaskPenalties)
        .where(and(...conditions))
        .orderBy(desc(crmTaskPenalties.createdAt))
        .limit(300);

      const names = await userNameMap(companyId);
      res.json(rows.map((row) => ({ ...row, salespersonName: names.get(row.salespersonId) ?? "User" })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch penalties" });
    }
  });

  // ── reporting ──────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/reports/pipeline", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.reports.view"))) {
        return res.status(403).json({ error: "CRM reports view permission required" });
      }
      // Seed the default stages before aggregating, so a fresh company still
      // gets a full stage breakdown rather than an empty report.
      await ensureStages(companyId);

      // Aggregation lives in SQL. The previous version fetched whole tables and
      // filtered them once per stage/source/assignee, so cost grew quadratically
      // with the size of the pipeline and every request transferred all rows.
      const [totalRow] = (
        await db.execute(sql`
          SELECT
            count(*)::int AS "total",
            count(*) FILTER (WHERE e.status = 'open')::int AS "open",
            count(*) FILTER (WHERE e.status = 'won')::int AS "won",
            count(*) FILTER (WHERE e.status = 'lost')::int AS "lost",
            coalesce(sum(e.expected_revenue) FILTER (WHERE e.status = 'open'), 0)::float8 AS "openValue",
            coalesce(sum(e.expected_revenue) FILTER (WHERE e.status = 'won'), 0)::float8 AS "wonValue",
            coalesce(sum(e.expected_revenue * (coalesce(s.probability, 0) / 100.0)) FILTER (WHERE e.status = 'open'), 0)::float8 AS "weightedForecast",
            count(*) FILTER (WHERE e.customer_id IS NOT NULL)::int AS "linkedCustomers",
            count(*) FILTER (WHERE e.quotation_id IS NOT NULL)::int AS "quotations"
          FROM enquiries e
          LEFT JOIN crm_stages s ON s.id = e.stage_id
          WHERE e.company_id = ${companyId}
        `)
      ).rows as Record<string, number>[];
      const t = totalRow ?? ({} as Record<string, number>);

      const stageRows = (
        await db.execute(sql`
          SELECT s.id AS "stageId", s.name, s.probability,
                 s.is_won AS "isWon", s.is_lost AS "isLost",
                 count(e.id)::int AS "count",
                 coalesce(sum(e.expected_revenue), 0)::float8 AS "value"
          FROM crm_stages s
          LEFT JOIN enquiries e ON e.stage_id = s.id AND e.company_id = ${companyId}
          WHERE s.company_id = ${companyId}
          GROUP BY s.id, s.name, s.probability, s.is_won, s.is_lost, s.sequence
          ORDER BY s.sequence
        `)
      ).rows as Record<string, any>[];
      const byStage = stageRows.map((s) => ({
        stageId: Number(s.stageId),
        name: String(s.name),
        probability: Number(s.probability),
        isWon: Boolean(s.isWon),
        isLost: Boolean(s.isLost),
        count: Number(s.count),
        value: Number(s.value),
        weightedValue: Number(s.value) * (Number(s.probability) / 100),
      }));

      // Delivered vehicles give the pipeline a real outcome. Revenue is the
      // invoice total when one exists, otherwise the sale price in base currency;
      // COGS prefers the posted amount and falls back to active landed costs.
      const deliveredRows = (
        await db.execute(sql`
          WITH delivered AS (
            SELECT
              coalesce(nullif(e.source, ''), 'unknown') AS source,
              coalesce(e.assigned_to, v.salesperson_id) AS assignee,
              coalesce(
                i.total::float8,
                v.sale_price::float8 * coalesce(v.sale_exchange_rate, 1)::float8,
                0
              ) AS revenue,
              coalesce(
                v.cogs_amount::float8,
                (SELECT coalesce(sum(vc.base_amount), 0)::float8
                   FROM vehicle_costs vc
                  WHERE vc.vehicle_id = v.id AND vc.status <> 'cancelled'),
                0
              ) AS cogs
            FROM vehicles v
            LEFT JOIN invoices i ON i.id = v.invoice_id
            LEFT JOIN enquiries e ON e.id = v.enquiry_id
            WHERE v.company_id = ${companyId}
              AND (v.invoice_id IS NOT NULL OR v.status IN ('sold', 'delivered'))
          )
          SELECT source, assignee,
                 count(*)::int AS units,
                 coalesce(sum(revenue), 0)::float8 AS "vehicleRevenue",
                 coalesce(sum(revenue - cogs), 0)::float8 AS "vehicleGrossProfit"
          FROM delivered
          GROUP BY source, assignee
        `)
      ).rows as Record<string, any>[];

      const [linkedRow] = (
        await db.execute(sql`
          SELECT
            count(*)::int AS "vehiclesLinked",
            count(*) FILTER (
              WHERE v.invoice_id IS NOT NULL OR v.status IN ('sold', 'delivered')
            )::int AS "linkedVehiclesSold"
          FROM vehicles v
          WHERE v.company_id = ${companyId} AND v.enquiry_id IS NOT NULL
        `)
      ).rows as Record<string, number>[];
      const linked = linkedRow ?? ({} as Record<string, number>);

      const breakdownRows = (
        await db.execute(sql`
          SELECT coalesce(nullif(source, ''), 'unknown') AS source,
                 assigned_to AS assignee,
                 status,
                 count(*)::int AS "count",
                 coalesce(sum(expected_revenue), 0)::float8 AS "value"
          FROM enquiries
          WHERE company_id = ${companyId}
          GROUP BY source, assigned_to, status
        `)
      ).rows as Record<string, any>[];

      // Names are resolved only for this company's members; the old code
      // selected every user in the deployment to label report rows.
      const nameRows = (
        await db.execute(sql`
          SELECT u.id, u.name, u.email
          FROM users u
          INNER JOIN company_users cu ON cu.user_id = u.id
          WHERE cu.company_id = ${companyId}
        `)
      ).rows as Record<string, any>[];

      type Breakdown = {
        count: number;
        won: number;
        value: number;
        units: number;
        vehicleRevenue: number;
        vehicleGrossProfit: number;
      };
      const emptyBreakdown = (): Breakdown => ({
        count: 0, won: 0, value: 0, units: 0, vehicleRevenue: 0, vehicleGrossProfit: 0,
      });
      const sources = new Map<string, Breakdown>();
      const assignees = new Map<string, Breakdown>();
      const bucket = (map: Map<string, Breakdown>, key: string) => {
        let entry = map.get(key);
        if (!entry) {
          entry = emptyBreakdown();
          map.set(key, entry);
        }
        return entry;
      };

      for (const row of breakdownRows) {
        const source = bucket(sources, String(row.source));
        const assignee = bucket(assignees, String(row.assignee ?? "unassigned"));
        source.count += Number(row.count);
        source.value += Number(row.value);
        assignee.count += Number(row.count);
        assignee.value += Number(row.value);
        if (row.status === "won") {
          source.won += Number(row.count);
          assignee.won += Number(row.count);
        }
      }
      for (const row of deliveredRows) {
        const units = Number(row.units);
        const revenue = Number(row.vehicleRevenue);
        const grossProfit = Number(row.vehicleGrossProfit);
        const source = bucket(sources, String(row.source));
        const assignee = bucket(assignees, String(row.assignee ?? "unassigned"));
        source.units += units;
        source.vehicleRevenue += revenue;
        source.vehicleGrossProfit += grossProfit;
        assignee.units += units;
        assignee.vehicleRevenue += revenue;
        assignee.vehicleGrossProfit += grossProfit;
      }

      const bySource = [...sources.entries()].map(([source, s]) => ({ source, ...s }));
      const byAssignee = [...assignees.entries()].map(([userId, a]) => ({
        userId,
        name: userId === "unassigned"
          ? "Unassigned"
          : nameRows.find((u) => String(u.id) === userId)?.name ||
            nameRows.find((u) => String(u.id) === userId)?.email ||
            "Unassigned",
        ...a,
      }));

      const vehicleRevenue = deliveredRows.reduce((sum, r) => sum + Number(r.vehicleRevenue), 0);
      const vehicleCogs = deliveredRows.reduce(
        (sum, r) => sum + Number(r.vehicleRevenue) - Number(r.vehicleGrossProfit), 0,
      );
      const vehiclesSold = deliveredRows.reduce((sum, r) => sum + Number(r.units), 0);

      const [activityRow] = (
        await db.execute(sql`
          SELECT count(*)::int AS "activityCount"
          FROM enquiry_activities a
          INNER JOIN enquiries e ON e.id = a.enquiry_id
          WHERE e.company_id = ${companyId} AND a.created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        `)
      ).rows as Record<string, number>[];

      const total = Number(t.total ?? 0);
      const open = Number(t.open ?? 0);
      const won = Number(t.won ?? 0);
      const lost = Number(t.lost ?? 0);
      const closed = won + lost;
      const vehiclesLinked = Number(linked.vehiclesLinked ?? 0);

      res.json({
        totals: {
          total,
          open,
          won,
          lost,
          openValue: Number(t.openValue ?? 0),
          wonValue: Number(t.wonValue ?? 0),
          weightedForecast: Number(t.weightedForecast ?? 0),
          winRate: closed ? (won / closed) * 100 : 0,
          linkedCustomers: Number(t.linkedCustomers ?? 0),
          quotations: Number(t.quotations ?? 0),
          activitiesLast30Days: Number(activityRow?.activityCount ?? 0),
          vehiclesLinked,
          vehiclesSold,
          vehicleRevenue,
          vehicleCogs,
          vehicleGrossProfit: vehicleRevenue - vehicleCogs,
          leadToDeliveryRate: vehiclesLinked
            ? (Number(linked.linkedVehiclesSold ?? 0) / vehiclesLinked) * 100
            : 0,
        },
        byStage,
        bySource,
        byAssignee,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to build pipeline report" });
    }
  });

  return router;
}

/**
 * Public, unauthenticated lead capture (website form / social bio link).
 * Mounted separately so the rest of the CRM stays behind requireAuth.
 */
export function createPublicLeadRouter() {
  const router = Router();

  router.post("/public/leads/:companyId", async (req, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: "Unknown company" });

      // A per-company token is the only credential. The optional deployment
      // fallback must be bound to one company, otherwise a leaked secret could
      // submit leads into every tenant.
      const token = (req.headers["x-lead-token"] as string | undefined)?.trim();
      if (!token) return res.status(401).json({ error: "Missing lead token" });

      const sharedSecret = process.env.CRM_LEAD_SHARED_SECRET?.trim();
      const sharedSecretCompanyId = Number(process.env.CRM_LEAD_SHARED_SECRET_COMPANY_ID);
      const isSharedSecret = Boolean(
        sharedSecret &&
        Number.isInteger(sharedSecretCompanyId) &&
        sharedSecretCompanyId === companyId &&
        token === sharedSecret,
      );

      if (!isSharedSecret) {
        const hash = hashLeadToken(token);
        const [validToken] = await db
          .select()
          .from(crmPublicLeadTokens)
          .where(
            and(
              eq(crmPublicLeadTokens.companyId, companyId),
              eq(crmPublicLeadTokens.isActive, true),
              // The raw-token comparison verifies rows issued before hashing.
              or(eq(crmPublicLeadTokens.token, hash), eq(crmPublicLeadTokens.token, token)),
            ),
          )
          .limit(1);

        if (!validToken) return res.status(401).json({ error: "Invalid or inactive lead token" });
        if (validToken.expiresAt && new Date(validToken.expiresAt) < new Date()) {
          return res.status(401).json({ error: "Lead token has expired" });
        }
        if (validToken.token === token) {
          // Upgrade a legacy plaintext row now that the secret has been seen.
          await db
            .update(crmPublicLeadTokens)
            .set({ token: hash, tokenPrefix: token.slice(0, 8) })
            .where(eq(crmPublicLeadTokens.id, validToken.id));
        }
      }

      // Trust X-Forwarded-For only behind an explicitly configured proxy;
      // otherwise callers can rotate the header to evade the limit.
      const trustProxy = /^(1|true|yes)$/i.test(process.env.CRM_TRUST_PROXY ?? "");
      const forwarded = req.headers["x-forwarded-for"];
      const clientIp = trustProxy && typeof forwarded === "string"
        ? forwarded.split(",")[0]?.trim()
        : req.socket.remoteAddress;
      const ipAddress = (clientIp || "0.0.0.0").slice(0, 64);

      // Fixed hourly windows make the counter safe to increment atomically.
      const hourMs = 60 * 60 * 1000;
      const windowStart = new Date(Math.floor(Date.now() / hourMs) * hourMs);
      const windowEnd = new Date(windowStart.getTime() + hourMs);

      const [rateLimit] = await db
        .insert(crmPublicLeadRateLimits)
        .values({ companyId, ipAddress, submissionCount: 1, windowStart, windowEnd })
        .onConflictDoUpdate({
          target: [
            crmPublicLeadRateLimits.companyId,
            crmPublicLeadRateLimits.ipAddress,
            crmPublicLeadRateLimits.windowStart,
          ],
          set: { submissionCount: sql`${crmPublicLeadRateLimits.submissionCount} + 1` },
        })
        .returning({ submissionCount: crmPublicLeadRateLimits.submissionCount });

      if (!rateLimit || rateLimit.submissionCount > 5) {
        return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
      }

      const body = publicLeadInput.parse(req.body ?? {});
      const result = await captureLead({
        companyId,
        name: body.name,
        phone: body.phone,
        email: body.email,
        interest: body.interest,
        notes: body.message,
        utmSource: body.utmSource,
        utmMedium: body.utmMedium,
        utmCampaign: body.utmCampaign,
        activityBody: "Captured from the public web form.",
      });

      if (!result.ok) return res.status(result.status).json({ error: result.error });
      res.status(201).json({
        id: result.id,
        returning: result.returning,
        reusedExisting: result.reusedExisting,
      });
    } catch (error) {
      console.error(error);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to capture lead" });
    }
  });

  return router;
}
