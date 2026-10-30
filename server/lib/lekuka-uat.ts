import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../db.js";
import {
  LekukaApiError,
  LekukaDevice,
  generateLekukaKeypair,
} from "../lekuka.js";
import type {
  LekukaFiscalDayCounter,
  LekukaReceipt,
  LekukaReceiptLine,
} from "../lekuka.js";
import { getLekukaGatewayUrl } from "../../shared/lekuka.js";

export type CaseStatus = "pass" | "fail" | "blocked" | "skipped";
export type CaseMode = "setup" | "read" | "fiscal" | "cert";

export interface UatCaseMeta {
  id: string;
  title: string;
  group: string;
  mode: CaseMode;
  description: string;
  requires?: string[];
}

export const LEKUKA_UAT_CASES: UatCaseMeta[] = [
  {
    id: "TC-001",
    title: "Device registration",
    group: "Setup",
    mode: "setup",
    description: "Register a spare device with an activation key. Requires an unused device ID — excluded from automated runs.",
  },
  {
    id: "TC-002",
    title: "Taxpayer information verification",
    group: "Setup",
    mode: "setup",
    description: "Verify taxpayer details for a new device. Requires a spare device ID — excluded from automated runs.",
  },
  {
    id: "TC-003",
    title: "Get server certificate",
    group: "Connectivity",
    mode: "read",
    description: "Fetch the RSL gateway certificate chain from the public GetServerCertificate endpoint.",
  },
  {
    id: "TC-004",
    title: "Issue new security certificate",
    group: "Certificate",
    mode: "cert",
    description: "Generate a new keypair/CSR and request a new device certificate (two-step process).",
  },
  {
    id: "TC-005",
    title: "Get device configuration",
    group: "Configuration",
    mode: "read",
    description: "Fetch the device configuration and applicable tax list from RSL.",
  },
  {
    id: "TC-006",
    title: "Confirm new security certificate",
    group: "Certificate",
    mode: "cert",
    description: "Confirm the newly issued certificate thumbprint and persist the new key/certificate locally.",
    requires: ["TC-004"],
  },
  {
    id: "TC-007",
    title: "Get fiscal day status",
    group: "Fiscal Day",
    mode: "read",
    description: "Read the current fiscal day status, last fiscal day number and last receipt global number.",
  },
  {
    id: "TC-008",
    title: "Open fiscal day",
    group: "Fiscal Day",
    mode: "fiscal",
    description: "Open a new fiscal day (or reuse the day already open for the current UAT session).",
  },
  {
    id: "TC-009",
    title: "Ping gateway",
    group: "Connectivity",
    mode: "read",
    description: "Call the LEKUKA Ping endpoint to verify the mTLS connection.",
  },
  {
    id: "TC-010",
    title: "Submit Receipt",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a simplified Receipt (buyer optional) for one VAT 15% line.",
  },
  {
    id: "TC-011",
    title: "Submit FiscalInvoice",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a FiscalInvoice with mandatory buyer data for one VAT 15% line.",
  },
  {
    id: "TC-012",
    title: "Submit CreditNote",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a CreditNote against the TC-010 receipt.",
    requires: ["TC-010"],
  },
  {
    id: "TC-013",
    title: "Submit FiscalInvoice with discount",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a FiscalInvoice containing a sale line and a discount line.",
  },
  {
    id: "TC-014",
    title: "Submit DebitNote",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a DebitNote against the TC-011 invoice.",
    requires: ["TC-011"],
  },
  {
    id: "TC-015",
    title: "Submit VAT at 15%",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a FiscalInvoice with a 15% VAT line (tax ID 7).",
  },
  {
    id: "TC-016",
    title: "Submit VAT at 10%",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a FiscalInvoice with a 10% VAT line (tax ID 21).",
  },
  {
    id: "TC-017",
    title: "Submit VAT at 0%",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a FiscalInvoice with a 0% NonVAT line (tax ID 6).",
  },
  {
    id: "TC-018",
    title: "Submit 20% levy with 15% VAT",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a tobacco line with a 20% percentage levy (tax ID 82) plus 15% VAT.",
  },
  {
    id: "TC-019",
    title: "Submit 10% levy with 15% VAT",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit an alcohol line with a 10% percentage levy (tax ID 81) plus 15% VAT.",
  },
  {
    id: "TC-020",
    title: "Submit fixed plastic levy",
    group: "Receipts",
    mode: "fiscal",
    description: "Submit a line with a fixed 0.90 plastic levy (tax ID 83) applied per unit.",
  },
  {
    id: "TC-021",
    title: "Close fiscal day",
    group: "Fiscal Day",
    mode: "fiscal",
    description: "Close the fiscal day with the aggregated counters and verify the closed status.",
  },
];

const RECEIPT_CASES = LEKUKA_UAT_CASES.filter((c) => c.group === "Receipts").map((c) => c.id);

/** Execution order that mirrors the official UAT script: read-only checks,
 * open the day, exercise every receipt, close, then renew the certificate. */
export const LEKUKA_UAT_ORDER = [
  "TC-003",
  "TC-005",
  "TC-007",
  "TC-009",
  "TC-008",
  ...RECEIPT_CASES,
  "TC-021",
  "TC-004",
  "TC-006",
  "TC-001",
  "TC-002",
];

const CASE_BY_ID = new Map(LEKUKA_UAT_CASES.map((c) => [c.id, c]));

export interface CaseResult {
  id: string;
  title: string;
  status: CaseStatus;
  startedAt: string;
  durationMs: number;
  request?: unknown;
  response?: unknown;
  summary?: unknown;
  validationErrors?: unknown[];
  error?: unknown;
  notes?: string[];
}

export interface UatSummary {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  byId: Array<{ id: string; status: CaseStatus }>;
}

export interface UatReport {
  suite: "LEKUKA UAT";
  runId: string;
  dryRun: boolean;
  noRenewal: boolean;
  company: {
    id: number;
    name: string;
    tin: string | null;
    deviceId: string;
    serialNo: string;
    environment: string | null;
    gateway: string;
  };
  startedAt: string;
  finishedAt?: string;
  fiscalDay: any;
  results: CaseResult[];
  summary: UatSummary;
  outputPath?: string;
  error?: unknown;
}

export type UatEvent =
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "case-started"; id: string; title: string }
  | { type: "case-finished"; result: CaseResult };

