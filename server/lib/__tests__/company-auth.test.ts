import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  attachApiKeyContext,
  createRequireAuthOrApiKey,
  createRequireOwner,
  resolveRequestedCompanyId,
  type CompanyAuthStorage,
} from "../company-auth.js";

function createStorageMock(): CompanyAuthStorage {
  return {
    getCompanyByApiKey: vi.fn(),
    getCompany: vi.fn(),
    getCompanies: vi.fn(),
  };
}

function createReq(overrides: Record<string, any> = {}) {
  return {
    headers: {},
    params: {},
    originalUrl: "",
    path: "",
    user: undefined,
    company: undefined,
    isAuthenticated: () => false,
    ...overrides,
  } as any;
}

function createRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
  };

  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  res.json = (body: any) => {
    res.body = body;
    return res;
  };

  return res;
}

describe("company auth hardening", () => {
  let storage: CompanyAuthStorage;

  beforeEach(() => {
    storage = createStorageMock();
  });

  test("allows API key access only on approved integration paths", async () => {
    vi.mocked(storage.getCompanyByApiKey).mockResolvedValue({ id: 7, name: "Tenant A" });
    const req = createReq({
      headers: { "x-api-key": "valid-key" },
      originalUrl: "/api/system/users",
      path: "/api/system/users",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireAuthOrApiKey(storage)(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("API key access is not allowed");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects API key requests that target another company id in the path", async () => {
    vi.mocked(storage.getCompanyByApiKey).mockResolvedValue({ id: 7, name: "Tenant A" });
    const req = createReq({
      headers: { "x-api-key": "valid-key" },
      params: { companyId: "8" },
      originalUrl: "/api/companies/8/zimra/status",
      path: "/api/companies/8/zimra/status",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireAuthOrApiKey(storage)(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("does not belong to this company");
    expect(next).not.toHaveBeenCalled();
  });

  test("attaches company context for allowed API key routes", async () => {
    vi.mocked(storage.getCompanyByApiKey).mockResolvedValue({ id: 7, name: "Tenant A" });
    const req = createReq({
      headers: { "x-api-key": "valid-key" },
      params: { id: "7" },
      originalUrl: "/api/companies/7/zimra/status",
      path: "/api/companies/7/zimra/status",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireAuthOrApiKey(storage)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.company).toEqual({ id: 7, name: "Tenant A" });
    expect(req.apiKeyCompanyId).toBe(7);
    expect(req.user).toMatchObject({ companyId: 7, isApiKey: true });
  });

  test("allows the /api/fiscal alias, which resolves the tenant from the key", async () => {
    vi.mocked(storage.getCompanyByApiKey).mockResolvedValue({ id: 7, name: "Tenant A" });
    const req = createReq({
      headers: { "x-api-key": "valid-key" },
      params: {},
      originalUrl: "/api/fiscal/device-details",
      path: "/api/fiscal/device-details",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireAuthOrApiKey(storage)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.apiKeyCompanyId).toBe(7);
  });

  test("company id 0 in the path is not a tenant, so the key's company is used", async () => {
    vi.mocked(storage.getCompanyByApiKey).mockResolvedValue({ id: 7, name: "Tenant A" });
    const req = createReq({
      headers: { "x-api-key": "valid-key" },
      params: { id: "0" },
      originalUrl: "/api/companies/0/zimra/offline-state",
      path: "/api/companies/0/zimra/offline-state",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireAuthOrApiKey(storage)(req, res, next);

    expect(resolveRequestedCompanyId(req)).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(req.apiKeyCompanyId).toBe(7);
  });

  test("rejects authenticated users without company membership on company-scoped routes", async () => {
    vi.mocked(storage.getCompanies).mockResolvedValue([{ id: 9, role: "owner" }]);
    const req = createReq({
      isAuthenticated: () => true,
      user: { id: "user-1", isSuperAdmin: false },
      params: { companyId: "8" },
      originalUrl: "/api/companies/8/branches",
      path: "/api/companies/8/branches",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireAuthOrApiKey(storage)(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("do not have access");
    expect(next).not.toHaveBeenCalled();
  });

  test("owner-protected routes still allow legacy company admins", async () => {
    vi.mocked(storage.getCompanies).mockResolvedValue([{ id: 7, role: "admin" }]);
    const req = createReq({
      isAuthenticated: () => true,
      user: { id: "user-1", isSuperAdmin: false },
      params: { companyId: "7" },
      originalUrl: "/api/companies/7/api-key",
      path: "/api/companies/7/api-key",
    });
    const res = createRes();
    const next = vi.fn();

    await createRequireOwner(storage)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  test("attachApiKeyContext preserves an existing authenticated user", () => {
    const req = createReq({
      user: { id: "user-1", isSuperAdmin: true },
    });

    attachApiKeyContext(req, { id: 12, name: "Tenant A" });

    expect(req.company).toEqual({ id: 12, name: "Tenant A" });
    expect(req.apiKeyCompanyId).toBe(12);
    expect(req.user).toEqual({ id: "user-1", isSuperAdmin: true });
  });
});
