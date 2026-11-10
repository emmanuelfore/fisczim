/**
 * Standard operating procedures: versioned read-and-sign.
 *
 * The control is not "the file exists on a drive", it is "every person this version
 * applies to has read this version and signed it", which is what an auditor or a
 * disciplinary hearing asks for. Three rules shape every route here:
 *
 * 1. A published version is immutable. Reissuing means a new version, because a
 *    signature can only ever point at the text it was shown against.
 * 2. Signatures belong to a version, so a reissue needs fresh signatures - the old
 *    ones stay on the superseded row where they are honest evidence.
 * 3. The typed name is the signature, so it must match the account that signed it.
 *    A tick box proves nothing.
 *
 * Every read and every write is scoped by company on the document row *and* on any
 * child row, so another tenant's document id is a 404 rather than a leak.
 */
import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../../db.js";
import {
  branches,
  companyUsers,
  departments,
  hrSopAcknowledgements,
  hrSopDocuments,
  hrSopQuestions,
  hrSopReaders,
  users,
} from "../../../shared/schema.js";
import { userHasPermission } from "../../lib/permissions.js";
import {
  addDaysIso,
  auditPayroll,
  boolFromText,
  getTargetCompanyId,
  PAYROLL_APPROVAL_ROLES,
  PAYROLL_READ_ROLES,
  PAYROLL_WRITE_ROLES,
  requirePayrollApproval,
  requirePayrollWrite,
  resolvePayrollRole,
  respondPayrollError,
  respondValidationErrors,
  toNumber,
  todayLocalIso,
} from "./payroll.js";

const router = Router({ mergeParams: true });

/**
 * This router is mounted ahead of the payroll.view gate in payroll.ts, on purpose: the
 * person a read-and-sign procedure is aimed at is usually a machine operator or a clerk
 * with no payroll rights at all, and behind that gate they could never list what is
 * waiting on them or sign it. So the split is enforced here instead.
 *
 * The floor is membership of the company - nothing in this module crosses a tenant, and
 * an account that does not belong to the company in the URL is turned away before a read.
 * On top of that floor, the reader paths stay open to anyone named on a version, while
 * everything a manager does requires payroll.view at the least.
 */
router.use(async (req: any, res: any, next: any) => {
  try {
    const companyId = getTargetCompanyId(req);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "User not authenticated" });
    }
    const role = await resolvePayrollRole(req, companyId);
    if (!role) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You are not a member of this company, so none of its procedures apply to you.",
      });
    }
    req.payrollRole = role;
    next();
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/** The states a reader may ever be shown. DRAFT and ARCHIVED are management-only. */
const READER_VISIBLE_STATUSES = ["PUBLISHED", "SUPERSEDED"];
const SOP_STATUSES = ["DRAFT", "PUBLISHED", "SUPERSEDED", "ARCHIVED"];
/** A signature is only asked for on the live version. */
const SIGNABLE_STATUS = "PUBLISHED";
/** A reader who gets this many of the questions right has understood the procedure. */
const EXAM_PASS_MARK = 80;
/** The picker the UI can always offer, whatever this company has written yet. */
const BASELINE_CATEGORIES = ["GENERAL", "PAYROLL", "HR", "HEALTH_SAFETY", "IT", "OPERATIONS"];

const IMMUTABLE_MESSAGE = "Published versions are immutable; issue a new version.";
const ALREADY_SIGNED_MESSAGE = "You have already signed this version.";
const SIGNATURE_NAME_MESSAGE = "Sign with the name on your account.";

/** What the list shows first: the version people are being asked to sign, then the rest. */
function statusRank(status: string): number {
  const index = ["PUBLISHED", "DRAFT", "SUPERSEDED", "ARCHIVED"].indexOf(String(status || "").toUpperCase());
  return index === -1 ? SOP_STATUSES.length : index;
}

function isUniqueViolation(err: any): boolean {
  return err?.code === "23505";
}

function textParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * `z.coerce.boolean()` is `Boolean()` in disguise: "false" from a form field would
 * read as true. The payroll router already says what the words mean, so reuse it -
 * wrapped, because this module is imported by that one and the reference has to be
 * resolved when a request runs rather than while the module graph is still loading.
 */
const boolField = (fallback: boolean) =>
  z.preprocess((value) => boolFromText(value), z.boolean().default(fallback));
const optionalBoolField = () => z.preprocess((value) => boolFromText(value), z.boolean().optional());

/** `YYYY-MM-DD` or nothing at all; a half-typed date is a validation error, not a null. */
const effectiveDateField = () =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate must be YYYY-MM-DD").nullable().optional()
  );

const acknowledgementDaysField = (required: boolean) => {
  const field = z.coerce
    .number()
    .int("acknowledgementDays must be a whole number of days")
    .min(0, "acknowledgementDays must be between 0 and 365")
    .max(365, "acknowledgementDays must be between 0 and 365");
  return required ? field.default(14) : field.optional();
};

const codeField = z.string().trim().min(1, "code is required");
const titleField = z.string().trim().min(1, "title is required");

const documentFields = {
  code: codeField,
  title: titleField,
  category: z.string().trim().min(1, "category must not be blank").max(60).nullable().optional(),
  body: z.string().nullable().optional(),
  effectiveDate: effectiveDateField(),
  requiresExam: optionalBoolField(),
  acknowledgementDays: acknowledgementDaysField(false),
  departmentId: z.coerce.number().int().nullable().optional(),
  branchId: z.coerce.number().int().nullable().optional(),
  authorNote: z.string().trim().nullable().optional(),
};

const createDocumentSchema = z.object({
  code: documentFields.code,
  title: documentFields.title,
  category: documentFields.category,
  body: documentFields.body,
  effectiveDate: documentFields.effectiveDate,
  requiresExam: boolField(false),
  acknowledgementDays: acknowledgementDaysField(true),
  departmentId: documentFields.departmentId,
  branchId: documentFields.branchId,
  authorNote: documentFields.authorNote,
});

/** Every key is optional here; a key the client did not send is left alone. */
const updateDocumentSchema = z.object({ ...documentFields, code: codeField.optional(), title: titleField.optional() });

