import {
  getCachedZimraConfig,
  getCachedFiscalSequence,
  cacheFiscalSequence,
  refreshOfflineFiscalCache,
} from "./fiscalStorage";
import { generateOfflineFiscalData, resolveTaxCode } from "./fiscalization-offline";

export async function processOfflineFiscalization(
  companyId: number,
  invoiceData: any,
  currencyCode: string,
  taxInclusive: boolean = true,
  options?: { tryRefresh?: boolean }
) {
  try {
    let zimraConfig = await getCachedZimraConfig(companyId);
    let fiscalSequence = await getCachedFiscalSequence(companyId);

    if ((!zimraConfig?.zimraPrivateKey || !fiscalSequence) && options?.tryRefresh !== false) {
      const refreshed = await refreshOfflineFiscalCache(companyId).catch(() => null);
      if (refreshed?.config) zimraConfig = refreshed.config;
      if (refreshed?.sequence) fiscalSequence = refreshed.sequence;
    }

    if (zimraConfig?.zimraPrivateKey && fiscalSequence) {
      const nextGlobalNo = fiscalSequence.lastReceiptGlobalNo + 1;
      const nextDailyCount = fiscalSequence.dailyReceiptCount + 1;
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

      const offlineSig = generateOfflineFiscalData({
        receiptData: receiptDataParams,
        previousReceiptHash: fiscalSequence.lastFiscalHash,
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
        _offline: true,
      };

      await cacheFiscalSequence(companyId, {
        ...fiscalSequence,
        lastReceiptGlobalNo: nextGlobalNo,
        dailyReceiptCount: nextDailyCount,
        lastFiscalHash: offlineSig.hash,
        currentFiscalDayNo: fiscalDayNo,
      });

      return fiscalData;
    }

    console.warn(
      "[OfflineFiscal] Missing cached ZIMRA config or fiscal sequence — offline receipt will print without fiscal fields. Open POS while online first."
    );
  } catch (e) {
    console.error("Failed to generate offline fiscal signature", e);
  }
  return null;
}
