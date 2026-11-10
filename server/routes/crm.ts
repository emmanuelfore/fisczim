import { Router } from "express";
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
} from "../../shared/schema.js";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  captureLead,
  ensureStages,
  findPriorEnquiry,
  linkCustomer,
} from "../lib/lead-capture.js";

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

/** Keep the enquiry `status` column aligned with its stage's won/lost flags. */
function statusForStage(stage: { isWon: boolean; isLost: boolean } | null | undefined) {
  if (!stage) return "open";
  if (stage.isWon) return "won";
  if (stage.isLost) return "lost";
  return "open";
}

export function createCrmRouter(requireAuth: any, requireCompanyAccess: any = (_q: any, _s: any, n: any) => n()) {
  const router = Router();

  // ── helpers ────────────────────────────────────────────────────────────────

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
  ) {
    await db.insert(enquiryActivities).values({
      enquiryId,
      type,
      body,
      metadata: metadata ?? null,
      userId: userId ?? null,
    });
    await db.update(enquiries).set({ lastActivityAt: new Date() }).where(eq(enquiries.id, enquiryId));
  }

  async function nextQuotationNumber(companyId: number) {
    const rows = await db
      .select({ quotationNumber: quotations.quotationNumber })
      .from(quotations)
      .where(eq(quotations.companyId, companyId));
    const max = rows
      .filter((r) => r.quotationNumber?.startsWith("QT-"))
      .map((r) => parseInt(r.quotationNumber.split("-")[1] ?? "0", 10))
      .filter((n) => !isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `QT-${max + 1}`;
  }

  // Prospects gone quiet: open, no activity for N days (default 30) and no
  // pending follow-up. The reactivation call list.
  router.get("/companies/:companyId/crm/dormant", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
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

      await db
        .update(enquiries)
        .set({ status: statusForStage(updated) })
        .where(and(eq(enquiries.companyId, companyId), eq(enquiries.stageId, id)));

      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update stage" });
    }
  });

  router.delete("/companies/:companyId/crm/stages/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
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

  router.get("/companies/:companyId/crm/enquiries/:id", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
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

      const [activities, followUps] = await Promise.all([
        db
          .select()
          .from(enquiryActivities)
          .where(eq(enquiryActivities.enquiryId, id))
          .orderBy(desc(enquiryActivities.createdAt)),
        db.select().from(enquiryFollowUps).where(eq(enquiryFollowUps.enquiryId, id)).orderBy(asc(enquiryFollowUps.dueAt)),
      ]);

      res.json({
        ...row.enquiry,
        stage: row.stage ?? null,
        assignee: row.assignee?.id ? row.assignee : null,
        customer: row.customer?.id ? row.customer : null,
        activities,
        followUps,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch enquiry" });
    }
  });

  router.post("/companies/:companyId/crm/enquiries", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const data = insertEnquirySchema.parse({ ...req.body, companyId });

      const stages = await ensureStages(companyId);
      const openingStage = stages.find((s) => s.sequence === Math.min(...stages.map((x) => x.sequence))) ?? stages[0];
      const stageId = (data.stageId ?? openingStage?.id) ?? null;

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
          status: statusForStage(stages.find((s) => s.id === stageId)),
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

      // Assignment change is logged with names so the chatter reads like Odoo's.
      if ("assignedTo" in body && body.assignedTo !== existing.assignedTo) {
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
        updates.status = statusForStage(stage);
        if (stage.isLost) updates.lostReason = body.lostReason;
        await logActivity(
          id,
          "stage",
          `Moved to ${stage.name}${stage.isLost && body.lostReason ? ` - ${body.lostReason}` : ""}.`,
          { from: existing.stageId, to: stage.id, probability: stage.probability },
          req.user?.id,
        );
      }

      if ("customerId" in body) updates.customerId = body.customerId || null;
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
          status: statusForStage(stage),
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

      const quotation = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(quotations)
          .values({
            companyId,
            branchId: enquiry.branchId ?? null,
            customerId,
            quotationNumber: await nextQuotationNumber(companyId),
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

        return created;
      });

      const [updated] = await db
        .update(enquiries)
        .set({ quotationId: quotation.id, customerId, updatedAt: new Date() })
        .where(eq(enquiries.id, id))
        .returning();

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
        .select({ id: enquiries.id, name: enquiries.name })
        .from(enquiries)
        .where(and(eq(enquiries.companyId, companyId), inArray(enquiries.id, sourceIds)));

      await db.transaction(async (tx) => {
        const ids = valid.map((v) => v.id);
        if (!ids.length) return;
        await tx.update(enquiryActivities).set({ enquiryId: id }).where(inArray(enquiryActivities.enquiryId, ids));
        await tx.update(enquiryFollowUps).set({ enquiryId: id }).where(inArray(enquiryFollowUps.enquiryId, ids));
        await tx.delete(enquiries).where(inArray(enquiries.id, ids));
      });

      await logActivity(
        id,
        "merge",
        `Merged ${valid.length} duplicate enquir${valid.length === 1 ? "y" : "ies"}: ${valid.map((v) => v.name).join(", ")}.`,
        { mergedIds: valid.map((v) => v.id) },
        req.user?.id,
      );

      res.json({ merged: valid.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to merge enquiries" });
    }
  });

  // ── activity timeline (chatter) ────────────────────────────────────────────

  router.get("/companies/:companyId/crm/enquiries/:id/activities", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
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
        .select({ id: enquiries.id })
        .from(enquiries)
        .where(and(eq(enquiries.id, id), eq(enquiries.companyId, parseInt(req.params.companyId))));
      if (!owned) return res.status(404).json({ error: "Enquiry not found" });
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

  // ── reporting ──────────────────────────────────────────────────────────────

  router.get("/companies/:companyId/crm/reports/pipeline", requireAuth, requireCompanyAccess, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
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

      const bySource = [...new Set(rows.map((r) => r.source ?? "unknown"))].map((source) => {
        const items = rows.filter((r) => (r.source ?? "unknown") === source);
        return {
          source,
          count: items.length,
          won: items.filter((r) => r.status === "won").length,
          value: items.reduce((sum, r) => sum + value(r.expectedRevenue), 0),
        };
      });

      const assigneeIds = [...new Set(rows.map((r) => r.assignedTo).filter(Boolean))] as string[];
      const byAssignee = assigneeIds.map((uid) => {
        const items = rows.filter((r) => r.assignedTo === uid);
        return {
          userId: uid,
          name: assigneeName(uid),
          count: items.length,
          won: items.filter((r) => r.status === "won").length,
          value: items.reduce((sum, r) => sum + value(r.expectedRevenue), 0),
        };
      });

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