const questionSchema = z.object({
  question: z.string().trim().min(1, "question is required"),
  options: z
    .array(z.string().trim().min(1, "each option must be a non-empty string"))
    .min(2, "an exam question needs at least 2 options")
    .max(8, "an exam question can have at most 8 options"),
  correctIndex: z.coerce.number().int().min(0),
  explanation: z.string().trim().nullable().optional(),
  questionOrder: z.coerce.number().int().min(1).optional(),
});

const readersSchema = z.object({
  userIds: z.array(z.string().trim().min(1, "each reader must be a user id")).max(500).default([]),
});

const acknowledgeSchema = z.object({
  signatureName: z.string().min(1, "signatureName is required"),
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number().int(),
        selectedIndex: z.coerce.number().int().min(0),
      })
    )
    .optional(),
});

/** The columns every document read needs, with the names a human recognises. */
const documentColumns = {
  id: hrSopDocuments.id,
  companyId: hrSopDocuments.companyId,
  code: hrSopDocuments.code,
  title: hrSopDocuments.title,
  category: hrSopDocuments.category,
  version: hrSopDocuments.version,
  status: hrSopDocuments.status,
  body: hrSopDocuments.body,
  effectiveDate: hrSopDocuments.effectiveDate,
  requiresExam: hrSopDocuments.requiresExam,
  acknowledgementDays: hrSopDocuments.acknowledgementDays,
  departmentId: hrSopDocuments.departmentId,
  departmentName: departments.name,
  branchId: hrSopDocuments.branchId,
  branchName: branches.name,
  authorNote: hrSopDocuments.authorNote,
  publishedBy: hrSopDocuments.publishedBy,
  publishedAt: hrSopDocuments.publishedAt,
  supersededById: hrSopDocuments.supersededById,
  createdAt: hrSopDocuments.createdAt,
  updatedAt: hrSopDocuments.updatedAt,
  publishedByName: users.name,
};

async function selectDocuments(query: any, conditions: any[]): Promise<any[]> {
  return query
    .select(documentColumns)
    .from(hrSopDocuments)
    .leftJoin(departments, eq(hrSopDocuments.departmentId, departments.id))
    .leftJoin(branches, eq(hrSopDocuments.branchId, branches.id))
    .leftJoin(users, eq(hrSopDocuments.publishedBy, users.id))
    .where(and(...conditions));
}

/** Company-scoped on purpose: a document id from another tenant does not exist here. */
async function loadDocument(query: any, companyId: number, documentId: number): Promise<any | undefined> {
  const rows = await selectDocuments(query, [
    eq(hrSopDocuments.companyId, companyId),
    eq(hrSopDocuments.id, documentId),
  ]);
  return rows[0];
}

function publicDocument(row: any) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    version: row.version,
    status: row.status,
    effectiveDate: row.effectiveDate,
    requiresExam: row.requiresExam,
    acknowledgementDays: row.acknowledgementDays,
    departmentId: row.departmentId,
    departmentName: row.departmentName ?? null,
    branchId: row.branchId,
    branchName: row.branchName ?? null,
    authorNote: row.authorNote ?? null,
    publishedAt: row.publishedAt,
    publishedByName: row.publishedByName ?? null,
    updatedAt: row.updatedAt,
  };
}

/** Detail keeps the markdown a reader signs against; the list stays light. */
function documentDetail(row: any) {
  return {
    ...publicDocument(row),
    body: row.body ?? "",
    publishedBy: row.publishedBy ?? null,
    supersededById: row.supersededById ?? null,
    createdAt: row.createdAt,
  };
}

function acknowledgementShape(row: any) {
  return {
    acknowledgedAt: row.acknowledgedAt,
    signatureName: row.signatureName,
    examScore: row.examScore == null ? null : toNumber(row.examScore),
    examPassed: row.examPassed,
  };
}

/**
 * `pg` hands decimals back as strings and jsonb as parsed values, but a row written
 * before normalisation can arrive the other way round. An exam that cannot read its
 * own options must fail the signature rather than guess at it.
 */
function optionsOf(question: any): string[] {
  const raw = question?.options;
  if (Array.isArray(raw)) return raw.map((option) => String(option));
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((option) => String(option));
    } catch {
      /* falls through to empty below */
    }
  }
  return [];
}

function questionShape(row: any, withAnswerKey: boolean) {
  const shared = {
    id: row.id,
    question: row.question,
    options: optionsOf(row),
    questionOrder: row.questionOrder,
  };
  // The answer key is withheld until the signature exists. Handing it out first would
  // let a reader copy the answers off the API without reading a word of the procedure.
  if (!withAnswerKey) return shared;
  return { ...shared, correctIndex: row.correctIndex, explanation: row.explanation ?? null };
}

async function hasPayrollWrite(req: any, companyId: number): Promise<boolean> {
  if (req.user?.isSuperAdmin) return true;
  const userId = req.user?.id;
  if (!userId) return false;
  if (await userHasPermission(userId, companyId, "payroll.write", false)) return true;
  // The pre-permission roles still own this area, so they still pass.
  return !!req.payrollRole && PAYROLL_WRITE_ROLES.has(req.payrollRole);
}

/** The library is payroll business: drafts, reader lists and signature counts are not for a passing glance. */
async function hasPayrollView(req: any, companyId: number): Promise<boolean> {
  if (req.user?.isSuperAdmin) return true;
  const userId = req.user?.id;
  if (!userId) return false;
  if (await userHasPermission(userId, companyId, "payroll.view", false)) return true;
  return !!req.payrollRole && PAYROLL_READ_ROLES.has(req.payrollRole);
}

async function requireSopViewer(req: any, res: any, next: any) {
  try {
    const companyId = getTargetCompanyId(req);
    if (!(await hasPayrollView(req, companyId))) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Payroll view permission required to browse the procedure library.",
      });
    }
    next();
  } catch (err: any) {
    respondPayrollError(res, err);
  }
}

/**
 * Coverage is read by whoever can change the reader list or publish it, so either
 * payroll.write or payroll.approve is enough; a plain viewer must not see who has not
 * signed yet.
 */
