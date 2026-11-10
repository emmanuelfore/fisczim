/**
 * Product scope — which slice of the platform a given deployment exposes.
 *
 * "full" (the default) is every module: POS, inventory, manufacturing,
 * freight, accounting, bus, restaurant and HR. "hr" ships the HR and payroll
 * surface only; every other screen is unreachable.
 *
 * Scope is a property of the deployment, not of a company, and it is strictly
 * opt-in: an unset or unrecognised value resolves to "full" so that every
 * existing deployment keeps the surface it has today.
 */

export type ProductScope = "full" | "hr";

export const DEFAULT_PRODUCT_SCOPE: ProductScope = "full";

/** Where an HR-only deployment sends anyone who asks for a screen it doesn't ship. */
export const HR_HOME_PATH = "/hr";

/**
 * Paths an HR-only deployment keeps. These are not HR screens — they are the
 * plumbing a signed-in customer needs to use any product at all: signing in,
 * creating the company, the subscription bill, the approval inbox, and the
 * company/team settings that feed payroll.
 */
const HR_SHARED_PATHS = [
  "/",
  "/auth",
  "/onboarding",
  "/profile",
  "/subscription",
  "/approvals",
  "/settings",
  "/team-settings",
  "/forgot-password",
  "/reset-password",
];

/** Path prefixes an HR-only deployment serves. Everything else is out of scope. */
const HR_PATH_PREFIXES = ["/hr", "/payroll"];

/**
 * Reads a scope out of an environment value. Anything other than "hr" —
 * including "", undefined and typos — resolves to "full", because widening the
 * gate by accident would hide modules from a live deployment.
 */
export function resolveProductScope(value?: string | null): ProductScope {
  return (value || "").trim().toLowerCase() === "hr" ? "hr" : DEFAULT_PRODUCT_SCOPE;
}

/**
 * True when `path` belongs to the HR-only surface. Deny-by-default: a path with
 * no entry here is out of scope, mirroring how NAV_PERMISSION_MAP treats an
 * unmapped route as forbidden rather than free.
 */
export function isHrSurfacePath(path: string): boolean {
  const clean = stripQuery(path);
  if (HR_SHARED_PATHS.includes(clean)) return true;
  return HR_PATH_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(`${prefix}/`)
  );
}

function stripQuery(path: string): string {
  const base = (path || "/").split("?")[0].split("#")[0];
  const trimmed = base.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}
