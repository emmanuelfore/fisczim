import { ENV } from "./env";

/**
 * Keep this in sync with the `version` field in mobile/app.json on every release.
 */
export const CURRENT_APP_VERSION = "0.1.0";

export type UpdateInfo = {
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
};

/** Returns true if semver `a` is strictly greater than `b`. */
function semverGt(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/[^0-9.]/g, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [aMaj = 0, aMin = 0, aPat = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPat = 0] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

/**
 * Checks the server for a newer APK version.
 * Returns update info if an update is available, or null otherwise.
 * Never throws – the check is non-critical.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(`${ENV.apiBaseUrl}/api/mobile/version`, {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) return null;

    const data = (await res.json()) as Partial<UpdateInfo>;
    const { latestVersion, downloadUrl, releaseNotes = "" } = data;

    if (!latestVersion || !downloadUrl) return null;

    return semverGt(latestVersion, CURRENT_APP_VERSION)
      ? { latestVersion, downloadUrl, releaseNotes }
      : null;
  } catch {
    // Silently ignore – connectivity issues, server errors, etc.
    return null;
  }
}