async function canManageSop(req: any, companyId: number): Promise<boolean> {
  if (req.user?.isSuperAdmin) return true;
  const userId = req.user?.id;
  if (!userId) return false;
  if (await userHasPermission(userId, companyId, "payroll.write", false)) return true;
  if (await userHasPermission(userId, companyId, "payroll.approve", false)) return true;
  return !!req.payrollRole && (PAYROLL_WRITE_ROLES.has(req.payrollRole) || PAYROLL_APPROVAL_ROLES.has(req.payrollRole));
}

function requireSopWrite(req: any, res: any, next: any) {
  return requirePayrollWrite(req, res, next);
}

function requireSopApproval(req: any, res: any, next: any) {
  return requirePayrollApproval(req, res, next);
}

async function requireSopManage(req: any, res: any, next: any) {
  try {
    const companyId = getTargetCompanyId(req);
    if (!req.user?.id) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "User not authenticated" });
    }
    if (!(await canManageSop(req, companyId))) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Payroll write or approval permission required",
      });
    }
    next();
  } catch (err: any) {
    respondPayrollError(res, err);
  }
}

function notFound(res: any) {
  return res.status(404).json({ error: "NOT_FOUND", message: "SOP document not found for this company" });
}

function refuseImmutable(res: any) {
  return res.status(409).json({ error: "SOP_VERSION_IMMUTABLE", message: IMMUTABLE_MESSAGE });
}

/**
 * Only the pieces the client actually sent are written: drizzle skips undefined, and a
 * null in a NOT NULL column would break the row rather than clear it.
 */
function collectDocumentUpdates(data: Record<string, any>) {
  const updates: Record<string, unknown> = {};
  if (data.code !== undefined) updates.code = data.code;
  if (data.title !== undefined) updates.title = data.title;
  if (data.category !== undefined) updates.category = data.category ?? "GENERAL";
  if (data.body !== undefined) updates.body = data.body ?? "";
  if (data.effectiveDate !== undefined) updates.effectiveDate = data.effectiveDate ?? null;
  if (data.requiresExam !== undefined) updates.requiresExam = data.requiresExam;
  if (data.acknowledgementDays !== undefined) updates.acknowledgementDays = data.acknowledgementDays;
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId ?? null;
  if (data.branchId !== undefined) updates.branchId = data.branchId ?? null;
  if (data.authorNote !== undefined) updates.authorNote = data.authorNote ?? null;
  return updates;
}

/**
 * A targeting id has to be this company's own, or the document would describe a
 * department in someone else's organisation.
 */
async function belongsToCompany(
  query: any,
  table: any,
  id: number,
  companyId: number
): Promise<boolean> {
  const [row] = await query
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .limit(1);
  return !!row;
}

async function refuseForeignTarget(res: any, data: Record<string, any>, companyId: number) {
  if (data.departmentId) {
    if (!(await belongsToCompany(db, departments, Number(data.departmentId), companyId))) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected department does not belong to this company." });
      return true;
    }
  }
  if (data.branchId) {
    if (!(await belongsToCompany(db, branches, Number(data.branchId), companyId))) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Selected branch does not belong to this company." });
      return true;
    }
  }
  return false;
}

function documentIdOf(req: any): number | null {
  const id = parseInt(req.params.id, 10);
  return Number.isInteger(id) ? id : null;
}

// --- Documents --------------------------------------------------------------

/**
 * GET /documents
 *
 * A viewer is shown the versions people have been asked to sign and the history behind
 * them; only someone who can edit sees drafts and withdrawn ones. Reader and signature
 * counts come back with the rows because the list is where a manager decides what is
 * outstanding.
 */
router.get("/documents", requireSopViewer, async (req: any, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const canWrite = await hasPayrollWrite(req, companyId);
    const statusFilter = textParam(req.query.status)?.toUpperCase();
    const categoryFilter = textParam(req.query.category)?.toUpperCase();
    const search = textParam(req.query.q);

    const conditions: any[] = [eq(hrSopDocuments.companyId, companyId)];
    if (!canWrite) conditions.push(inArray(hrSopDocuments.status, READER_VISIBLE_STATUSES));
    if (statusFilter) conditions.push(eq(hrSopDocuments.status, statusFilter));
    if (categoryFilter) conditions.push(eq(hrSopDocuments.category, categoryFilter));
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(ilike(hrSopDocuments.title, like), ilike(hrSopDocuments.code, like)));
    }

    const rows = await selectDocuments(db, conditions);

    // Totals drive the tab badges, so they count what this requester may see with the
    // narrowing filters removed - otherwise filtering to one category would look like
    // the rest of the library had emptied.
    const visibility: any[] = [eq(hrSopDocuments.companyId, companyId)];
    if (!canWrite) visibility.push(inArray(hrSopDocuments.status, READER_VISIBLE_STATUSES));
    const totalRows = await db
      .select({ status: hrSopDocuments.status, count: sql<number>`count(*)::int` })
      .from(hrSopDocuments)
      .where(and(...visibility))
      .groupBy(hrSopDocuments.status);
    const totals: Record<string, number> = { draft: 0, published: 0, superseded: 0, archived: 0 };
    for (const row of totalRows) {
      const key = String(row.status ?? "").toLowerCase();
      if (key in totals) totals[key] = toNumber(row.count);
    }

    const ids = rows.map((row: any) => row.id);
    const readerCounts = new Map<number, number>();
    const signedCounts = new Map<number, number>();
    const mineByDocument = new Map<number, any>();
    if (ids.length > 0) {
      // Two reads for the whole page rather than one per document: a company's library
      // is tens of rows, and the grouping is arithmetic the API can do for free.
      const readerRows = await db
        .select({ sopId: hrSopReaders.sopId, userId: hrSopReaders.userId })
        .from(hrSopReaders)
        .where(and(eq(hrSopReaders.companyId, companyId), inArray(hrSopReaders.sopId, ids)));
      for (const reader of readerRows) {
        readerCounts.set(reader.sopId, (readerCounts.get(reader.sopId) ?? 0) + 1);
      }

      const ackRows = await db
        .select({
          sopId: hrSopAcknowledgements.sopId,
          userId: hrSopAcknowledgements.userId,
          acknowledgedAt: hrSopAcknowledgements.acknowledgedAt,
          signatureName: hrSopAcknowledgements.signatureName,
          examScore: hrSopAcknowledgements.examScore,
          examPassed: hrSopAcknowledgements.examPassed,
        })
        .from(hrSopAcknowledgements)
        .where(and(eq(hrSopAcknowledgements.companyId, companyId), inArray(hrSopAcknowledgements.sopId, ids)));
      for (const ack of ackRows) {
        signedCounts.set(ack.sopId, (signedCounts.get(ack.sopId) ?? 0) + 1);
        if (req.user?.id && String(ack.userId) === String(req.user.id)) {
          mineByDocument.set(ack.sopId, acknowledgementShape(ack));
        }
      }
    }

    const documents = rows
      .map((row: any) => ({
        ...publicDocument(row),
        readerCount: readerCounts.get(row.id) ?? 0,
        signedCount: signedCounts.get(row.id) ?? 0,
        myAcknowledgement: mineByDocument.get(row.id) ?? null,
      }))
      .sort((a: any, b: any) => {
        if (statusRank(a.status) !== statusRank(b.status)) return statusRank(a.status) - statusRank(b.status);
        if (String(a.code) !== String(b.code)) return String(a.code) < String(b.code) ? -1 : 1;
        return toNumber(b.version) - toNumber(a.version);
      });

    res.json({ documents, totals });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * GET /categories
 *
 * The fixed baseline rides along with whatever this company has actually used, so the
 * picker is the same shape in every tenant and a new document is not filed under an
 * invented category.
 */