export interface RunLekukaUatOptions {
  companyId: number;
  runId?: string;
  selected?: string[];
  dryRun?: boolean;
  noRenewal?: boolean;
  closeAfter?: boolean;
  outputDir?: string;
  onEvent?: (event: UatEvent) => void;
}

export interface StartUatRunOptions extends Omit<RunLekukaUatOptions, "onEvent"> {
  onEvent?: (event: UatEvent) => void;
}

export interface UatRunState {
  runId: string;
  companyId: number;
  status: "running" | "completed" | "failed";
  selected: string[] | null;
  plan: string[];
  currentCase: string | null;
  results: CaseResult[];
  summary: UatSummary | null;
  startedAt: string;
  finishedAt: string | null;
  error: unknown | null;
  report: UatReport | null;
}

interface CompanyRow {
  id: number;
  name: string;
  tin: string | null;
  vat_number: string | null;
  zimra_environment: string | null;
  lekuka_gateway_url: string | null;
  fdms_device_id: string | null;
  fdms_device_serial_no: string | null;
  zimra_private_key: string | null;
  zimra_certificate: string | null;
  current_fiscal_day_no: number | null;
  fiscal_day_open: boolean | null;
  fiscal_day_opened_at: Date | null;
  last_receipt_global_no: number | null;
  daily_receipt_count: number | null;
  last_fiscal_hash: string | null;
}

interface UatSession {
  companyId: number;
  runId: string;
  fiscalDayNo: number | null;
  fiscalDayDate: string | null;
  receiptCounter: number;
  globalNo: number;
  prevHash: string | null;
  counters: LekukaFiscalDayCounter[];
  originalDocuments: Record<string, { receiptGlobalNo: number; fiscalDayNo: number }>;
  results: CaseResult[];
  startedAt: string;
  updatedAt: string;
}

const LESOTHO_TZ = "Africa/Maseru";
const DEFAULT_OUTPUT_DIR = process.env.LEKUKA_UAT_DIR || path.resolve("uat-results");

const counterKey = (counter: LekukaFiscalDayCounter) =>
  `${counter.fiscalCounterType}|${counter.fiscalCounterCurrency}|${counter.fiscalCounterTaxID ?? ""}|${counter.fiscalCounterTaxRate ?? ""}|${counter.fiscalCounterMoneyType ?? ""}`;

function timestampRunId(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
}

function normalizeRunId(value?: string): string {
  const cleaned = (value || timestampRunId()).replace(/[^A-Za-z0-9]/g, "");
  return cleaned || timestampRunId();
}

function formatLocalDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LESOTHO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = (type: string) => parts.find((x) => x.type === type)?.value || "00";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}`;
}

function formatLocalDate(date: Date): string {
  return formatLocalDateTime(date).slice(0, 10);
}

function normalizeValidationErrors(response: any): Array<{ code: string; color: string; message: string }> {
  const list = response?.validationErrors || response?.ValidationErrors || [];
  if (!Array.isArray(list)) return [];
  return list.map((e: any) => ({
    code: String(e.validationErrorCode || e.errorCode || e.code || ""),
    color: String(e.validationErrorColor || e.errorColor || e.color || ""),
    message: String(e.validationErrorDescription || e.errorMessage || e.message || ""),
  }));
}

function errorToJson(error: any): unknown {
  if (error instanceof LekukaApiError) {
    return { message: error.message, statusCode: error.statusCode, details: error.details };
  }
  return { message: error?.message || String(error), details: error?.details };
}

function receiptSummary(receipt: LekukaReceipt): unknown {
  return {
    receiptType: receipt.receiptType,
    receiptCounter: receipt.receiptCounter,
    receiptGlobalNo: receipt.receiptGlobalNo,
    invoiceNo: receipt.invoiceNo,
    receiptDate: receipt.receiptDate,
    receiptTotal: receipt.receiptTotal,
    receiptLinesTaxInclusive: receipt.receiptLinesTaxInclusive,
    lineCount: receipt.receiptLines.length,
    receiptTaxes: receipt.receiptTaxes,
    receiptPayments: receipt.receiptPayments,
    hasBuyerData: !!receipt.buyerData,
    creditDebitNote: receipt.creditDebitNote,
    receiptNotes: receipt.receiptNotes,
    receiptDeviceSignatureHash: receipt.receiptDeviceSignature?.hash,
  };
}

function certInfo(pem: string) {
  const cert = new crypto.X509Certificate(pem);
  const sha1 = crypto.createHash("sha1").update(cert.raw).digest();
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    serialNumber: cert.serialNumber,
    thumbprintHex: sha1.toString("hex").toUpperCase(),
    thumbprintBase64: sha1.toString("base64"),
  };
}

function sessionPath(outputDir: string, companyId: number): string {
  return path.join(outputDir, `lekuka-uat-session-${companyId}.json`);
}

function loadSession(outputDir: string, companyId: number): UatSession | null {
  try {
    return JSON.parse(fs.readFileSync(sessionPath(outputDir, companyId), "utf8"));
  } catch {
    return null;
  }
}

function saveSession(outputDir: string, session: UatSession): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(sessionPath(outputDir, session.companyId), JSON.stringify(session, null, 2));
}

function clearSession(outputDir: string, companyId: number): void {
  try {
    fs.unlinkSync(sessionPath(outputDir, companyId));
  } catch {
    // already gone
  }
}

/**
 * Builds the case execution plan.
 *
 * A selected receipt case is expanded with its dependencies plus TC-008
 * (open/reuse the day) and TC-021 (close the day). This keeps every individual
 * run self-contained and leaves the device in a closed state.
 */
export function buildUatPlan(
  selected?: string[],
  opts?: { dryRun?: boolean; closeAfter?: boolean },
): string[] {
  if (opts?.dryRun) {
    const readOnly = new Set(["TC-003", "TC-005", "TC-007", "TC-009", "TC-001", "TC-002"]);
    if (selected && selected.length) {
      const selectedReadOnly = selected.filter((id) => readOnly.has(id));
      if (selectedReadOnly.length) {
        return LEKUKA_UAT_ORDER.filter((id) => selectedReadOnly.includes(id));
      }
    }
    return LEKUKA_UAT_ORDER.filter((id) => readOnly.has(id));
  }

  if (!selected || selected.length === 0) {
    return [...LEKUKA_UAT_ORDER];
  }

  const set = new Set<string>();
  const add = (id: string) => {
    if (set.has(id) || !CASE_BY_ID.has(id)) return;
    set.add(id);
    for (const dep of CASE_BY_ID.get(id)?.requires || []) add(dep);
  };
  selected.forEach(add);

  if (set.has("TC-004")) add("TC-006");

  const hasFiscal = [...set].some((id) => CASE_BY_ID.get(id)?.mode === "fiscal");
  if (hasFiscal) {
    add("TC-008");
    if (opts?.closeAfter !== false) add("TC-021");
  }

  // Closing a day that has no receipts is not meaningful; add TC-010 when the
  // operator selected only the close-day case or only the open-day case.
  if (set.has("TC-021") && !RECEIPT_CASES.some((id) => set.has(id))) {
    if (selected.some((id) => RECEIPT_CASES.includes(id))) {
      // A receipt case was requested but is run through its own dependencies.
    } else if (selected.includes("TC-021")) {
      RECEIPT_CASES.forEach(add);
    } else {
      add("TC-010");
    }
  }

  return LEKUKA_UAT_ORDER.filter((id) => set.has(id));
}

function summarize(results: CaseResult[]): UatSummary {
  const counts: Record<CaseStatus, number> = { pass: 0, fail: 0, blocked: 0, skipped: 0 };
  for (const result of results) counts[result.status] += 1;
  return {
    total: results.length,
    pass: counts.pass,
    fail: counts.fail,
    blocked: counts.blocked,
    skipped: counts.skipped,
    byId: results.map((r) => ({ id: r.id, status: r.status })),
  };
}

export async function runLekukaUat(opts: RunLekukaUatOptions): Promise<UatReport> {
  const outputDir = path.resolve(opts.outputDir || DEFAULT_OUTPUT_DIR);
  const runId = normalizeRunId(opts.runId);
  const dryRun = !!opts.dryRun;
  const noRenewal = !!opts.noRenewal;
  const closeAfter = opts.closeAfter !== false;
  const selected = opts.selected && opts.selected.length ? opts.selected : undefined;
  const plan = buildUatPlan(selected, { dryRun, closeAfter });
  const needsFiscalDay = plan.some((id) => CASE_BY_ID.get(id)?.mode === "fiscal");
  const emit = opts.onEvent || (() => {});
  const uatInvoiceNo = (testCaseId: string) => `LS-${runId}-${testCaseId}`;

  const companyResult = await pool.query<CompanyRow>(
    `SELECT id, name, tin, vat_number, zimra_environment, lekuka_gateway_url,
            fdms_device_id, fdms_device_serial_no,
            zimra_private_key, zimra_certificate,
            current_fiscal_day_no, fiscal_day_open, fiscal_day_opened_at,
            last_receipt_global_no, daily_receipt_count, last_fiscal_hash
       FROM companies WHERE id = $1`,
    [opts.companyId],
  );
  const company = companyResult.rows[0];
  if (!company) throw new Error(`Company ${opts.companyId} not found`);
  if (!company.fdms_device_id) throw new Error(`Company ${opts.companyId} has no LEKUKA device ID`);
  if (!company.zimra_private_key || !company.zimra_certificate) {
    throw new Error(`Company ${opts.companyId} is missing its LEKUKA client certificate/key`);
  }

  const gateway = (company.lekuka_gateway_url || getLekukaGatewayUrl(company.zimra_environment)).trim();
  const deviceId = String(company.fdms_device_id).trim();
  const serialNo = (company.fdms_device_serial_no || "").trim();

  let device = new LekukaDevice({
    baseUrl: gateway,
    deviceId,
    privateKey: company.zimra_private_key,
    certificate: company.zimra_certificate,
    deviceModelName: "Server",
    deviceModelVersion: "1.0",
  });

  const runStartedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  const report: UatReport = {
    suite: "LEKUKA UAT",
    runId,
    dryRun,
    noRenewal,
    company: {
      id: company.id,
      name: company.name,
      tin: company.tin,
      deviceId,
      serialNo,
      environment: company.zimra_environment,
      gateway,
    },
    startedAt: runStartedAt,
    fiscalDay: null,
    results,
    summary: { total: 0, pass: 0, fail: 0, blocked: 0, skipped: 0, byId: [] },
  };

  const buyerData = {
    buyerRegisterName: "TC Maseru Foods (Pty) Ltd",
    buyerTradeName: "TC Maseru Foods",
    buyerTIN: "02001532810",
    VATNumber: "01987654",
    buyerContacts: { phoneNo: "022312345", email: "orders@maserufoods.co.ls" },
    buyerAddress: { city: "Maseru", street: "Kingsway Road" },
  };

  let status: any = null;
  try {
    status = await device.getStatus();
    report.fiscalDay = status;
  } catch (error) {
    if (!dryRun) throw error;
    emit({ type: "log", level: "warn", message: `Could not read fiscal status during dry run: ${(error as Error).message}` });
  }

  let session = !dryRun && needsFiscalDay ? loadSession(outputDir, company.id) : null;

  if (!dryRun && needsFiscalDay && status?.fiscalDayStatus === "FiscalDayCloseFailed") {
    throw new Error(
      `Fiscal day ${status?.lastFiscalDayNo ?? company.current_fiscal_day_no} is in FiscalDayCloseFailed state; close or reconcile it before running UAT`,
    );
  }

  if (!dryRun && needsFiscalDay && status?.fiscalDayStatus === "FiscalDayOpened") {
    const gatewayGlobal = Number(status?.lastReceiptGlobalNo ?? 0);
    if (!session || session.fiscalDayNo !== Number(status.lastFiscalDayNo) || session.globalNo !== gatewayGlobal) {
      throw new Error(
        `Fiscal day ${status.lastFiscalDayNo} is open but there is no matching UAT session. ` +
          `Close/reconcile the open day before running UAT, or rerun the interrupted UAT session.`,
      );
    }
    results.push(...session.results);
    emit({
      type: "log",
      level: "info",
      message: `Resuming UAT session for open fiscal day ${session.fiscalDayNo} (global ${session.globalNo}).`,
    });
  } else if (session && !dryRun && needsFiscalDay) {
    emit({ type: "log", level: "warn", message: "Discarding stale UAT session because the gateway fiscal day is not open." });
    clearSession(outputDir, company.id);
    session = null;
  }

  let dayNo: number | null = session?.fiscalDayNo ?? null;
  let fiscalDayDate: string | null = session?.fiscalDayDate ?? null;
  let nextReceiptCounter = (session?.receiptCounter ?? 0) + 1;
  let nextGlobalNo =
    (session?.globalNo ?? Number(status?.lastReceiptGlobalNo ?? company.last_receipt_global_no ?? 0)) + 1;
  let prevHash: string | null = session?.prevHash ?? null;
  let lastReceiptCounter = session?.receiptCounter ?? 0;
  const counters = new Map<string, LekukaFiscalDayCounter & { key: string }>();
  for (const counter of session?.counters ?? []) {
    counters.set(counterKey(counter), { ...counter, key: counterKey(counter) });
  }
  const originalDocuments: Record<string, { receiptGlobalNo: number; fiscalDayNo: number }> = {
    ...(session?.originalDocuments || {}),
  };

  let activeSession: UatSession | null = session;
  let sessionClosed = false;

  const persistSession = () => {
    if (dryRun || sessionClosed || (!dayNo && !activeSession)) return;
    const now = new Date().toISOString();
    activeSession = {
      companyId: company.id,
      runId,
      fiscalDayNo: dayNo,
      fiscalDayDate,
      receiptCounter: lastReceiptCounter,
      globalNo: nextGlobalNo - 1,
      prevHash,
      counters: [...counters.values()].map(({ key: _key, ...counter }) => counter),
      originalDocuments,
      results,
      startedAt: activeSession?.startedAt || now,
      updatedAt: now,
    };
    saveSession(outputDir, activeSession);
  };

  const persistCompanyCounters = async () => {
    await pool.query(
      `UPDATE companies
          SET last_receipt_global_no = $1, daily_receipt_count = $2, last_fiscal_hash = $3
        WHERE id = $4`,
      [nextGlobalNo - 1, lastReceiptCounter, prevHash, company.id],
    );
  };

  const upsertResult = (result: CaseResult) => {
    const index = results.findIndex((r) => r.id === result.id);
    if (index >= 0) results[index] = result;
    else results.push(result);
  };

  const addSkipped = (id: string, title: string, reason: string) => {
    const result: CaseResult = {
      id,
      title,
      status: "skipped",
      startedAt: new Date().toISOString(),
      durationMs: 0,
      notes: [reason],
    };
    upsertResult(result);
    emit({ type: "case-finished", result });
  };

  const runCase = async (
    id: string,
    title: string,
    fn: () => Promise<Partial<CaseResult> | void>,
  ): Promise<CaseResult> => {
    emit({ type: "case-started", id, title });
    const startedAt = new Date().toISOString();
    const started = Date.now();
    let result: CaseResult;
    try {
      const value = (await fn()) || {};
      result = {
        id,
        title,
        status: (value.status as CaseStatus) || "pass",
        startedAt,
        durationMs: Date.now() - started,
        ...value,
      };
    } catch (error: any) {
      result = {
        id,
        title,
        status: "fail",
        startedAt,
        durationMs: Date.now() - started,
        error: errorToJson(error),
      };
    }
    upsertResult(result);
    persistSession();
    emit({ type: "case-finished", result });
    return result;
  };

  const addCounter = (
    type: LekukaFiscalDayCounter["fiscalCounterType"],
    value: number,
    tax?: { taxID: number; taxRate?: number },
    moneyType?: string,
  ) => {
    if (Math.round(value * 100) === 0) return;
    const currency = "LSL";
    const key = `${type}|${currency}|${tax?.taxID ?? ""}|${tax?.taxRate ?? ""}|${moneyType ?? ""}`;
    const existing = counters.get(key);
    if (existing) {
      existing.fiscalCounterValue = Number((existing.fiscalCounterValue + value).toFixed(2));
      return;
    }
    counters.set(key, {
      key,
      fiscalCounterType: type,
      fiscalCounterCurrency: currency,
      ...(tax ? { fiscalCounterTaxID: tax.taxID } : {}),
      ...(tax && tax.taxRate !== undefined && tax.taxRate !== null ? { fiscalCounterTaxRate: tax.taxRate } : {}),
      ...(moneyType ? { fiscalCounterMoneyType: moneyType } : {}),
      fiscalCounterValue: Number(value.toFixed(2)),
    });
  };

  const addReceiptCounters = (receipt: LekukaReceipt) => {
    const taxCounterType =
      receipt.receiptType === "CreditNote"
        ? "CreditNoteByTax"
        : receipt.receiptType === "DebitNote"
          ? "DebitNoteByTax"
          : receipt.receiptType === "Payout"
            ? "PayoutByTax"
            : "SaleByTax";
    const taxAmountCounterType =
      receipt.receiptType === "CreditNote"
        ? "CreditNoteTaxByTax"
        : receipt.receiptType === "DebitNote"
          ? "DebitNoteTaxByTax"
          : receipt.receiptType === "Payout"
            ? "PayoutTaxByTax"
            : "SaleTaxByTax";

    for (const tax of receipt.receiptTaxes || []) {
      addCounter(taxCounterType, tax.salesAmountWithTax, { taxID: tax.taxID, taxRate: tax.taxRate });
      addCounter(taxAmountCounterType, tax.taxAmount, { taxID: tax.taxID, taxRate: tax.taxRate });
    }
    for (const payment of receipt.receiptPayments || []) {
      addCounter("BalanceByMoneyType", payment.paymentAmount, undefined, payment.moneyTypeCode);
    }
  };

  const submitReceipt = async (opts: {
    id: string;
    title: string;
    receiptType: LekukaReceipt["receiptType"];
    lines: LekukaReceiptLine[];
    payments: LekukaReceipt["receiptPayments"];
    expectedTotal: number;
    buyer?: boolean;
    creditDebitNote?: { deviceID: number; receiptGlobalNo: number; fiscalDayNo: number };
    notes?: string;
    invoiceNo: string;
  }): Promise<Partial<CaseResult>> => {
    const receiptCounter = nextReceiptCounter;
    const receiptGlobalNo = nextGlobalNo;
    const receipt: LekukaReceipt = {
      receiptType: opts.receiptType,
      receiptCurrency: "LSL",
      receiptCounter,
      receiptGlobalNo,
      invoiceNo: opts.invoiceNo,
      receiptDate: formatLocalDateTime(new Date(Date.now() + receiptCounter * 1000)),
      receiptLinesTaxInclusive: false,
      receiptLines: opts.lines,
      receiptPayments: opts.payments,
      taxRoundingType: "PerReceipt",
      ...(opts.buyer ? { buyerData } : {}),
      ...(opts.creditDebitNote ? { creditDebitNote: opts.creditDebitNote } : {}),
      ...(opts.notes ? { receiptNotes: opts.notes } : {}),
    };

    const signed = device.signReceipt(receipt, prevHash || undefined);
    const preparedTotal = Number(signed.receiptTotal || 0);
    if (Math.abs(preparedTotal - opts.expectedTotal) > 0.001) {
      throw new Error(
        `TC ${opts.id} total mismatch: expected ${opts.expectedTotal.toFixed(2)}, prepared ${preparedTotal.toFixed(2)}`,
      );
    }

    const response = await device.submitSignedReceipt(signed);
    const validationErrors = normalizeValidationErrors(response);

    // The gateway records the receipt even when it flags validation issues, so
    // the local counters and hash chain must advance either way.
    nextReceiptCounter += 1;
    nextGlobalNo += 1;
    lastReceiptCounter = receiptCounter;
    prevHash = signed.receiptDeviceSignature?.hash || prevHash;
    addReceiptCounters(signed);
    originalDocuments[opts.id] = { receiptGlobalNo, fiscalDayNo: dayNo || 1 };
    await persistCompanyCounters();
    persistSession();

    return {
      status: validationErrors.length === 0 ? ("pass" as const) : ("fail" as const),
      request: receiptSummary(signed),
      response,
      validationErrors,
      summary: {
        receiptCounter,
        receiptGlobalNo,
        receiptTotal: signed.receiptTotal,
        validationErrors: validationErrors.length,
      },
    };
  };

  const executePlan = async () => {
    let fiscalAborted = false;
    let renewal: { privateKey: string; certificate: string } | null = null;

    for (const id of plan) {
      const meta = CASE_BY_ID.get(id);
      const title = meta?.title || id;
      const mode = meta?.mode || "read";

      const existing = results.find((r) => r.id === id);
      if (existing) {
        emit({ type: "log", level: "info", message: `${id} already recorded (${existing.status}); skipping.` });
        emit({ type: "case-finished", result: existing });
        if (id === "TC-008" && existing.status !== "pass") fiscalAborted = true;
        continue;
      }

      if (fiscalAborted && (mode === "fiscal" || mode === "cert")) {
        const result: CaseResult = {
          id,
          title,
          status: "blocked",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          notes: ["Blocked because the fiscal day could not be opened/reused"],
        };
        upsertResult(result);
        persistSession();
        emit({ type: "case-finished", result });
        continue;
      }

      if (id === "TC-001" || id === "TC-002") {
        addSkipped(
          id,
          title,
          "Requires a spare device ID and activation key — excluded from automated runs",
        );
        continue;
      }

      if (id === "TC-003") {
        await runCase(id, title, async () => {
          const response = await device.getServerCertificate();
          const certificates = Array.isArray(response?.certificate)
            ? response.certificate
            : [response?.certificate].filter(Boolean);
          return {
            response: {
              certificateCount: certificates.length,
              certificateValidTill: response?.certificateValidTill,
              subjects: certificates.map((pem: string) => {
                try {
                  return new crypto.X509Certificate(pem).subject;
                } catch {
                  return "unparseable";
                }
              }),
            },
            summary: { certificateValidTill: response?.certificateValidTill },
          };
        });
        continue;
      }

      if (id === "TC-005") {
        await runCase(id, title, async () => {
          const response = await device.getConfig();
          return {
            response: {
              operationID: response?.operationID,
              applicableTaxes: response?.applicableTaxes,
              deviceOperatingMode: response?.deviceOperatingMode,
              taxpayer: response?.taxpayer,
            },
            summary: {
              taxCount: Array.isArray(response?.applicableTaxes) ? response.applicableTaxes.length : 0,
              deviceOperatingMode: response?.deviceOperatingMode,
            },
          };
        });
        continue;
      }

      if (id === "TC-007") {
        await runCase(id, title, async () => {
          status = await device.getStatus();
          report.fiscalDay = status;
          return {
            response: status,
            summary: {
              fiscalDayStatus: status?.fiscalDayStatus,
              lastFiscalDayNo: status?.lastFiscalDayNo,
              lastReceiptGlobalNo: status?.lastReceiptGlobalNo,
            },
          };
        });
        continue;
      }

      if (id === "TC-009") {
        await runCase(id, title, async () => {
          const response = await device.ping();
          return { response, summary: { operationID: response?.operationID } };
        });
        continue;
      }

      if (id === "TC-008") {
        const result = await runCase(id, title, async () => {
          const currentStatus = status || (await device.getStatus());
          if (currentStatus?.fiscalDayStatus === "FiscalDayOpened") {
            dayNo = Number(currentStatus?.lastFiscalDayNo || company.current_fiscal_day_no || 1);
            fiscalDayDate =
              activeSession?.fiscalDayDate ||
              (company.fiscal_day_opened_at
                ? formatLocalDate(new Date(company.fiscal_day_opened_at))
                : formatLocalDate(new Date()));
            nextGlobalNo = Math.max(nextGlobalNo, Number(currentStatus?.lastReceiptGlobalNo || 0) + 1);
            return {
              response: currentStatus,
              summary: { fiscalDayNo: dayNo, fiscalDayDate, note: "Fiscal day was already open; reused it" },
            };
          }
          if (currentStatus?.fiscalDayStatus === "FiscalDayCloseFailed") {
            throw new Error(
              `Fiscal day ${currentStatus?.lastFiscalDayNo} is in FiscalDayCloseFailed state; close or reconcile it before running UAT`,
            );
          }

          const nextDayNo = Number(currentStatus?.lastFiscalDayNo || company.current_fiscal_day_no || 0) + 1;
          const openedAt = formatLocalDateTime(new Date());
          const response: any = await device.openDay(openedAt);
          dayNo = Number(response?.fiscalDayNo || nextDayNo);
          fiscalDayDate = openedAt.slice(0, 10);

          const afterOpen = await device.getStatus();
          status = afterOpen;
          report.fiscalDay = afterOpen;
          nextGlobalNo = Math.max(nextGlobalNo, Number(afterOpen?.lastReceiptGlobalNo || 0) + 1);
          nextReceiptCounter = 1;
          prevHash = null;
          lastReceiptCounter = 0;
          counters.clear();
          for (const key of Object.keys(originalDocuments)) delete originalDocuments[key];

          await pool.query(
            `UPDATE companies
                SET fiscal_day_open = true, fiscal_day_opened_at = NOW(),
                    current_fiscal_day_no = $1, daily_receipt_count = 0,
                    last_fiscal_day_status = 'Opened'
              WHERE id = $2`,
            [dayNo, company.id],
          );

          persistSession();

          return {
            request: { fiscalDayOpened: openedAt, fiscalDayNo: nextDayNo },
            response: { openDay: response, status: afterOpen },
            summary: {
              fiscalDayNo: dayNo,
              fiscalDayDate,
              fiscalDayStatus: afterOpen?.fiscalDayStatus,
              openingGlobalNo: nextGlobalNo,
            },
          };
        });
        if (result.status !== "pass") fiscalAborted = true;
        continue;
      }

      if (id === "TC-010") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "Receipt",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 115,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Brown Bread 700g",
              receiptLineQuantity: 1,
              receiptLineTotal: 100,
              receiptLinePrice: 100,
              receiptLineHSCode: "19059000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 115 }],
          }),
        );
        continue;
      }

      if (id === "TC-011") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 115,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Fresh Milk 2L",
              receiptLineQuantity: 2,
              receiptLineTotal: 100,
              receiptLinePrice: 50,
              receiptLineHSCode: "04012000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 115 }],
          }),
        );
        continue;
      }

      if (id === "TC-012") {
        await runCase(id, title, async () => {
          const original = originalDocuments["TC-010"];
          if (!original) throw new Error("Original TC-010 receipt is required for the credit note");
          return submitReceipt({
            id,
            title,
            receiptType: "CreditNote",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: -115,
            buyer: true,
            creditDebitNote: { deviceID: Number(deviceId), ...original },
            notes: "UAT credit note for TC-010",
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Brown Bread 700g (return)",
              receiptLineQuantity: 1,
              receiptLineTotal: -100,
              receiptLinePrice: -100,
              receiptLineHSCode: "19059000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: -115 }],
          });
        });
        continue;
      }

      if (id === "TC-013") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 103.5,
            buyer: true,
            lines: [
              {
                receiptLineType: "Sale",
                receiptLineNo: 1,
                receiptLineName: "TC Brown Bread 700g",
                receiptLineQuantity: 1,
                receiptLineTotal: 100,
                receiptLinePrice: 100,
                receiptLineHSCode: "19059000",
                taxID: 7,
                taxType: "VAT",
                taxRate: 15,
              },
              {
                receiptLineType: "Discount",
                receiptLineNo: 2,
                receiptLineName: "Loyalty discount",
                receiptLineQuantity: 1,
                receiptLineTotal: -10,
                receiptLinePrice: -10,
                taxID: 7,
                taxType: "VAT",
                taxRate: 15,
              },
            ],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 103.5 }],
          }),
        );
        continue;
      }

      if (id === "TC-014") {
        await runCase(id, title, async () => {
          const original = originalDocuments["TC-011"];
          if (!original) throw new Error("Original TC-011 invoice is required for the debit note");
          return submitReceipt({
            id,
            title,
            receiptType: "DebitNote",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 57.5,
            buyer: true,
            creditDebitNote: { deviceID: Number(deviceId), ...original },
            notes: "UAT debit note for TC-011",
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Fresh Milk 2L (undercharge)",
              receiptLineQuantity: 1,
              receiptLineTotal: 50,
              receiptLinePrice: 50,
              receiptLineHSCode: "04012000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 57.5 }],
          });
        });
        continue;
      }

      if (id === "TC-015") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 57.5,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Fresh Milk 2L",
              receiptLineQuantity: 1,
              receiptLineTotal: 50,
              receiptLinePrice: 50,
              receiptLineHSCode: "04012000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 57.5 }],
          }),
        );
        continue;
      }

      if (id === "TC-016") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 220,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Cooking Oil 2L",
              receiptLineQuantity: 1,
              receiptLineTotal: 200,
              receiptLinePrice: 200,
              receiptLineHSCode: "15121900",
              taxID: 21,
              taxType: "VAT",
              taxRate: 10,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 220 }],
          }),
        );
        continue;
      }

      if (id === "TC-017") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 300,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Maize Meal 10kg",
              receiptLineQuantity: 1,
              receiptLineTotal: 300,
              receiptLinePrice: 300,
              receiptLineHSCode: "11022000",
              taxID: 6,
              taxType: "NonVAT",
              taxRate: 0,
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 300 }],
          }),
        );
        continue;
      }

      if (id === "TC-018") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 540,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Cigarettes 20s",
              receiptLineQuantity: 1,
              receiptLineTotal: 400,
              receiptLinePrice: 400,
              receiptLineHSCode: "24022000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
              additionalTaxes: [{
                taxID: 82,
                receiptLineId: 1,
                taxType: "PercentageLevy",
                taxRate: 20,
              }],
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 540 }],
          }),
        );
        continue;
      }

      if (id === "TC-019") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 625,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Lager 6-pack",
              receiptLineQuantity: 1,
              receiptLineTotal: 500,
              receiptLinePrice: 500,
              receiptLineHSCode: "22030000",
              taxID: 7,
              taxType: "VAT",
              taxRate: 15,
              additionalTaxes: [{
                taxID: 81,
                receiptLineId: 1,
                taxType: "PercentageLevy",
                taxRate: 10,
              }],
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 625 }],
          }),
        );
        continue;
      }

      if (id === "TC-020") {
        await runCase(id, title, async () =>
          submitReceipt({
            id,
            title,
            receiptType: "FiscalInvoice",
            invoiceNo: uatInvoiceNo(id),
            expectedTotal: 11.8,
            buyer: true,
            lines: [{
              receiptLineType: "Sale",
              receiptLineNo: 1,
              receiptLineName: "TC Carrier Bag",
              receiptLineQuantity: 2,
              receiptLineTotal: 10,
              receiptLinePrice: 5,
              receiptLineHSCode: "39232100",
              taxID: 6,
              taxType: "NonVAT",
              taxRate: 0,
              additionalTaxes: [{
                taxID: 83,
                receiptLineId: 1,
                taxType: "FixedValueLevy",
                taxRate: 0.9,
                appliedForQuantity: 2,
              }],
            }],
            payments: [{ moneyTypeCode: "Cash", paymentAmount: 11.8 }],
          }),
        );
        continue;
      }

      if (id === "TC-021") {
        await runCase(id, title, async () => {
          if (!dayNo || !fiscalDayDate) throw new Error("Fiscal day was not opened");
          const closeCounters = [...counters.values()].map(({ key: _key, ...counter }) => counter);
          const request: any = {
            fiscalDayNo: dayNo,
            fiscalDayDate,
            receiptCounter: lastReceiptCounter,
            counters: closeCounters,
          };
          const response: any = await device.closeDay({
            fiscalDayNo: dayNo,
            fiscalDayDate,
            receiptCounter: lastReceiptCounter,
            counters: closeCounters,
          });

          let closedStatus: any = null;
          const deadline = Date.now() + 45_000;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            closedStatus = await device.getStatus();
            report.fiscalDay = closedStatus;
            if (closedStatus?.fiscalDayStatus === "FiscalDayClosed") break;
            if (closedStatus?.fiscalDayStatus === "FiscalDayCloseFailed") break;
          }

          const closeFailed = closedStatus?.fiscalDayStatus === "FiscalDayCloseFailed";
          await pool.query(
            `UPDATE companies
                SET fiscal_day_open = $1, last_fiscal_day_status = $2,
                    daily_receipt_count = $3, last_receipt_global_no = $4,
                    last_fiscal_hash = $5, current_fiscal_day_no = $6
              WHERE id = $7`,
            [
              closeFailed,
              closedStatus?.fiscalDayStatus || "Closed",
              closeFailed ? lastReceiptCounter : 0,
              nextGlobalNo - 1,
              prevHash,
              dayNo,
              company.id,
            ],
          );

          if (!closeFailed) {
            sessionClosed = true;
            clearSession(outputDir, company.id);
          } else {
            persistSession();
          }

          return {
            status: closedStatus?.fiscalDayStatus === "FiscalDayClosed" ? ("pass" as const) : ("fail" as const),
            request,
            response: { closeDay: response, status: closedStatus },
            summary: {
              fiscalDayNo: dayNo,
              receiptCounter: lastReceiptCounter,
              counters: closeCounters.length,
              fiscalDayStatus: closedStatus?.fiscalDayStatus,
              errorCode: closedStatus?.fiscalDayClosingErrorCode,
            },
          };
        });
        continue;
      }

      if (id === "TC-004") {
        if (noRenewal) {
          addSkipped(id, title, "Skipped because certificate renewal is disabled");
          continue;
        }
        await runCase(id, title, async () => {
          const { privateKey, certificateRequest } = generateLekukaKeypair(deviceId, serialNo);
          const response: any = await device.issueCertificate(certificateRequest, true);
          const certificate = response?.certificate || response?.data?.certificate;
          if (!certificate) throw new Error("IssueCertificate did not return a certificate");
          renewal = { privateKey, certificate };
          const info = certInfo(certificate);
          return {
            request: {
              certificateRequestSubject: `RSL-${serialNo || ""}-${deviceId.padStart(10, "0")}`,
              twoStepsProcess: true,
            },
            response: {
              operationID: response?.operationID,
              certificate: {
                subject: info.subject,
                issuer: info.issuer,
                validFrom: info.validFrom,
                validTo: info.validTo,
                thumbprintHex: info.thumbprintHex,
              },
            },
            summary: {
              operationID: response?.operationID,
              validTo: info.validTo,
              thumbprintHex: info.thumbprintHex,
            },
          };
        });
        continue;
      }

      if (id === "TC-006") {
        if (noRenewal) {
          addSkipped(id, title, "Skipped because certificate renewal is disabled");
          continue;
        }
        await runCase(id, title, async () => {
          if (!renewal) throw new Error("TC-004 did not return a new certificate to confirm");
          const info = certInfo(renewal.certificate);
          const candidates = [
            { encoding: "base64", value: info.thumbprintBase64 },
            { encoding: "hex-upper", value: info.thumbprintHex },
            { encoding: "hex-lower", value: info.thumbprintHex.toLowerCase() },
          ];
          let confirmed: any = null;
          const attempts: any[] = [];
          for (const candidate of candidates) {
            try {
              const response = await device.confirmCertificate(candidate.value);
              confirmed = { response, encoding: candidate.encoding };
              break;
            } catch (error: any) {
              attempts.push({ encoding: candidate.encoding, error: errorToJson(error) });
            }
          }
          if (!confirmed) {
            throw new Error(`ConfirmCertificate failed for all thumbprint encodings: ${JSON.stringify(attempts)}`);
          }

          await pool.query(
            `UPDATE companies SET zimra_private_key = $1, zimra_certificate = $2 WHERE id = $3`,
            [renewal.privateKey, renewal.certificate, company.id],
          );

          device = new LekukaDevice({
            baseUrl: gateway,
            deviceId,
            privateKey: renewal.privateKey,
            certificate: renewal.certificate,
            deviceModelName: "Server",
            deviceModelVersion: "1.0",
          });
          const postConfirmStatus = await device.getStatus();

          return {
            response: {
              confirm: confirmed.response,
              verifiedStatus: {
                fiscalDayStatus: postConfirmStatus?.fiscalDayStatus,
                lastFiscalDayNo: postConfirmStatus?.lastFiscalDayNo,
                lastReceiptGlobalNo: postConfirmStatus?.lastReceiptGlobalNo,
              },
            },
            summary: {
              operationID: confirmed.response?.operationID,
              thumbprintEncoding: confirmed.encoding,
              newThumbprintHex: info.thumbprintHex,
              postConfirmStatus: postConfirmStatus?.fiscalDayStatus,
            },
          };
        });
        continue;
      }

      emit({ type: "log", level: "warn", message: `${id} is not implemented; skipping.` });
      addSkipped(id, title, "Not implemented");
    }
  };

  try {
    await executePlan();
  } catch (error: any) {
    report.error = errorToJson(error);
    emit({ type: "log", level: "error", message: error?.message || String(error) });
  } finally {
    report.finishedAt = new Date().toISOString();
    const ordered = LEKUKA_UAT_ORDER.filter((id) => results.some((r) => r.id === id));
    const extra = results.filter((r) => !LEKUKA_UAT_ORDER.includes(r.id)).map((r) => r.id);
    report.results = [...ordered, ...extra].map((id) => results.find((r) => r.id === id)!).filter(Boolean);
    report.summary = summarize(report.results);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `lekuka-uat-${stamp}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      report.outputPath = outputPath;
    } catch (error: any) {
      emit({ type: "log", level: "warn", message: `Could not write UAT report: ${error?.message || error}` });
    }
  }

  return report;
}

