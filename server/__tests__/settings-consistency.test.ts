import { describe, expect, test } from "vitest";
import { resolveWorkspaceMode } from "../../shared/app-mode";
import { isFeatureModuleEnabled } from "../../shared/feature-modules";
import {
  APPROVAL_TYPES,
  DIRECT_ACTION_PERMISSION,
  LEGACY_ROLE_PERMISSIONS,
} from "../../shared/permissions";
import { DEFAULT_APPROVAL_POLICIES } from "../../shared/approval-policies";
import { rateAsPercent } from "../../shared/statutory/brackets";

describe("workspace and module settings", () => {
  test("module visibility does not decide the workspace", () => {
    // A company may show Bus as an extra module while remaining a POS workspace.
    const modules = { bus: true };
    expect(isFeatureModuleEnabled(modules, "bus", { appMode: "pos" })).toBe(true);
    expect(resolveWorkspaceMode("pos", false)).toBe("pos");
  });

  test("explicit module off wins even in its native workspace", () => {
    expect(isFeatureModuleEnabled({ restaurant: false }, "restaurant", { appMode: "restaurant" })).toBe(false);
    expect(isFeatureModuleEnabled({ bus: false }, "bus", { appMode: "bus_ticketing" })).toBe(false);
  });

  test("legacy bus flag keeps the bus workspace until App Mode clears it", () => {
    expect(resolveWorkspaceMode("pos", true)).toBe("bus_ticketing");
    expect(resolveWorkspaceMode("restaurant", true)).toBe("bus_ticketing");
    expect(resolveWorkspaceMode("bus_ticketing", false)).toBe("bus_ticketing");
  });
});

describe("role and approval defaults", () => {
  test("roles with granular settings permissions can reach settings", () => {
    expect(LEGACY_ROLE_PERMISSIONS.finance_director).toContain("nav.settings");
    expect(LEGACY_ROLE_PERMISSIONS.tax_officer).toContain("nav.settings");
  });

  test("commission direct action still requires approve permission", () => {
    expect(DIRECT_ACTION_PERMISSION.sales_commission).toBe("crm.commission.approve");
  });

  test("every approval type starts disabled", () => {
    for (const type of Object.values(APPROVAL_TYPES)) {
      expect(DEFAULT_APPROVAL_POLICIES[type].mode).toBe("disabled");
    }
  });
});

describe("tax bracket rates", () => {
  test("legacy fraction rows display as percentages", () => {
    expect(rateAsPercent(0.2)).toBe(20);
    expect(rateAsPercent(20)).toBe(20);
  });
});