router.get("/categories", requireSopViewer, async (req: any, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const rows = await db
      .select({ category: hrSopDocuments.category })
      .from(hrSopDocuments)
      .where(and(eq(hrSopDocuments.companyId, companyId), ne(hrSopDocuments.category, "")))
      .groupBy(hrSopDocuments.category);
    const inUse = [...new Set(rows.map((row: any) => String(row.category).trim()).filter(Boolean))].sort();
    res.json({ categories: [...new Set([...BASELINE_CATEGORIES, ...inUse])], inUse });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * POST /documents
 *
 * A new procedure always starts as version 1 in DRAFT. Publishing is a separate,
 * approval-gated decision, so nothing reaches a reader by accident.
 */
router.post("/documents", requireSopWrite, async (req: any, res) => {
  const parsed = createDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const data = parsed.data as Record<string, any>;
    if (await refuseForeignTarget(res, data, companyId)) return;

    const existing = await db
      .select({ id: hrSopDocuments.id })
      .from(hrSopDocuments)
      .where(and(
        eq(hrSopDocuments.companyId, companyId),
        eq(hrSopDocuments.code, data.code),
        eq(hrSopDocuments.version, 1),
      ))
      .limit(1);
    if (existing[0]) {
      return res.status(409).json({
        error: "VALIDATION_ERROR",
        message: `${data.code} version 1 already exists for this company. Edit the draft or issue a new version of ${data.code}.`,
      });
    }

    const [document] = await db
      .insert(hrSopDocuments)
      .values({
        companyId,
        code: data.code,
        title: data.title,
        category: data.category ?? "GENERAL",
        version: 1,
        status: "DRAFT",
        body: data.body ?? "",
        effectiveDate: data.effectiveDate ?? null,
        requiresExam: data.requiresExam ?? false,
        acknowledgementDays: data.acknowledgementDays ?? 14,
        departmentId: data.departmentId ?? null,
        branchId: data.branchId ?? null,
        authorNote: data.authorNote ?? null,
      })
      .returning();

    await auditPayroll(req, "PAYROLL_SOP_DOCUMENT_CREATED", "hr_sop_documents", document.id, {
      code: document.code,
      version: document.version,
      title: document.title,
    });
    res.status(201).json(document);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      const code = String((req.body as any)?.code ?? "");
      return res.status(409).json({
        error: "VALIDATION_ERROR",
        message: `${code} version 1 already exists for this company. Edit the draft or issue a new version of ${code}.`,
      });
    }
    respondPayrollError(res, err);
  }
});

/**
 * PUT /documents/:id
 *
 * DRAFT only. Once a version has been published its text is evidence, so an edit here
 * would silently move the ground under signatures already given against it.
 */
router.put("/documents/:id", requireSopWrite, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  const parsed = updateDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== "DRAFT") return refuseImmutable(res);

    const data = parsed.data as Record<string, any>;
    if (await refuseForeignTarget(res, data, companyId)) return;

    const updates = collectDocumentUpdates(data);
    const [updated] = await db
      .update(hrSopDocuments)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(and(eq(hrSopDocuments.id, documentId), eq(hrSopDocuments.companyId, companyId)))
      .returning();

    await auditPayroll(req, "PAYROLL_SOP_DOCUMENT_UPDATED", "hr_sop_documents", documentId, {
      changedFields: Object.keys(updates),
    });
    res.json(documentDetail(updated));
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        error: "VALIDATION_ERROR",
        message: `That code and version already exist for this company. Issue a new version instead.`,
      });
    }
    respondPayrollError(res, err);
  }
});

/**
 * DELETE /documents/:id
 *
 * A draft can be thrown away; a published version can only be superseded or archived,
 * because its signatures are evidence somebody keeps relying on.
 */
router.delete("/documents/:id", requireSopWrite, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== "DRAFT") {
      return res.status(409).json({
        error: "SOP_VERSION_NOT_DRAFT",
        message: `Only a DRAFT version can be deleted, and this one is ${document.status}. Archive it or issue a new version instead.`,
      });
    }

    // Questions and readers follow the document through ON DELETE CASCADE, so nothing
    // signed can be orphaned by this delete.
    await db.delete(hrSopDocuments).where(and(eq(hrSopDocuments.id, documentId), eq(hrSopDocuments.companyId, companyId)));
    await auditPayroll(req, "PAYROLL_SOP_DOCUMENT_DELETED", "hr_sop_documents", documentId, {
      code: document.code,
      version: document.version,
    });
    res.json({ deleted: true, id: documentId });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// --- Exam questions ---------------------------------------------------------

