import { Router } from "express";
import { storage } from "../storage.js";
import { renderQrPng, verifyInvoiceQrToken } from "../lib/fiscal-qr.js";
import { renderInvoicePdf } from "../lib/invoice-pdf-server.tsx";

const router = Router();

/**
 * GET /api/public/fiscal/qr?c=<companyId>&invoice=<number>&t=<token>
 *
 * Public so Zoho Books can render the QR image inside invoice PDFs/emails.
 * Access is constrained by an HMAC token embedded in the URL written back to
 * the Zoho invoice; only fiscalised invoices resolve to an image.
 */
router.get("/qr", async (req, res) => {
  const companyId = Number(req.query.c);
  const invoiceNumber = String(req.query.invoice ?? "").trim();
  const token = String(req.query.t ?? "").trim();

  if (!Number.isInteger(companyId) || companyId <= 0 || !invoiceNumber) {
    return res.status(400).json({ error: "INVALID_REQUEST" });
  }

  if (!verifyInvoiceQrToken(companyId, invoiceNumber, token)) {
    return res.status(403).json({ error: "INVALID_TOKEN" });
  }

  try {
    const invoice = await storage.getInvoiceByNumber(companyId, invoiceNumber);
    if (!invoice) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    if (!invoice.qrCodeData) {
      return res.status(404).json({ error: "NOT_FISCALISED" });
    }

    const png = await renderQrPng(invoice.qrCodeData);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(png);
  } catch (err: any) {
    console.error("[PublicFiscalQR] Failed to render QR:", err.message);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/public/fiscal/invoice?c=<companyId>&invoice=<number>&t=<token>
 *
 * Public invoice view - allows viewing fiscalised invoices without login.
 * Uses the same HMAC token as the QR endpoint for security.
 */
router.get("/invoice", async (req, res) => {
  const companyId = Number(req.query.c);
  const invoiceNumber = String(req.query.invoice ?? "").trim();
  const token = String(req.query.t ?? "").trim();

  if (!Number.isInteger(companyId) || companyId <= 0 || !invoiceNumber) {
    return res.status(400).json({ error: "INVALID_REQUEST" });
  }

  if (!verifyInvoiceQrToken(companyId, invoiceNumber, token)) {
    return res.status(403).json({ error: "INVALID_TOKEN" });
  }

  try {
    const invoice = await storage.getInvoiceByNumber(companyId, invoiceNumber);
    if (!invoice) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    if (!invoice.qrCodeData) {
      return res.status(404).json({ error: "NOT_FISCALISED" });
    }

    // Get full invoice with items and customer
    const fullInvoice = await storage.getInvoice(invoice.id);
    if (!fullInvoice) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    // Get tax types for the company
    const taxTypes = await storage.getTaxTypes(companyId);

    // Generate QR code URL
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://fiscalstack.com";
    const qrCodeUrl = await renderQrPng(invoice.qrCodeData).then(png => {
      const base64 = png.toString('base64');
      return `data:image/png;base64,${base64}`;
    });

    // Generate PDF
    const pdfBytes = await renderInvoicePdf(fullInvoice, company, fullInvoice.customer, qrCodeUrl, taxTypes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
    return res.status(200).send(pdfBytes);
  } catch (err: any) {
    console.error("[PublicFiscalInvoice] Failed to render invoice:", err.message);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
