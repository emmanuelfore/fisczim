import { describe, expect, test } from "vitest";
import { isHrOnly, isPathInScope, productScope } from "../product-scope";

/**
 * Guards the default build. VITE_PRODUCT_SCOPE is unset for every existing
 * deployment, so a plain test run must see the full platform — if this ever
 * fails, the flag leaked into a build and would hide modules from live tenants.
 */
describe("default build surface", () => {
  test("scope resolves to full when the flag is unset", () => {
    expect(productScope).toBe("full");
    expect(isHrOnly).toBe(false);
  });

  test("nothing is hidden", () => {
    for (const path of ["/dashboard", "/pos", "/products", "/accounting/reports/vat-return", "/hr"]) {
      expect(isPathInScope(path)).toBe(true);
    }
  });
});
