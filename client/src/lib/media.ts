const API_BASE = import.meta.env.VITE_API_URL ?? "";

function joinUrl(base: string, path: string) {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function resolveMediaUrl(raw?: string | null): string {
  if (!raw) return "";
  const value = String(raw).trim();
  if (!value) return "";

  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("//")) return `${window.location.protocol}${value}`;

  // Relative upload paths should point to API host when VITE_API_URL is set.
  if (value.startsWith("/")) return joinUrl(API_BASE, value);
  return joinUrl(API_BASE, `/${value}`);
}

