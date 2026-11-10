import { describe, expect, test } from "vitest";
import {
  resolveProductScope,
  isHrSurfacePath,
  HR_HOME_PATH,
} from "../../shared/product-scope";

describe("resolveProductScope", () => {
  test("defaults to the full platform when unset", () => {
    expect(resolveProductScope(undefined)).toBe("full");
    expect(resolveProductScope("")).toBe("full");
    expect(resolveProductScope(null)).toBe("full");
  });

  test("recognises hr in any case or with stray whitespace", () => {
    expect(resolveProductScope("hr")).toBe("hr");
    expect(resolveProductScope("  HR  ")).toBe("hr");
  });

  test("an unrecognised value never narrows the surface", () => {
    // A typo in a live deployment must not hide modules the customer pays for.
    expect(resolveProductScope("payroll")).toBe("full");
    expect(resolveProductScope("zimbabwe")).toBe("full");
  });
});

describe("isHrSurfacePath", () => {
  test("serves the HR screens", () => {
    for (const path of [
      "/hr",
      "/hr/payroll",
      "/hr/employees",
      "/hr/leave",
      "/hr/loans",
      "/hr/setup",
      "/hr/self-service",
      "/hr/reports/zimra",
      "/hr/reports/remittances",
      "/payroll",
    ]) {
      expect(isHrSurfacePath(path)).toBe(true);
    }
  });

  test("keeps the plumbing a signed-in customer needs", () => {
    for (const path of [
      "/",
      "/auth",
      "/onboarding",
      "/profile",
      "/subscription",
      "/approvals",
      "/settings",
      "/team-settings",
    ]) {
      expect(isHrSurfacePath(path)).toBe(true);
    }
  });

  test("denies every other module by default", () => {
    for (const path of [
      "/dashboard",
      "/pos",
      "/pos-login",
      "/products",
      "/invoices",
      "/inventory/purchase-orders",
      "/manufacturing/bom",
      "/accounting/reports/vat-return",
      "/freight/consignments",
      "/restaurant/orders",
      "/zimra-logs",
      "/reports/tax",
    ]) {
      expect(isHrSurfacePath(path)).toBe(false);
    }
  });

  test("ignores query strings and fragments", () => {
    expect(isHrSurfacePath("/hr/payroll?tab=runs")).toBe(true);
    expect(isHrSurfacePath("/settings?tab=app-mode")).toBe(true);
    expect(isHrSurfacePath("/pos#checkout")).toBe(false);
  });

  test("normalises trailing slashes", () => {
    expect(isHrSurfacePath("/hr/")).toBe(true);
    expect(isHrSurfacePath("/")).toBe(true);
  });

  test("does not treat a sibling prefix as in-scope", () => {
    // "/hr" must not swallow "/hrms" or "/payroll-runs".
    expect(isHrSurfacePath("/hrms")).toBe(false);
    expect(isHrSurfacePath("/payroll-runs")).toBe(false);
  });

  test("the HR home path is itself reachable", () => {
    expect(isHrSurfacePath(HR_HOME_PATH)).toBe(true);
  });
});
