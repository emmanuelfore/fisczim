/**
 * Desktop / Web POS — local-first offline fiscal signing.
 * Mirrors mobile/src/lib/offline-fiscal.ts + fiscalStorage.ts but uses
 * IndexedDB (client/src/lib/offline-db.ts) instead of AsyncStorage.
 *
 * Flow:
 *  1. While online, call refreshOfflineFiscalCache(companyId) to cache the
 *     ZIMRA private key, device IDs, QR URL and fiscal counters from
 *     GET /api/companies/:id/fiscal-context.
 *  2. At checkout, call processOfflineFiscalization() FIRST — it signs the
 *     receipt locally (<100ms once the RSA key is pre-warmed) so the receipt
 *     can print immediately with QR + fiscal numbers, without waiting for
 *     the server round-trip.
 *  3. POST the sale to the server in the background including the
 *     pre-computed signature/counters so ZIMRA gets the official receipt.
 *     (The server re-signs its own payload but reuses the claimed numbers.)
 */
import { apiFetch } from "./api";
import {
  getCachedZimraConfig,
  getCachedFiscalSequence,
  cacheZimraConfig,
  cacheFiscalSequence,
} from "./offline-db";
import { generateOfflineFiscalData, resolveTaxCode, prewarmKeyCache } from "./fiscalization-offline";

/**
 * Refresh the full offline fiscal cache (private key, QR URL, device IDs, counters).
 * Must be called while online so sales can sign receipts locally and print
 * fiscal fields instantly — even before the server responds.
 */
export async function refreshOfflineFiscalCache(companyId: number): Promise<{
  config: any | null;
  sequence: any | null;
}> {
  try {
    const res = await apiFetch(`/api/companies/${companyId}/fiscal-context`);
    if (res.ok) {
      const ctx = await res.json();
      let config: any | null = null;
      let sequence: any | null = null;

      if (ctx?.zimraPrivateKey) {
        config = {
          fdmsDeviceId: ctx.fdmsDeviceId,
          fdmsDeviceSerialNo: ctx.fdmsDeviceSerialNo,
          zimraPrivateKey: ctx.zimraPrivateKey,
          zimraCertificate: ctx.zimraCertificate,
          qrUrl: ctx.qrUrl,
          currentFiscalDayNo: ctx.currentFiscalDayNo,
          fiscalDayOpen: ctx.fiscalDayOpen,
          fiscalDayOpenedAt: ctx.fiscalDayOpenedAt,
          zimraEnvironment: ctx.zimraEnvironment,
        };
        await cacheZimraConfig(companyId, config);
        // Pre-warm RSA key cache so first checkout is instant
        prewarmKeyCache(ctx.zimraPrivateKey);
      } else {
        console.warn(`[FiscalStorage] /fiscal-context returned OK but zimraPrivateKey is missing!`);
      }

      if (typeof ctx?.lastReceiptGlobalNo === "number") {
        sequence = {
          lastReceiptGlobalNo: ctx.lastReceiptGlobalNo || 0,
          dailyReceiptCount: ctx.dailyReceiptCount || 0,
          lastFiscalHash: ctx.lastFiscalHash || null,
          currentFiscalDayNo: ctx.currentFiscalDayNo || 0,
        };
        await cacheFiscalSequence(companyId, sequence);
      }

      return {
        config: config || (await getCachedZimraConfig(companyId)) || null,
        sequence: sequence || (await getCachedFiscalSequence(companyId)) || null,
      };
    } else {
      console.warn(`[FiscalStorage] /fiscal-context returned ${res.status}`);
    }
  } catch (e) {
    console.warn("[FiscalStorage] Failed to refresh offline fiscal cache:", e);
  }

  return {
    config: (await getCachedZimraConfig(companyId)) || null,
    sequence: (await getCachedFiscalSequence(companyId)) || null,
  };
}

/**
 * True when we have enough cached data to sign receipts locally.
 */
export async function hasOfflineFiscalCapability(companyId: number): Promise<boolean> {
  const config = await getCachedZimraConfig(companyId);
  const sequence = await getCachedFiscalSequence(companyId);
  return Boolean((config as any)?.zimraPrivateKey && sequence);
}

/** Merge cached ZIMRA device fields into company for receipt printing (offline-safe). */
export async function mergeCompanyWithCachedZimraConfig(company: any, companyId: number): Promise<any> {
  const config = (await getCachedZimraConfig(companyId)) as any;
  if (!config) return company;
  return {
    ...company,
    fdmsDeviceId: company?.fdmsDeviceId || company?.deviceId || config.fdmsDeviceId,
    fdmsDeviceSerialNo: company?.fdmsDeviceSerialNo || company?.deviceSerialNo || config.fdmsDeviceSerialNo,
    deviceId: company?.deviceId || config.fdmsDeviceId,
    deviceSerialNo: company?.deviceSerialNo || config.fdmsDeviceSerialNo,
    qrUrl: company?.qrUrl || config.qrUrl,
    currentFiscalDayNo: company?.currentFiscalDayNo || config.currentFiscalDayNo,
  };
}

