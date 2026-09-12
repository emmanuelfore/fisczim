import { describe, expect, test } from "vitest";
import {
  getFiscalStateCarrier,
  getFiscalStateOwnerKey,
  hasDedicatedBranchFiscalDevice,
} from "../fiscal-state.js";

describe("fiscal state ownership", () => {
  const company = {
    id: 7,
    lastReceiptGlobalNo: 10,
    dailyReceiptCount: 4,
    lastFiscalHash: "company-hash",
  };

  test("keeps company state authoritative when a branch does not have full fiscal credentials", () => {
    const branch = {
      id: 15,
      companyId: 7,
      fdmsDeviceId: "321",
      zimraPrivateKey: null,
      zimraCertificate: "cert",
      lastReceiptGlobalNo: 99,
    };

    expect(hasDedicatedBranchFiscalDevice(branch)).toBe(false);
    expect(getFiscalStateCarrier(company, branch)).toBe(company);
    expect(getFiscalStateOwnerKey(company.id, branch)).toBe(company.id);
  });

  test("switches ownership to the branch when it has its own FDMS device and keys", () => {
    const branch = {
      id: 15,
      companyId: 7,
      fdmsDeviceId: "321",
      zimraPrivateKey: "private-key",
      zimraCertificate: "cert",
      lastReceiptGlobalNo: 42,
      dailyReceiptCount: 11,
      lastFiscalHash: "branch-hash",
    };

    expect(hasDedicatedBranchFiscalDevice(branch)).toBe(true);
    expect(getFiscalStateCarrier(company, branch)).toBe(branch);
    expect(getFiscalStateOwnerKey(company.id, branch)).toBe(-15);
  });
});
