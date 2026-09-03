import type { NextFunction, Request, Response } from "express";

type CompanyLike = {
  id: number;
  name?: string | null;
  tradingName?: string | null;
  superadminVisible?: boolean | null;
};

type CompanyMembership = {
  id: number;
  role?: string | null;
};

type UserLike = {
  id?: string | null;
  email?: string | null;
  isSuperAdmin?: boolean | null;
};

export type CompanyScopedRequest = Request & {
  company?: CompanyLike;
  apiKeyCompanyId?: number;
  user?: UserLike & { companyId?: number | null; isApiKey?: boolean };
  isAuthenticated?: () => boolean;
};

export interface CompanyAuthStorage {
  getCompanyByApiKey(apiKey: string): Promise<CompanyLike | undefined>;
  getCompany(companyId: number): Promise<CompanyLike | undefined>;
  getCompanies(userId: string): Promise<CompanyMembership[]>;
}

const SYSTEM_ADMIN_EMAIL_B64 = "YWRtaW5AemltcmEuY28uenc=";
const SYSTEM_ADMIN_ONLY_COMPANIES = new Set([
  "goosehill trading",
  "glorious tire services",
  "spares arena",
]);

const API_KEY_PATH_ALLOWLIST = [
  /^\/api\/v1(?:\/|$)/,
  /^\/api\/zimra(?:\/|$)/,
  /^\/api\/companies\/\d+\/zimra(?:\/|$)/,
];

function normalizePath(req: Pick<Request, "originalUrl" | "path">): string {
  return String(req.originalUrl || req.path || "").split("?")[0];
}

export function isSystemAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return Buffer.from(String(email).toLowerCase()).toString("base64") === SYSTEM_ADMIN_EMAIL_B64;
}

export function resolveRequestedCompanyId(
  req: Pick<Request, "params" | "originalUrl" | "path">,
): number | undefined {
  const companyIdParam = req.params?.companyId;
  if (companyIdParam) {
    const parsed = Number(companyIdParam);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  const path = normalizePath(req);
  const companyPathMatch = path.match(/^\/api\/companies\/(\d+)(?:\/|$)/);
  if (companyPathMatch) {
    const parsed = Number(companyPathMatch[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

export function isApiKeyRouteAllowed(req: Pick<Request, "originalUrl" | "path">): boolean {
  const path = normalizePath(req);
  return API_KEY_PATH_ALLOWLIST.some((pattern) => pattern.test(path));
}

export function attachApiKeyContext(req: CompanyScopedRequest, company: CompanyLike) {
  req.company = company;
  req.apiKeyCompanyId = company.id;

  if (!req.user) {
    req.user = { companyId: company.id, isApiKey: true } as any;
  }
}

export async function checkCompanyAccess(
  storage: CompanyAuthStorage,
  user: UserLike | undefined,
  companyId: number,
): Promise<boolean> {
  if (!user) return false;

  if (user.isSuperAdmin) {
    if (isSystemAdminEmail(user.email)) return true;

    const company = await storage.getCompany(companyId);
    if (!company || company.superadminVisible === false) return false;

    const companyName = (company.name || "").toLowerCase();
    const tradingName = (company.tradingName || "").toLowerCase();
    return !(
      SYSTEM_ADMIN_ONLY_COMPANIES.has(companyName) ||
      SYSTEM_ADMIN_ONLY_COMPANIES.has(tradingName)
    );
  }

  if (!user.id) return false;
  const userCompanies = await storage.getCompanies(user.id);
  return userCompanies.some((company) => company.id === companyId);
}

export function createRequireAuthOrApiKey(storage: CompanyAuthStorage) {
  return async function requireAuthOrApiKey(
    req: CompanyScopedRequest,
    res: Response,
    next: NextFunction,
  ) {
    const apiKey = req.headers["x-api-key"];
    const requestedCompanyId = resolveRequestedCompanyId(req);

    if (typeof apiKey === "string" && apiKey.trim()) {
      const company = await storage.getCompanyByApiKey(apiKey);
      if (!company) {
        return res.status(401).json({ message: "Unauthorized: Invalid API key" });
      }

      if (!isApiKeyRouteAllowed(req)) {
        return res.status(403).json({ message: "Forbidden: API key access is not allowed for this route" });
      }

      if (requestedCompanyId && requestedCompanyId !== company.id) {
        return res.status(403).json({ message: "Forbidden: API key does not belong to this company" });
      }

      attachApiKeyContext(req, company);
      return next();
    }

    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized: Authentication required" });
    }

    if (requestedCompanyId) {
      const hasAccess = await checkCompanyAccess(storage, req.user, requestedCompanyId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden: You do not have access to this company" });
      }
    }

    return next();
  };
}

export function createRequireOwner(storage: CompanyAuthStorage) {
  return async function requireOwner(
    req: CompanyScopedRequest,
    res: Response,
    next: NextFunction,
  ) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized: Authentication required" });
    }

    const companyId = resolveRequestedCompanyId(req);
    if (companyId) {
      const hasAccess = await checkCompanyAccess(storage, req.user, companyId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Forbidden: You do not have access to this company" });
      }
    }

    if (req.user?.isSuperAdmin) {
      return next();
    }

    if (!companyId || !req.user?.id) {
      return res.status(403).json({ message: "Forbidden: Company ownership required" });
    }

    const companies = await storage.getCompanies(req.user.id);
    const userCompany = companies.find((company) => company.id === companyId);
    if (!userCompany || (userCompany.role !== "owner" && userCompany.role !== "admin")) {
      return res.status(403).json({ message: "Forbidden: Owner or admin access required for this company" });
    }

    return next();
  };
}