export async function processOfflineFiscalization(
  companyId: number,
  invoiceData: any,
  currencyCode: string,
  taxInclusive: boolean = true,
  options?: { tryRefresh?: boolean; isOnlineSale?: boolean }
) {
  try {
    let zimraConfig: any = await getCachedZimraConfig(companyId);
    let fiscalSequence: any = await getCachedFiscalSequence(companyId);

    if ((!zimraConfig?.zimraPrivateKey || !fiscalSequence) && options?.tryRefresh !== false) {
      const refreshed = await refreshOfflineFiscalCache(companyId).catch(() => null);
      if (refreshed?.config) zimraConfig = refreshed.config;
      if (refreshed?.sequence) fiscalSequence = refreshed.sequence;
    }

    if (zimraConfig?.zimraPrivateKey && fiscalSequence) {
      const nextGlobalNo = (fiscalSequence.lastReceiptGlobalNo || 0) + 1;
      const nextDailyCount = (fiscalSequence.dailyReceiptCount || 0) + 1;
      const dateObj = new Date();
      const dateLocal = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000));
      const receiptDate = dateLocal.toISOString().slice(0, 19);

      const taxesMap = new Map<number, any>();
      let total = 0;

      for (const item of invoiceData.items || []) {
        const taxId = item.taxTypeId || 1;
        const taxRate = Number(item.taxRate || 0);
        const lineTotal = Number(item.lineTotal || (Number(item.price || item.unitPrice || 0) * Number(item.quantity || 1)));
        const taxAmount = taxInclusive
          ? Number((lineTotal - (lineTotal / (1 + (taxRate / 100)))).toFixed(2))
          : Number((lineTotal * (taxRate / 100)).toFixed(2));
        const salesWithTax = taxInclusive ? lineTotal : Number((lineTotal + taxAmount).toFixed(2));

        total += salesWithTax;

        if (!taxesMap.has(taxId)) {
          taxesMap.set(taxId, { taxID: taxId, taxCode: resolveTaxCode(taxId), taxPercent: taxRate, taxAmount: 0, salesAmountWithTax: 0 });
        }
        const t = taxesMap.get(taxId);
        t.taxAmount = Number((t.taxAmount + taxAmount).toFixed(2));
        t.salesAmountWithTax = Number((t.salesAmountWithTax + salesWithTax).toFixed(2));
      }

      const receiptTotal = invoiceData.total ? Number(invoiceData.total) : Number(total.toFixed(2));

      const receiptDataParams = {
        receiptType: "FISCALINVOICE",
        receiptCurrency: currencyCode,
        receiptGlobalNo: nextGlobalNo,
        receiptDate: receiptDate,
        receiptTotal: receiptTotal,
        receiptTaxes: Array.from(taxesMap.values()),
      };

      const offlineSig = await generateOfflineFiscalData({
        receiptData: receiptDataParams,
        previousReceiptHash: fiscalSequence.lastFiscalHash || null,
        deviceId: zimraConfig.fdmsDeviceId,
        privateKeyPem: zimraConfig.zimraPrivateKey,
      });

      const fiscalDayNo =
        fiscalSequence.currentFiscalDayNo ||
        zimraConfig.currentFiscalDayNo ||
        null;

      const fiscalData = {
        receiptGlobalNo: nextGlobalNo,
        receiptCounter: nextDailyCount,
        fiscalDayNo,
        fiscalSignature: offlineSig.signature,
        receiptDeviceSignature: offlineSig.hash,
        verificationCode: offlineSig.verificationCode,
        qrCodeData: zimraConfig.qrUrl ? `${zimraConfig.qrUrl}?verify=${offlineSig.verificationCode}` : null,
        offlinePreviousHash: fiscalSequence.lastFiscalHash || null,
        offlineDate: receiptDate,
        _localSigned: true,
        _offline: !options?.isOnlineSale,
      };

      await cacheFiscalSequence(companyId, {
        ...fiscalSequence,
        lastReceiptGlobalNo: nextGlobalNo,
        dailyReceiptCount: nextDailyCount,
        lastFiscalHash: offlineSig.hash,
        currentFiscalDayNo: fiscalDayNo,
      });

      // Anchor for the offline clock monotonic check.
      try {
        localStorage.setItem("pos_last_receipt_at", String(Date.now()));
      } catch { /* ignore */ }

      return fiscalData;
    }

    console.warn(
      "[OfflineFiscal] Missing cached ZIMRA config or fiscal sequence — receipt will print without fiscal fields. Open POS while online first."
    );
  } catch (e) {
    console.error("Failed to generate offline fiscal signature", e);
  }
  return null;
}
