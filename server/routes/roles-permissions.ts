import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage.js";
import { getPermissionCatalog, getUserPermissions } from "../lib/permissions.js";
import { approveRequest, createApprovalRequest, rejectRequest } from "../lib/approvals.js";
import { ALL_PERMISSION_KEYS, APPROVAL_TYPES, type ApprovalType } from "../../shared/permissions.js";
import {
  normalizeApprovalPolicies,
  getApprovalPolicyList,
  supportsAmountThreshold,
  APPROVAL_POLICY_MODES,
  type CompanyApprovalPolicies,
} from "../../shared/approval-policies.js";
import { deriveApprovalAmount, getCompanyApprovalPolicies, resolveActionAccess } from "../lib/approval-policies.js";
import { logAction } from "../audit.js";

export function createRolesPermissionsRouter(
  requireAuth: (req: any, res: any, next: any) => void
) {
  const router = Router();

  async function assertCompanyAccess(req: any, companyId: number) {
    const membership = await storage.getCompanyMembership(req.user!.id, companyId);
    if (!membership && !req.user?.isSuperAdmin) {
      throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
    return membership;
  }

  async function assertPermission(req: any, companyId: number, permission: string) {
    const perms = await getUserPermissions(req.user!.id, companyId, req.user?.isSuperAdmin);
    if (!perms.has(permission)) {
      throw Object.assign(new Error("Insufficient permissions"), { statusCode: 403 });
    }
  }

  router.get("/companies/:companyId/permissions/catalog", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      res.json(getPermissionCatalog());
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/my-permissions", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      const permissions = await getUserPermissions(req.user!.id, companyId, req.user?.isSuperAdmin);
      const membership = await storage.getCompanyMembership(req.user!.id, companyId);
      const approvalPolicies = await getCompanyApprovalPolicies(companyId);
      res.json({
        permissions: Array.from(permissions),
        legacyRole: membership?.legacyRole || "member",
        companyRoleId: membership?.companyRoleId || null,
        approvalPolicies,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/roles", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "roles.view");
      const roles = await storage.getCompanyRoles(companyId);
      res.json(roles);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/roles", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertPermission(req, companyId, "roles.manage");
      const body = z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        permissions: z.array(z.string()).default([]),
      }).parse(req.body);

      // Drop unknown/stale permission keys (e.g. legacy keys no longer in the
      // catalog) instead of failing the whole save.
      body.permissions = body.permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p));

      const role = await storage.createCompanyRole(companyId, body);
      res.status(201).json(role);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.patch("/companies/:companyId/roles/:roleId", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const roleId = Number(req.params.roleId);
      await assertPermission(req, companyId, "roles.manage");
      const body = z.object({
        name: z.string().min(2).optional(),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      }).parse(req.body);

      if (body.permissions) {
        // Drop unknown/stale permission keys instead of failing the whole save.
        body.permissions = body.permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p));
      }

      const role = await storage.updateCompanyRole(roleId, companyId, body);
      res.json(role);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.delete("/companies/:companyId/roles/:roleId", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const roleId = Number(req.params.roleId);
      await assertPermission(req, companyId, "roles.manage");
      await storage.deleteCompanyRole(roleId, companyId);
      res.json({ message: "Role deleted" });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/roles/:roleId/clone", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const roleId = Number(req.params.roleId);
      await assertPermission(req, companyId, "roles.manage");
      const source = await storage.getCompanyRole(roleId, companyId);
      if (!source) return res.status(404).json({ message: "Role not found" });

      const body = z.object({ name: z.string().min(2) }).parse(req.body);
      const role = await storage.createCompanyRole(companyId, {
        name: body.name,
        description: source.description ? `Cloned from ${source.name}` : undefined,
        permissions: source.permissions,
      });
      res.status(201).json(role);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.patch("/companies/:companyId/users/:userId/role-assignment", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const targetUserId = req.params.userId;
      await assertPermission(req, companyId, "users.manage");

      const body = z.object({
        companyRoleId: z.number().nullable().optional(),
        legacyRole: z.enum(["owner", "admin", "member", "cashier", "manufacturing", "sales", "accountant", "logistics", "manager", "hr", "procurement", "auditor", "restaurant"]).optional(),
      }).parse(req.body);

      if (body.legacyRole) {
        await storage.updateUserRole(targetUserId, companyId, body.legacyRole);
      }
      if (body.companyRoleId !== undefined) {
        if (body.companyRoleId !== null) {
          const role = await storage.getCompanyRole(body.companyRoleId, companyId);
          if (!role) return res.status(404).json({ message: "Role not found" });
        }
        await storage.assignUserCompanyRole(targetUserId, companyId, body.companyRoleId);
      }

      res.json({ message: "User role updated" });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/approvals", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "approvals.view");
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const requests = await storage.getApprovalRequests(companyId, status);
      res.json(requests);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/approvals/pending-count", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "approvals.view");
      const count = await storage.getPendingApprovalCount(companyId);
      res.json({ count });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/approvals", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      const body = z.object({
        type: z.enum(Object.values(APPROVAL_TYPES) as [ApprovalType, ...ApprovalType[]]),
        title: z.string().min(3),
        description: z.string().optional(),
        payload: z.record(z.unknown()),
        referenceType: z.string().optional(),
        referenceId: z.string().optional(),
      }).parse(req.body);

      if (body.type === APPROVAL_TYPES.PURCHASE_ORDER) {
        return res.status(400).json({ message: "Submit purchase orders from the purchasing workflow" });
      }

      // Verify the submitter has the request permission for this approval type
      const { REQUEST_ACTION_PERMISSION } = await import("../../shared/permissions.js");
      const requestPerm = REQUEST_ACTION_PERMISSION[body.type as keyof typeof REQUEST_ACTION_PERMISSION];
      if (requestPerm) {
        await assertPermission(req, companyId, requestPerm);
      }

      // Re-evaluate monetary authority from the stored source document rather
      // than any amount the caller declared. A client cannot understate a
      // transaction to keep it below a configured threshold.
      const derivedAmount = deriveApprovalAmount(body.type, body.payload);
      const access = await resolveActionAccess(
        req.user!.id,
        companyId,
        body.type,
        !!req.user?.isSuperAdmin,
        { amount: derivedAmount },
      );
      if (!access.allowed) {
        throw Object.assign(new Error("You do not have permission to submit this approval"), { statusCode: 403 });
      }

      const trustedPayload = { ...body.payload };
      delete trustedPayload.__approvalAmount;
      if (derivedAmount != null) trustedPayload.__approvalAmount = derivedAmount;

      const request = await createApprovalRequest({
        companyId,
        type: body.type,
        title: body.title,
        description: body.description,
        payload: trustedPayload,
        referenceType: body.referenceType,
        referenceId: body.referenceId,
        requestedBy: req.user!.id,
      });
      res.status(201).json(request);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/approvals/:id/approve", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "approvals.action");
      const { reviewNotes } = z.object({ reviewNotes: z.string().optional() }).parse(req.body || {});
      const result = await approveRequest(id, companyId, req.user!.id, !!req.user?.isSuperAdmin, reviewNotes);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/approvals/:id/reject", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "approvals.action");
      const { reviewNotes } = z.object({ reviewNotes: z.string().optional() }).parse(req.body || {});
      const result = await rejectRequest(id, companyId, req.user!.id, !!req.user?.isSuperAdmin, reviewNotes);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  // Failed executions may have produced side effects. They are terminal and
  // can only be closed by an administrator after manual reconciliation.
  router.post("/companies/:companyId/approvals/:id/resolve-failed", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "approvals.admin");
      const { reviewNotes } = z.object({
        reviewNotes: z.string().trim().min(5, "Describe the reconciliation action"),
      }).parse(req.body || {});
      const result = await storage.resolveFailedApprovalRequest(
        id,
        companyId,
        req.user!.id,
        reviewNotes,
      );
      if (!result) return res.status(404).json({ message: "Failed approval request not found" });
      await logAction(companyId, req.user!.id, "APPROVAL_EXECUTION_RESOLVED", "approval_request", String(id), {
        type: result.type,
        reviewNotes,
      });
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/approval-policies", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "roles.view");
      const policies = await getCompanyApprovalPolicies(companyId);
      const roles = await storage.getCompanyRoles(companyId);
      const users = await storage.getCompanyUsers(companyId);
      res.json({
        policies,
        items: getApprovalPolicyList(policies),
        modes: APPROVAL_POLICY_MODES,
        approverRoles: roles.map((role) => ({ id: role.id, name: role.name })),
        approverUsers: users.map((user) => ({ id: user.id, name: user.name || user.username || user.email })),
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.patch("/companies/:companyId/approval-policies", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "roles.manage");
      const body = z.object({
        policies: z.record(
          z.object({
            mode: z.enum(["disabled", "by_permission", "always"]).optional(),
            amountThreshold: z.number().min(0).optional(),
            ownerBypass: z.boolean().optional(),
            allowSelfApproval: z.boolean().optional(),
            approverUserIds: z.array(z.string()).optional(),
            approverRoleIds: z.array(z.coerce.number().int().positive()).optional(),
          })
        ),
        reason: z.string().trim().min(5).optional(),
      }).parse(req.body);

      const knownTypes = new Set<string>(Object.values(APPROVAL_TYPES));
      const unknownTypes = Object.keys(body.policies).filter((type) => !knownTypes.has(type));
      if (unknownTypes.length) {
        throw Object.assign(new Error(`Unknown approval types: ${unknownTypes.join(", ")}`), { statusCode: 400 });
      }

      const selfApprovalTypes = (Object.entries(body.policies) as [ApprovalType, any][])
        .filter(([, policy]) => policy.allowSelfApproval === true)
        .map(([type]) => type);
      if (selfApprovalTypes.length && !body.reason) {
        throw Object.assign(
          new Error("A written justification is required when enabling self-approval"),
          { statusCode: 400 },
        );
      }

      const current = await getCompanyApprovalPolicies(companyId);
      const before = JSON.parse(JSON.stringify(current));
      const merged = { ...current } as CompanyApprovalPolicies;
      for (const [type, patch] of Object.entries(body.policies) as [ApprovalType, any][]) {
        if (patch.amountThreshold !== undefined && !supportsAmountThreshold(type)) {
          throw Object.assign(
            new Error(`${type} does not support a monetary threshold`),
            { statusCode: 400 },
          );
        }
        merged[type] = { ...merged[type], ...patch };
      }

      const policies = normalizeApprovalPolicies(merged) as CompanyApprovalPolicies;
      const company = await storage.updateCompany(companyId, { approvalSettings: policies as any });
      await logAction(companyId, req.user!.id, "APPROVAL_POLICIES_UPDATED", "company", String(companyId), {
        reason: body.reason ?? null,
        selfApprovalTypes,
        changedTypes: Object.keys(body.policies),
        before,
        after: policies,
      });
      res.json({
        policies: normalizeApprovalPolicies(company.approvalSettings),
        items: getApprovalPolicyList(normalizeApprovalPolicies(company.approvalSettings)),
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({ message: err.message });
    }
  });

  return router;
}
