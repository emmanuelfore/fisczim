import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { recoverFromStaleCompanyAccess } from "./api";

vi.mock("./auth", () => ({ auth: { getAccessToken: () => null } }));

const selection = new Map<string, string>();
const dispatchEvent = vi.fn();

beforeEach(() => {
  selection.set("selectedCompanyId", "7");
  selection.set("selectedBranchId", "3");
  dispatchEvent.mockClear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => selection.get(key),
    removeItem: (key: string) => selection.delete(key),
  });
  vi.stubGlobal("window", { location: { origin: "http://localhost:5001" }, dispatchEvent });
});

afterEach(() => vi.unstubAllGlobals());

test.each([
  ["sample-documents", "Sample document creation is disabled in production"],
  ["sample-script", "You do not have permission to download scripts for this company"],
  ["config/reset", "Manual FDMS counter edits are disabled"],
])("preserves company and branch on a forbidden ZIMRA %s action", async (action, message) => {
  const response = Response.json({ message }, { status: 403 });

  await recoverFromStaleCompanyAccess(`/api/companies/7/zimra/${action}`, response);

  expect(selection.get("selectedCompanyId")).toBe("7");
  expect(selection.get("selectedBranchId")).toBe("3");
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({ message });
});

test("clears the selection when access to the selected company is denied", async () => {
  const response = Response.json({ code: "COMPANY_ACCESS_DENIED" }, { status: 403 });

  await recoverFromStaleCompanyAccess("/api/companies/7/zimra/sample-script", response);

  expect(selection.size).toBe(0);
  expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
    type: "company-access-denied",
    detail: { companyId: 7 },
  }));
});
