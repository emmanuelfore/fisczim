import { Router } from "express";
import { storage } from "../../storage.js";

const router = Router();

// GET /api/v1/company — tenant identity used by tills that print receipts
// outside the web app. The API key identifies the company, so no id is needed.
router.get("/", async (req, res) => {
  const scoped = req.company as { id?: number } | undefined;
  if (!scoped?.id) {
    return res.status(404).json({ message: "Company not found" });
  }

  const company = await storage.getCompany(scoped.id);
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }

  return res.json({
    id: company.id,
    name: company.name || company.tradingName || "",
    tin: company.tin || "",
    vatNumber: company.vatNumber || "",
    address: company.address || "",
    city: company.city || "",
    phone: company.phone || "",
    email: company.email || "",
    logoUrl: company.logoUrl || "",
  });
});

export default router;
