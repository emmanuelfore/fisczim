export function throughEndOfDay(value: Date): Date {
  const upper = new Date(value);
  if (Number.isNaN(upper.getTime())) return value;
  upper.setHours(23, 59, 59, 999);
  return upper;
}

export type ReportRangeDefault = "month" | "year" | "all" | "required";

export type ReportRangeResult =
  | { ok: true; start: Date; end: Date }
  | { ok: false; message: string };

export interface ReportRangeOptions {
  default?: ReportRangeDefault;
  startKey?: string;
  endKey?: string;
  now?: Date;
}

function readDate(query: Record<string, unknown>, key: string): Date | null | "invalid" {
  const raw = query[key];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

function defaultRange(kind: Exclude<ReportRangeDefault, "required">, now: Date): { start: Date; end: Date } {
  if (kind === "all") return { start: new Date(0), end: throughEndOfDay(now) };
  if (kind === "year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

// A caller-supplied end date is inclusive: "up to 31 March" must cover the whole of
// 31 March, not just its first millisecond.
export function parseReportRange(
  query: Record<string, unknown>,
  options: ReportRangeOptions = {},
): ReportRangeResult {
  const startKey = options.startKey ?? "startDate";
  const endKey = options.endKey ?? "endDate";
  const now = options.now ?? new Date();

  const rawStart = readDate(query, startKey);
  const rawEnd = readDate(query, endKey);
  if (rawStart === "invalid") return { ok: false, message: `Invalid ${startKey} format` };
  if (rawEnd === "invalid") return { ok: false, message: `Invalid ${endKey} format` };

  const fallback = options.default ?? "month";
  if (fallback === "required" && (rawStart === null || rawEnd === null)) {
    return { ok: false, message: `${startKey} and ${endKey} are required` };
  }

  const defaults = fallback === "required" ? null : defaultRange(fallback, now);
  const start = rawStart ?? defaults!.start;
  const end = throughEndOfDay(rawEnd ?? defaults!.end);

  if (end.getTime() < start.getTime()) {
    return { ok: false, message: `${endKey} must not be before ${startKey}` };
  }
  return { ok: true, start, end };
}

export type OptionalRangeResult =
  | { ok: true; start?: Date; end?: Date }
  | { ok: false; message: string };

// Statement endpoints treat an absent bound as unbounded rather than defaulting to a
// period, so the storage layer keeps receiving undefined.
export function parseOptionalRange(
  query: Record<string, unknown>,
  options: Omit<ReportRangeOptions, "default" | "now"> = {},
): OptionalRangeResult {
  const startKey = options.startKey ?? "startDate";
  const endKey = options.endKey ?? "endDate";
  const rawStart = readDate(query, startKey);
  const rawEnd = readDate(query, endKey);
  if (rawStart === "invalid") return { ok: false, message: `Invalid ${startKey} format` };
  if (rawEnd === "invalid") return { ok: false, message: `Invalid ${endKey} format` };
  const start = rawStart ?? undefined;
  const end = rawEnd ? throughEndOfDay(rawEnd) : undefined;
  if (start && end && end.getTime() < start.getTime()) {
    return { ok: false, message: `${endKey} must not be before ${startKey}` };
  }
  return { ok: true, start, end };
}

export type AsOfResult = { ok: true; date: Date } | { ok: false; message: string };

export function parseAsOfDate(
  query: Record<string, unknown>,
  key = "date",
  now: Date = new Date(),
): AsOfResult {
  const raw = readDate(query, key);
  if (raw === "invalid") return { ok: false, message: `Invalid ${key} format` };
  return { ok: true, date: raw ?? now };
}