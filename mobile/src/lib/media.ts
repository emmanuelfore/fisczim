import { ENV } from "./env";

function toOrigin(base: string): string {
  try {
    const url = new URL(base);
    return `${url.protocol}//${url.host}`;
  } catch {
    return base.replace(/\/+$/, "");
  }
}

export function resolveMediaUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  const path = value.startsWith("/") ? value : `/${value}`;
  if (!ENV.apiBaseUrl) return path;

  return `${toOrigin(ENV.apiBaseUrl)}${path}`;
}

