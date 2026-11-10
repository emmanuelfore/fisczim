import { and, asc, eq, ilike, or } from "drizzle-orm";
import {
  crmStages,
  customers,
  enquiries,
  enquiryActivities,
} from "../../shared/schema.js";

/**
 * Bridges the CRM pipeline and vehicle imports.
 *
 * The CRM owns the lead and its chatter; the vehicle module owns stock, pricing
 * and accounting. These helpers only write the join points: the customer on an
 * enquiry, the activity trail, and the one-way "sold ⇒ enquiry won" update.
 */

type Executor = any;

/** Append an activity to an enquiry and bump its last-activity stamp. */
export async function logEnquiryVehicleActivity(
  executor: Executor,
  enquiryId: number,
  body: string,
  metadata: unknown,
  userId?: string | null,
) {
  await executor.insert(enquiryActivities).values({
    enquiryId,
    type: "vehicle",
    body,
    metadata: metadata ?? null,
    userId: userId ?? null,
  });
  await executor
    .update(enquiries)
    .set({ lastActivityAt: new Date() })
    .where(eq(enquiries.id, enquiryId));
}

/**
 * Resolve the customer for an enquiry, creating one from the captured contact
 * details when needed. Runs on the caller's transaction so a reservation and
 * the new customer commit together.
 */
export async function ensureEnquiryCustomer(
  tx: Executor,
  companyId: number,
  enquiry: {
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    customerId?: number | null;
  },
): Promise<{ customerId: number; created: boolean }> {
  if (enquiry.customerId) return { customerId: enquiry.customerId, created: false };

  const phone = enquiry.phone?.trim();
  const email = enquiry.email?.trim();
  const matches: any[] = [];
  if (phone) matches.push(eq(customers.phone, phone), eq(customers.mobile, phone));
  if (email) matches.push(ilike(customers.email, email));

  if (matches.length) {
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.companyId, companyId), or(...matches)))
      .limit(1);
    if (existing) {
      await tx
        .update(enquiries)
        .set({ customerId: existing.id, updatedAt: new Date() })
        .where(eq(enquiries.id, enquiry.id));
      return { customerId: existing.id, created: false };
    }
  }

  const [created] = await tx
    .insert(customers)
    .values({
      companyId,
      name: enquiry.name,
      phone: enquiry.phone ?? null,
      email: enquiry.email ?? null,
      notes: enquiry.notes ?? null,
    })
    .returning();
  await tx
    .update(enquiries)
    .set({ customerId: created.id, updatedAt: new Date() })
    .where(eq(enquiries.id, enquiry.id));
  return { customerId: created.id, created: true };
}

/**
 * One-way close: when a linked vehicle is invoiced or delivered, move an open
 * enquiry to the company's won stage and record why. A closed or already-won
 * enquiry is left alone, and companies without a won stage are a no-op.
 */
export async function markEnquiryWon(
  tx: Executor,
  companyId: number,
  enquiryId: number,
  body: string,
  metadata: unknown,
  userId?: string | null,
) {
  const [enquiry] = await tx
    .select()
    .from(enquiries)
    .where(and(eq(enquiries.id, enquiryId), eq(enquiries.companyId, companyId)));
  if (!enquiry || enquiry.status !== "open") return enquiry ?? null;

  const [wonStage] = await tx
    .select()
    .from(crmStages)
    .where(and(eq(crmStages.companyId, companyId), eq(crmStages.isWon, true)))
    .orderBy(asc(crmStages.sequence))
    .limit(1);
  if (!wonStage) return enquiry;

  const [updated] = await tx
    .update(enquiries)
    .set({
      stageId: wonStage.id,
      status: "won",
      lostReason: null,
      updatedAt: new Date(),
    })
    .where(eq(enquiries.id, enquiry.id))
    .returning();

  await logEnquiryVehicleActivity(tx, enquiry.id, body, metadata, userId);
  return updated;
}
