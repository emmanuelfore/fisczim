import { Router } from "express";
import { z } from "zod";
import { buildInvoiceQrUrl } from "../../lib/fiscal-qr.js";
import { storage } from "../../storage.js";
import { renderInvoicePdf } from "../../lib/invoice-pdf-server.tsx";

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

const invoicePdfQuery = z.object({
  invoice_number: z.string().trim().min(1).max(255),
});

router.get("/invoice-pdf", async (req, res) => {
  const parsed = invoicePdfQuery.safeParse(req.query);
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

  try {
    const invoice = await storage.getInvoiceByNumber(companyId, parsed.data.invoice_number);
    if (!invoice) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Invoice not found" });
    }

    // Get full invoice with items and customer
    const fullInvoice = await storage.getInvoice(invoice.id);
    if (!fullInvoice) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Invoice details not found" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Company not found" });
    }

    // Get tax types for the company
    const taxTypes = await storage.getTaxTypes(companyId);

    // Generate QR code URL
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://fiscalstack.com";
    const qrCodeUrl = invoice.fiscalCode ? await buildInvoiceQrUrl(publicBaseUrl, companyId, invoice.invoiceNumber) : undefined;

    // Generate PDF using React PDF
    const pdfBytes = await renderInvoicePdf(fullInvoice, company, fullInvoice.customer, qrCodeUrl, taxTypes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(pdfBytes);
  } catch (err: any) {
    console.error("[ZohoExtension] Failed to generate invoice PDF:", err.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to generate PDF" });
  }
});

// Close fiscal day endpoint
router.post("/close-day", async (req, res) => {
  try {
    const companyId = (req as any).apiKeyCompanyId;
    if (!companyId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid API key" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Company not found" });
    }

    // Close the fiscal day - increment fiscal day counter
    const updatedCompany = await storage.updateCompany(companyId, {
      currentFiscalDayNo: (company.currentFiscalDayNo || 0) + 1,
      fiscalDayOpen: false,
    });

    res.json({
      success: true,
      message: "Fiscal day closed successfully",
      fiscalDayNo: updatedCompany?.currentFiscalDayNo || (company.currentFiscalDayNo || 0) + 1,
    });
  } catch (err: any) {
    console.error("[ZohoExtension] Failed to close fiscal day:", err.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to close fiscal day" });
  }
});

// Get fiscal day status endpoint
router.get("/fiscal-day-status", async (req, res) => {
  try {
    const companyId = (req as any).apiKeyCompanyId;
    if (!companyId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid API key" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Company not found" });
    }

    res.json({
      isOpen: company.fiscalDayOpen !== false,
      fiscalDayNo: company.currentFiscalDayNo || 0,
    });
  } catch (err: any) {
    console.error("[ZohoExtension] Failed to get fiscal day status:", err.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to get fiscal day status" });
  }
});

// Send invoice endpoint
router.post("/send-invoice", async (req, res) => {
  try {
    const companyId = (req as any).apiKeyCompanyId;
    if (!companyId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid API key" });
    }

    const { invoice_number, email } = req.body;
    if (!invoice_number || !email) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "invoice_number and email are required" });
    }

    const invoice = await storage.getInvoiceByNumber(companyId, invoice_number);
    if (!invoice) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Invoice not found" });
    }

    // Get full invoice with items and customer
    const fullInvoice = await storage.getInvoice(invoice.id);
    if (!fullInvoice) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Invoice details not found" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Company not found" });
    }

    // Get tax types for the company
    const taxTypes = await storage.getTaxTypes(companyId);

    // Generate QR code URL
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://fiscalstack.com";
    const qrCodeUrl = invoice.fiscalCode ? await buildInvoiceQrUrl(publicBaseUrl, companyId, invoice.invoiceNumber) : undefined;

    // Generate PDF
    const pdfBytes = await renderInvoicePdf(fullInvoice, company, fullInvoice.customer, qrCodeUrl, taxTypes);

    // Send email using the email service
    const { sendInvoiceEmail } = await import("../../email.ts");
    await sendInvoiceEmail(email, invoice.invoiceNumber, pdfBytes);

    res.json({
      success: true,
      message: "Invoice sent successfully",
    });
  } catch (err: any) {
    console.error("[ZohoExtension] Failed to send invoice:", err.message);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to send invoice" });
  }
});

export default router;
