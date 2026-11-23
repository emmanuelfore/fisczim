import type { PermissionKey } from "../../shared/permissions.js";
import { userHasPermission } from "./permissions.js";

/**
 * Central accounting permission guard.
 *
 * API keys authenticate a tenant but carry no user role, so they are denied
 * accounting actions unless a future explicit scope is introduced. Session
 * users are checked against the real permission catalog.
 */
export async function requireAccountingPermission(
  req: any,
  res: any,
  companyId: number,
  permission: PermissionKey
): Promise<boolean> {
  if (req.apiKeyCompanyId) {
    res.status(403).json({ message: "API keys cannot perform accounting actions" });
    return false;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }

  const allowed = await userHasPermission(userId, companyId, permission, !!req.user?.isSuperAdmin);
  if (!allowed) {
    res.status(403).json({ message: `You do not have permission to ${permission}.` });
    return false;
  }
  return true;
}

const MANUAL_JOURNAL_HEADER_KEYS = [
  "entryDate",
  "description",
  "branchId",
  "journalType",
  "currency",
  "exchangeRate",
  "postingKey",
  "idempotencyKey",
] as const;

const MANUAL_JOURNAL_LINE_KEYS = [
  "accountCode",
  "accountId",
  "type",
  "debit",
  "credit",
  "amount",
  "memo",
  "branchId",
  "costCenterId",
  "segmentId",
  "currency",
  "exchangeRate",
  "baseAmount",
] as const;

/**
 * Manual journals must not be able to influence control-account checks by
 * supplying a fake `referenceType`. The server always stamps MANUAL.
 */
export function sanitizeManualJournalPayload(body: any): any {
  const source = body && typeof body === "object" ? body : {};
  const clean: Record<string, any> = {};

  for (const key of MANUAL_JOURNAL_HEADER_KEYS) {
    if (source[key] !== undefined) clean[key] = source[key];
  }

  // A free-text reference is useful audit metadata; it is harmless now that
  // referenceType is forced to MANUAL by the server.
  if (typeof source.referenceId === "string" && source.referenceId.trim()) {
    clean.referenceId = source.referenceId.trim();
  }
  clean.referenceType = "MANUAL";

  if (Array.isArray(source.lines)) {
    clean.lines = source.lines.map((line: any) => {
      const out: Record<string, any> = {};
      const row = line && typeof line === "object" ? line : {};
      for (const key of MANUAL_JOURNAL_LINE_KEYS) {
        if (row[key] !== undefined) out[key] = row[key];
      }
      return out;
    });
  }

  if (clean.idempotencyKey && !clean.postingKey) {
    clean.postingKey = `manual-journal:${clean.idempotencyKey}`;
    delete clean.idempotencyKey;
  }
  return clean;
}

/** Strip reconciliation state from imported bank statement lines. */
export function sanitizeBankStatementLines(lines: any): any[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line: any) => {
    const row = line && typeof line === "object" ? line : {};
    const clean: Record<string, any> = {};
    if (row.date !== undefined) clean.date = row.date;
    if (row.description !== undefined) clean.description = String(row.description || "").trim();
    if (row.amount !== undefined) clean.amount = row.amount;
    return clean;
  });
}
