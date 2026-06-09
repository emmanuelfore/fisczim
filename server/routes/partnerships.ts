import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage.js";
import { normalizePartnershipSettings, partnershipSettingsSchema } from "../../shared/partnership.js";

export function createPartnershipsRouter(requireAuth: (req: any, res: any, next: any) => void) {
  const router = Router();

  router.get("/companies/:companyId/partners", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const partners = await storage.getCompanyPartners(companyId);
      res.json(partners);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.post("/companies/:companyId/partners", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const body = z.object({
        name: z.string().min(2),
        tradingName: z.string().optional(),
        logoUrl: z.string().optional(),
        tin: z.string().optional(),
        vatNumber: z.string().optional(),
        displayLabel: z.string().optional(),
        defaultRevenueSharePercent: z.number().min(0).max(100).optional(),
        ownerGroupMatch: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      const partner = await storage.createCompanyPartner(companyId, {
        ...body,
        defaultRevenueSharePercent: body.defaultRevenueSharePercent != null
          ? String(body.defaultRevenueSharePercent)
          : undefined,
      });
      res.status(201).json(partner);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.patch("/companies/:companyId/partners/:partnerId", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const partnerId = Number(req.params.partnerId);
      const partner = await storage.updateCompanyPartner(partnerId, companyId, req.body);
      res.json(partner);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.delete("/companies/:companyId/partners/:partnerId", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const partnerId = Number(req.params.partnerId);
      await storage.deactivateCompanyPartner(partnerId, companyId);
      res.json({ message: "Partner deactivated" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/partnership-settings", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ message: "Company not found" });
      res.json(normalizePartnershipSettings(company.partnershipSettings));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  router.patch("/companies/:companyId/partnership-settings", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const settings = partnershipSettingsSchema.parse(req.body);
      const company = await storage.updateCompany(companyId, { partnershipSettings: settings as any });
      res.json(normalizePartnershipSettings(company.partnershipSettings));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.get("/companies/:companyId/reports/partnership-sales", requireAuth, async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(0);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      endDate.setHours(23, 59, 59, 999);
      const partnerId = req.query.partnerId ? Number(req.query.partnerId) : undefined;
      const data = await storage.getReportPartnershipSales(companyId, startDate, endDate, partnerId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return router;
}
