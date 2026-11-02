import { Router } from "express";
import { storage } from "../../storage.js";
import { ZimraApiError } from "../../zimra.js";
import { LekukaApiError } from "../../lekuka.js";
import { assertFiscalDayClosePreflight, ZimraPreflightError } from "../../lib/zimra-preflight.js";
import {
  certificateExpiry,
  closeLekukaFiscalDay,
  confirmCompanyCertificate,
  FiscalDayStateError,
  fiscalDeviceFromCompany,
  issueCompanyCertificate,
  lekukaDeviceFromCompany,
  openLekukaFiscalDay,
  providerOf,
  UnsupportedOperationError,
  zimraDeviceFromCompany,
} from "../../lib/fiscal-provider.js";

const router = Router();

// The low-level gateway surface also lives under /api/v1 so an integrator only
// needs one base path. These five operations already exist as company-scoped
// routes, so forward to them with the tenant taken from the API key — exactly
// like the /api/fiscal alias, which stays for existing clients.
const GATEWAY_PASSTHROUGH_PATHS = new Set([
  "/device-details",
  "/device-status",
  "/register",
  "/verify-taxpayer",
  "/transact",
]);

router.use((req, res, next) => {
  const companyId = (req as any).apiKeyCompanyId || (req as any).company?.id;
  if (!companyId || !GATEWAY_PASSTHROUGH_PATHS.has(req.path)) return next();

  req.url = `/api/companies/${companyId}/zimra${req.url}`;
  return (req.app as any).handle(req, res);
});

// GET /device — get fiscal device status (Task 9.2, Req 7.1)
router.get("/device", async (req, res) => {
  const company = req.company as any;

  if (!company.fdmsDeviceId) {
    return res.status(200).json({
      status: "unregistered",
    });
  }

  // Mask activation key to show only last 4 chars
  const rawKey = company.fdmsApiKey || "";
  const maskedActivationKey = rawKey.length > 4 
    ? `***${rawKey.slice(-4)}` 
    : "***";

  return res.status(200).json({
    deviceId: company.fdmsDeviceId,
    serialNumber: company.fdmsDeviceSerialNo,
    activationKey: maskedActivationKey,
    environment: company.zimraEnvironment || "test",
    lastPingTime: company.lastPing || null,
    status: company.fiscalDayOpen ? "online" : "offline", // simplistic status mapping
    currentDayNo: company.currentFiscalDayNo || null,
    certificateValidTill: certificateExpiry(company.zimraCertificate),
  });
});

// The gateway exposes a public certificate endpoint and device-authenticated
// reads. Authenticated calls use mTLS, so an incomplete registration must fail
// here rather than as an opaque transport error.
function requireRegisteredDevice(req: any, res: any, needsCredentials = false) {
  const company = req.company as any;
  const missing: string[] = [];

  if (!company?.fdmsDeviceId) missing.push("device ID");
  if (needsCredentials) {
    if (!company?.zimraPrivateKey) missing.push("private key");
    if (!company?.zimraCertificate) missing.push("device certificate");
  }

  if (missing.length > 0) {
    res.status(400).json({
      error: "NOT_REGISTERED",
      message: needsCredentials
        ? `Fiscal device is not fully registered — missing: ${missing.join(", ")}`
        : "Company has no registered fiscal device",
      missing,
    });
    return null;
  }
  return company;
}

function sendProviderError(res: any, err: any, action: string) {
  console.error(`v1 ${action} Error:`, err);
  if (err instanceof ZimraApiError || err instanceof LekukaApiError) {
    return res.status(err.statusCode || 500).json({
      error: "FISCAL_PROVIDER_ERROR",
      message: err.message,
      details: err.details,
    });
  }
  return res.status(500).json({ error: "INTERNAL_ERROR", message: `${action} failed: ${err.message}` });
}