async function loadQuestions(query: any, companyId: number, documentId: number): Promise<any[]> {
  return query
    .select({
      id: hrSopQuestions.id,
      companyId: hrSopQuestions.companyId,
      sopId: hrSopQuestions.sopId,
      question: hrSopQuestions.question,
      options: hrSopQuestions.options,
      correctIndex: hrSopQuestions.correctIndex,
      explanation: hrSopQuestions.explanation,
      questionOrder: hrSopQuestions.questionOrder,
    })
    .from(hrSopQuestions)
    .where(and(eq(hrSopQuestions.companyId, companyId), eq(hrSopQuestions.sopId, documentId)))
    .orderBy(asc(hrSopQuestions.questionOrder), asc(hrSopQuestions.id));
}

/**
 * POST /documents/:id/questions
 *
 * The bank belongs to the version. On publish the questions are copied forward with the
 * text, so an answer recorded against version 3 is graded against version 3's wording.
 */
router.post("/documents/:id/questions", requireSopWrite, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  const parsed = questionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== "DRAFT") return refuseImmutable(res);

    const data = parsed.data as Record<string, any>;
    if (data.correctIndex >= data.options.length) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `correctIndex must point at one of the ${data.options.length} options.`,
      });
    }

    const existingQuestions = await loadQuestions(db, companyId, documentId);
    const nextOrder =
      data.questionOrder ??
      (existingQuestions.length > 0
        ? Math.max(...existingQuestions.map((question: any) => toNumber(question.questionOrder))) + 1
        : 1);

    const [question] = await db
      .insert(hrSopQuestions)
      .values({
        companyId,
        sopId: documentId,
        question: data.question,
        options: data.options,
        correctIndex: data.correctIndex,
        explanation: data.explanation ?? null,
        questionOrder: nextOrder,
      } as any)
      .returning();

    await auditPayroll(req, "PAYROLL_SOP_QUESTION_CREATED", "hr_sop_questions", question.id, {
      sopId: documentId,
      questionOrder: question.questionOrder,
    });
    res.status(201).json(question);
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/** DELETE /documents/:id/questions/:questionId - DRAFT only, and this company's only. */
router.delete("/documents/:id/questions/:questionId", requireSopWrite, async (req: any, res) => {
  const documentId = documentIdOf(req);
  const questionId = parseInt(req.params.questionId, 10);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });
  if (!Number.isInteger(questionId)) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid question ID" });
  }

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== "DRAFT") return refuseImmutable(res);

    // Child scoped by the document and the company, so another tenant's question id is
    // not deletable from here.
    const [question] = await db
      .select({ id: hrSopQuestions.id })
      .from(hrSopQuestions)
      .where(and(
        eq(hrSopQuestions.id, questionId),
        eq(hrSopQuestions.sopId, documentId),
        eq(hrSopQuestions.companyId, companyId),
      ))
      .limit(1);
    if (!question) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Question not found for this document" });
    }

    await db
      .delete(hrSopQuestions)
      .where(and(
        eq(hrSopQuestions.id, questionId),
        eq(hrSopQuestions.sopId, documentId),
        eq(hrSopQuestions.companyId, companyId),
      ));
    await auditPayroll(req, "PAYROLL_SOP_QUESTION_DELETED", "hr_sop_questions", questionId, { sopId: documentId });
    res.json({ deleted: true, id: questionId });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// --- Readers ---------------------------------------------------------------

/**
 * POST /documents/:id/readers
 *
 * The set of people a version applies to is replaced whole, inside one transaction: a
 * half-written reader list would make "outstanding signatures" a lie. An empty list is
 * allowed while drafting, but publish refuses it.
 */
router.post("/documents/:id/readers", requireSopWrite, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  const parsed = readersSchema.safeParse(req.body ?? {});
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== "DRAFT") return refuseImmutable(res);

    const requested = [...new Set((parsed.data.userIds as string[]).map((id) => String(id)))];
    if (requested.length > 0) {
      const known = await db
        .select({ userId: companyUsers.userId })
        .from(companyUsers)
        .where(and(eq(companyUsers.companyId, companyId), inArray(companyUsers.userId, requested)));
      const knownIds = new Set(known.map((row: any) => String(row.userId)));
      const offenders = requested.filter((id) => !knownIds.has(id));
      if (offenders.length > 0) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: `These accounts are not users of this company: ${offenders.join(", ")}`,
        });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(hrSopReaders)
        .where(and(eq(hrSopReaders.sopId, documentId), eq(hrSopReaders.companyId, companyId)));
      if (requested.length > 0) {
        await tx.insert(hrSopReaders).values(
          requested.map((userId) => ({ companyId, sopId: documentId, userId, assignedAt: new Date() }))
        );
      }
    });

    await auditPayroll(req, "PAYROLL_SOP_READERS_SET", "hr_sop_documents", documentId, {
      code: document.code,
      version: document.version,
      readerCount: requested.length,
    });
    res.json({ readerCount: requested.length });
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        error: "SOP_READER_DUPLICATE",
        message: "That reader is already on this version.",
      });
    }
    respondPayrollError(res, err);
  }
});

// --- Publishing and reissue ------------------------------------------------

/**
 * POST /documents/:id/publish
 *
 * The gate that makes the control real: no empty text, no version without a named list
 * of readers, no exam without questions. The previous published version of the same code
 * is superseded in the same transaction, so the library never holds two live versions of
 * one procedure.
 */
