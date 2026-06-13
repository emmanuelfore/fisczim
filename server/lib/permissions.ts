import {
  ALL_PERMISSION_KEYS,
  LEGACY_ROLE_PERMISSIONS,
  PermissionKey,
  ALL_PERMISSIONS,
} from "../../shared/permissions.js";
import { storage } from "../storage.js";

export async function getUserPermissions(
  userId: string,
  companyId: number,
  isSuperAdmin?: boolean
): Promise<Set<PermissionKey>> {
  if (isSuperAdmin) {
    const user = await storage.getUser(userId);
    const isSystemAdmin = user?.email === 'admin@zimra.co.zw';
    if (!isSystemAdmin) {
      const company = await storage.getCompany(companyId);
      if (!company || company.superadminVisible === false) {
        return new Set();
      }
      const systemAdminOnlyCompanies = new Set(['goosehill trading', 'glorious tire services', 'spares arena']);
      const companyName = (company.name || "").toLowerCase();
      const tradingName = (company.tradingName || "").toLowerCase();
      if (systemAdminOnlyCompanies.has(companyName) || systemAdminOnlyCompanies.has(tradingName)) {
        return new Set();
      }
    }
    return new Set(ALL_PERMISSION_KEYS);
  }

  const membership = await storage.getCompanyMembership(userId, companyId);
  if (!membership) return new Set();

  if (membership.legacyRole === "owner") {
    return new Set(ALL_PERMISSION_KEYS);
  }

  if (membership.companyRoleId) {
    const perms = await storage.getRolePermissions(membership.companyRoleId);
    return new Set(perms);
  }

  const legacy = membership.legacyRole || "member";
  const mapped = LEGACY_ROLE_PERMISSIONS[legacy] || LEGACY_ROLE_PERMISSIONS.member;
  return new Set(mapped);
}

export async function userHasPermission(
  userId: string,
  companyId: number,
  permission: PermissionKey,
  isSuperAdmin?: boolean
): Promise<boolean> {
  const perms = await getUserPermissions(userId, companyId, isSuperAdmin);
  return perms.has(permission);
}

export async function userHasAnyPermission(
  userId: string,
  companyId: number,
  permissions: PermissionKey[],
  isSuperAdmin?: boolean
): Promise<boolean> {
  const perms = await getUserPermissions(userId, companyId, isSuperAdmin);
  return permissions.some((p) => perms.has(p));
}

export function getPermissionCatalog() {
  return ALL_PERMISSIONS;
}

export async function canPerformDirectAction(
  userId: string,
  companyId: number,
  directPermission: PermissionKey,
  isSuperAdmin?: boolean
): Promise<boolean> {
  return userHasPermission(userId, companyId, directPermission, isSuperAdmin);
}

/** @deprecated Use resolveActionAccess from approval-policies.ts */
export async function canRequestAction(
  userId: string,
  companyId: number,
  requestPermission: PermissionKey,
  directPermission: PermissionKey,
  isSuperAdmin?: boolean
): Promise<{ allowed: boolean; requiresApproval: boolean }> {
  const perms = await getUserPermissions(userId, companyId, isSuperAdmin);
  if (perms.has(directPermission)) {
    return { allowed: true, requiresApproval: false };
  }
  if (perms.has(requestPermission)) {
    return { allowed: true, requiresApproval: true };
  }
  return { allowed: false, requiresApproval: false };
}