// POST /ping — manual connectivity check against the company's own gateway
router.post("/ping", async (req, res) => {
  const company = requireRegisteredDevice(req, res);
  if (!company) return;

  try {
    const device = fiscalDeviceFromCompany(company);
    const start = Date.now();
    const response: any = await device.ping();
    const latencyMs = Date.now() - start;

    const patch: Record<string, any> = { lastPing: new Date() };
    if (typeof response?.reportingFrequency === "number") {
      patch.deviceReportingFrequency = response.reportingFrequency;
    }
    await storage.updateCompany(company.id, patch);

    return res.status(200).json({
      isOnline: true,
      provider: providerOf(company),
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return sendProviderError(res, err, "Ping fiscal server");
  }
});

// POST /open-day — manual day open (Task 9.4, Req 8.1)
router.post("/open-day", async (req, res) => {
  const company = requireRegisteredDevice(req, res, true);
  if (!company) return;
  const provider = providerOf(company);

  try {
    if (provider === "LEKUKA") {
      const { fiscalDayNo, alreadyOpen } = await openLekukaFiscalDay(company);
      return res.status(200).json({
        success: true,
        provider,
        fiscalDayNo,
        ...(alreadyOpen ? { message: "Fiscal day is already open" } : {}),
      });
    }

    const device = zimraDeviceFromCompany(company);

    const status = await device.getStatus() as any;
    if (status.fiscalDayStatus === 'FiscalDayOpened') {
      const fiscalDayNo = status.lastFiscalDayNo;
      if (!company.fiscalDayOpen) {
        await storage.updateCompany(company.id, {
          currentFiscalDayNo: fiscalDayNo,
          fiscalDayOpen: true,
          lastFiscalDayStatus: 'FiscalDayOpened'
        });
      }
      return res.status(200).json({ 
        success: true, 
        provider,
        message: "Fiscal day is already open", 
        fiscalDayNo 
      });
    }

    const nextDayNo = (status.lastFiscalDayNo || 0) + 1;
    const result = await device.openDay(nextDayNo) as any;

    await storage.updateCompany(company.id, {
      currentFiscalDayNo: result.fiscalDayNo || nextDayNo,
      fiscalDayOpen: true,
      lastFiscalDayStatus: 'FiscalDayOpened',
      fiscalDayOpenedAt: new Date(),
      dailyReceiptCount: 0,
      lastFiscalHash: null
    });

    return res.status(200).json({
      success: true,
      provider,
      fiscalDayNo: result.fiscalDayNo || nextDayNo,
    });
  } catch (err: any) {
    return sendProviderError(res, err, "Open fiscal day");
  }
});

// POST /close-day — manual day close (Task 9.5, Req 8.2)
router.post("/close-day", async (req, res) => {
  const company = requireRegisteredDevice(req, res, true);
  if (!company) return;
  const provider = providerOf(company);
  // manual: true — always attempt the close and let the gateway be the authority.
  // Skips local state guard and preflight blocking (issues are logged as warnings).
  const manual = req.body?.manual === true || req.body?.force === true;

  try {
    if (provider === "LEKUKA") {
      const { fiscalDayNo, result } = await closeLekukaFiscalDay(company, req.body || {});
      return res.status(200).json({
        success: true,
        provider,
        fiscalDayNo,
        message: `Fiscal day ${fiscalDayNo} closed successfully`,
        result,
      });
    }

    const device = zimraDeviceFromCompany(company);

    if (!manual && !company.fiscalDayOpen && company.lastFiscalDayStatus !== 'FiscalDayCloseFailed') {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "No fiscal day is currently open",
      });
    }

    const fiscalDayNo = company.currentFiscalDayNo || 0;
    if (!fiscalDayNo) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "No fiscal day has been opened yet",
      });
    }
    
    // Attempt closing without the complex retry logic here for simplicity,
    // or simulate the basic structure of a single pass
    let receiptCount: number;
    let counters: any[];
    try {
      const closePreflight = await assertFiscalDayClosePreflight(company.id, fiscalDayNo);
      receiptCount = closePreflight.dayInvoices.reduce((max, inv) => Math.max(max, inv.receiptCounter || 0), 0);
      counters = closePreflight.counters;
    } catch (e) {
      if (!manual) throw e;
      console.warn(`[ZIMRA] Manual close bypassing preflight issues: ${(e as Error).message}`);
      const dayInvoices = await storage.getInvoicesByFiscalDay(company.id, fiscalDayNo);
      receiptCount = dayInvoices.reduce((max, inv) => Math.max(max, inv.receiptCounter || 0), 0);
      counters = await storage.calculateFiscalCounters(company.id, fiscalDayNo);
    }
    
    // Identify opening date
    const formatHarareDateOnly = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Harare',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      const p = (t: string) => parts.find(x => x.type === t)?.value;
      return `${p('year')}-${p('month')}-${p('day')}`;
    };

    let fiscalDayDate = formatHarareDateOnly(new Date());
    if (company.fiscalDayOpenedAt) {
      fiscalDayDate = formatHarareDateOnly(new Date(company.fiscalDayOpenedAt));
    }

    let response: any;
    try {
      response = await device.closeDay(
        fiscalDayNo,
        fiscalDayDate,
        receiptCount,
        counters
      );
    } catch (e: any) {
      throw e;
    }

    // ZIMRA processes day closure asynchronously: the CloseDay 200 response
    // only acknowledges the request (it contains no fiscalDayStatus field).
    // Poll getStatus until the day is CONFIRMED closed before updating local
    // state — otherwise the UI reports "closed" while ZIMRA is still
    // processing or has actually failed (CloseInitiated -> CloseFailed).
    let verificationStatus: any = null;
    let closeConfirmed = false;
    const verifyStarted = Date.now();
    const VERIFY_TIMEOUT_MS = Number(process.env.CLOSE_DAY_VERIFY_TIMEOUT_MS) || 90_000;

    try {
      while (Date.now() - verifyStarted < VERIFY_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        verificationStatus = await device.getStatus() as any;
        if (verificationStatus.fiscalDayStatus === 'FiscalDayClosed') {
          closeConfirmed = true;
          break;
        }
        if (verificationStatus.fiscalDayStatus === 'FiscalDayCloseFailed') break;
      }
    } catch (verifyErr: any) {
      console.warn(`[ZIMRA] v1 CloseDay verification poll failed: ${verifyErr.message}`);
      verificationStatus = null;
    }

    if (!closeConfirmed && verificationStatus?.fiscalDayStatus === 'FiscalDayCloseFailed') {
      await storage.updateCompany(company.id, {
        fiscalDayOpen: true,
        lastFiscalDayStatus: 'FiscalDayCloseFailed'
      });
      return res.status(400).json({
        error: "CLOSE_DAY_FAILED",
        message: `The fiscal authority rejected closure: ${verificationStatus.fiscalDayClosingErrorCode || 'UnknownError'}`,
        fiscalDayStatus: verificationStatus.fiscalDayStatus,
        fiscalDayClosingErrorCode: verificationStatus.fiscalDayClosingErrorCode
      });
    }

    if (!closeConfirmed) {
      await storage.updateCompany(company.id, {
        fiscalDayOpen: true,
        lastFiscalDayStatus: verificationStatus?.fiscalDayStatus || 'FiscalDayCloseFailed'
      });
      return res.status(202).json({
        success: false,
        message: "Fiscal day closure was submitted to the fiscal authority but is not yet confirmed. Please check the fiscal day status and try again if it failed.",
        fiscalDayNo,
        fiscalDayStatus: verificationStatus?.fiscalDayStatus || "unknown"
      });
    }

    // Confirmed closed by ZIMRA — only now reset local state
    await storage.updateCompany(company.id, {
      fiscalDayOpen: false,
      lastFiscalDayStatus: 'FiscalDayClosed',
      dailyReceiptCount: 0
    });

    return res.status(200).json({
      success: true,
      provider,
      fiscalDayNo,
      receiptsDayCount: receiptCount,
      zimraStatus: 'FiscalDayClosed'
    });
  } catch (err: any) {
    if (err instanceof FiscalDayStateError) {
      // Nothing was ever opened — leave the recorded fiscal state alone.
      return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
    }

    try {
      // The day did not close: keep it open so the close can be retried.
      await storage.updateCompany(company.id, {
        fiscalDayOpen: true,
        lastFiscalDayStatus: 'FiscalDayCloseFailed'
      });
    } catch (updateErr) {
      console.error("Failed to preserve fiscal day state after close failure:", updateErr);
    }

    if (err instanceof ZimraPreflightError) {
      console.warn(`v1 Close Day preflight blocked: ${err.message}`);
      return res.status(400).json({
        error: "FISCAL_PREFLIGHT_ERROR",
        message: err.message,
        issues: err.issues,
        recovery: "Fix the listed local receipt/day issues, then retry closing the fiscal day.",
      });
    }
    return sendProviderError(res, err, "Close fiscal day");
  }
});

