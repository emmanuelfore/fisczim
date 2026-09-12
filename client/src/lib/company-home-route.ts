import { normalizeAppMode } from "@shared/app-mode";
import { normalizeBusSettings } from "@shared/bus-settings";

type CompanyLike = {
  id?: number;
  role?: string | null;
  appMode?: unknown;
  busSettings?: unknown;
};

function pickActiveCompany(companies: CompanyLike[]) {
  const storedId = Number(localStorage.getItem("selectedCompanyId") || "0");
  const storedCompany = Number.isFinite(storedId)
    ? companies.find((company) => company.id === storedId)
    : undefined;

  return storedCompany ||
    companies.find((company) => company.role === "owner") ||
    companies.find((company) => company.role === "cashier") ||
    companies[0];
}

export function getCompanyHomeRoute(companies: CompanyLike[] | undefined, user?: { isSuperAdmin?: boolean } | null) {
  if (!Array.isArray(companies) || companies.length === 0) return "/onboarding";

  const company = pickActiveCompany(companies);
  const isCashier = company?.role === "cashier" && !user?.isSuperAdmin;
  if (isCashier) return "/pos";

  const appMode = normalizeAppMode(company?.appMode);
  const busSettings = normalizeBusSettings(company?.busSettings);
  if (appMode === "bus_ticketing" || busSettings.enabled) return "/bus/dashboard";

  return "/dashboard";
}