/**
 * Attempts to reconcile a fiscal day left in FiscalDayCloseFailed. LEKUKA
 * allows closeDay from either Opened or CloseFailed; the response/status
 * separates a bad device signature from red receipts and counter mismatches.
 */
export async function reconcileLekukaFiscalDay(opts: {
  companyId: number;
  fiscalDayDate?: string;
  receiptCounter?: number;
  counters?: LekukaFiscalDayCounter[];
  dryRun?: boolean;
}): Promise<any> {
  const companyResult = await pool.query<CompanyRow>(
    `SELECT id, name, tin, vat_number, zimra_environment, lekuka_gateway_url,
            fdms_device_id, fdms_device_serial_no,
            zimra_private_key, zimra_certificate,
            current_fiscal_day_no, fiscal_day_open, fiscal_day_opened_at,
            last_receipt_global_no, daily_receipt_count, last_fiscal_hash
       FROM companies WHERE id = $1`,
    [opts.companyId],
  );
  const company = companyResult.rows[0];
  if (!company) throw new Error(`Company ${opts.companyId} not found`);
  if (!company.fdms_device_id) throw new Error(`Company ${opts.companyId} has no LEKUKA device ID`);
  if (!company.zimra_private_key || !company.zimra_certificate) {
    throw new Error(`Company ${opts.companyId} is missing its LEKUKA client certificate/key`);
  }

  const device = new LekukaDevice({
    baseUrl: (company.lekuka_gateway_url || getLekukaGatewayUrl(company.zimra_environment)).trim(),
    deviceId: String(company.fdms_device_id).trim(),
    privateKey: company.zimra_private_key,
    certificate: company.zimra_certificate,
    deviceModelName: "Server",
    deviceModelVersion: "1.0",
  });

  const before = await device.getStatus();
  const fiscalDayNo = Number(before?.lastFiscalDayNo || company.current_fiscal_day_no || 1);
  const fiscalDayDate =
    opts.fiscalDayDate ||
    (company.fiscal_day_opened_at
      ? formatLocalDate(new Date(company.fiscal_day_opened_at))
      : formatLocalDate(new Date()));
  const request = {
    fiscalDayNo,
    fiscalDayDate,
    receiptCounter: opts.receiptCounter ?? company.daily_receipt_count ?? 0,
    counters: opts.counters || [],
  };

  if (opts.dryRun) return { before, request, dryRun: true };
  if (before?.fiscalDayStatus !== "FiscalDayCloseFailed") {
    return { before, request, skipped: `Fiscal day is ${before?.fiscalDayStatus}, not FiscalDayCloseFailed` };
  }

  let response: any = null;
  let error: unknown = null;
  try {
    response = await device.closeDay(request);
  } catch (err) {
    error = errorToJson(err);
  }

  let after = await device.getStatus();
  for (let attempt = 0; attempt < 10 && after?.fiscalDayStatus === "FiscalDayCloseInitiated"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    after = await device.getStatus();
  }

  return { before, request, response, error, after };
}