// ── Provider-agnostic device reads (status / config / server certificate) ──

// GET /status — live fiscal-day status straight from the device's gateway.
// Read-only: unlike the dashboard route this never writes local counters.
router.get("/status", async (req, res) => {
  const company = requireRegisteredDevice(req, res, true);
  if (!company) return;

  try {
    const data = await fiscalDeviceFromCompany(company).getStatus();
    return res.json({ provider: providerOf(company), data });
  } catch (err: any) {
    return sendProviderError(res, err, "Get status");
  }
});

// GET /config — device configuration: tax table, taxpayer identity, operating
// mode and certificateValidTill (when the certificate expires).
router.get("/config", async (req, res) => {
  const company = requireRegisteredDevice(req, res, true);
  if (!company) return;

  try {
    const data = await fiscalDeviceFromCompany(company).getConfig();
    return res.json({ provider: providerOf(company), data });
  } catch (err: any) {
    return sendProviderError(res, err, "Get config");
  }
});

// GET /server-certificate — the gateway's own certificate chain (public
// endpoint; ?thumbprint= selects one and is only supported by FDMS).
router.get("/server-certificate", async (req, res) => {
  const company = requireRegisteredDevice(req, res);
  if (!company) return;

  const provider = providerOf(company);
  const thumbprint = typeof req.query.thumbprint === "string" ? req.query.thumbprint : undefined;

  try {
    const data = provider === "LEKUKA"
      ? await lekukaDeviceFromCompany(company).getServerCertificate()
      : await zimraDeviceFromCompany(company).getServerCertificate(thumbprint);
    return res.json({ provider, data });
  } catch (err: any) {
    return sendProviderError(res, err, "Get server certificate");
  }
});

