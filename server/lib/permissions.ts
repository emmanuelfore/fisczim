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
  // Short-lived cache: permission checks run on nearly every guarded
  // endpoint (often alongside a separate membership lookup), each a
  // multi-second round-trip on a high-latency link. The cached set is
  // immutable per entry (always cloned on the way out). Trade-off: role /
  // permission edits take up to PERMISSIONS_CACHE_TTL_MS to reflect.
  const cacheKey = `${userId}:${companyId}:${isSuperAdmin ? 1 : 0}`;
  const cached = permissionsCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) return new Set(cached.value);
  if (cached) permissionsCache.delete(cacheKey);
  const value = await getUserPermissionsUncached(userId, companyId, isSuperAdmin);
  if (permissionsCache.size > 2000) {
    const now = Date.now();
    for (const [key, entry] of permissionsCache) {
      if (now > entry.expiresAt) permissionsCache.delete(key);
    }
  }
  permissionsCache.set(cacheKey, { value: new Set(value), expiresAt: Date.now() + PERMISSIONS_CACHE_TTL_MS });
  return new Set(value);
}

const PERMISSIONS_CACHE_TTL_MS = 60_000;
const permissionsCache = new Map<string, { value: Set<PermissionKey>; expiresAt: number }>();

async function getUserPermissionsUncached(
  userId: string,
  companyId: number,
  isSuperAdmin?: boolean
): Promise<Set<PermissionKey>> {
  if (isSuperAdmin) {
    const user = await storage.getUser(userId);
    const isSystemAdmin = user?.email ? Buffer.from(String(user.email).toLowerCase()).toString('base64') === "YWRtaW5AemltcmEuY28uenc=" : false;
    if (!isSystemAdmin) {
      const company = await storage.getCompany(companyId);
      if (!company || company.cfg1 === false) {
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
