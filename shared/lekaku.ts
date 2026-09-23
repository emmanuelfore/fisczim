// Revenue Services Lesotho (RSL) LEKAKU gateway defaults.
// Shared by client (settings placeholders) and server (submit fallback)
// so both sides agree on the endpoint.
export const LEKAKU_TEST_GATEWAY = "https://lekukaapi.rsl.org.ls:8443";
export const LEKAKU_PROD_GATEWAY = "https://lekukaapi.rsl.org.ls";
// Default remains test so existing deployments without env stay on test.
// Fiscalization picks prod vs test based on company.zimraEnvironment if
// lekakuGatewayUrl is not explicitly set — mirrors ZIMRA's env switch.
export const LEKAKU_DEFAULT_GATEWAY = LEKAKU_TEST_GATEWAY;

export function getLekakuGatewayUrl(environment?: string | null): string {
  return environment === "production" ? LEKAKU_PROD_GATEWAY : LEKAKU_TEST_GATEWAY;
}

/**
 * True when a company belongs on the RSL/LEKAKU fiscal path.
 * Accepts both spellings in the wild ("LEKAKU" branch shorthand and RSL's
 * own "LEKUKA" product name). An explicit non-Lekaku provider (e.g. ZIMRA)
 * always wins; the Lesotho country fallback only applies when no provider
 * is set — mirroring the original hook semantics.
 */
export function isLekakuProvider(provider?: string | null, country?: string | null): boolean {
  const p = (provider || "").trim().toUpperCase();
  if (p === "LEKAKU" || p === "LEKUKA") return true;
  if (p) return false;
  return (country || "").trim().toLowerCase() === "lesotho";
}
