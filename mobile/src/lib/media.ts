import { ENV } from "./env";

function toOrigin(base: string): string {
  try {
    const url = new URL(base);
    return `${url.protocol}//${url.host}`;
  } catch {
    return base.replace(/\/+$/, "");
  }
}

function withApiBase(path: string): string {
  if (!ENV.apiBaseUrl) return path;
  return `${toOrigin(ENV.apiBaseUrl)}${path}`;
}

export function resolveMediaUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^https?:/i.test(value)) {
    // Upload paths are served by the API host. Absolute legacy URLs may point
    // at another domain (or http://) and break; resolve them against the API.
    try {
      const url = new URL(value);
      if (url.pathname.startsWith("/uploads/")) {
        return withApiBase(`${url.pathname}${url.search}`);
      }
    } catch {
      // fall through and return the value unchanged
    }
    return value;
  }
  if (/^(data:|blob:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;

  return withApiBase(value.startsWith("/") ? value : `/${value}`);
}

