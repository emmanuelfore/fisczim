const API_BASE = import.meta.env.VITE_API_URL ?? "";

function joinUrl(base: string, path: string) {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function resolveMediaUrl(raw?: string | null): string {
  if (!raw) return "";
  const value = String(raw).trim();
  if (!value) return "";

  if (/^https?:/i.test(value)) {
    // Older rows stored the full origin (sometimes http://). Uploads always
    // live on the API host, so serve them relative to the configured API base
    // instead of the origin that happened to be used at upload time.
    try {
      const url = new URL(value);
      if (url.pathname.startsWith("/uploads/")) {
        return joinUrl(API_BASE, `${url.pathname}${url.search}`);
      }
    } catch {
      // fall through and return the value unchanged
    }
    return value;
  }
  if (/^(data:|blob:)/i.test(value)) return value;
  if (value.startsWith("//")) return `${window.location.protocol}${value}`;

  // Relative upload paths should point to API host when VITE_API_URL is set.
  if (value.startsWith("/")) return joinUrl(API_BASE, value);
  return joinUrl(API_BASE, `/${value}`);
}

