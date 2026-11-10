/**
 * CRM display constants. Kept in one place because the board, the detail
 * drawer and the reporting tables all label the same stored codes.
 */

export const SOURCES = [
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "web", label: "Website" },
  { value: "social", label: "Social media" },
  { value: "referral", label: "Referral" },
];

export const CHANNELS = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "visit", label: "Visit" },
];

/**
 * `enquiries.lost_reason` is free text, so these are the starting points the
 * dropdown offers - a typed value is stored exactly as written.
 */
export const LOST_REASONS = [
  "Price too high",
  "Bought elsewhere",
  "No longer interested",
  "Could not reach",
  "Out of stock",
  "Duplicate",
];

/** Tailwind classes keyed by the stage `color` name, mirroring DEFAULT_STAGES. */
export const STAGE_COLORS: Record<string, { bar: string; badge: string }> = {
  slate: { bar: "bg-slate-400", badge: "bg-slate-100 text-slate-700" },
  blue: { bar: "bg-blue-500", badge: "bg-blue-100 text-blue-700" },
  amber: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  violet: { bar: "bg-violet-500", badge: "bg-violet-100 text-violet-700" },
  emerald: { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  rose: { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-700" },
  sky: { bar: "bg-sky-500", badge: "bg-sky-100 text-sky-700" },
  teal: { bar: "bg-teal-500", badge: "bg-teal-100 text-teal-700" },
};

export const COLOR_NAMES = Object.keys(STAGE_COLORS);

export function stageColor(color?: string | null) {
  return STAGE_COLORS[color || "slate"] || STAGE_COLORS.slate;
}

export function sourceLabel(source?: string | null) {
  return SOURCES.find((s) => s.value === source)?.label || source || "Unknown";
}

export function channelLabel(channel?: string | null) {
  return CHANNELS.find((c) => c.value === channel)?.label || channel || "Task";
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

/** Decimal columns arrive as strings; the board needs numbers to total. */
export function amount(value?: string | number | null) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
