import { describe, expect, test } from "vitest";
import {
  APPROVAL_TYPES,
  APPROVAL_TYPE_LABELS,
  APPROVAL_TYPE_PERMISSION,
  DIRECT_ACTION_PERMISSION,
  LEGACY_ROLE_PERMISSIONS,
  REQUEST_ACTION_PERMISSION,
} from "../../shared/permissions.js";
import {
  DEFAULT_APPROVAL_POLICIES,
  normalizeApprovalPolicies,
  supportsAmountThreshold,
} from "../../shared/approval-policies.js";

describe("purchase requisition approval registration", () => {
  test("the approval type is fully wired into the central framework", () => {
    expect(APPROVAL_TYPES.REQUISITION).toBe("requisition");
    expect(APPROVAL_TYPE_LABELS.requisition).toBe("Purchase Requisition");
    expect(REQUEST_ACTION_PERMISSION.requisition).toBe("purchasing.requisition.request");
    expect(DIRECT_ACTION_PERMISSION.requisition).toBe("purchasing.requisition.direct");
    expect(APPROVAL_TYPE_PERMISSION.requisition).toBe("purchasing.requisition.approve");
    expect(DEFAULT_APPROVAL_POLICIES.requisition.mode).toBe("disabled");
    expect(supportsAmountThreshold("requisition")).toBe(false);
  });

  test("stored policies without requisition normalize to a SoD-safe default", () => {
    const policies = normalizeApprovalPolicies({
      requisition: { mode: "always", approverUserIds: ["manager-1"] },
    });
    expect(policies.requisition.mode).toBe("always");
    expect(policies.requisition.approverUserIds).toEqual(["manager-1"]);
    expect(policies.requisition.allowSelfApproval).toBeUndefined();
  });

  test("operational roles can raise or approve requisitions, but not both by default", () => {
    expect(LEGACY_ROLE_PERMISSIONS.procurement).toContain("purchasing.requisition.request");
    expect(LEGACY_ROLE_PERMISSIONS.procurement).not.toContain("purchasing.requisition.approve");
    expect(LEGACY_ROLE_PERMISSIONS.manager).toContain("purchasing.requisition.approve");
    expect(LEGACY_ROLE_PERMISSIONS.finance_director).toContain("purchasing.requisition.approve");
  });
});
