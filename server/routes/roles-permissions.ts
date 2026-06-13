import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage.js";
import { getPermissionCatalog, getUserPermissions } from "../lib/permissions.js";
import { approveRequest, createApprovalRequest, rejectRequest } from "../lib/approvals.js";
import { ALL_PERMISSION_KEYS } from "../../shared/permissions.js";
import {
  normalizeApprovalPolicies,
  getApprovalPolicyList,
  APPROVAL_POLICY_MODES,
  type CompanyApprovalPolicies,
} from "../../shared/approval-policies.js";
import { getCompanyApprovalPolicies } from "../lib/approval-policies.js";

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

      const invalid = body.permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
      if (invalid.length > 0) {
        return res.status(400).json({ message: `Invalid permissions: ${invalid.join(", ")}` });
      }

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
        const invalid = body.permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
        if (invalid.length > 0) {
          return res.status(400).json({ message: `Invalid permissions: ${invalid.join(", ")}` });
        }
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
        legacyRole: z.enum(["owner", "admin", "member", "cashier"]).optional(),
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
      const count = await storage.getPendingApprovalCount(companyId);
      res.json({ count });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/approvals", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const body = z.object({
        type: z.enum(["stock_adjustment", "grn_confirm", "journal_post", "invoice_issue"]),
        title: z.string().min(3),
        description: z.string().optional(),
        payload: z.record(z.unknown()),
        referenceType: z.string().optional(),
        referenceId: z.string().optional(),
      }).parse(req.body);

      const request = await createApprovalRequest({
        companyId,
        type: body.type,
        title: body.title,
        description: body.description,
        payload: body.payload,
        referenceType: body.referenceType,
        referenceId: body.referenceId,
        requestedBy: req.user!.id,
      });
      res.status(201).json(request);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/approvals/:id/approve", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      const { reviewNotes } = z.object({ reviewNotes: z.string().optional() }).parse(req.body || {});
      const result = await approveRequest(id, companyId, req.user!.id, !!req.user?.isSuperAdmin, reviewNotes);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/approvals/:id/reject", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      const { reviewNotes } = z.object({ reviewNotes: z.string().optional() }).parse(req.body || {});
      const result = await rejectRequest(id, companyId, req.user!.id, !!req.user?.isSuperAdmin, reviewNotes);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/approval-policies", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertCompanyAccess(req, companyId);
      await assertPermission(req, companyId, "roles.view");
      const policies = await getCompanyApprovalPolicies(companyId);
      res.json({
        policies,
        items: getApprovalPolicyList(policies),
        modes: APPROVAL_POLICY_MODES,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });

  router.patch("/companies/:companyId/approval-policies", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      await assertPermission(req, companyId, "roles.manage");
      const body = z.object({
        policies: z.record(
          z.object({
            mode: z.enum(["disabled", "by_permission", "always"]),
            amountThreshold: z.number().min(0).optional(),
            ownerBypass: z.boolean().optional(),
          })
        ),
      }).parse(req.body);

      const policies = normalizeApprovalPolicies(body.policies) as CompanyApprovalPolicies;
      const company = await storage.updateCompany(companyId, { approvalSettings: policies as any });
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
