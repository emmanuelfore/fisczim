// Revenue Services Lesotho (RSL) LEKUKA gateway defaults.
// Shared by client (settings placeholders) and server (submit fallback)
// so both sides agree on the endpoint.
export const LEKUKA_TEST_GATEWAY = "https://lekukaapi.rsl.org.ls:8443";
export const LEKUKA_PROD_GATEWAY = "https://lekukaapi.rsl.org.ls";
// Default remains test so existing deployments without env stay on test.
// Fiscalization picks prod vs test based on company.zimraEnvironment if
// lekukaGatewayUrl is not explicitly set — mirrors ZIMRA's env switch.
export const LEKUKA_DEFAULT_GATEWAY = LEKUKA_TEST_GATEWAY;

export function getLekukaGatewayUrl(environment?: string | null): string {
  return environment === "production" ? LEKUKA_PROD_GATEWAY : LEKUKA_TEST_GATEWAY;
}
