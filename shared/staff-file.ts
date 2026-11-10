/**
 * Staff file rules, shared by the payroll routes and the HR screens.
 *
 * A scanned document is only half a record. It also has to say when it stops being
 * valid (an expired contract does not protect anyone, least of all in a labour
 * dispute), whether the signed original is actually in the cabinet, and whether the
 * employer requires it at all. Those three judgements live here so a badge on a list,
 * a radar on a dashboard and a server-side validation message cannot disagree.
 */

export const EMPLOYEE_DOCUMENT_TYPES = [
  "CONTRACT",
  "ID_COPY",
  "NSSA",
  "MEDICAL",
  "CERTIFICATE",
  "OTHER",
] as const;

export type EmployeeDocumentType = (typeof EMPLOYEE_DOCUMENT_TYPES)[number];

const DOCUMENT_LABELS: Record<string, string> = {
  CONTRACT: "Employment contract",
  ID_COPY: "ID copy",
  NSSA: "NSSA registration",
  MEDICAL: "Medical aid certificate",
  CERTIFICATE: "Qualification certificate",
  OTHER: "Other document",
};

export function documentTypeLabel(type: unknown): string {
  const key = String(type ?? "").toUpperCase();
  return DOCUMENT_LABELS[key] ?? key ?? "Document";
}

export function isKnownDocumentType(type: unknown): type is EmployeeDocumentType {
  return EMPLOYEE_DOCUMENT_TYPES.includes(String(type ?? "").toUpperCase() as EmployeeDocumentType);
}

/** Documents that carry a legal life span. Bank slips and certificates usually do not. */
export const EXPIRY_TRACKED_TYPES: EmployeeDocumentType[] = ["CONTRACT", "MEDICAL", "NSSA", "ID_COPY"];

/** A document row, narrowed to what the expiry maths needs. */
export interface ExpiryBearing {
  expiryDate?: Date | string | null;
}

export type DocumentExpiryState = "NONE" | "VALID" | "EXPIRING" | "EXPIRED";

/**
 * How close a document is to useless. `warningDays` comes from the company's own
 * settings, because a 30-day radar on a monthly contract and a 90-day one on a
 * work permit are not the same problem.
 */
export function documentExpiryState(doc: ExpiryBearing, warningDays = 30, today?: Date): DocumentExpiryState {
  if (!doc.expiryDate) return "NONE";
  const expiry = new Date(doc.expiryDate);
  if (Number.isNaN(expiry.getTime())) return "NONE";

  const now = today ?? new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfExpiry = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

  if (startOfExpiry < startOfToday) return "EXPIRED";

  const horizon = new Date(startOfToday);
  horizon.setDate(horizon.getDate() + Math.max(0, warningDays));
  return startOfExpiry <= horizon ? "EXPIRING" : "VALID";
}

export interface StaffFileCheck {
  /** Types this employer requires on every active employee's file. */
  required: string[];
  /** Required types with no document at all. */
  missing: string[];
  /** Required types present but expired. */
  expired: string[];
  /** Any document, required or not, expiring inside the warning window. */
  expiring: string[];
  /** Required documents on file, none of them expired. */
  complete: boolean;
}

/**
 * The state of one employee's file against the company's required list. `docs` is
 * every document attached to that employee, in any order.
 */
export function staffFileStatus(
  docs: Array<ExpiryBearing & { documentType?: unknown }>,
  requiredTypes: string[] = [],
  warningDays = 30,
  today?: Date,
): StaffFileCheck {
  const required = [...new Set((requiredTypes ?? []).map((t) => String(t).toUpperCase()).filter(Boolean))];
  const present = new Map<string, DocumentExpiryState>();

  const expiring: string[] = [];
  for (const doc of docs ?? []) {
    const type = String(doc.documentType ?? "OTHER").toUpperCase();
    const state = documentExpiryState(doc, warningDays, today);
    if (state === "EXPIRING") expiring.push(type);
    // The worst state for a type wins: a file with a valid copy and an expired copy
    // of the same document is an expired file.
    const current = present.get(type);
    const severity = { NONE: 0, VALID: 1, EXPIRING: 2, EXPIRED: 3 } as const;
    if (!current || severity[state] > severity[current]) present.set(type, state);
  }

  const missing: string[] = [];
  const expired: string[] = [];
  for (const type of required) {
    const state = present.get(type);
    if (!state) missing.push(type);
    else if (state === "EXPIRED") expired.push(type);
  }

  return {
    required,
    missing,
    expired,
    expiring: [...new Set(expiring)],
    complete: missing.length === 0 && expired.length === 0,
  };
}

/**
 * The next staff number for a company: prefix + zero-padded counter, e.g. "FS" + 7
 * becomes "FS0007". Employers read their own numbers out loud to fingerprint
 * machines and payslips, so the shape is a per-company setting rather than a constant.
 */
export function nextStaffNumber(prefix: string, digits: number, counter: number): string {
  const cleanPrefix = String(prefix ?? "").trim().toUpperCase();
  const width = Math.min(Math.max(Number(digits) || 1, 1), 12);
  const value = Math.max(Number(counter) || 1, 1);
  return `${cleanPrefix}${String(value).padStart(width, "0")}`;
}