const runs = new Map<string, UatRunState>();
const companyRuns = new Map<number, string[]>();

function rememberRun(state: UatRunState) {
  runs.set(state.runId, state);
  const list = companyRuns.get(state.companyId) || [];
  list.unshift(state.runId);
  const trimmed = list.slice(0, 20);
  companyRuns.set(state.companyId, trimmed);
  for (const id of list.slice(20)) runs.delete(id);
}

export function getUatRun(companyId: number, runId: string): UatRunState | undefined {
  const state = runs.get(runId);
  return state && state.companyId === companyId ? state : undefined;
}

export function listUatRuns(companyId: number): UatRunState[] {
  return (companyRuns.get(companyId) || [])
    .map((id) => runs.get(id))
    .filter((state): state is UatRunState => !!state);
}

export function getActiveUatRun(companyId: number): UatRunState | undefined {
  return listUatRuns(companyId).find((state) => state.status === "running");
}

export function startUatRun(opts: StartUatRunOptions): UatRunState {
  const active = getActiveUatRun(opts.companyId);
  if (active) {
    throw new Error(`A UAT run is already in progress (${active.runId})`);
  }

  const runId = normalizeRunId(opts.runId);
  const selected = opts.selected && opts.selected.length ? opts.selected : null;
  const plan = buildUatPlan(selected || undefined, {
    dryRun: opts.dryRun,
    closeAfter: opts.closeAfter,
  });
  const state: UatRunState = {
    runId,
    companyId: opts.companyId,
    status: "running",
    selected,
    plan,
    currentCase: null,
    results: [],
    summary: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    report: null,
  };
  rememberRun(state);

  void runLekukaUat({
    ...opts,
    runId,
    selected: selected || undefined,
    onEvent: (event) => {
      if (event.type === "case-started") {
        state.currentCase = event.id;
      } else if (event.type === "case-finished") {
        state.currentCase = null;
        const index = state.results.findIndex((r) => r.id === event.result.id);
        if (index >= 0) state.results[index] = event.result;
        else state.results.push(event.result);
        state.summary = summarize(state.results);
      }
      opts.onEvent?.(event);
    },
  })
    .then((report) => {
      state.report = report;
      state.results = report.results;
      state.summary = report.summary;
      state.status = report.error ? "failed" : "completed";
      state.error = report.error || null;
      state.finishedAt = report.finishedAt || new Date().toISOString();
      state.currentCase = null;
    })
    .catch((error) => {
      state.status = "failed";
      state.error = errorToJson(error);
      state.finishedAt = new Date().toISOString();
      state.currentCase = null;
    });

  return state;
}