router.post("/documents/:id/publish", requireSopApproval, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);

    const readerRows = await db
      .select({ userId: hrSopReaders.userId })
      .from(hrSopReaders)
      .where(and(eq(hrSopReaders.companyId, companyId), eq(hrSopReaders.sopId, documentId)));

    const questionRows = document.requiresExam
      ? await loadQuestions(db, companyId, documentId)
      : [];

    const missing: string[] = [];
    if (document.status !== "DRAFT") missing.push(`it is already ${document.status}, only a DRAFT can be published`);
    if (!String(document.body ?? "").trim()) missing.push("the body text is empty");
    if (readerRows.length === 0) missing.push("no readers are assigned");
    if (document.requiresExam && questionRows.length === 0) missing.push("an exam is required but no questions are set");

    if (missing.length > 0) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `Publish refused: ${missing.join("; ")}.`,
        missing,
      });
    }

    const publishedAt = new Date();
    const result = await db.transaction(async (tx) => {
      // One live version per code: the newer row retires the older one and the older row
      // points forward at it, so history reads in both directions.
      const [previous] = await tx
        .select({ id: hrSopDocuments.id })
        .from(hrSopDocuments)
        .where(and(
          eq(hrSopDocuments.companyId, companyId),
          eq(hrSopDocuments.code, document.code),
          eq(hrSopDocuments.status, "PUBLISHED"),
          ne(hrSopDocuments.id, documentId),
        ))
        .limit(1);
      const supersededId = previous?.id ?? null;

      if (supersededId != null) {
        await tx
          .update(hrSopDocuments)
          .set({ status: "SUPERSEDED", supersededById: documentId, updatedAt: publishedAt })
          .where(and(eq(hrSopDocuments.id, supersededId), eq(hrSopDocuments.companyId, companyId)));
      }

      if (supersededId != null && readerRows.length === 0) {
        // Unreachable while publish requires a reader list, but the rule is written down
        // so a reissue never goes out silently unassigned.
        const inherited = await tx
          .select({ userId: hrSopReaders.userId })
          .from(hrSopReaders)
          .where(and(eq(hrSopReaders.companyId, companyId), eq(hrSopReaders.sopId, supersededId)));
        if (inherited.length > 0) {
          await tx.insert(hrSopReaders).values(
            inherited.map((reader: any) => ({
              companyId,
              sopId: documentId,
              userId: reader.userId,
              assignedAt: publishedAt,
            }))
          );
        }
      }

      const [published] = await tx
        .update(hrSopDocuments)
        .set({
          status: "PUBLISHED",
          publishedBy: req.user?.id ?? null,
          publishedAt,
          updatedAt: publishedAt,
        } as any)
        .where(and(eq(hrSopDocuments.id, documentId), eq(hrSopDocuments.companyId, companyId)))
        .returning();

      return { published, supersededId };
    });

    await auditPayroll(req, "PAYROLL_SOP_PUBLISHED", "hr_sop_documents", documentId, {
      code: document.code,
      version: document.version,
      supersededId: result.supersededId,
      readerCount: readerRows.length,
    });
    res.json({ document: documentDetail(result.published), supersededId: result.supersededId });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * POST /documents/:id/new-version
 *
 * Reissue = a fresh DRAFT at max(version)+1 carrying the text and the question bank. The
 * old signatures stay where they are: they prove what was signed against that text only.
 * The effective date deliberately does not carry over - the new version has not been
 * agreed yet.
 */
router.post("/documents/:id/new-version", requireSopWrite, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);

    const openDraft = await db
      .select({ id: hrSopDocuments.id, version: hrSopDocuments.version })
      .from(hrSopDocuments)
      .where(and(
        eq(hrSopDocuments.companyId, companyId),
        eq(hrSopDocuments.code, document.code),
        eq(hrSopDocuments.status, "DRAFT"),
      ))
      .limit(1);
    if (openDraft[0]) {
      return res.status(409).json({
        error: "SOP_DRAFT_EXISTS",
        message: `Version ${openDraft[0].version} of ${document.code} is already being drafted. Edit that draft instead of starting another.`,
      });
    }

    const [highest] = await db
      .select({ maxVersion: sql<number>`coalesce(max(${hrSopDocuments.version}), 0)::int` })
      .from(hrSopDocuments)
      .where(and(eq(hrSopDocuments.companyId, companyId), eq(hrSopDocuments.code, document.code)));
    const nextVersion = toNumber(highest?.maxVersion) + 1;
    const sourceQuestions = await loadQuestions(db, companyId, documentId);

    const created = await db.transaction(async (tx) => {
      const [copy] = await tx
        .insert(hrSopDocuments)
        .values({
          companyId,
          code: document.code,
          title: document.title,
          category: document.category,
          version: nextVersion,
          status: "DRAFT",
          body: document.body ?? "",
          effectiveDate: null,
          requiresExam: document.requiresExam,
          acknowledgementDays: document.acknowledgementDays,
          departmentId: document.departmentId ?? null,
          branchId: document.branchId ?? null,
          authorNote: document.authorNote ?? null,
        })
        .returning();

      if (sourceQuestions.length > 0) {
        await tx.insert(hrSopQuestions).values(
          sourceQuestions.map((question: any) => ({
            companyId,
            sopId: copy.id,
            question: question.question,
            options: question.options,
            correctIndex: question.correctIndex,
            explanation: question.explanation ?? null,
            questionOrder: question.questionOrder,
          }))
        );
      }
      return copy;
    });

    await auditPayroll(req, "PAYROLL_SOP_VERSION_DRAFTED", "hr_sop_documents", created.id, {
      code: created.code,
      version: created.version,
      fromDocumentId: documentId,
      questionCount: sourceQuestions.length,
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        error: "VALIDATION_ERROR",
        message: `That code and version already exist for this company. Issue a new version instead.`,
      });
    }
    respondPayrollError(res, err);
  }
});

/**
 * POST /documents/:id/archive
 *
 * Withdrawal without a replacement (a procedure that no longer applies at all). A draft
 * is deleted instead; only text that people may have signed is archived, so the
 * signatures keep their document.
 */
router.post("/documents/:id/archive", requireSopApproval, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== "PUBLISHED" && document.status !== "SUPERSEDED") {
      return res.status(409).json({
        error: "SOP_STATE_ERROR",
        message: `Only a PUBLISHED or SUPERSEDED version can be archived. current: ${document.status}`,
      });
    }

    const [archived] = await db
      .update(hrSopDocuments)
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(eq(hrSopDocuments.id, documentId), eq(hrSopDocuments.companyId, companyId)))
      .returning();

    await auditPayroll(req, "PAYROLL_SOP_ARCHIVED", "hr_sop_documents", documentId, {
      code: document.code,
      version: document.version,
      from: document.status,
    });
    res.json(documentDetail(archived));
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

// --- One document, its readers and its signature ---------------------------

/**
 * GET /documents/:id
 *
 * A reader gets the text and the questions, never the answer key: the signature has to
 * cost something to be worth anything. Once they have signed, the key and the
 * explanations are theirs - that is how a procedure gets learned rather than passed.
 */
