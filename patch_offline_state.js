const fs = require('fs');
const file = 'server/routes.ts';
let code = fs.readFileSync(file, 'utf8');

const offlineStateRoute = `
  // GET /api/companies/:id/zimra/offline-state
  app.get("/api/companies/:id/zimra/offline-state", requireAuthOrApiKey, apiLogger, async (req, res) => {
    try {
      let companyId = req.params.id ? Number(req.params.id) : (req as any).apiKeyCompanyId;

      if (!companyId) {
        const allCompanies = await db.select().from(companies)
          .where(isNotNull(companies.fdmsDeviceId))
          .limit(1);
        if (allCompanies.length > 0) {
          companyId = allCompanies[0].id;
        }
      }

      if (!companyId) {
        return res.status(404).json({ message: "Device not found" });
      }

      const company = await storage.getCompany(companyId);
      if (!company || !company.fdmsDeviceId || !company.zimraPrivateKey) {
        return res.status(404).json({ message: "Device not found or missing private key" });
      }

      res.json({
        privateKey: company.zimraPrivateKey,
        deviceId: company.fdmsDeviceId,
        lastFiscalHash: company.lastFiscalHash || "",
        currentFiscalDayNo: company.currentFiscalDayNo || 0,
        dailyReceiptCount: company.dailyReceiptCount || 0,
        lastReceiptGlobalNo: company.lastReceiptGlobalNo || 0
      });
    } catch (err: any) {
      console.error("GetOfflineState Error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // 1. GET /api/companies/:id/zimra/device-details`;

code = code.replace('  // 1. GET /api/companies/:id/zimra/device-details', offlineStateRoute);
fs.writeFileSync(file, code);
console.log("Patched server/routes.ts");
