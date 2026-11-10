import { and, eq, inArray } from "drizzle-orm";
import { posShifts } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage.js";
import { checkCompanyAccess } from "./company-auth.js";

/**
 * Which company a POS shift route is acting for.
 *
 * Shift routes are addressed by shift id alone (`/api/pos/shifts/:id/close`), and in the
 * live database `pos_shifts` has no primary key — migrations/0084 had to leave it out
 * because two tenants hold a shift with id 1. So an id by itself does not identify a row:
 * a close or a reconcile that filters on id alone writes every tenant's shift that shares
 * it, and a lookup by id can hand another tenant's shift back as the caller's own.
 *
 * The caller names its company the way every other route reads it (path, query, body, or
 * the X-Company-ID header the web client sends). The mobile POS sends no such header, so
 * when nothing names one the owner is inferred from the caller's own memberships — and a
 * shift id that two of the caller's companies both hold is refused rather than guessed at.
 */
export async function resolveShiftCompanyId(req: any, shiftId: number): Promise<number | undefined> {
  const userId = req.user?.id;
  if (!userId) return undefined;

  const named = Number(req.params?.companyId ?? req.query?.companyId ?? req.body?.companyId ?? req.headers?.["x-company-id"]);
  if (Number.isInteger(named) && named > 0) {
    // API keys authenticate a whole tenant and must not be pointed at another one.
    if (req.apiKeyCompanyId && named !== Number(req.apiKeyCompanyId)) return undefined;
    return (await checkCompanyAccess(storage, req.user, named)) ? named : undefined;
  }

  const memberships = await storage.getCompanies(userId);
  if (memberships.length === 0) return undefined;

  const owners = await db
    .select({ companyId: posShifts.companyId })
    .from(posShifts)
    .where(and(eq(posShifts.id, shiftId), inArray(posShifts.companyId, memberships.map((c: any) => Number(c.id)))))
    .groupBy(posShifts.companyId);

  return owners.length === 1 ? Number(owners[0].companyId) : undefined;
}