router.get("/documents/:id", async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const canWrite = await hasPayrollWrite(req, companyId);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (!canWrite && !READER_VISIBLE_STATUSES.includes(String(document.status))) return notFound(res);

    const questionRows = await loadQuestions(db, companyId, documentId);
    const readerRows = await db
      .select({ userId: hrSopReaders.userId })
      .from(hrSopReaders)
      .where(and(eq(hrSopReaders.companyId, companyId), eq(hrSopReaders.sopId, documentId)));
    const ackRows = await db
      .select({
        userId: hrSopAcknowledgements.userId,
        acknowledgedAt: hrSopAcknowledgements.acknowledgedAt,
        signatureName: hrSopAcknowledgements.signatureName,
        examScore: hrSopAcknowledgements.examScore,
        examPassed: hrSopAcknowledgements.examPassed,
      })
      .from(hrSopAcknowledgements)
      .where(and(eq(hrSopAcknowledgements.companyId, companyId), eq(hrSopAcknowledgements.sopId, documentId)));

    const myAcknowledgement = req.user?.id
      ? ackRows.find((ack: any) => String(ack.userId) === String(req.user.id)) ?? null
      : null;
    const showAnswerKey = canWrite || !!myAcknowledgement;
    const signedCount = ackRows.length;
    const readerCount = readerRows.length;

    res.json({
      document: documentDetail(document),
      questions: questionRows.map((question: any) => questionShape(question, showAnswerKey)),
      readerCount,
      signedCount,
      myAcknowledgement: myAcknowledgement ? acknowledgementShape(myAcknowledgement) : null,
      coverage: {
        required: readerCount,
        signed: signedCount,
        outstanding: Math.max(readerCount - signedCount, 0),
      },
    });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * GET /documents/:id/coverage
 *
 * Every named reader with their signature beside it. This is the list an auditor asks
 * for, so it is always a real list of people rather than a percentage.
 */
router.get("/documents/:id/coverage", requireSopManage, async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  try {
    const companyId = getTargetCompanyId(req);
    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);

    const rows = await db
      .select({
        userId: hrSopReaders.userId,
        userName: users.name,
        username: users.username,
        email: users.email,
        signedAt: hrSopAcknowledgements.acknowledgedAt,
        examScore: hrSopAcknowledgements.examScore,
        examPassed: hrSopAcknowledgements.examPassed,
      })
      .from(hrSopReaders)
      .leftJoin(users, eq(hrSopReaders.userId, users.id))
      .leftJoin(
        hrSopAcknowledgements,
        and(
          eq(hrSopAcknowledgements.sopId, hrSopReaders.sopId),
          eq(hrSopAcknowledgements.userId, hrSopReaders.userId),
        )
      )
      .where(and(eq(hrSopReaders.companyId, companyId), eq(hrSopReaders.sopId, documentId)))
      .orderBy(asc(hrSopReaders.assignedAt), asc(hrSopReaders.id));

    // An account with no display name still has to be identifiable on the sheet.
    const required = rows.map((row: any) => ({
      userId: row.userId,
      name: row.userName?.trim() || row.username?.trim() || row.email || null,
      email: row.email ?? null,
      signedAt: row.signedAt ?? null,
      examScore: row.examScore == null ? null : toNumber(row.examScore),
      examPassed: row.examPassed ?? null,
    }));
    const signed = required.filter((reader: any) => reader.signedAt != null).length;

    res.json({ required, signed, outstanding: Math.max(required.length - signed, 0) });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * POST /documents/:id/acknowledge
 *
 * The signature itself, and the reason the module exists. Only `payroll.view` is needed -
 * this is the reader's own action, not a management one - but four things are checked in
 * order: the version is open for signing, the requester is on its reader list, the typed
 * name is the name on their account, and (when there is an exam) they passed it.
 *
 * A failed exam records nothing at all. A signature backed by a failed test would be
 * worse than none, because it looks like a control.
 */
router.post("/documents/:id/acknowledge", async (req: any, res) => {
  const documentId = documentIdOf(req);
  if (documentId == null) return res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid document ID" });

  const parsed = acknowledgeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return respondValidationErrors(res, parsed.error.errors);

  try {
    const companyId = getTargetCompanyId(req);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED", message: "User not authenticated" });

    const document = await loadDocument(db, companyId, documentId);
    if (!document) return notFound(res);
    if (document.status !== SIGNABLE_STATUS) {
      return res.status(409).json({
        error: "SOP_NOT_SIGNABLE",
        message: `This version is not open for signatures. current: ${document.status}`,
      });
    }

    const [reader] = await db
      .select({ id: hrSopReaders.id })
      .from(hrSopReaders)
      .where(and(
        eq(hrSopReaders.companyId, companyId),
        eq(hrSopReaders.sopId, documentId),
        eq(hrSopReaders.userId, userId),
      ))
      .limit(1);
    if (!reader) {
      return res.status(403).json({ error: "FORBIDDEN", message: "You are not a reader on this version." });
    }

    const [account] = await db
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!account) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "No account found for this session" });
    }

    const typed = String(parsed.data.signatureName ?? "").trim();
    const ownNames = [account.name, account.username]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase());
    if (!ownNames.includes(typed.toLowerCase())) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: SIGNATURE_NAME_MESSAGE });
    }

    const alreadySigned = await db
      .select({ id: hrSopAcknowledgements.id })
      .from(hrSopAcknowledgements)
      .where(and(
        eq(hrSopAcknowledgements.companyId, companyId),
        eq(hrSopAcknowledgements.sopId, documentId),
        eq(hrSopAcknowledgements.userId, userId),
      ))
      .limit(1);
    if (alreadySigned[0]) {
      return res.status(409).json({ error: "SOP_ALREADY_SIGNED", message: ALREADY_SIGNED_MESSAGE });
    }

    let examScore: number | null = null;
    let examPassed: boolean | null = null;
    if (document.requiresExam) {
      const questions = await loadQuestions(db, companyId, documentId);
      const answers = new Map<number, number>();
      for (const answer of parsed.data.answers ?? []) answers.set(Number(answer.questionId), Number(answer.selectedIndex));

      const unanswered = questions.filter((question: any) => !answers.has(Number(question.id)));
      if (unanswered.length > 0) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: `Answer every question before signing - ${unanswered.length} of ${questions.length} ${unanswered.length === 1 ? "is" : "are"} still blank.`,
        });
      }

      const incorrectQuestionIds = questions
        .filter((question: any) => answers.get(Number(question.id)) !== Number(question.correctIndex))
        .map((question: any) => Number(question.id));
      const total = questions.length;
      const correct = total - incorrectQuestionIds.length;
      // Rounded to the cent, because the column is decimal(5,2) and 79.999 must not
      // round itself into a pass.
      examScore = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
      examPassed = examScore >= EXAM_PASS_MARK;

      if (!examPassed) {
        // Nothing recorded: the reader tries again after re-reading, and the failed
        // attempt is not evidence of anything.
        return res.status(422).json({
          error: "EXAM_NOT_PASSED",
          score: examScore,
          passMark: EXAM_PASS_MARK,
          incorrectQuestionIds,
        });
      }
    }

    try {
      const [acknowledgement] = await db
        .insert(hrSopAcknowledgements)
        .values({
          companyId,
          sopId: documentId,
          userId,
          signatureName: typed,
          examScore: examScore == null ? null : examScore.toFixed(2),
          examPassed,
          acknowledgedAt: new Date(),
        } as any)
        .returning();

      await auditPayroll(req, "PAYROLL_SOP_ACKNOWLEDGED", "hr_sop_acknowledgements", acknowledgement.id, {
        sopId: documentId,
        code: document.code,
        version: document.version,
        examScore,
        examPassed,
      });
      return res.status(201).json({
        ...acknowledgement,
        examScore: acknowledgement?.examScore == null ? null : toNumber(acknowledgement.examScore),
      });
    } catch (insertErr: any) {
      // Two readers on one account, or a retry after a slow response: the unique index
      // catches it and it is a refusal the client can explain, not a server fault.
      if (isUniqueViolation(insertErr)) {
        return res.status(409).json({ error: "SOP_ALREADY_SIGNED", message: ALREADY_SIGNED_MESSAGE });
      }
      throw insertErr;
    }
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

