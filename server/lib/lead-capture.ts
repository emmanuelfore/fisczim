import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db.js";
import {
  companies,
  crmStages,
  customers,
  enquiryActivities,
  enquiries,
} from "../../shared/schema.js";

/**
 * The single way an unattended submission becomes an enquiry: the public website
 * form, a Meta instant form, a TikTok lead ad and a page comment all arrive here,
 * so the company check, the opening stage, the returning-prospect rule and the
 * first chatter entry are decided once rather than restated per caller.
 */

const DEFAULT_STAGES = [
  { name: "New", sequence: 0, probability: 10, isWon: false, isLost: false, color: "slate" },
  { name: "Contacted", sequence: 1, probability: 30, isWon: false, isLost: false, color: "blue" },
  { name: "Qualified", sequence: 2, probability: 50, isWon: false, isLost: false, color: "amber" },
  { name: "Proposal", sequence: 3, probability: 70, isWon: false, isLost: false, color: "violet" },
  { name: "Won", sequence: 4, probability: 100, isWon: true, isLost: false, color: "emerald" },
  { name: "Lost", sequence: 5, probability: 0, isWon: false, isLost: true, color: "rose" },
];

/** Every company gets the default pipeline the first time it is touched. */
export async function ensureStages(companyId: number) {
  const existing = await db.select().from(crmStages).where(eq(crmStages.companyId, companyId));
  if (existing.length) return existing;
  return db
    .insert(crmStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, companyId })))
    .returning();
}

/** Find an existing customer for this company by phone or email. */
export async function linkCustomer(
  companyId: number,
  phone?: string | null,
  email?: string | null,
) {
  const normalizedPhone = phone?.trim();
  const normalizedEmail = email?.trim();
  if (!normalizedPhone && !normalizedEmail) return null;

  const matches = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        or(
          normalizedPhone ? eq(customers.phone, normalizedPhone) : undefined,
          normalizedPhone ? eq(customers.mobile, normalizedPhone) : undefined,
          normalizedEmail ? ilike(customers.email, normalizedEmail) : undefined,
        ),
      ),
    )
    .limit(1);

  return matches[0]?.id ?? null;
}

/** Most recent enquiry for this phone/email, if the person has been in before. */
export async function findPriorEnquiry(
  companyId: number,
  phone?: string | null,
  email?: string | null,
) {
  const p = phone?.trim();
  const e = email?.trim();
  if (!p && !e) return null;
  const [row] = await db
    .select()
    .from(enquiries)
    .where(
      and(
        eq(enquiries.companyId, companyId),
        or(p ? eq(enquiries.phone, p) : undefined, e ? ilike(enquiries.email, e) : undefined),
      ),
    )
    .orderBy(desc(enquiries.createdAt))
    .limit(1);
  return row ?? null;
}

export const SOCIAL_UTM_SOURCES = ["facebook", "instagram", "tiktok"];

export interface LeadCaptureInput {
  companyId: number;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  interest?: unknown;
  notes?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  activityBody: string;
  activityMetadata?: Record<string, unknown>;
}

export type LeadCaptureResult =
  | { ok: true; id: number; returning: boolean; reusedExisting: boolean }
  | { ok: false; status: number; error: string };

function text(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function captureLead(input: LeadCaptureInput): Promise<LeadCaptureResult> {
  const name = text(input.name);
  if (!name) return { ok: false, status: 400, error: "Name is required" };

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, input.companyId));
  if (!company) return { ok: false, status: 404, error: "Unknown company" };

  const phone = text(input.phone);
  const email = text(input.email);
  const utmSource = text(input.utmSource);
  const source = SOCIAL_UTM_SOURCES.includes((utmSource || "").toLowerCase()) ? "social" : "web";

  const prior = await findPriorEnquiry(input.companyId, phone, email);
  if (prior && prior.status === "open") {
    // Same rule the authenticated capture uses: a person already in the pipeline
    // gets a chatter entry, not a second card competing for the same phone number.
    await db.insert(enquiryActivities).values({
      enquiryId: prior.id,
      type: "returned",
      body: input.activityBody,
      metadata: input.activityMetadata ?? { source },
    });
    await db
      .update(enquiries)
      .set({ lastActivityAt: new Date() })
      .where(eq(enquiries.id, prior.id));
    return { ok: true, id: prior.id, returning: true, reusedExisting: true };
  }

  const stages = await ensureStages(input.companyId);
  const openingStage = stages.sort((a, b) => a.sequence - b.sequence)[0] ?? null;
  const customerId = await linkCustomer(input.companyId, phone, email);

  const [created] = await db
    .insert(enquiries)
    .values({
      companyId: input.companyId,
      name,
      phone,
      email,
      interest: text(input.interest),
      notes: text(input.notes),
      source,
      stageId: openingStage?.id ?? null,
      status: "open",
      tags: prior ? ["returning"] : [],
      customerId,
      assignedTo: prior?.assignedTo ?? null,
      utmSource,
      utmMedium: text(input.utmMedium),
      utmCampaign: text(input.utmCampaign),
    })
    .returning();

  await db.insert(enquiryActivities).values({
    enquiryId: created.id,
    type: "created",
    body: input.activityBody,
    metadata: input.activityMetadata ?? { source },
  });

  return { ok: true, id: created.id, returning: Boolean(prior), reusedExisting: false };
}
