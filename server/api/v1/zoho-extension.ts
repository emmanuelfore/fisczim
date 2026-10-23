import { Router } from "express";
import { z } from "zod";
import { buildInvoiceQrUrl } from "../../lib/fiscal-qr.js";

/**
 * Small, API-key protected helpers used by the installed Zoho Books extension.
 *
 * The extension performs all Zoho configuration and record write-back itself.
 * It deliberately receives only a signed public QR URL: the signing secret and
 * company id remain in FiscalStack, rather than being copied into a Zoho global
 * field or a Deluge function.
 */
const router = Router();

const qrUrlQuery = z.object({
  invoice_number: z.string().trim().min(1).max(255),
});

router.get("/qr-url", (req, res) => {
  const parsed = qrUrlQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "invoice_number is required",
    });
  }

  const companyId = Number((req as any).company?.id);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "A company API key is required" });
  }

  const configuredBaseUrl = String(process.env.PUBLIC_APP_URL || "").trim();
  const baseUrl = (configuredBaseUrl || `${req.protocol}://${req.get("host")}`)
    .replace(/\/+$/, "");

  return res.json({
    qr_image_url: buildInvoiceQrUrl(baseUrl, companyId, parsed.data.invoice_number),
    device_id: String((req as any).company?.fdmsDeviceId || ""),
  });
});

export default router;