/**
 * GET /my
 *
 * The reader's own desk. Pending is what they were assigned and have not signed, with the
 * date it fell due worked out from the version's own acknowledgement window, so "overdue"
 * means the same thing in every tenant.
 */
router.get("/my", async (req: any, res) => {
  try {
    const companyId = getTargetCompanyId(req);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED", message: "User not authenticated" });

    const assignedRows = await db
      .select({
        id: hrSopDocuments.id,
        code: hrSopDocuments.code,
        title: hrSopDocuments.title,
        category: hrSopDocuments.category,
        version: hrSopDocuments.version,
        status: hrSopDocuments.status,
        effectiveDate: hrSopDocuments.effectiveDate,
        requiresExam: hrSopDocuments.requiresExam,
        acknowledgementDays: hrSopDocuments.acknowledgementDays,
        publishedAt: hrSopDocuments.publishedAt,
        signedAt: hrSopAcknowledgements.acknowledgedAt,
      })
      .from(hrSopReaders)
      .innerJoin(hrSopDocuments, eq(hrSopReaders.sopId, hrSopDocuments.id))
      .leftJoin(
        hrSopAcknowledgements,
        and(
          eq(hrSopAcknowledgements.sopId, hrSopReaders.sopId),
          eq(hrSopAcknowledgements.userId, hrSopReaders.userId),
        )
      )
      .where(and(
        eq(hrSopReaders.companyId, companyId),
        eq(hrSopReaders.userId, userId),
        eq(hrSopDocuments.status, SIGNABLE_STATUS),
      ));

    const today = todayLocalIso();
    const pending = assignedRows
      .filter((row: any) => row.signedAt == null)
      .map((row: any) => {
        const publishedIso = row.publishedAt instanceof Date
          ? todayLocalIso(row.publishedAt)
          : String(row.publishedAt ?? "").slice(0, 10) || today;
        const dueDate = addDaysIso(publishedIso, toNumber(row.acknowledgementDays));
        return {
          id: row.id,
          code: row.code,
          title: row.title,
          category: row.category,
          version: row.version,
          status: row.status,
          effectiveDate: row.effectiveDate,
          requiresExam: row.requiresExam,
          acknowledgementDays: row.acknowledgementDays,
          publishedAt: row.publishedAt,
          dueDate,
          overdue: dueDate < today,
        };
      })
      .sort((a: any, b: any) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

    const signedRows = await db
      .select({
        id: hrSopDocuments.id,
        code: hrSopDocuments.code,
        title: hrSopDocuments.title,
        category: hrSopDocuments.category,
        version: hrSopDocuments.version,
        status: hrSopDocuments.status,
        effectiveDate: hrSopDocuments.effectiveDate,
        requiresExam: hrSopDocuments.requiresExam,
        publishedAt: hrSopDocuments.publishedAt,
        acknowledgedAt: hrSopAcknowledgements.acknowledgedAt,
        signatureName: hrSopAcknowledgements.signatureName,
        examScore: hrSopAcknowledgements.examScore,
        examPassed: hrSopAcknowledgements.examPassed,
      })
      .from(hrSopAcknowledgements)
      .innerJoin(hrSopDocuments, eq(hrSopAcknowledgements.sopId, hrSopDocuments.id))
      .where(and(
        eq(hrSopAcknowledgements.companyId, companyId),
        eq(hrSopAcknowledgements.userId, userId),
      ));

    const signed = signedRows
      .map((row: any) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        category: row.category,
        version: row.version,
        status: row.status,
        effectiveDate: row.effectiveDate,
        requiresExam: row.requiresExam,
        publishedAt: row.publishedAt,
        acknowledgedAt: row.acknowledgedAt,
        signatureName: row.signatureName,
        examScore: row.examScore == null ? null : toNumber(row.examScore),
        examPassed: row.examPassed,
      }))
      .sort((a: any, b: any) => String(b.acknowledgedAt ?? "").localeCompare(String(a.acknowledgedAt ?? "")));

    res.json({ pending, signed });
  } catch (err: any) {
    respondPayrollError(res, err);
  }
});

export default router;
