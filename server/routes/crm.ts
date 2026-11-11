import { Router } from "express";
import { randomBytes } from "node:crypto";
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
  quotations,
  quotationItems,
  users,
  companyUsers,
  vehicles,
  vehicleCosts,
  invoices,
  socialLeads,
  socialComments,
  crmPublicLeadTokens,
  crmPublicLeadRateLimits,
} from "../../shared/schema.js";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  captureLead,
  ensureStages,
  findPriorEnquiry,
  linkCustomer,
} from "../lib/lead-capture.js";
import { userHasPermission } from "../lib/permissions.js";

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

export function createCrmRouter(requireAuth: any, requireCompanyAccess: any = (_q: any, _s: any, n: any) => n()) {
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
      const updates: Record<string, unknown> = { ...req.body };
      delete updates.id;
      delete updates.companyId;
      delete updates.createdAt;

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
      const data = insertEnquirySchema.parse({ ...req.body, companyId });

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

      const body = req.body ?? {};
      const updates: Record<string, unknown> = {};
      const editable = [
        "name", "phone", "email", "source", "interest", "notes", "tags",
        "expectedRevenue", "expectedCloseDate", "utmSource", "utmMedium", "utmCampaign",
        // Editable on its own: the sheet lets you restate why an enquiry was lost
        // after the move that closed it.
        "lostReason",
      ];
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
      const stageId = parseInt(req.body?.stageId);

      const [existing] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, companyId)));
      if (!existing) return res.status(404).json({ error: "Enquiry not found" });

      const stage = await getStage(companyId, stageId);
      if (!stage) return res.status(400).json({ error: "Unknown stage" });
      if (stage.isLost && !req.body?.lostReason) {
        return res.status(400).json({ error: "A lost reason is required to close an enquiry as lost" });
      }

      const [updated] = await db
        .update(enquiries)
        .set({
          stageId: stage.id,
          status: statusAfterStageMove(stage, existing.status),
          lostReason: stage.isLost ? req.body.lostReason : null,
          updatedAt: new Date(),
        })
        .where(eq(enquiries.id, id))
        .returning();

      await logActivity(
        id,
        "stage",
        `Moved to ${stage.name}${stage.isLost ? ` - ${req.body.lostReason}` : ""}.`,
        { from: existing.stageId, to: stage.id },
        req.user?.id,
      );

      res.json(updated);
    } catch (error) {
      console.error(error);
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

      const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) {
        return res.status(400).json({ error: "At least one line item is required to raise a quotation" });
      }

      let customerId = enquiry.customerId ?? (await linkCustomer(companyId, enquiry.phone, enquiry.email));
      if (!customerId) {
        const [customer] = await db
          .insert(customers)
          .values({ companyId, name: enquiry.name, phone: enquiry.phone, email: enquiry.email })
          .returning();
        customerId = customer.id;
      }

      const computed = items.map((item) => {
        const quantity = Number(item.quantity ?? 1);
        const unitPrice = Number(item.unitPrice ?? 0);
        const taxRate = Number(item.taxRate ?? 0);
        const lineTotal = quantity * unitPrice;
        return {
          productId: item.productId ?? null,
          description: String(item.description ?? "Item"),
          quantity: String(quantity),
          unitPrice: String(unitPrice),
          taxRate: String(taxRate),
          lineTotal: String(lineTotal),
          taxTotal: lineTotal * (taxRate / 100),
        };
      });

      const subtotal = computed.reduce((sum, i) => sum + Number(i.lineTotal), 0);
      const taxAmount = computed.reduce((sum, i) => sum + i.taxTotal, 0);

      const { quotation, updated } = await db.transaction(async (tx) => {
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

        return { quotation: created, updated: enq };
      });

      await logActivity(id, "quotation", `Quotation ${quotation.quotationNumber} raised.`, { quotationId: quotation.id }, req.user?.id);

      res.status(201).json({ enquiry: updated, quotation });
    } catch (error) {
      console.error(error);
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

      const type = String(req.body?.type ?? "note");
      const body = req.body?.body ? String(req.body.body) : null;
      if (!body) return res.status(400).json({ error: "A note is required" });

      await logActivity(id, type, body, null, req.user?.id);
      const activities = await db
        .select()
        .from(enquiryActivities)
        .where(eq(enquiryActivities.enquiryId, id))
        .orderBy(desc(enquiryActivities.createdAt));
      res.status(201).json(activities);
    } catch (error) {
      console.error(error);
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
      const id = parseInt(req.params.id);
      const [owned] = await db
        .select({ companyId: enquiries.companyId })
        .from(enquiries)
        .where(eq(enquiries.id, id))
        .limit(1);
      if (!owned) return res.status(404).json({ error: "Enquiry not found" });
      if (!(await can(req, owned.companyId, "crm.pipeline.manage"))) {
        return res.status(403).json({ error: "CRM pipeline manage permission required" });
      }
      // The generated insert schema types `due_at` as z.date(), but a timestamp can
      // only ever arrive over JSON as an ISO string, so every schedule request was
      // rejected with "Expected date, received string" before the conversion below
      // could run. Coerce it here instead of asking every caller to post a Date.
      const data = insertEnquiryFollowUpSchema
        .extend({ dueAt: z.coerce.date().nullish() })
        .parse({ ...req.body, enquiryId: id });

      const [created] = await db
        .insert(enquiryFollowUps)
        .values({
          ...data,
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

      const updates: Record<string, unknown> = { ...req.body };
      delete updates.id;
      delete updates.enquiryId;
      // Drizzle's timestamp mapper calls .toISOString() on whatever it is given, so a
      // value that arrived over JSON as a string has to become a Date first. Only dueAt
      // was converted here, which made every "Done" click 500.
      for (const ts of ["dueAt", "completedAt"] as const) {
        if (typeof updates[ts] === "string") updates[ts] = new Date(updates[ts] as string);
      }

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
      const rows = await db
        .select({
          id: crmPublicLeadTokens.id,
          token: crmPublicLeadTokens.token,
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
      const [created] = await db
        .insert(crmPublicLeadTokens)
        .values({
          companyId,
          token: randomBytes(24).toString("base64url"),
          isActive: true,
          expiresAt: body.expiresAt ?? null,
          createdBy: req.user?.id ?? null,
        })
        .returning();
      res.status(201).json(created);
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

  // ── reporting ──────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/reports/pipeline", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      if (!(await can(req, companyId, "crm.reports.view"))) {
        return res.status(403).json({ error: "CRM reports view permission required" });
      }
      const stages = await ensureStages(companyId);

      const rows = await db
        .select({
          id: enquiries.id,
          stageId: enquiries.stageId,
          status: enquiries.status,
          source: enquiries.source,
          assignedTo: enquiries.assignedTo,
          expectedRevenue: enquiries.expectedRevenue,
          customerId: enquiries.customerId,
          quotationId: enquiries.quotationId,
          createdAt: enquiries.createdAt,
        })
        .from(enquiries)
        .where(eq(enquiries.companyId, companyId));

      const assigneeRows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users);
      const assigneeName = (id: string | null) => {
        const u = assigneeRows.find((a) => a.id === id);
        return u ? u.name || u.email : "Unassigned";
      };

      const value = (v: unknown) => Number(v ?? 0);

      const byStage = stages
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => {
          const items = rows.filter((r) => r.stageId === s.id);
          const total = items.reduce((sum, r) => sum + value(r.expectedRevenue), 0);
          return {
            stageId: s.id,
            name: s.name,
            probability: s.probability,
            isWon: s.isWon,
            isLost: s.isLost,
            count: items.length,
            value: total,
            weightedValue: total * (s.probability / 100),
          };
        });

      const open = rows.filter((r) => r.status === "open");
      const won = rows.filter((r) => r.status === "won");
      const lost = rows.filter((r) => r.status === "lost");
      const closed = won.length + lost.length;

      // Vehicle deliveries give the pipeline a real outcome instead of only an
      // expected value. Revenue is the invoice total when one exists, otherwise
      // the agreed sale price converted to base. COGS prefers the posted amount
      // and falls back to active landed costs for vehicles invoiced before the
      // COGS posting was introduced.
      const vehicleRows = await db
        .select({
          id: vehicles.id,
          enquiryId: vehicles.enquiryId,
          salespersonId: vehicles.salespersonId,
          status: vehicles.status,
          invoiceId: vehicles.invoiceId,
          salePrice: vehicles.salePrice,
          saleExchangeRate: vehicles.saleExchangeRate,
          cogsAmount: vehicles.cogsAmount,
          invoiceTotal: invoices.total,
        })
        .from(vehicles)
        .leftJoin(invoices, eq(vehicles.invoiceId, invoices.id))
        .where(eq(vehicles.companyId, companyId));

      const costRows = await db
        .select({
          vehicleId: vehicleCosts.vehicleId,
          total: sql<string>`coalesce(sum(${vehicleCosts.baseAmount}), 0)`,
        })
        .from(vehicleCosts)
        .innerJoin(vehicles, eq(vehicleCosts.vehicleId, vehicles.id))
        .where(and(eq(vehicles.companyId, companyId), sql`${vehicleCosts.status} <> 'cancelled'`))
        .groupBy(vehicleCosts.vehicleId);

      const enquiryById = new Map(rows.map((r) => [r.id, r]));
      const costByVehicle = new Map(costRows.map((r) => [r.vehicleId, Number(r.total)]));
      const isDelivered = (v: (typeof vehicleRows)[number]) =>
        !!v.invoiceId || v.status === "sold" || v.status === "delivered";
      const revenueOf = (v: (typeof vehicleRows)[number]) =>
        value(v.invoiceTotal ?? value(v.salePrice) * value(v.saleExchangeRate ?? 1));
      const cogsOf = (v: (typeof vehicleRows)[number]) =>
        v.cogsAmount != null ? value(v.cogsAmount) : costByVehicle.get(v.id) ?? 0;

      const linkedVehicles = vehicleRows.filter((v) => v.enquiryId);
      const deliveredVehicles = vehicleRows.filter(isDelivered);
      const linkedDeliveredVehicles = linkedVehicles.filter(isDelivered);
      const vehicleRevenue = deliveredVehicles.reduce((sum, v) => sum + revenueOf(v), 0);
      const vehicleCogs = deliveredVehicles.reduce((sum, v) => sum + cogsOf(v), 0);

      const bySource = [...new Set(rows.map((r) => r.source ?? "unknown"))].map((source) => {
        const items = rows.filter((r) => (r.source ?? "unknown") === source);
        const units = linkedDeliveredVehicles.filter(
          (v) => (enquiryById.get(v.enquiryId!)?.source ?? "unknown") === source,
        );
        const revenue = units.reduce((sum, v) => sum + revenueOf(v), 0);
        const cogs = units.reduce((sum, v) => sum + cogsOf(v), 0);
        return {
          source,
          count: items.length,
          won: items.filter((r) => r.status === "won").length,
          value: items.reduce((sum, r) => sum + value(r.expectedRevenue), 0),
          units: units.length,
          vehicleRevenue: revenue,
          vehicleGrossProfit: revenue - cogs,
        };
      });

      const assigneeIds = [
        ...new Set(
          [
            ...rows.map((r) => r.assignedTo),
            ...deliveredVehicles.map(
              (v) => enquiryById.get(v.enquiryId!)?.assignedTo ?? v.salespersonId,
            ),
          ].filter(Boolean),
        ),
      ] as string[];
      const byAssignee = assigneeIds.map((uid) => {
        const items = rows.filter((r) => r.assignedTo === uid);
        const units = deliveredVehicles.filter(
          (v) => (enquiryById.get(v.enquiryId!)?.assignedTo ?? v.salespersonId) === uid,
        );
        const revenue = units.reduce((sum, v) => sum + revenueOf(v), 0);
        const cogs = units.reduce((sum, v) => sum + cogsOf(v), 0);
        return {
          userId: uid,
          name: assigneeName(uid),
          count: items.length,
          won: items.filter((r) => r.status === "won").length,
          value: items.reduce((sum, r) => sum + value(r.expectedRevenue), 0),
          units: units.length,
          vehicleRevenue: revenue,
          vehicleGrossProfit: revenue - cogs,
        };
      });

      const unassignedUnits = deliveredVehicles.filter(
        (v) => !(enquiryById.get(v.enquiryId!)?.assignedTo ?? v.salespersonId),
      );
      if (unassignedUnits.length) {
        const revenue = unassignedUnits.reduce((sum, v) => sum + revenueOf(v), 0);
        const cogs = unassignedUnits.reduce((sum, v) => sum + cogsOf(v), 0);
        byAssignee.push({
          userId: "unassigned",
          name: "Unassigned",
          count: 0,
          won: 0,
          value: 0,
          units: unassignedUnits.length,
          vehicleRevenue: revenue,
          vehicleGrossProfit: revenue - cogs,
        });
      }

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [{ activityCount }] = await db
        .select({ activityCount: sql<number>`count(*)::int` })
        .from(enquiryActivities)
        .innerJoin(enquiries, eq(enquiryActivities.enquiryId, enquiries.id))
        .where(and(eq(enquiries.companyId, companyId), gte(enquiryActivities.createdAt, since)));

      res.json({
        totals: {
          total: rows.length,
          open: open.length,
          won: won.length,
          lost: lost.length,
          openValue: open.reduce((sum, r) => sum + value(r.expectedRevenue), 0),
          wonValue: won.reduce((sum, r) => sum + value(r.expectedRevenue), 0),
          weightedForecast: open.reduce((sum, r) => {
            const stage = stages.find((s) => s.id === r.stageId);
            return sum + value(r.expectedRevenue) * ((stage?.probability ?? 0) / 100);
          }, 0),
          winRate: closed ? (won.length / closed) * 100 : 0,
          linkedCustomers: rows.filter((r) => r.customerId).length,
          quotations: rows.filter((r) => r.quotationId).length,
          activitiesLast30Days: activityCount ?? 0,
          vehiclesLinked: linkedVehicles.length,
          vehiclesSold: deliveredVehicles.length,
          vehicleRevenue,
          vehicleCogs,
          vehicleGrossProfit: vehicleRevenue - vehicleCogs,
          leadToDeliveryRate: linkedVehicles.length
            ? (linkedDeliveredVehicles.length / linkedVehicles.length) * 100
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

      // A per-company token (issued from CRM settings) is the normal credential.
      // A deployment-wide shared secret is accepted as a fallback so the public
      // form can be wired before an admin issues tokens.
      const token = (req.headers["x-lead-token"] as string | undefined)?.trim();
      const sharedSecret = process.env.CRM_LEAD_SHARED_SECRET?.trim();
      const isSharedSecret = Boolean(sharedSecret && token && token === sharedSecret);

      if (!token) return res.status(401).json({ error: "Missing lead token" });

      if (!isSharedSecret) {
        const [validToken] = await db
          .select()
          .from(crmPublicLeadTokens)
          .where(
            and(
              eq(crmPublicLeadTokens.companyId, companyId),
              eq(crmPublicLeadTokens.token, token),
              eq(crmPublicLeadTokens.isActive, true),
            ),
          )
          .limit(1);

        if (!validToken) return res.status(401).json({ error: "Invalid or inactive lead token" });
        if (validToken.expiresAt && new Date(validToken.expiresAt) < new Date()) {
          return res.status(401).json({ error: "Lead token has expired" });
        }
      }

      // Rate limiting by IP address (max 5 submissions per hour). `ip_address`
      // is INET, so a missing remote address must fall back to a valid address
      // rather than the string "unknown".
      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "0.0.0.0";
      const now = new Date();
      const windowStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
      const windowEnd = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      const [existingRateLimit] = await db
        .select()
        .from(crmPublicLeadRateLimits)
        .where(
          and(
            eq(crmPublicLeadRateLimits.companyId, companyId),
            eq(crmPublicLeadRateLimits.ipAddress, ipAddress),
            gte(crmPublicLeadRateLimits.windowEnd, windowStart),
          ),
        )
        .orderBy(desc(crmPublicLeadRateLimits.windowEnd))
        .limit(1);

      if (existingRateLimit && existingRateLimit.submissionCount >= 5) {
        return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
      }

      // Update or create rate limit record
      if (existingRateLimit) {
        await db
          .update(crmPublicLeadRateLimits)
          .set({ submissionCount: existingRateLimit.submissionCount + 1 })
          .where(eq(crmPublicLeadRateLimits.id, existingRateLimit.id));
      } else {
        await db.insert(crmPublicLeadRateLimits).values({
          companyId,
          ipAddress,
          submissionCount: 1,
          windowStart,
          windowEnd,
        });
      }

      const body = req.body ?? {};
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
      res.status(500).json({ error: "Failed to capture lead" });
    }
  });

  return router;
}