// ── Certificate renewal ──
// The device certificate signs every receipt and expires, so the integrator
// needs the same key-authenticated path the dashboard uses. Renewal itself is an
// authenticated call, so the current credentials must still be in place.

function sendCertificateError(res: any, err: any, action: string) {
  if (err instanceof UnsupportedOperationError) {
    return res.status(400).json({ error: "NOT_SUPPORTED", message: err.message });
  }
  return sendProviderError(res, err, action);
}

// POST /certificate/issue — rotate the device key pair and certificate.
// Body: { certificateRequest? } to keep the private key client-side.
router.post("/certificate/issue", async (req, res) => {
  const company = requireRegisteredDevice(req, res, true);
  if (!company) return;

  try {
    const { response, ...issued } = await issueCompanyCertificate(company, {
      certificateRequest: req.body?.certificateRequest,
    });
    return res.status(200).json({
      ...issued,
      message: issued.certificate
        ? `New device certificate installed. ${issued.confirmationRequired
            ? "Call POST /api/v1/fiscal/certificate/confirm to activate it."
            : "Receipts now sign with the new certificate; every till must re-provision."}`
        : "The fiscal gateway did not return a certificate. Existing credentials are unchanged.",
    });
  } catch (err: any) {
    return sendCertificateError(res, err, "Issue certificate");
  }
});

// POST /certificate/confirm — activate a certificate issued in two steps.
router.post("/certificate/confirm", async (req, res) => {
  const company = requireRegisteredDevice(req, res, true);
  if (!company) return;

  try {
    const confirmed = await confirmCompanyCertificate(company);
    return res.status(200).json({ ...confirmed, message: "Certificate confirmation submitted." });
  } catch (err: any) {
    return sendCertificateError(res, err, "Confirm certificate");
  }
});

export default router;
