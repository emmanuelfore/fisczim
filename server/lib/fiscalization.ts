import { storage } from "../storage.js";
import { ZimraDevice, ReceiptData, ZimraConfigResponse, ZimraApiError, ZimraLogger } from "../zimra.js";
import { Invoice, products } from "../../shared/schema.js";
import fs from "fs";
import path from "path";
import { logAction } from "../audit.js";
import { assertReceiptPreflight, ZimraPreflightError, expectedReceiptTotal } from "./zimra-preflight.js";
import { buildCompanyTaxMapping, resolveLineTaxID } from "./tax-mapping.js";
import { db } from "../db.js";
import { eq, and, isNotNull, ne } from "drizzle-orm";

const POS_VERBOSE_LOGS = process.env.POS_VERBOSE_LOGS === "1";
const vLog = (...args: any[]) => { if (POS_VERBOSE_LOGS) console.log(...args); };
const vTime = (label: string) => { if (POS_VERBOSE_LOGS) console.time(label); };
const vTimeEnd = (label: string) => { if (POS_VERBOSE_LOGS) console.timeEnd(label); };

// In-memory cache for ZIMRA configuration to reduce redundant network calls
const zimraConfigCache = new Map<number, { config: ZimraConfigResponse, expiresAt: number }>();
const CONFIG_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Exported to be shared across the server
export const getZimraLogger = (companyId: number) => ({
    log: async (invoiceId: number | null, endpoint: string, request: any, response: any, statusCode?: number, errorMessage?: string) => {
        try {
            await storage.createZimraLog({
                companyId,
                invoiceId: invoiceId || undefined,
                endpoint,
                requestPayload: request,
                responsePayload: response,
                statusCode,
                errorMessage
            });

            // Also log to general audit for major events
            if (['OpenDay', 'CloseDay', 'SubmitReceipt'].includes(endpoint)) {
                await logAction(
                    companyId,
                    "system",
                    `ZIMRA_${endpoint.toUpperCase()}`,
                    "ZimraAPI",
                    invoiceId?.toString(),
                    { statusCode, errorMessage, endpoint }
                );
            }
        } catch (error) {
            console.error("Failed to create ZIMRA log:", error);
        }
    }
});

export const getCompanyZimraConfig = async (companyId: number, company: any, activeBranch?: any): Promise<ZimraConfigResponse | undefined> => {
    // Check cache first
    const cached = zimraConfigCache.get(companyId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.config;
    }

    let fiscalConfig = { ...company };
    if (activeBranch) {
        fiscalConfig = {
            ...fiscalConfig,
            fdmsDeviceId: activeBranch.fdmsDeviceId || fiscalConfig.fdmsDeviceId,
            fdmsDeviceSerialNo: activeBranch.fdmsDeviceSerialNo || fiscalConfig.fdmsDeviceSerialNo,
            fdmsApiKey: activeBranch.fdmsApiKey || fiscalConfig.fdmsApiKey,
            zimraPrivateKey: activeBranch.zimraPrivateKey || fiscalConfig.zimraPrivateKey,
            zimraCertificate: activeBranch.zimraCertificate || fiscalConfig.zimraCertificate,
            zimraEnvironment: activeBranch.zimraEnvironment || fiscalConfig.zimraEnvironment
        };
    }

    if (!fiscalConfig.zimraPrivateKey || !fiscalConfig.zimraCertificate || !fiscalConfig.fdmsDeviceId) {
        return undefined;
    }

    const device = new ZimraDevice({
        deviceId: fiscalConfig.fdmsDeviceId,
        deviceSerialNo: fiscalConfig.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: fiscalConfig.fdmsApiKey || "",
        privateKey: fiscalConfig.zimraPrivateKey,
        certificate: fiscalConfig.zimraCertificate,
        baseUrl: fiscalConfig.zimraEnvironment === 'production' ? 'https://fdmsapi.zimra.co.zw' : 'https://fdmsapitest.zimra.co.zw'
    }, getZimraLogger(companyId));

    try {
        const zimraConfig = await device.getConfig();
        if (zimraConfig) {
            zimraConfigCache.set(companyId, {
                config: zimraConfig,
                expiresAt: now + CONFIG_CACHE_TTL
            });
            // Auto-update QR URL if needed
            if (zimraConfig.qrUrl && (!company.qrUrl || company.qrUrl !== zimraConfig.qrUrl)) {
                await storage.updateCompany(companyId, { qrUrl: zimraConfig.qrUrl });
                company.qrUrl = zimraConfig.qrUrl;
            }
        }
        return zimraConfig;
    } catch (e) {
        console.warn(`[getCompanyZimraConfig] Failed to fetch ZIMRA config for company ${companyId}`);
        return undefined;
    }
};

