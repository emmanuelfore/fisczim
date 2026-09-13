// Revenue Services Lesotho (RSL) LEKAKU gateway defaults.
// Shared by client (settings placeholders) and server (submit fallback)
// so both sides agree on the endpoint.
export const LEKAKU_TEST_GATEWAY = "https://lekukaapi.rsl.org.ls:8443";
export const LEKAKU_PROD_GATEWAY = "https://lekukaapi.rsl.org.ls";
// Default remains test so existing deployments without env stay on test.
// Fiscalization picks prod vs test based on company.zimraEnvironment if
// lekakuGatewayUrl is not explicitly set — mirrors ZIMRA's env switch.
export const LEKAKU_DEFAULT_GATEWAY = LEKAKU_TEST_GATEWAY;

export function getLekukaGatewayUrl(environment?: string | null): string {
  return environment === "production" ? LEKAKU_PROD_GATEWAY : LEKAKU_TEST_GATEWAY;
}