export const processInvoiceFiscalization = async (invoiceId: number, companyId: number, userId?: number | string, isSuperAdmin: boolean = false, zimraSync?: any, isPos: boolean = false) => {
    // Retrieve full invoice with line items
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.fiscalCode) {
        throw new Error(`Invoice ${invoice.invoiceNumber} is already fiscalized and cannot be submitted to ZIMRA again.`);
    }

    // Check permissions
    if (userId) {
        // If string, likely UUID from Supabase. Convert to number? No, schema says userId is uuid (string).
        // But getCompanyUsers returns users with string IDs.
        // Wait, companyUsers relationship uses string IDs?
        // Let's assume userId is string (UUID).
        const users = await storage.getCompanyUsers(companyId);
        const isMember = users.some(u => u.id === userId);
        if (!isMember && !isSuperAdmin) throw new Error("You do not have permission to fiscalize for this company");
    }

    let company: any = await storage.getCompany(companyId);
    if (!company) throw new Error("Company not found");

    // Branch Support: Load branch config if specified on invoice
    let fiscalConfig = { ...company };
    let activeBranch: any = null;

    if (invoice.branchId) {
        activeBranch = await storage.getBranch(invoice.branchId);
        if (activeBranch) {
            // Override company settings with branch-specific fiscal settings
            fiscalConfig = {
                ...fiscalConfig,
                fdmsDeviceId: activeBranch.fdmsDeviceId || fiscalConfig.fdmsDeviceId,
                fdmsDeviceSerialNo: activeBranch.fdmsDeviceSerialNo || fiscalConfig.fdmsDeviceSerialNo,
                fdmsApiKey: activeBranch.fdmsApiKey || fiscalConfig.fdmsApiKey,
                zimraPrivateKey: activeBranch.zimraPrivateKey || fiscalConfig.zimraPrivateKey,
                zimraCertificate: activeBranch.zimraCertificate || fiscalConfig.zimraCertificate,
                zimraEnvironment: activeBranch.zimraEnvironment || fiscalConfig.zimraEnvironment,
                fiscalDayOpen: activeBranch.fiscalDayOpen ?? fiscalConfig.fiscalDayOpen,
                currentFiscalDayNo: activeBranch.currentFiscalDayNo ?? fiscalConfig.currentFiscalDayNo,
                fiscalDayOpenedAt: activeBranch.fiscalDayOpenedAt || fiscalConfig.fiscalDayOpenedAt,
                lastFiscalDayStatus: activeBranch.lastFiscalDayStatus || fiscalConfig.lastFiscalDayStatus,
                lastReceiptGlobalNo: activeBranch.lastReceiptGlobalNo ?? fiscalConfig.lastReceiptGlobalNo,
                dailyReceiptCount: activeBranch.dailyReceiptCount ?? fiscalConfig.dailyReceiptCount,
                lastFiscalHash: activeBranch.lastFiscalHash || fiscalConfig.lastFiscalHash,
                lastReceiptAt: activeBranch.lastReceiptAt || fiscalConfig.lastReceiptAt,
                qrUrl: activeBranch.qrUrl || fiscalConfig.qrUrl,
            };
        }
    }

    if (!fiscalConfig.zimraPrivateKey || !fiscalConfig.zimraCertificate || !fiscalConfig.fdmsDeviceId) {
        throw new Error(activeBranch ? `Branch ${activeBranch.name} has not registered a ZIMRA device` : "Company has not registered a ZIMRA device");
    }

    // Initialize Device with Logger
    const device = new ZimraDevice({
        deviceId: fiscalConfig.fdmsDeviceId,
        deviceSerialNo: fiscalConfig.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: fiscalConfig.fdmsApiKey || "",
        privateKey: fiscalConfig.zimraPrivateKey,
        certificate: fiscalConfig.zimraCertificate,
        baseUrl: fiscalConfig.zimraEnvironment === 'production' ? 'https://fdmsapi.zimra.co.zw' : 'https://fdmsapitest.zimra.co.zw'
    }, getZimraLogger(company.id));

    device.setInvoiceId(invoiceId);

    let justOpened = false;

    try {
        let status: any = null;

        // RCPT041 fix: receipts submitted after the fiscal day's max hours are
        // flagged "Invoice is issued after fiscal day end" (yellow). When a day
        // is stale, close it (replay counters make this safe) and open a fresh
        // one so submissions always land inside the valid window.
        const formatHarareDayDate = (date: Date) => {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Africa/Harare',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(date);
            const p = (t: string) => parts.find(x => x.type === t)?.value;
            return `${p('year')}-${p('month')}-${p('day')}`;
        };
        const autoCloseAndReopenDay = async (reason: string) => {
            const staleDayNo = fiscalConfig.currentFiscalDayNo || company.currentFiscalDayNo;
            if (!staleDayNo) return false;
            const openAt = fiscalConfig.fiscalDayOpenedAt ? new Date(fiscalConfig.fiscalDayOpenedAt) : null;
            const dayDate = openAt && !Number.isNaN(openAt.getTime()) ? formatHarareDayDate(openAt) : formatHarareDayDate(new Date());
            const closeCounter = fiscalConfig.dailyReceiptCount || company.dailyReceiptCount || 0;
            if (closeCounter < 1) {
                vLog(`[Fiscalize] Stale day ${staleDayNo} has no receipts; not closing.`);
                return false;
            }
            vLog(`[Fiscalize] Stale day auto-close (${reason}): closing day ${staleDayNo}...`);
            try {
                const counters = await storage.calculateFiscalCounters(company.id, staleDayNo);
                await device.closeDay(staleDayNo, dayDate, closeCounter, counters);

                // ZIMRA closes days asynchronously: a 200 response only means
                // the request was accepted. Poll getStatus until the closure
                // is confirmed before opening the next day — otherwise the
                // OpenDay call fails (FISC01) and we keep the stale day.
                let closeConfirmed = false;
                const verifyStart = Date.now();
                while (Date.now() - verifyStart < 20_000) {
                    await new Promise(resolve => setTimeout(resolve, 2500));
                    const st = await device.getStatus() as any;
                    if (st.fiscalDayStatus === 'FiscalDayClosed') { closeConfirmed = true; break; }
                    if (st.fiscalDayStatus === 'FiscalDayCloseFailed') break;
                }

                if (!closeConfirmed) {
                    console.warn(`[Fiscalize] Stale-day auto-close not confirmed (${reason}); continuing on stale day.`);
                    return false;
                }

                const nextDay = staleDayNo + 1;
                const openResult = await device.openDay(nextDay) as any;
                const openedAt = new Date();
                const updateData = {
                    currentFiscalDayNo: openResult.fiscalDayNo || nextDay,
                    fiscalDayOpen: true,
                    fiscalDayOpenedAt: openedAt,
                    lastFiscalDayStatus: 'FiscalDayOpened',
                    dailyReceiptCount: 0,
                    lastFiscalHash: null
                };
                if (activeBranch) {
                    await storage.updateBranch(activeBranch.id, updateData);
                } else {
                    await storage.updateCompany(company.id, updateData);
                }
                fiscalConfig = { ...fiscalConfig, ...updateData };
                vLog(`[Fiscalize] Stale day ${staleDayNo} closed; opened new fiscal day ${updateData.currentFiscalDayNo}.`);
                return true;
            } catch (closeErr: any) {
                console.warn(`[Fiscalize] Stale-day auto-close failed (${reason}): ${closeErr.message}; continuing on stale day.`);
                return false;
            }
        };

        // 🚀 OPTIMIZATION: Skip getStatus if the day is already open locally
        const needsStatusSync = !fiscalConfig.fiscalDayOpen || !fiscalConfig.currentFiscalDayNo;

        if (needsStatusSync) {
            vTime(`[ZIMRA] getStatus-${companyId}`);
            status = await device.getStatus() as any;
            vTimeEnd(`[ZIMRA] getStatus-${companyId}`);
            vLog(`[ZIMRA] Check Status: ${status.fiscalDayStatus}, LastDay: ${status.lastFiscalDayNo}`);

            const now = new Date();
            const fiscalDayOpenedAt = fiscalConfig.fiscalDayOpenedAt ? new Date(fiscalConfig.fiscalDayOpenedAt) : null;
            // Configurable fiscal day staleness threshold (default 24 hours)
            // Branch settings override company settings
            const fiscalDayStalenessHours = activeBranch?.fiscalDayStalenessHours || company.fiscalDayStalenessHours || 24;
            const stalenessThresholdMs = fiscalDayStalenessHours * 60 * 60 * 1000;
            const isStale = fiscalDayOpenedAt && (now.getTime() - fiscalDayOpenedAt.getTime() > stalenessThresholdMs);

            if (isStale) vLog(`[ZIMRA] Day is Stale (>${fiscalDayStalenessHours}h). OpenedAt: ${fiscalDayOpenedAt?.toISOString()}, but continuing to fiscalize on it.`);

            // ZIMRA Day Management:
            const statusStr = (status.fiscalDayStatus || "").toLowerCase();

            if (statusStr === 'fiscaldayclosed') {
                // Day is closed on ZIMRA's side — we must open a new day to fiscalize
                try {
                    const nextDayNo = (status.lastFiscalDayNo || 0) + 1;
                    vLog(`[ZIMRA] Day is Closed. Opening new fiscal day ${nextDayNo}...`);
                    const openResult = await device.openDay(nextDayNo) as any;

                    const openedAt = new Date();
                    const updateData = {
                        currentFiscalDayNo: openResult.fiscalDayNo || nextDayNo,
                        fiscalDayOpen: true,
                        fiscalDayOpenedAt: openedAt,
                        lastFiscalDayStatus: 'FiscalDayOpened',
                        dailyReceiptCount: 0,
                        lastFiscalHash: null
                    };

                    if (activeBranch) {
                        await storage.updateBranch(activeBranch.id, updateData);
                    } else {
                        await storage.updateCompany(company.id, updateData);
                    }
                    fiscalConfig = { ...fiscalConfig, ...updateData };
                    vLog(`[ZIMRA] Fiscal Day Opened: ${openResult.fiscalDayNo} at ${openedAt.toISOString()}`);

                    status.fiscalDayStatus = 'FiscalDayOpened';
                    status.lastFiscalDayNo = openResult.fiscalDayNo || nextDayNo;
                    justOpened = true;
                } catch (openErr: any) {
                    console.error(`[ZIMRA] Failed to open new fiscal day: ${openErr.message}`);
                }
            } else if (statusStr === 'fiscaldayopened' || statusStr === 'fiscaldayclosefailed') {
                // Day is open (or close failed) — continue fiscalizing on it. Do NOT close it proactively.
                vLog(`[ZIMRA] Day status: ${status.fiscalDayStatus}. Continuing to fiscalize on current day.`);
                if (!fiscalConfig.fiscalDayOpen) {
                    const updateData = {
                        fiscalDayOpen: true,
                        currentFiscalDayNo: status.lastFiscalDayNo,
                        lastFiscalDayStatus: status.fiscalDayStatus
                    };
                    if (activeBranch) {
                        await storage.updateBranch(activeBranch.id, updateData);
                    } else {
                        await storage.updateCompany(company.id, updateData);
                    }
                }
            } else {
                console.warn(`[ZIMRA] Unknown day status: ${status.fiscalDayStatus}. Proceeding with caution.`);
            }

            // RCPT041: if ZIMRA still has the (stale) day open, close it and
            // reopen a fresh one before submitting.
            if (isStale && (statusStr === 'fiscaldayopened' || statusStr === 'fiscaldayclosefailed')) {
                await autoCloseAndReopenDay('status sync staleness');
            }

            // 2. SYNC COUNTERS FROM ZIMRA
            const zimraGlobalNo = status.lastReceiptGlobalNo || 0;
            let zimraDailyCount = status.lastReceiptCounter || 0;

            if (zimraDailyCount === 0 && status.fiscalDayDocumentQuantities) {
                zimraDailyCount = status.fiscalDayDocumentQuantities.reduce((sum: number, dq: any) => sum + (dq.receiptQuantity || 0), 0);
            }

            const activeStatusDayNo = fiscalConfig.currentFiscalDayNo || status.lastFiscalDayNo || company.currentFiscalDayNo;
            if (zimraDailyCount === 0 && activeStatusDayNo && (statusStr === 'fiscaldayopened' || statusStr === 'fiscaldayclosefailed')) {
                const localDayInvoices = await storage.getInvoicesByFiscalDay(company.id, activeStatusDayNo);
                const localMaxReceiptCounter = localDayInvoices
                    .filter((inv: any) => inv.syncedWithFdms)
                    .reduce((max: number, inv: any) => Math.max(max, inv.receiptCounter || 0), 0);
                if (localMaxReceiptCounter > 0) {
                    zimraDailyCount = localMaxReceiptCounter;
                    vLog(`[ZIMRA] Status returned dailyCount=0 for ${statusStr}; using local day max counter ${localMaxReceiptCounter}`);
                }
            }

            vLog(`[Fiscalize] ZIMRA Status Sync - GlobalNo: ${zimraGlobalNo}, DailyCount: ${zimraDailyCount}`);

            if (status.lastReceiptGlobalNo !== undefined || status.lastReceiptCounter !== undefined) {
                const updateData: any = {};
                const localGlobal = company.lastReceiptGlobalNo ?? 0;
                const localDaily = company.dailyReceiptCount ?? 0;

                if (zimraGlobalNo > localGlobal) {
                    updateData.lastReceiptGlobalNo = zimraGlobalNo;
                    vLog(`[ZIMRA] Advancing globalNo from ${localGlobal} → ${zimraGlobalNo} (ZIMRA is ahead)`);
                } else {
                    vLog(`[ZIMRA] Skipping globalNo sync: local ${localGlobal} >= ZIMRA ${zimraGlobalNo} (keeping local)`);
                }

                if (zimraDailyCount > localDaily) {
                    updateData.dailyReceiptCount = zimraDailyCount;
                    vLog(`[ZIMRA] Advancing dailyCount from ${localDaily} → ${zimraDailyCount} (ZIMRA is ahead)`);
                } else {
                    vLog(`[ZIMRA] Skipping dailyCount sync: local ${localDaily} >= ZIMRA ${zimraDailyCount} (keeping local)`);
                }

                if (Object.keys(updateData).length > 0) {
                    if (activeBranch) {
                        await storage.updateBranch(activeBranch.id, updateData);
                    } else {
                        await storage.updateCompany(company.id, updateData);
                    }
                }
            }

            // Always re-fetch the latest fiscal config after potential sync
            if (activeBranch) {
                activeBranch = await storage.getBranch(activeBranch.id);
                if (!activeBranch) throw new Error("Branch not found after sync");
                fiscalConfig = { ...fiscalConfig, ...activeBranch };
            } else {
                company = await storage.getCompany(company.id);
                if (!company) throw new Error("Company not found after sync");
                fiscalConfig = { ...fiscalConfig, ...company };
            }
        } else {
            // Re-fetch the latest fiscal config
            if (activeBranch) {
                activeBranch = (await storage.getBranch(activeBranch.id)) || activeBranch;
                fiscalConfig = { ...fiscalConfig, ...activeBranch };
            } else {
                const refreshed = await storage.getCompany(company.id);
                if (refreshed) {
                    fiscalConfig = { ...fiscalConfig, ...refreshed };
                }
            }
        }

        // RCPT041: local-only staleness check — when the day is open locally
        // we skip getStatus for speed, but a day older than the configured
        // threshold still needs closing so ZIMRA doesn't flag receipts yellow.
        if (fiscalConfig.fiscalDayOpen) {
            const openedAtCheck = fiscalConfig.fiscalDayOpenedAt ? new Date(fiscalConfig.fiscalDayOpenedAt) : null;
            const stalenessHoursCheck = activeBranch?.fiscalDayStalenessHours || company.fiscalDayStalenessHours || 24;
            if (openedAtCheck && !Number.isNaN(openedAtCheck.getTime()) &&
                (Date.now() - openedAtCheck.getTime() > stalenessHoursCheck * 60 * 60 * 1000)) {
                await autoCloseAndReopenDay('local staleness');
            }
        }

        // Preview numbers for local preflight only. Do not claim/persist counters yet:
        // a preflight failure never reached FDMS, so it must not burn a receipt number.
        let nextGlobalNo: number;
        let nextReceiptCounter: number;

        if (zimraSync) {
            nextGlobalNo = zimraSync.nextGlobalNo;
            nextReceiptCounter = zimraSync.nextReceiptCounter;
        } else if (invoice.receiptGlobalNo && invoice.receiptCounter) {
            // Retry: reuse the numbers already locked to this invoice
            nextGlobalNo = invoice.receiptGlobalNo;
            nextReceiptCounter = invoice.receiptCounter;
            vLog(`[Fiscalize] Retry — reusing locked numbers: GlobalNo=${nextGlobalNo}, Counter=${nextReceiptCounter}`);
        } else {
            const counterSource = activeBranch || fiscalConfig || company;
            nextGlobalNo = (counterSource.lastReceiptGlobalNo || 0) + 1;
            nextReceiptCounter = (counterSource.dailyReceiptCount || 0) + 1;
            vLog(`[Fiscalize] Preflight preview: GlobalNo=${nextGlobalNo}, Counter=${nextReceiptCounter}`);
        }

        // 1. Get ZIMRA Config for correct Tax IDs
        let zimraConfig: ZimraConfigResponse | undefined;
        const dbTaxTypes = await storage.getTaxTypes(company.id);

        try {
            // Check cache first
            const cached = zimraConfigCache.get(company.id);
            const now = Date.now();
            
            if (cached && cached.expiresAt > now) {
                zimraConfig = cached.config;
                vLog(`[ZIMRA] Using cached config for company ${company.id}`);
            } else {
                vTime(`[ZIMRA] getConfig-${companyId}`);
                zimraConfig = await device.getConfig();
                vTimeEnd(`[ZIMRA] getConfig-${companyId}`);
                
                if (zimraConfig) {
                    zimraConfigCache.set(company.id, {
                        config: zimraConfig,
                        expiresAt: now + CONFIG_CACHE_TTL
                    });
                }
            }
            
            // Auto-update QR URL if missing or different/better
            if (zimraConfig && zimraConfig.qrUrl && (!company.qrUrl || company.qrUrl !== zimraConfig.qrUrl)) {
                vLog(`[ZIMRA] Auto-updating Company QR URL to: ${zimraConfig.qrUrl}`);
                await storage.updateCompany(company.id, { qrUrl: zimraConfig.qrUrl });
                company.qrUrl = zimraConfig.qrUrl; // Update local scope for usage this turn
            }
        } catch (e) {
            console.warn("Failed to fetch ZIMRA config, falling back to database for tax mapping");
        }

        const explicitlyNotVatRegistered = company.vatRegistered === false || company.vatEnabled === false;

        // Build the deterministic company tax mapping ONCE from live ZIMRA
        // config + local tax types. All lines resolve through this map so a
        // broken/ambiguous tax config surfaces as an actionable error before
        // the receipt ever reaches FDMS (instead of a Red validation from ZIMRA).
        const taxMapping = buildCompanyTaxMapping(dbTaxTypes, zimraConfig);
        const lineTaxIssues: { code: string; message: string }[] = [];

        // Map Invoice to ReceiptData
        const receiptLines = await Promise.all(invoice.items.map(async (item, index) => {
            let taxPercent = parseFloat(item.taxRate as any);
            let unitPrice = parseFloat(item.unitPrice as any);
            let lineTotal = parseFloat(item.lineTotal as any);

            if (explicitlyNotVatRegistered && taxPercent > 0) {
                if (!invoice.taxInclusive) {
                    const taxFactor = 1 + (taxPercent / 100);
                    unitPrice = parseFloat((unitPrice * taxFactor).toFixed(2));
                    lineTotal = parseFloat((lineTotal * taxFactor).toFixed(2));
                }
                taxPercent = 0;
            }

            let taxID = 0;

            if (explicitlyNotVatRegistered) {
                const nonVatTax = zimraConfig?.applicableTaxes?.find(t =>
                    Math.abs(t.taxPercent || 0) < 0.01 &&
                    t.taxName?.toLowerCase().includes('non-vat')
                );
                if (nonVatTax) taxID = nonVatTax.taxID;
            }

            if (taxID === 0) {
                const itemTaxTypeId = (item as any).product?.taxTypeId || (item as any).taxTypeId;
                const resolution = resolveLineTaxID(taxMapping, {
                    taxTypeId: itemTaxTypeId,
                    rate: taxPercent,
                    description: item.description || "",
                    forceNonVat: explicitlyNotVatRegistered
                });

                if (resolution.taxID) {
                    taxID = resolution.taxID;
                }
                if (resolution.issue) {
                    const label = (item.description || '').trim() || 'Item';
                    if (resolution.issue.severity === 'error') {
                        lineTaxIssues.push({
                            code: resolution.issue.code,
                            message: `Line ${index + 1} (${label}) — ${resolution.issue.message}`
                        });
                    } else {
                        vLog(`[Fiscalize] ${resolution.issue.code} (line ${index + 1} ${label}): ${resolution.issue.message}`);
                    }
                }
            }

            if (taxID === 0) {
                // Last resort heuristic — flagged as a warning so admins notice
                taxID = ZimraDevice.getTaxID(taxPercent);
                vLog(`[Fiscalize] WARN: heuristic tax ID ${taxID} used for rate ${taxPercent}% (no live config match for ${item.description || 'item'}); check tax config.`);
            }

            // HS code must be exactly 4 or 8 digits (RCPT048). Normalize by
            // stripping separators/dots and validating, else fall back.
            const normalizeHs = (code: any) => {
                const digits = String(code || "").replace(/\D/g, "");
                return /^\d{4}$|^\d{8}$/.test(digits) ? digits : "";
            };
            let hsCode = normalizeHs(item.product?.hsCode);
            if (!hsCode) {
                const categoryMatch = await db
                    .select()
                    .from(products)
                    .where(
                        and(
                            eq(products.companyId, company.id),
                            item.product?.category ? eq(products.category, item.product.category) : eq(products.name, item.description),
                            isNotNull(products.hsCode),
                            ne(products.hsCode, "0000.00.00"),
                            ne(products.hsCode, "")
                        )
                    )
                    .limit(1);

                if (categoryMatch.length > 0 && categoryMatch[0].hsCode) {
                    hsCode = normalizeHs(categoryMatch[0].hsCode.trim());
                }
                if (!hsCode) {
                    hsCode = "99999999"; // Default fallback for services
                }
            }

            // Build receipt line, conditionally omitting taxPercent for exempt items
            const receiptLine: any = {
                receiptLineType: ((invoice.transactionType || 'FiscalInvoice') !== 'CreditNote' && (invoice.transactionType || 'FiscalInvoice') !== 'DebitNote' && Number(unitPrice) < 0) ? 'Discount' : 'Sale',
                receiptLineNo: index + 1,
                receiptLineHSCode: hsCode,
                receiptLineName: (item.description || '').trim() || 'Item without description',
                receiptLinePrice: parseFloat(Number(unitPrice).toFixed(2)),
                receiptLineQuantity: parseFloat(Number(item.quantity).toFixed(2)),
                receiptLineTotal: parseFloat(Number(lineTotal).toFixed(2)),
                taxID: taxID,
            };

            // Only include taxPercent if not exempt (Tax ID 1)
            if (taxID !== 1) {
                receiptLine.taxPercent = taxPercent;
            }

            return receiptLine;
        }));

        const getZimraPaymentMethodCode = (methodName: string): 'Cash' | 'Card' | 'Other' | 'BankTransfer' | 'MobileWallet' => {
            const m = methodName.toUpperCase();
            if (['CASH'].includes(m)) return 'Cash';
            if (['CARD', 'SWIPE', 'POS'].includes(m)) return 'Card';
            if (['MOBILE', 'ECOCASH', 'ONE_MONEY', 'TELE_CASH', 'MOBILEWALLET'].includes(m)) return 'MobileWallet';
            if (['EFT', 'RTGS', 'TRANSFER', 'ZIPIT', 'BANKTRANSFER'].includes(m)) return 'BankTransfer';
            return 'Other';
        };

        // ── RCPT024/027/039: Normalize totals to ZIMRA's exact arithmetic ──
        // Line totals must equal price × quantity (2dp) and the receipt total
        // must be the per-tax-bucket sum ZIMRA computes — not the POS's per-line
        // rounded totals. Sending POS totals causes Red RCPT024/027/039 even
        // when the invoice is internally consistent.
        const roundMoney = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
        for (const line of receiptLines) {
            line.receiptLineTotal = Number((Number(line.receiptLineQuantity) * Number(line.receiptLinePrice)).toFixed(4));
        }

        const totalAmount = parseFloat(Number(invoice.total).toFixed(2));
        let payments: Array<{ moneyTypeCode: string, paymentAmount: number }> = [];

        if (invoice.splitPayments && Array.isArray(invoice.splitPayments) && invoice.splitPayments.length > 0) {
            payments = invoice.splitPayments.map((p: any) => ({
                moneyTypeCode: getZimraPaymentMethodCode(p.method),
                paymentAmount: parseFloat(Number(p.amount).toFixed(2))
            }));
            
            const sum = payments.reduce((acc, p) => acc + p.paymentAmount, 0);
            if (Math.abs(sum - totalAmount) > 0.05) {
                console.warn(`[Fiscalize] Split payments sum (${sum}) doesn't roughly match total (${totalAmount}).`);
            }
        } else {
            payments = [{
                moneyTypeCode: getZimraPaymentMethodCode(invoice.paymentMethod || 'CASH'),
                paymentAmount: totalAmount
            }];
        }

        let buyerData: any = undefined;
        let creditDebitNote = undefined;
        const transactionType = invoice.transactionType || "FiscalInvoice";
        let receiptType: any = "FiscalInvoice";

        if (transactionType === "CreditNote") receiptType = "CreditNote";
        if (transactionType === "DebitNote") receiptType = "DebitNote";

        // Receipt total via ZIMRA's bucket math (credit notes negative).
        const computedTotal = expectedReceiptTotal({
            receiptType,
            receiptLines: receiptLines as any,
            receiptLinesTaxInclusive: invoice.taxInclusive || false
        } as any);
        if (Math.abs(computedTotal - totalAmount) > 0.01) {
            vLog(`[Fiscalize] Total differs: invoice ${totalAmount.toFixed(2)} vs ZIMRA bucket math ${computedTotal.toFixed(2)}; submitting ZIMRA total.`);
        }
        const zimraTotal = roundMoney(computedTotal);

        // Re-anchor payments to the computed total (RCPT039). Split payments
        // are scaled proportionally; the last payment absorbs rounding so the
        // sum equals the computed total exactly.
        if (payments.length === 1) {
            payments[0].paymentAmount = Math.abs(zimraTotal);
        } else if (Math.abs(zimraTotal - totalAmount) > 0.01) {
            const scale = Math.abs(zimraTotal) / (Math.abs(totalAmount) || 1);
            let assigned = 0;
            for (let i = 0; i < payments.length; i++) {
                if (i === payments.length - 1) {
                    payments[i].paymentAmount = roundMoney(Math.abs(zimraTotal) - assigned);
                } else {
                    payments[i].paymentAmount = roundMoney(Number(payments[i].paymentAmount) * scale);
                    assigned = roundMoney(assigned + payments[i].paymentAmount);
                }
            }
        }

        if (receiptType === "CreditNote") {
            payments = payments.map(p => ({
                ...p,
                paymentAmount: -Math.abs(Number(p.paymentAmount || 0))
            }));
        } else {
            payments = payments.map(p => ({
                ...p,
                paymentAmount: Math.abs(Number(p.paymentAmount || 0))
            }));
        }

        // If CN/DN, we need original invoice details
        let originalInvoice = null;
        if (receiptType !== "FiscalInvoice") {
            if (!invoice.relatedInvoiceId) {
                throw new Error(`${receiptType} requires a related original invoice.`);
            }
            originalInvoice = await storage.getInvoice(invoice.relatedInvoiceId);
            if (!originalInvoice) {
                throw new Error(`Original invoice for this ${receiptType} not found.`);
            }
            if (!originalInvoice.fiscalCode) {
                throw new Error(`Original invoice must be fiscalized before a ${receiptType} can be issued.`);
            }

            // Spec 4.7: creditDebitNote: deviceID, receiptGlobalNo, fiscalDayNo
            creditDebitNote = {
                deviceID: parseInt(company.fdmsDeviceId || "0"),
                receiptGlobalNo: originalInvoice.receiptGlobalNo || originalInvoice.id,
                fiscalDayNo: originalInvoice.fiscalDayNo || 1,
                receiptID: originalInvoice.submissionId ? parseInt(originalInvoice.submissionId) : undefined
            };
        }

        // ZIMRA buyerData is optional, but buyerTIN is mandatory when buyerData is sent.
        // Keep named customers locally, but treat customers without a TIN as consumer sales for FDMS.
        const customerTin = invoice.customer?.tin?.trim();
        if (invoice.customer && customerTin) {
            buyerData = {
                buyerRegisterName: invoice.customer.name,
                buyerTradeName: invoice.customer.name,
                buyerTIN: customerTin,
            };

            // Only include VAT number if it exists
            if (invoice.customer.vatNumber && invoice.customer.vatNumber.trim()) {
                buyerData.vatNumber = invoice.customer.vatNumber.trim();
            }

            // Only include contacts if at least one field has data
            const hasPhone = invoice.customer.phone?.trim();
            const hasEmail = invoice.customer.email?.trim();

            if (hasPhone || hasEmail) {
                buyerData.buyerContacts = {};
                if (hasPhone) buyerData.buyerContacts.phoneNo = hasPhone;
                if (hasEmail) buyerData.buyerContacts.email = hasEmail;
            }

            // Only include address if at least one field has data
            const hasProvince = invoice.customer.city?.trim();
            const hasCity = invoice.customer.city?.trim();
            const hasStreet = invoice.customer.address?.trim();

            if (hasProvince || hasCity || hasStreet) {
                buyerData.buyerAddress = {};
                if (hasProvince) buyerData.buyerAddress.province = hasProvince;
                if (hasCity) buyerData.buyerAddress.city = hasCity;
                if (hasStreet) buyerData.buyerAddress.street = hasStreet;
                // houseNo and district are optional and not used in our schema
            }
        }

        // DEBUG: Write to file
        try {
            const logData = `[${new Date().toISOString()}] Invoice ${invoiceId}
        Existing GlobalNo: ${invoice.receiptGlobalNo}
        Existing ReceiptCounter: ${invoice.receiptCounter}
        ZimraSync: ${JSON.stringify(zimraSync)}
        Calculated NextGlobalNo: ${nextGlobalNo}
        Calculated NextReceiptCounter: ${nextReceiptCounter}
        --------------------------------\n`;
            fs.appendFileSync(path.join(process.cwd(), 'debug_fiscalize.log'), logData);
        } catch (err) { console.error("Failed to write debug log", err); }

        // ZIMRA Date Formatting — ISO 8601 local Harare time, no timezone suffix.
        // Format: YYYY-MM-DDTHH:mm:ss (24h, local time per ZIMRA spec example: 2019-09-23T14:43:23)
        // Harare is UTC+2, no DST. We manually offset to avoid Intl/locale quirks on the server.
        const formatZimraDate = (date: Date): string => {
            const harareMsOffset = 2 * 60 * 60 * 1000; // UTC+2, no DST
            const local = new Date(date.getTime() + harareMsOffset);
            return local.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:mm:ss"
        };

        // Ensure receiptDate is after fiscalDayOpenedAt (RCPT014) and after lastReceiptAt (RCPT030)
        let nowAtHarare = new Date();
        const dayOpenedAt = (fiscalConfig.fiscalDayOpenedAt || company.fiscalDayOpenedAt)
            ? new Date(fiscalConfig.fiscalDayOpenedAt || company.fiscalDayOpenedAt)
            : null;
        const lastRcptAt = (fiscalConfig.lastReceiptAt || company.lastReceiptAt)
            ? new Date(fiscalConfig.lastReceiptAt || company.lastReceiptAt)
            : null;

        // Check against day opening — receipt must be after day was opened (RCPT014)
        if (dayOpenedAt && nowAtHarare.getTime() <= dayOpenedAt.getTime() + 1000) {
            vLog(`[ZIMRA] Guard: now (${nowAtHarare.toISOString()}) <= dayOpened (${dayOpenedAt.toISOString()}). Bumping by 1s.`);
            nowAtHarare = new Date(dayOpenedAt.getTime() + 2000);
        }

        // Check against last receipt — receipt must be after previous receipt (RCPT030).
        // Only bump if lastRcptAt is in the past or very recent (within 5 minutes).
        // If lastRcptAt is far in the future (stale bug), ignore it — don't send a future date.
        const fiveMinutes = 5 * 60 * 1000;
        const realNow = new Date();
        if (lastRcptAt && lastRcptAt.getTime() > realNow.getTime() + fiveMinutes) {
            vLog(`[ZIMRA] Guard: lastRcptAt (${lastRcptAt.toISOString()}) is far in the future — ignoring stale value, using real now.`);
            // Don't bump — lastRcptAt is stale/wrong, just use current time
        } else if (lastRcptAt && nowAtHarare.getTime() <= lastRcptAt.getTime() + 1000) {
            vLog(`[ZIMRA] Guard: now (${nowAtHarare.toISOString()}) <= lastRcpt (${lastRcptAt.toISOString()}). Bumping by 1s.`);
            nowAtHarare = new Date(lastRcptAt.getTime() + 2000);
        }

        // Offline-signed receipts carry the timestamp from signing time; it must
        // still satisfy RCPT014 (after day open) and RCPT030 (after the previous
        // receipt). Route it through the same guards as "now": the server re-signs
        // its own payload (see submitReceipt below), so bumping the submitted date
        // is safe. Without this, a queued offline sale whose signed date predates
        // the current day/receipt (day closed and reopened while it waited) would
        // be rejected — or worse, stored Grey against a chain it does not fit.
        let effectiveReceiptDate = invoice.offlineDate || formatZimraDate(nowAtHarare);
        if (invoice.offlineDate) {
            const parseHarareLocal = (v: string) => {
                const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
                return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 2, +m[5], +m[6])) : null;
            };
            const signedAt = parseHarareLocal(invoice.offlineDate);
            if (signedAt) {
                if (dayOpenedAt && signedAt.getTime() <= dayOpenedAt.getTime() + 1000) {
                    effectiveReceiptDate = formatZimraDate(new Date(dayOpenedAt.getTime() + 2000));
                    vLog(`[ZIMRA] Guard (offline): signed date ${invoice.offlineDate} predates day open (${dayOpenedAt.toISOString()}). Bumped to ${effectiveReceiptDate}.`);
                } else if (!(lastRcptAt && lastRcptAt.getTime() > realNow.getTime() + fiveMinutes) && lastRcptAt && signedAt.getTime() <= lastRcptAt.getTime() + 1000) {
                    effectiveReceiptDate = formatZimraDate(new Date(lastRcptAt.getTime() + 2000));
                    vLog(`[ZIMRA] Guard (offline): signed date ${invoice.offlineDate} <= last receipt (${lastRcptAt.toISOString()}). Bumped to ${effectiveReceiptDate}.`);
                }
            }
        }

        const activeFiscalDayNo = fiscalConfig.currentFiscalDayNo || status?.lastFiscalDayNo || company.currentFiscalDayNo;

        const receiptData: ReceiptData = {
            receiptType: receiptType,
            receiptCurrency: (invoice.currency || 'USD').toUpperCase(),
            receiptCounter: nextReceiptCounter,
            receiptGlobalNo: nextGlobalNo,
            fiscalDayNo: activeFiscalDayNo, // Use refreshed day after auto-open, not stale company state.
            invoiceNo: invoice.invoiceNumber,
            receiptDate: effectiveReceiptDate,
            receiptLines: receiptLines as any,
            receiptTaxes: [],
            receiptPayments: payments as any,
            receiptTotal: zimraTotal,
            receiptLinesTaxInclusive: invoice.taxInclusive || false,
            buyerData: buyerData,
            creditDebitNote: creditDebitNote,
            receiptNotes: invoice.notes
                ? (creditDebitNote ? `${invoice.notes} (Ref: ${originalInvoice?.invoiceNumber || 'Original'})` : invoice.notes)
                : (receiptType !== 'FiscalInvoice' ? `Correction of data entry error (Ref: ${originalInvoice?.invoiceNumber || 'Original'})` : undefined)
        };

        vLog(`[Fiscalize] Prepared Receipt Data for Invoice ${invoiceId} (Date: ${receiptData.receiptDate}):`, JSON.stringify(receiptData, null, 2));

        // Submit with previous hash for chaining. This is recalculated after the
        // real receipt numbers are claimed, because preflight only uses a preview.
        let prevHash = invoice.offlinePreviousHash || ((nextReceiptCounter === 1) ? null : (company.lastFiscalHash || null));
        let result: any;

        try {
            await assertReceiptPreflight({
                company: {
                    ...company,
                    ...fiscalConfig,
                    currentFiscalDayNo: receiptData.fiscalDayNo,
                    lastReceiptGlobalNo: receiptData.receiptGlobalNo,
                    dailyReceiptCount: receiptData.receiptCounter,
                    id: company.id // CRITICAL: Prevent activeBranch.id from overriding company.id
                },
                invoice,
                receiptData,
                originalInvoice,
                zimraConfig,
                taxIssues: lineTaxIssues
            });
        } catch (preflightErr: any) {
            if (preflightErr instanceof ZimraPreflightError) {
                const parsedValidationErrors = preflightErr.issues.map((issue: any) => ({
                    invoiceId: invoiceId,
                    errorCode: issue.code || 'PREFLIGHT',
                    errorMessage: issue.message,
                    errorColor: 'Red',
                    requiresPreviousReceipt: false
                }));
                try {
                    if (parsedValidationErrors.length > 0) {
                        await storage.createValidationErrors(parsedValidationErrors);
                        await storage.updateInvoice(invoiceId, { validationStatus: 'invalid', fdmsStatus: 'failed' });
                    }
                    
                    const needsTaxSync = preflightErr.issues.some((issue: any) => issue.code === 'TAX_LIVE_MISSING' || issue.code === 'RCPT025');
                    if (needsTaxSync && zimraConfig) {
                        vLog(`[Fiscalize] Tax error detected (TAX_LIVE_MISSING or RCPT025). Auto-syncing ZIMRA taxes...`);
                        const taxesToSync = zimraConfig.applicableTaxes || zimraConfig.taxLevels || [];
                        if (taxesToSync.length > 0) {
                            await storage.syncTaxTypes(company.id, taxesToSync);
                            zimraConfigCache.delete(company.id);
                        }
                    }
                } catch (saveErr) {
                    console.error("Error handling preflight failure details:", saveErr);
                }
            }
            throw preflightErr; // Propagate preflight errors WITHOUT locking sequence numbers
        }

        // Now that preflight passed, we are ready to make the network request.
        // Claim the actual numbers atomically, or reuse valid locked ones.
        if (zimraSync) {
            nextGlobalNo = zimraSync.nextGlobalNo;
            nextReceiptCounter = zimraSync.nextReceiptCounter;
        } else if (invoice.fiscalSignature && invoice.receiptGlobalNo && invoice.receiptCounter) {
            // Offline-signed receipt: use the counters that were signed offline.
            // Per the ZIMRA spec these must be EXACTLY one greater than the live
            // sequence (previous receipt + 1) — "ahead" is not enough. A
            // skip-ahead number (a gap in the chain) is stored Grey ("previous
            // receipt missing") and poisons the chain exactly like the day-4
            // anchor break did. Require an exact match on BOTH counters, and
            // if the client sent the previous hash it signed against, it must
            // still match the live chain. Otherwise reject with a clear error
            // so the sale is re-issued with fresh numbers rather than burning
            // a corrupt receipt.
            const liveGlobal = fiscalConfig.lastReceiptGlobalNo ?? company.lastReceiptGlobalNo ?? 0;
            const liveCounter = fiscalConfig.dailyReceiptCount ?? company.dailyReceiptCount ?? 0;
            if (invoice.receiptGlobalNo !== liveGlobal + 1) {
                throw new Error(`Offline receipt global number ${invoice.receiptGlobalNo} is not the next in sequence (expected ${liveGlobal + 1}). The POS claimed these numbers from an outdated or skipped cached sequence. Re-issue this sale from the POS to obtain fresh numbers.`);
            }
            if (invoice.receiptCounter !== liveCounter + 1) {
                throw new Error(`Offline receipt daily counter ${invoice.receiptCounter} is not the next in sequence (expected ${liveCounter + 1}). The POS claimed these numbers from an outdated or skipped cached sequence. Re-issue this sale from the POS to obtain fresh numbers.`);
            }
            const liveHash = fiscalConfig.lastFiscalHash || company.lastFiscalHash || null;
            if (invoice.offlinePreviousHash && liveHash && invoice.offlinePreviousHash !== liveHash) {
                throw new Error(`Offline receipt was signed against a previous hash that no longer matches the live chain. Re-issue this sale from the POS to obtain fresh numbers.`);
            }
            nextGlobalNo = invoice.receiptGlobalNo;
            nextReceiptCounter = invoice.receiptCounter;
            vLog(`[Fiscalize] Offline — using signed counters: GlobalNo=${nextGlobalNo}, Counter=${nextReceiptCounter}`);
        } else if (
            invoice.receiptGlobalNo &&
            invoice.receiptCounter &&
            invoice.receiptGlobalNo === ((fiscalConfig.lastReceiptGlobalNo ?? company.lastReceiptGlobalNo) || 0) &&
            invoice.receiptCounter === ((fiscalConfig.dailyReceiptCount ?? company.dailyReceiptCount) || 0)
        ) {
            // Retry after a post-preflight/submit failure: reuse the already claimed
            // high-water numbers. If another invoice moved the counters forward,
            // these locked numbers are stale and must not be reused.
            nextGlobalNo = invoice.receiptGlobalNo;
            nextReceiptCounter = invoice.receiptCounter;
            vLog(`[Fiscalize] Retry — safely reusing locked numbers: GlobalNo=${nextGlobalNo}, Counter=${nextReceiptCounter}`);
        } else {
            // First attempt, preflight passed: atomically claim the actual pair.
            const claimed = await storage.claimNextReceiptNumbers(company.id, invoice.branchId || undefined);
            nextGlobalNo = claimed.receiptGlobalNo;
            nextReceiptCounter = claimed.receiptCounter;
            vLog(`[Fiscalize] Atomically claimed fresh numbers: GlobalNo=${nextGlobalNo}, Counter=${nextReceiptCounter}`);
        }

        // Update receiptData with the REAL assigned numbers
        receiptData.receiptCounter = nextReceiptCounter;
        receiptData.receiptGlobalNo = nextGlobalNo;
        prevHash = invoice.offlinePreviousHash || ((receiptData.receiptCounter === 1) ? null : (fiscalConfig.lastFiscalHash || company.lastFiscalHash || null));

        // Note: The signature generation inside submitReceipt relies on these final counters!
        // The client's offline signature (if any) is intentionally NOT forwarded to
        // submitReceipt: the server recomputes taxes/totals/date from its own prepared
        // payload, and ZIMRA verifies the signature against exactly what is submitted.
        // Forwarding a client-computed signature (whose tax rounding or timestamp may
        // differ by a cent/second) makes ZIMRA reject the receipt with RCPT020
        // "Invoice signature is not valid". The server re-signs its own payload instead.

        try {
            try {
                vTime(`[ZIMRA] submitReceipt-${companyId}-${nextGlobalNo}`);
                result = await device.submitReceipt(receiptData, prevHash, true);
                vTimeEnd(`[ZIMRA] submitReceipt-${companyId}-${nextGlobalNo}`);
            } catch (submitErr: any) {
                // Auto-Open Retry Logic: Trigger on ZIMRA error code 310 or RCPT01 (FiscalDayClosed).
                const errStr = submitErr.toString();
                const isDayClosedError = errStr.includes('310') || 
                                         errStr.includes('RCPT01') || 
                                         errStr.toLowerCase().includes('fiscal day is closed') ||
                                         (submitErr instanceof ZimraApiError && (submitErr as any).details?.statusCode === 310);
                
                if (isDayClosedError) {
                    vLog("[ZIMRA] Auto-Open Retry: ZIMRA returned FiscalDayClosed (310, RCPT01, or text). Opening new day...");

                    try {
                        // 1. Open New Fiscal Day
                        const nextDay = (company.currentFiscalDayNo || 0) + 1;
                        const openResult = await device.openDay(nextDay) as any;
                        const actualNextDay = openResult.fiscalDayNo || nextDay;

                        // 2. Update Local State — reset daily counter to 0 for the new day
                        // Set openedAt slightly in the past so the receipt date comes STRICTLY AFTER it
                        const openedAt = new Date(Date.now() - 2000);
                        const dayUpdate = {
                            fiscalDayOpen: true,
                            currentFiscalDayNo: actualNextDay,
                            fiscalDayOpenedAt: openedAt,
                            dailyReceiptCount: 0,
                            lastFiscalHash: null
                        };
                        await storage.updateCompany(company.id, dayUpdate);
                        if (activeBranch) {
                            await storage.updateBranch(activeBranch.id, dayUpdate);
                        }
                        
                        fiscalConfig = {
                            ...fiscalConfig,
                            ...dayUpdate
                        };

                        // 3. Atomically claim fresh numbers for the new day
                        const newDayClaimed = await storage.claimNextReceiptNumbers(company.id, activeBranch?.id);
                        receiptData.receiptCounter = newDayClaimed.receiptCounter;
                        nextReceiptCounter = newDayClaimed.receiptCounter;
                        receiptData.receiptGlobalNo = newDayClaimed.receiptGlobalNo;
                        receiptData.fiscalDayNo = actualNextDay;
                        receiptData.receiptDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
                        invoice.issueDate = new Date(receiptData.receiptDate);
                        prevHash = null; // First receipt of new day has no previous hash

                        vLog(`[ZIMRA] Retry: New day ${nextDay}, claimed Counter=${nextReceiptCounter}, GlobalNo=${newDayClaimed.receiptGlobalNo}`);

                        await assertReceiptPreflight({
                            company: {
                                ...company,
                                ...fiscalConfig,
                                currentFiscalDayNo: receiptData.fiscalDayNo,
                                lastReceiptGlobalNo: receiptData.receiptGlobalNo,
                                dailyReceiptCount: receiptData.receiptCounter,
                                id: company.id // CRITICAL: Prevent activeBranch.id from overriding company.id
                            },
                            invoice,
                            receiptData,
                            originalInvoice,
                            zimraConfig,
                            taxIssues: lineTaxIssues
                        });
                        
                        vTime(`[ZIMRA] submitReceipt-retry-${companyId}-${nextGlobalNo}`);
                        result = await device.submitReceipt(receiptData, prevHash, true);
                        vTimeEnd(`[ZIMRA] submitReceipt-retry-${companyId}-${nextGlobalNo}`);

                    } catch (retryErr: any) {
                        console.error("[ZIMRA] Retry Failed:", retryErr);
                        throw new Error(`Fiscal Day Closed. Automatic opening failed: ${retryErr.message}`);
                    }
                } else {
                    throw submitErr;
                }
            }
        } catch (err: any) {
            // CRITICAL: Always lock the counters to this invoice on failure
            // This ensures resubmission uses the same number, and next invoice gets a new one.
            try {
                vLog(`[Fiscalize] Exception Caught. Saving Lock: GlobalNo=${nextGlobalNo}, Counter=${nextReceiptCounter} to Invoice ${invoiceId}`);
                await storage.updateInvoice(invoiceId, {
                    fdmsStatus: 'failed',
                    validationStatus: 'invalid', // Default to invalid on system error, specific errors overwritten below
                    lastValidationAttempt: new Date(),
                    receiptGlobalNo: nextGlobalNo,
                    receiptCounter: nextReceiptCounter
                });

                const lockUserId = userId?.toString();
                if (lockUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lockUserId)) {
                    try {
                        await storage.lockInvoice(invoiceId, lockUserId);
                    } catch (lockError) {
                        console.error("Failure cleanup error:", lockError);
                    }
                }
            } catch (err2) {
                console.error("Failure reporting error:", err2);
            }

            // Handle ZIMRA API Errors (Validation details)
            if (err instanceof ZimraApiError) {
                const details = err.details || {};
                let parsedValidationErrors: any[] = [];
                let hasRedErrors = false;

                if (details.validationErrors && Array.isArray(details.validationErrors)) {
                    try {
                        parsedValidationErrors = details.validationErrors.map((e: any) => ({
                            invoiceId: invoiceId,
                            errorCode: e.validationErrorCode || 'UNKNOWN',
                            errorMessage: e.validationErrorMessage || e.errorMessage || e.message || 'Unknown Error',
                            errorColor: e.validationErrorColor || 'Red',
                            requiresPreviousReceipt: false
                        }));

                        if (parsedValidationErrors.length > 0) {
                            await storage.createValidationErrors(parsedValidationErrors);
                            hasRedErrors = parsedValidationErrors.some((e: any) => e.errorColor === 'Red');
                        }
                    } catch (saveErr) {
                        console.error("Failed to save validation errors during exception handling:", saveErr);
                    }
                }

                if (hasRedErrors) {
                    try { await storage.updateInvoice(invoiceId, { validationStatus: 'red' }); }
                    catch (e) { console.error("Failed to update status to red", e); }
                }
            }

            throw err; // Re-throw to propagate error to caller
        }

        vLog(`[Fiscalize] Result for Invoice ${invoiceId}:`, JSON.stringify(result, null, 2));

        // Handle validation errors
        const validationResult = result.validationResult;
        let validationStatus = 'valid';
        let validationErrors: any[] = [];

        if (validationResult && !validationResult.valid) {
            // Map ZIMRA validation colors
            if (validationResult.errors.some((e: any) => e.errorColor === 'Red')) {
                validationStatus = 'red';
            } else if (validationResult.errors.some((e: any) => e.errorColor === 'Grey')) {
                validationStatus = 'grey';
            } else if (validationResult.errors.some((e: any) => e.errorColor === 'Yellow')) {
                validationStatus = 'yellow';
            } else {
                validationStatus = 'invalid';
            }

            // Store validation errors
            validationErrors = validationResult.errors.map((error: any) => ({
                invoiceId,
                errorCode: error.errorCode,
                errorMessage: error.errorMessage,
                errorColor: error.errorColor,
                requiresPreviousReceipt: error.requiresPreviousReceipt
            }));

            // Save validation errors to database
            if (validationErrors.length > 0) {
                await storage.createValidationErrors(validationErrors);
            }
        }

        // RCPT012/011 fix: ZIMRA rejected the receipt because the submitted
        // global/daily number was not the next one (usually a number burned by
        // an earlier failure). Re-align the local high-water marks with ZIMRA's
        // actual state in BOTH directions so the desync does not cascade into
        // every later receipt: if ZIMRA's counters differ from ours (ahead or
        // behind), take ZIMRA's — it is authoritative for what it stored.
        if (validationStatus === 'red' && validationErrors.some((e) => e.errorCode === 'RCPT012' || e.errorCode === 'RCPT011')) {
            try {
                const syncStatus = await device.getStatus() as any;
                const syncGlobal = Number(syncStatus.lastReceiptGlobalNo || 0);
                const syncCounter = Number(syncStatus.lastReceiptCounter || 0);
                const counterUpdate: any = {};
                if (syncGlobal !== (company.lastReceiptGlobalNo || 0)) counterUpdate.lastReceiptGlobalNo = syncGlobal;
                if (syncCounter !== (company.dailyReceiptCount || 0)) counterUpdate.dailyReceiptCount = syncCounter;
                if (Object.keys(counterUpdate).length > 0) {
                    if (activeBranch) await storage.updateBranch(activeBranch.id, counterUpdate);
                    await storage.updateCompany(company.id, counterUpdate);
                    vLog(`[Fiscalize] RCPT012/011: realigned counters to ZIMRA (global=${counterUpdate.lastReceiptGlobalNo ?? 'keep'}, daily=${counterUpdate.dailyReceiptCount ?? 'keep'}).`);
                } else {
                    vLog(`[Fiscalize] RCPT012/011 detected but ZIMRA counters already match; no realignment needed.`);
                }
            } catch (syncErr: any) {
                console.warn(`[Fiscalize] Counter realignment failed: ${syncErr.message}`);
            }
        }

        // Generate QR Code (if successful and synced/signed - validation errors don't prevent signature)
        let qrCode = '';
        if (result.synced) {
            qrCode = device.generateQrCode(result.signature, receiptData.receiptGlobalNo, receiptData.receiptDate);
        }

        // Update Invoice & Company Counters
        const updatedInvoice = await storage.fiscalizeInvoice(invoiceId, {
            fiscalCode: result.hash, // Corrected to SHA256 Hash for verification independently
            qrCodeData: qrCode,
            verificationCode: result.verificationCode,
            fiscalSignature: result.signature,
            fiscalDayNo: receiptData.fiscalDayNo,
            receiptCounter: receiptData.receiptCounter,
            receiptGlobalNo: receiptData.receiptGlobalNo,
            syncedWithFdms: result.synced,
            fdmsStatus: result.synced ? "Fiscalized" : "Failed",
            submissionId: result.operationID,
            validationStatus: validationStatus,
            lastValidationAttempt: new Date()
        });


        const companyUpdateData: any = {
            lastReceiptAt: nowAtHarare  // Use the actual UTC Date object, not re-parsed from the Harare-formatted string
        };
        // Update Company Counters (Important!)
        // ZIMRA stores every receipt it accepts over the wire — including ones
        // with Red/Grey validation errors — and its sequence advances for all
        // of them. So as long as ZIMRA processed the call, the local counters
        // and hash must advance too, or the next receipt submits a number ZIMRA
        // already has (RCPT012/011). The RCPT012/011 realignment below heals the
        // only exception (a call ZIMRA rejected as non-sequential).
        companyUpdateData.lastReceiptGlobalNo = receiptData.receiptGlobalNo;
        companyUpdateData.dailyReceiptCount = receiptData.receiptCounter;
        companyUpdateData.lastFiscalHash = result.hash;
        await storage.updateCompany(company.id, companyUpdateData);

        return updatedInvoice;

    } catch (e: any) {
        if (e instanceof ZimraApiError) {
            throw new Error(e.message);
        }
        throw e;
    }
};

