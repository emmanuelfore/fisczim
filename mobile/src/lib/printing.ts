import * as Print from 'expo-print';

// Lazy-load native thermal printer to avoid crash on Expo Go / unsupported builds
let ThermalPrinterModule: any = null;
try {
  // Use a dynamic require within a try-catch for maximum safety
  const Printer = require('react-native-thermal-printer');
  ThermalPrinterModule = Printer?.default || Printer || null;
} catch (e) {
  console.warn("[Printing] Thermal printer module not available:", e);
  // Not available in this build (e.g. Expo Go) — Bluetooth printing will be disabled
}

let Z100Printer: any = null;
try {
  Z100Printer = require('../../modules/z100-printer').default;
} catch (e) {
  console.warn("[Printing] Z100 printer module not available", e);
}

let SunmiPrinter: any = null;
try {
  SunmiPrinter = require('@hendrysetiadi/react-native-sunmi-printer');
} catch (e) {
  console.warn("[Printing] Sunmi printer module not available", e);
}

export interface TicketData {
  invoice: any;
  company: any;
  customer?: any;
  items?: any[];
  terminalId?: string;
  currencySymbol?: string;
  cashierName?: string;
  paidAmount?: number;
  paperWidth?: number;
  noteType?: "credit" | "debit";
  originalInvoiceNumber?: string;
  suppressTaxDetails?: boolean;
}

/** True when the company is VAT-registered and can issue fiscal receipts */
const isFiscal = (company: any) => !!(company?.vatRegistered && company?.vatNumber);

/** Derive receipt title and fiscal footer marker based on note type */
function getNoteLabels(noteType: "credit" | "debit" | undefined, fiscal: boolean) {
  if (!noteType) {
    return {
      title: fiscal ? 'FISCAL TAX INVOICE' : 'TAX INVOICE',
      footerMarker: fiscal ? '*** FISCAL RECEIPT ***' : null,
    };
  }
  const isCredit = noteType === "credit";
  return {
    title: fiscal
      ? (isCredit ? 'FISCAL CREDIT NOTE' : 'FISCAL DEBIT NOTE')
      : (isCredit ? 'CREDIT NOTE' : 'DEBIT NOTE'),
    footerMarker: fiscal
      ? (isCredit ? '*** FISCAL CREDIT NOTE ***' : '*** FISCAL DEBIT NOTE ***')
      : null,
  };
}

export const generateReceiptHtml = (data: TicketData) => {
  const { invoice, company, items, customer, currencySymbol, cashierName, paidAmount, paperWidth, noteType, originalInvoiceNumber, suppressTaxDetails } = data;
  const symbol = currencySymbol || '$';
  const receiptItems = items || invoice.items || [];
  const width = paperWidth || 58;
  const isA4 = width >= 210;
  const receiptWidth = isA4 ? '210mm' : `${width}mm`;
  
  const fiscal = !suppressTaxDetails && isFiscal(company);
  const noteLabels = getNoteLabels(noteType, fiscal);
  const title = suppressTaxDetails ? (invoice.receiptTitle || "BUS TICKET") : noteLabels.title;
  const footerMarker = suppressTaxDetails ? null : noteLabels.footerMarker;

  // Group taxes
  const taxGroups = receiptItems.reduce((acc: any, item: any) => {
    const taxRate = parseFloat(item.taxRate || 0);
    const price = parseFloat(item.price || 0);
    const qty = parseFloat(item.quantity || 0);
    const total = parseFloat(item.lineTotal || (price * qty));
    const rate = taxRate / 100;
    const taxAmount = (total * rate) / (1 + rate);
    const netAmount = total - taxAmount;
    const key = taxRate.toFixed(2);
    if (!acc[key]) {
      acc[key] = { rate: taxRate, net: 0, tax: 0, gross: 0, name: item.taxCode || (taxRate === 0 ? "Exempt" : `${taxRate}%`) };
    }
    acc[key].net += netAmount;
    acc[key].tax += taxAmount;
    acc[key].gross += total;
    return acc;
  }, {});

  const qrUrl = fiscal && invoice.qrCodeData
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(invoice.qrCodeData)}&size=100x100`
    : null;

  const total = Number(invoice.total || 0);
  const paid = Number(paidAmount || total);
  const change = Math.max(0, paid - total);

  // Format date identical to pos.tsx: dd/MM/yy HH:mm
  const dateObj = new Date(invoice.issueDate || invoice.createdAt);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formattedDate = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear().toString().slice(-2)} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @media print {
            @page { size: ${isA4 ? 'A4' : `${receiptWidth} auto`}; margin: 0mm; }
            html, body { margin: 0 !important; padding: 0 !important; width: ${isA4 ? '210mm' : receiptWidth} !important; background: white; }
          }
          body { 
            font-family: 'Courier New', Courier, monospace; 
            color: black; 
            font-size: 10px; 
            line-height: 1.25; 
            width: ${receiptWidth}; 
            max-width: ${receiptWidth};
            margin: ${isA4 ? '0 auto' : '0'};
            padding: 2mm;
            box-sizing: border-box;
            background: white;
          }
          * { box-sizing: border-box; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .items-center { align-items: center; }
          .flex-col { flex-direction: column; }
          .text-right { text-align: right; }
          .text-xs { font-size: 12px; }
          .text-base { font-size: 16px; }
          .mb-1 { margin-bottom: 4px; }
          .mb-2 { margin-bottom: 8px; }
          .mt-1 { margin-top: 4px; }
          .pb-1 { padding-bottom: 4px; }
          .pb-2 { padding-bottom: 8px; }
          .pt-1 { padding-top: 4px; }
          .border-b-dashed { border-bottom: 1px dashed black; }
          .border-b-dotted { border-bottom: 1px dotted #888; }
          .w-45 { width: 45%; }
          .w-25 { width: 25%; }
          .w-10 { width: 10%; }
          .w-60 { width: 60%; }
          .w-30 { width: 30%; }
          .pl-2 { padding-left: 8px; }
          .text-9xs { font-size: 9px; }
          .whitespace-pre-wrap { white-space: pre-wrap; }
          .logo { max-height: 64px; object-fit: contain; }
        </style>
      </head>
      <body>
        ${company.logoUrl ? `<div class="flex justify-center mb-2 text-center"><img src="${company.logoUrl}" class="logo" /></div>` : ''}
        
        <h1 class="text-center font-bold uppercase text-xs mb-1">${company.name}</h1>
        
        <div class="text-center mb-1">
          ${!suppressTaxDetails && company.tin ? `<p>TIN: ${company.tin}</p>` : ''}
          ${!suppressTaxDetails && company.vatNumber ? `<p>VAT No: ${company.vatNumber}</p>` : ''}
        </div>
        
        <div class="text-center mb-1">
          <p>${company.tradingName || "Branch Name"}</p>
          <p class="whitespace-pre-wrap">${company.address || ""}</p>
          <p>${company.city || ""}</p>
        </div>
        
        <div class="text-center mb-2 pb-2 border-b-dashed">
          ${company.email ? `<p>${company.email}</p>` : ''}
          ${company.phone ? `<p>${company.phone}</p>` : ''}
        </div>

        <div class="text-center font-bold mb-2 pb-2 border-b-dashed">
          <p>${title}</p>
        </div>

        ${customer ? `
        <div class="mb-2 pb-2 border-b-dashed">
          <p class="font-bold">Buyer:</p>
          <p>${customer.name}</p>
          ${customer.tin ? `<p>TIN: ${customer.tin}</p>` : ''}
          ${customer.vatNumber ? `<p>VAT: ${customer.vatNumber}</p>` : ''}
          ${customer.address ? `<p>${customer.address}</p>` : ''}
          ${customer.email ? `<p>${customer.email}</p>` : ''}
          ${customer.phone ? `<p>${customer.phone}</p>` : ''}
        </div>
        ` : ''}

        <div class="mb-2 pb-2 border-b-dashed">
          <p>${suppressTaxDetails ? 'Ticket' : 'Invoice'} No: ${invoice.invoiceNumber || invoice.id || 'N/A'}</p>
          ${(invoice.fiscalCode && !suppressTaxDetails) ? `
            <p>Receipt No: ${invoice.receiptCounter || 'N/A'} / ${invoice.receiptGlobalNo || 'N/A'}</p>
            <p>Fiscal Day No: ${invoice.fiscalDayNo || 'N/A'}</p>
            <p>Device Serial: ${company.fdmsDeviceSerialNo || company.deviceSerialNo || 'N/A'}</p>
            <p>Device ID: ${company.fdmsDeviceId || company.deviceId || 'N/A'}</p>
          ` : ''}
          ${invoice.customerReference ? `<p>Customer Ref: ${invoice.customerReference}</p>` : ''}
          <p>Date: ${formattedDate}</p>
          ${cashierName ? `<p>Cashier: ${cashierName}</p>` : ''}
          
          ${(noteType === 'credit' || noteType === 'debit') && originalInvoiceNumber ? `
            <div class="mt-1">
              <p class="font-bold">${noteType === 'credit' ? "Credited Invoice" : "Debited Invoice"}</p>
              <p>Invoice No: ${originalInvoiceNumber}</p>
            </div>
          ` : ''}
        </div>

        <div class="flex justify-between font-bold mb-1 border-b-dashed pb-1">
          <span class="w-45">Description</span>
          <span class="w-25 text-right">Amount</span>
          ${suppressTaxDetails ? '' : '<span class="w-10 text-right">Tax</span>'}
        </div>

        <div class="mb-2 pb-2 border-b-dashed">
          ${receiptItems.map((item: any) => `
            <div class="mb-2">
              <div class="flex justify-between">
                <span class="w-60 font-bold">${item.description || item.name || ""}</span>
                <span class="w-30 text-right font-bold">${Number(item.lineTotal || (item.price * item.quantity)).toFixed(2)}</span>
                ${suppressTaxDetails ? '' : `<span class="w-10 text-right">${item.taxCode || (item.taxRate > 0 ? "VT" : "ZE")}</span>`}
              </div>
              <div class="text-9xs pl-2">${Number(item.quantity)} x ${Number(item.unitPrice || item.price).toFixed(2)}</div>
            </div>
          `).join('')}
        </div>

        <div class="mb-2 pb-2 border-b-dashed font-bold">
          <div class="flex justify-between text-base">
            <span>Total ${invoice.currency || "USD"}</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        <div class="mb-2 pb-2 border-b-dashed">
          <div class="flex justify-between">
            <span>${invoice.paymentMethod || "Cash"}</span>
            <span>${paid.toFixed(2)}</span>
          </div>
          ${change > 0 ? `<div class="flex justify-between"><span>Change</span><span>${change.toFixed(2)}</span></div>` : ''}
        </div>

        <div class="mb-2 pb-2 border-b-dashed text-center">
          <p>Number of Items: ${receiptItems.length}</p>
        </div>

        ${suppressTaxDetails ? '' : `<div class="mb-2 pb-2 border-b-dashed">
          <p class="font-bold text-center mb-1">Tax Table</p>
          ${Object.values(taxGroups).map((group: any) => `
            <div class="mb-1">
              <div class="flex justify-between"><span>Net Amount</span><span>${group.net.toFixed(2)}</span></div>
              <div class="flex justify-between"><span>VAT (${group.name})</span><span>${group.tax.toFixed(2)}</span></div>
              <div class="flex justify-between font-bold border-b-dotted pb-1"><span>Gross Amount</span><span>${group.gross.toFixed(2)}</span></div>
            </div>
          `).join('')}
        </div>`}

        <div class="text-center mb-2">
          <p>${invoice.notes || "Invoice is issued after purchasing goods"}</p>
        </div>

        ${qrUrl ? `
          <div class="flex flex-col items-center mb-2 mt-1">
            <img src="${qrUrl}" width="100" height="100" />
            <p style="font-size: 7px; margin-top: 4px;">Scan to verify with ZIMRA</p>
            ${invoice.verificationCode ? `<div class="text-center mt-1"><p>Verification Code:</p><p class="font-bold">${invoice.verificationCode}</p></div>` : ''}
          </div>
        ` : ''}

        <div class="text-center text-9xs mt-1">
          <p>${company.posSettings?.receiptFooter || "Thank you for your business!"}</p>
          ${invoice._offline
            ? `<div style="border:1px solid black; padding:4px; font-weight:bold; margin-top:8px;"><p>*** PENDING SYNC ***</p><p style="font-weight:normal;">Will sync when online</p></div>`
            : footerMarker ? `<p>${footerMarker}</p>` : ''}
        </div>
      </body>
    </html>
  `;
};

export const printReceipt = async (data: TicketData, printerUrl?: string, silent?: boolean) => {
  try {
    const html = generateReceiptHtml(data);
    await Print.printAsync({ html, printerUrl: printerUrl || undefined });
  } catch (error) {
    console.error('[Printing] Standard print error:', error);
    throw error;
  }
};

import { ReceiptTemplate, ReceiptData } from './printer/receipt-template';
import type { PrinterConfig } from '../contexts/PrinterContext';

export const printToBluetooth = async (data: TicketData, address?: string, config?: PrinterConfig) => {
  if (typeof ThermalPrinterModule?.printBluetooth !== "function") {
    throw new Error("Bluetooth printing is not available in this build. Please use a custom dev client.");
  }

  // Request Android 12+ Runtime Permissions before printing
  const { Platform: RNPlatform, PermissionsAndroid, NativeModules } = require("react-native");
  if (RNPlatform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const connectOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      if (!connectOk) {
        throw new Error("Bluetooth connect permission denied. Cannot print.");
      }
    } catch (permError) {
      // Android < 12 doesn't have these permissions; ignore the error and continue.
      console.warn("[Printing] Permission request before print skipped:", permError);
    }
  }

  const { invoice, company, items, customer, cashierName, paperWidth, suppressTaxDetails } = data;
  const configuredPaperWidth = config?.paperWidth || paperWidth || 58;
  const configuredPrinterWidth = config?.printerWidth || (configuredPaperWidth === 80 ? 42 : 32);
  const receiptItems = [
    items,
    invoice?.items,
    invoice?.lineItems,
    invoice?.invoiceItems,
    invoice?._printItems,
  ].find((candidate) => Array.isArray(candidate) && candidate.length > 0) || [];
  
  // Use the new unified template for mobile
  const payloadStr = ReceiptTemplate.formatFiscalReceipt({
    company,
    invoice,
    items: receiptItems,
    customer,
    user: { name: cashierName },
    paperWidth: configuredPaperWidth,
    printerWidth: configuredPrinterWidth,
    feedLines: config?.feedLines,
    doubleHeightHeader: config?.doubleHeightHeader,
    receiptShowLogo: config?.receiptShowLogo,
    suppressTaxDetails,
  });

  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Printing] Calling ThermalPrinterModule.printBluetooth to ${address} (Attempt ${attempt}/${MAX_RETRIES}) with payload length ${payloadStr.length}...`);

      const PRINT_TIMEOUT_MS = 15000;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Bluetooth connection timed out after 15s. Ensure printer is on and paired.")), PRINT_TIMEOUT_MS)
      );

      const printPromise = ThermalPrinterModule.printBluetooth({ 
        payload: payloadStr, 
        macAddress: address,
        autoCut: config?.autoCut !== false,
        openCashbox: !!config?.openDrawerOnPrint,
        mmFeedPaper: Math.max(0, Number(config?.feedLines ?? 5)) * 4,
        printerWidthMM: configuredPaperWidth,
        printerNbrCharactersPerLine: configuredPrinterWidth,
      });

      await Promise.race([printPromise, timeout]);
      console.log("[Printing] Successfully printed via Bluetooth native module.");
      return; // Success, exit the retry loop
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.warn(`[Printing] Attempt ${attempt} failed:`, errorMsg);
      lastError = e;
      
      if (attempt < MAX_RETRIES) {
        // If the native module says device not found, its internal array is empty 
        // (happens when bypassing the scan screen or after JS reload). 
        // Force a scan to repopulate the Java array before retrying.
        if (errorMsg.includes("Bluetooth Device Not Found")) {
          console.log("[Printing] Native cache empty. Running background scan to repopulate btDevicesList...");
          try {
            await ThermalPrinterModule.getBluetoothDeviceList();
          } catch (scanErr) { /* ignore */ }
        } else {
          // General connection failure, wait 1s before retrying
          await new Promise(res => setTimeout(res, 1000));
        }
      }
    }
  }

  // If we get here, all retries failed
  throw lastError;
};

export const printToZ100 = async (data: TicketData) => {
  if (!Z100Printer) {
    throw new Error("Z100 Printer module is not included in this build.");
  }

  const { invoice, company, customer, items, cashierName, paidAmount, suppressTaxDetails } = data;
  const zlog = async (message: string) => {
    console.log(`[Printing][Z100] ${message}`);
    try {
      if (typeof Z100Printer.recordLog === "function") {
        await Z100Printer.recordLog(message);
      }
    } catch {
      // Keep printing even if diagnostic logging is unavailable in an older build.
    }
  };
  
  try {
    await zlog(`printToZ100 start invoice=${invoice?.invoiceNumber || "N/A"} company=${company?.name || "N/A"} items=${(items || invoice?.items || []).length}`);
    const initOk = await Z100Printer.printInit();
    await zlog(`printInit ok=${initOk}`);
    if (!initOk) {
      throw new Error("Z100 printer failed to initialize. libAndroid.so may not have loaded correctly.");
    }

    const queueText = async (text: string, size?: number, align?: number, zoom?: number) => {
      const safeText = String(text ?? "");
      const line = safeText.endsWith("\n") ? safeText : `${safeText}\n`;
      await zlog(`queueText align=${align ?? 0} size=${size ?? 24} zoom=${zoom ?? 0} chars=${safeText.length} preview="${safeText.slice(0, 80)}"`);
      const ok = await Z100Printer.printString(line, size, align, zoom);
      if (!ok) {
        throw new Error(`Z100 printer rejected text line: ${safeText.slice(0, 40)}`);
      }
    };

    const queueQrCode = async (content: string, width: number, height: number) => {
      await zlog(`queueQrCode width=${width} height=${height} chars=${content?.length || 0}`);
      const ok = await Z100Printer.printQrCode(content, width, height);
      if (!ok) {
        await zlog("queueQrCode skipped/rejected by native SDK; continuing text receipt");
      }
    };

    const width = 48;
    const branch = (data as any).branch;
    const activeCompany = branch || company;
    const isVatPayer = !suppressTaxDetails && !!company?.vatNumber;
    const separator = "-".repeat(width);
    const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
    const money = (value: unknown) => Number(value || 0).toFixed(2);
    const centerText = (value: unknown) => {
      const text = clean(value);
      if (!text) return "";
      if (text.length >= width) return text.slice(0, width);
      return `${" ".repeat(Math.floor((width - text.length) / 2))}${text}`;
    };
    const wrap = (value: unknown, max = width) => {
      const text = clean(value);
      if (!text) return [""];
      const lines: string[] = [];
      let rest = text;
      while (rest.length > max) {
        const slice = rest.slice(0, max);
        const breakAt = slice.lastIndexOf(" ");
        const cut = breakAt > 8 ? breakAt : max;
        lines.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
      }
      lines.push(rest);
      return lines;
    };
    const centerWrapped = async (value: unknown) => {
      for (const line of wrap(value)) {
        await queueText(centerText(line), 16, 0, 0);
      }
    };
    const tableRow = (label: string, value: unknown) => {
      const left = clean(label);
      const right = clean(value);
      if (!right) return left.slice(0, width);
      const maxLeft = width - right.length - 1;
      if (maxLeft < 8) return `${left}\n${right}`;
      const safeLeft = left.slice(0, maxLeft);
      return `${safeLeft}${" ".repeat(Math.max(1, width - safeLeft.length - right.length))}${right}`;
    };
    const formatDateTime = (dateValue: unknown) => {
      const date = new Date((dateValue as any) || Date.now());
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };
    const formatVerificationCode = (code: string) => {
      if (!code) return "";
      return code.replace(/-/g, "").match(/.{1,4}/g)?.join("-") || code;
    };
    const line = async (value: unknown) => {
      await queueText(String(value ?? ""), 16, 0, 0);
    };
    const lines = async (value: unknown) => {
      for (const wrapped of wrap(value)) {
        await line(wrapped);
      }
    };
    const row = async (label: string, value: unknown) => {
      const composed = tableRow(label, value);
      for (const part of composed.split("\n")) {
        await line(part);
      }
    };
    const receiptItems = Array.isArray(items) && items.length > 0
      ? items
      : Array.isArray(invoice.items) && invoice.items.length > 0
        ? invoice.items
        : Array.isArray(invoice.lineItems)
          ? invoice.lineItems
          : [];
    const totalQty = receiptItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const taxGroups = receiptItems.reduce((acc: any, item: any) => {
      const taxRate = parseFloat(item.taxRate || 0);
      const unitPrice = Number(item.unitPrice ?? item.price ?? item.sellingPrice ?? 0);
      const qty = Number(item.quantity || 0);
      const total = parseFloat(item.lineTotal || (unitPrice * qty));
      const rate = taxRate / 100;
      const taxAmount = rate > 0 ? (total * rate) / (1 + rate) : 0;
      const netAmount = total - taxAmount;
      const key = taxRate.toFixed(2);
      if (!acc[key]) {
        acc[key] = { rate: taxRate, net: 0, tax: 0, gross: 0, name: item.taxCode || (taxRate === 0 ? "Exempt" : `${taxRate}%`) };
      }
      acc[key].net += netAmount;
      acc[key].tax += taxAmount;
      acc[key].gross += total;
      return acc;
    }, {});

    let documentTitle = "INVOICE";
    if (invoice.transactionType === "CreditNote" || invoice.type === "credit_note" || data.noteType === "credit") documentTitle = "CREDIT NOTE";
    else if (invoice.transactionType === "DebitNote" || invoice.type === "debit_note" || data.noteType === "debit") documentTitle = "DEBIT NOTE";
    if (invoice._offline || invoice._simulation || invoice.fiscalCode) {
      documentTitle = isVatPayer ? `FISCAL ${documentTitle === "INVOICE" ? "TAX INVOICE" : documentTitle}` : `FISCAL ${documentTitle}`;
    }
    if (suppressTaxDetails) {
      documentTitle = invoice.receiptTitle || "BUS TICKET";
    }

    await zlog(`printer font set to 16x24 plain; copied fiscal receipt template for ${width} columns; receiptItems=${receiptItems.length}`);

    await centerWrapped(clean(company?.name || "FieldPOS").toUpperCase());
    if (branch && branch.name !== company.name) await centerWrapped(branch.name);

    const addressParts = [activeCompany?.address, activeCompany?.city, activeCompany?.province].filter(Boolean);
    for (const part of addressParts) await centerWrapped(part);
    if (activeCompany?.phone) await centerWrapped(`TEL: ${activeCompany.phone}`);
    if (activeCompany?.email) await centerWrapped(`EMAIL: ${activeCompany.email}`);

    await line(separator);
    if (!suppressTaxDetails && company?.tin) await centerWrapped(`TIN: ${company.tin}`);
    if (isVatPayer) await centerWrapped(`VAT No: ${company.vatNumber}`);
    await line(separator);
    await centerWrapped(documentTitle);
    await line(separator);

    const counterStr = invoice.receiptCounter ? invoice.receiptCounter.toString() : "---";
    const globalStr = invoice.receiptGlobalNo ? invoice.receiptGlobalNo.toString() : "---";
    if (suppressTaxDetails) {
      await row("TICKET NO:", invoice.invoiceNumber || invoice.id || "---");
    } else {
      await row("INVOICE NO:", `${counterStr}/${globalStr}`);
      if (invoice.receiptGlobalNo || invoice._offline || invoice._simulation || invoice.fiscalCode) {
        await row("FISCAL DAY NO:", (invoice.fiscalDayNo || "---").toString());
        await row("DEVICE SERIAL NO:", activeCompany?.fdmsDeviceSerialNo || activeCompany?.deviceSerialNo || "stack1");
        await row("DEVICE ID:", activeCompany?.fdmsDeviceId || activeCompany?.deviceId || "33697");
      }
    }
    if (!suppressTaxDetails) {
      await row("CUST REF NO:", invoice.invoiceNo || invoice.invoiceNumber || `INV-${invoice.id || "---"}`);
    }
    await row("DATE & TIME:", formatDateTime(invoice.issueDate || invoice.createdAt));
    if (cashierName) await row("CASHIER:", cashierName);

    const customerName = customer?.name;
    const isWalkIn = !customer || ["walk-in", "walk in", "guest"].some((s) => customerName?.toLowerCase().includes(s));
    if (!isWalkIn) {
      await line(separator);
      await line("BUYER:");
      await lines(customer.name);
      if (customer.tin) await line(`TIN: ${customer.tin}`);
      if (customer.vatNumber) await line(`VAT No: ${customer.vatNumber}`);
    }

    await line(separator);
    await line("ITEMS");
    await line(suppressTaxDetails ? "QTY                  TOTAL" : "QTY        VAT       TOTAL");
    await line(separator);

    if (receiptItems.length === 0) {
      await line("NO ITEMS");
    }

    for (const item of receiptItems) {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice ?? item.price ?? item.sellingPrice ?? 0);
      const computedTotal = price * qty;
      const total = Number.isFinite(Number(item.lineTotal)) ? Number(item.lineTotal) : computedTotal;
      const taxRate = parseFloat(item.taxRate || 0);
      const vatAmount = taxRate > 0 ? (total * (taxRate / 100)) / (1 + (taxRate / 100)) : 0;
      const desc = item.description || item.product?.name || item.name || "Item";
      await zlog(`itemLine desc="${clean(desc).slice(0, 40)}" qty=${qty} price=${price} vat=${vatAmount.toFixed(2)} total=${total.toFixed(2)}`);
      await lines(desc);
      await line((
        suppressTaxDetails
          ? `${qty.toFixed(2).padEnd(20)}${total.toFixed(2)}`
          : `${qty.toFixed(2).padEnd(10)}${vatAmount.toFixed(2).padEnd(10)}${total.toFixed(2)}`
      ).slice(0, width));
      await line(".".repeat(width));
    }

    await line(separator);
    await row(suppressTaxDetails ? "GRAND TOTAL:" : "GRAND TOTAL (Incl. VAT):", `${invoice.currency || "USD"} ${money(invoice.total || invoice.receiptTotal)}`);
    await row("AMT TENDERED:", `${invoice.currency || "USD"} ${money(invoice.paymentAmount || paidAmount || invoice.total)}`);
    await row("CHANGE:", `${invoice.currency || "USD"} ${money(invoice.change || 0)}`);
    await line(separator);
    await row("NUMBER OF ITEMS:", totalQty.toFixed(3));
    await line(separator);

    if (isVatPayer) {
      await centerWrapped("TAX SUMMARY");
      for (const group of Object.values(taxGroups) as any[]) {
        await line(`TAX CODE ${group.name} (${group.rate}%)`);
        await row("  NET AMT:", group.net.toFixed(2));
        await row("  VAT AMT:", group.tax.toFixed(2));
        await row("  TOTAL AMT:", group.gross.toFixed(2));
        await line(".".repeat(width));
      }
    }

    let verificationCode = invoice.verificationCode || "";
    if (!verificationCode && (invoice._simulation || invoice._offline || invoice.status === "draft")) {
      verificationCode = "9A2B-C48D-80FE-12A5-99BF";
    }
    if (verificationCode) {
      await centerWrapped("VERIFICATION CODE:");
      await centerWrapped(formatVerificationCode(verificationCode));
    }

    const qrData = invoice.qrCodeData || invoice.receiptQRData || invoice.verificationUrl || (invoice._simulation ? "https://fdms.zimra.co.zw/verify/SIMULATION-ONLY" : "");
    if (qrData) {
      await line("");
      await queueQrCode(qrData, 200, 200);
      await centerWrapped("Verify at:");
      await centerWrapped("https://fdms.zimra.co.zw/verify");
    }

    await line("");
    await centerWrapped(invoice.notes || invoice.receiptNotes || "Thank you for your business!");
    await centerWrapped("Powered by FiscalStack");
    
    await zlog("queued trailing blank lines=12");
    for (let i = 0; i < 12; i++) {
      await queueText("", 16, 0, 0);
    }
    const beforeStartStatus = await Z100Printer.checkStatus().catch((error: unknown) => {
      console.warn("[Printing] Z100 status check before start failed:", error);
      return null;
    });
    console.log("[Printing] Z100 status before printStart:", beforeStartStatus);
    await zlog(`status before printStart=${beforeStartStatus}`);
    const status = await Z100Printer.printStart();
    await zlog(`printStart ok=${status}`);
    if(!status) throw new Error("Print failed on Z100 device.");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const afterStartStatus = await Z100Printer.checkStatus().catch((error: unknown) => {
      console.warn("[Printing] Z100 status check after start failed:", error);
      return null;
    });
    console.log("[Printing] Z100 status after printStart:", afterStartStatus);
    await zlog(`status after printStart=${afterStartStatus}`);
  } finally {
    // CRITICAL: Always close to release hardware locks and prevent crashes on next print
    await zlog("printClose requested");
    await Z100Printer.printClose().catch(() => {});
  }
};

/** True when running on a Sunmi device with a built-in InnerPrinter service */
export const isSunmiDevice = async (): Promise<boolean> => {
  if (!SunmiPrinter) return false;
  try {
    const serial = await SunmiPrinter.getPrinterSerialNo();
    return typeof serial === "string" && serial.length > 0;
  } catch (e) {
    console.warn("[Printing] Sunmi device detection failed:", e);
    return false;
  }
};

/**
 * Print a fiscal receipt on a SUNMI device's built-in printer.
 * Uses the Sunmi InnerPrinter AIDL service via @hendrysetiadi/react-native-sunmi-printer.
 * The receipt layout mirrors the Z100 text template (48 columns).
 */
export const printToSunmi = async (data: TicketData, config?: PrinterConfig) => {
  if (!SunmiPrinter) {
    throw new Error("Sunmi printer module is not included in this build.");
  }

  const { invoice, company, customer, items, cashierName, paidAmount, suppressTaxDetails } = data;

  const initOk = await SunmiPrinter.initPrinter().catch((e: unknown) => {
    console.warn("[Printing] Sunmi initPrinter failed:", e);
    return null;
  });
  if (initOk === null) {
    throw new Error("Sunmi inner printer could not be initialized. Check that you are running on a Sunmi device.");
  }

  const width = config?.printerWidth || 48;
  const branch = (data as any).branch;
  const activeCompany = branch || company;
  const isVatPayer = !suppressTaxDetails && !!company?.vatNumber;
  const separator = "-".repeat(width);
  const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const money = (value: unknown) => Number(value || 0).toFixed(2);
  const centerText = (value: unknown) => {
    const text = clean(value);
    if (!text) return "";
    if (text.length >= width) return text.slice(0, width);
    return `${" ".repeat(Math.floor((width - text.length) / 2))}${text}`;
  };
  const wrap = (value: unknown, max = width) => {
    const text = clean(value);
    if (!text) return [""];
    const lines: string[] = [];
    let rest = text;
    while (rest.length > max) {
      const slice = rest.slice(0, max);
      const breakAt = slice.lastIndexOf(" ");
      const cut = breakAt > 8 ? breakAt : max;
      lines.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
    return lines;
  };
  const tableRow = (label: string, value: unknown) => {
    const left = clean(label);
    const right = clean(value);
    if (!right) return left.slice(0, width);
    const maxLeft = width - right.length - 1;
    if (maxLeft < 8) return `${left}\n${right}`;
    const safeLeft = left.slice(0, maxLeft);
    return `${safeLeft}${" ".repeat(Math.max(1, width - safeLeft.length - right.length))}${right}`;
  };
  const formatDateTime = (dateValue: unknown) => {
    const date = new Date((dateValue as any) || Date.now());
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };
  const formatVerificationCode = (code: string) => {
    if (!code) return "";
    return code.replace(/-/g, "").match(/.{1,4}/g)?.join("-") || code;
  };

  // Build the plain-text receipt first (mirrors printToZ100), then emit via Sunmi AIDL in buffer mode.
  const textLines: string[] = [];
  const pushLine = (text: string) => textLines.push(text);
  const pushCenter = (value: unknown) => wrap(value).forEach((l) => pushLine(centerText(l)));
  const pushWrapped = (value: unknown) => wrap(value).forEach((l) => pushLine(l));
  const pushRow = (label: string, value: unknown) => tableRow(label, value).split("\n").forEach((l) => pushLine(l));

  const receiptItems = Array.isArray(items) && items.length > 0
    ? items
    : Array.isArray(invoice.items) && invoice.items.length > 0
      ? invoice.items
      : Array.isArray(invoice.lineItems)
        ? invoice.lineItems
        : [];
  const totalQty = receiptItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
  const taxGroups = receiptItems.reduce((acc: any, item: any) => {
    const taxRate = parseFloat(item.taxRate || 0);
    const unitPrice = Number(item.unitPrice ?? item.price ?? item.sellingPrice ?? 0);
    const qty = Number(item.quantity || 0);
    const total = parseFloat(item.lineTotal || (unitPrice * qty));
    const rate = taxRate / 100;
    const taxAmount = rate > 0 ? (total * rate) / (1 + rate) : 0;
    const netAmount = total - taxAmount;
    const key = taxRate.toFixed(2);
    if (!acc[key]) {
      acc[key] = { rate: taxRate, net: 0, tax: 0, gross: 0, name: item.taxCode || (taxRate === 0 ? "Exempt" : `${taxRate}%`) };
    }
    acc[key].net += netAmount;
    acc[key].tax += taxAmount;
    acc[key].gross += total;
    return acc;
  }, {});

  let documentTitle = "INVOICE";
  if (invoice.transactionType === "CreditNote" || invoice.type === "credit_note" || data.noteType === "credit") documentTitle = "CREDIT NOTE";
  else if (invoice.transactionType === "DebitNote" || invoice.type === "debit_note" || data.noteType === "debit") documentTitle = "DEBIT NOTE";
  if (invoice._offline || invoice._simulation || invoice.fiscalCode) {
    documentTitle = isVatPayer ? `FISCAL ${documentTitle === "INVOICE" ? "TAX INVOICE" : documentTitle}` : `FISCAL ${documentTitle}`;
  }
  if (suppressTaxDetails) {
    documentTitle = invoice.receiptTitle || "BUS TICKET";
  }

  pushCenter(clean(company?.name || "FieldPOS").toUpperCase());
  if (branch && branch.name !== company.name) pushCenter(branch.name);

  const addressParts = [activeCompany?.address, activeCompany?.city, activeCompany?.province].filter(Boolean);
  for (const part of addressParts) pushCenter(part);
  if (activeCompany?.phone) pushCenter(`TEL: ${activeCompany.phone}`);
  if (activeCompany?.email) pushCenter(`EMAIL: ${activeCompany.email}`);

  pushLine(separator);
  if (!suppressTaxDetails && company?.tin) pushCenter(`TIN: ${company.tin}`);
  if (isVatPayer) pushCenter(`VAT No: ${company.vatNumber}`);
  pushLine(separator);
  pushCenter(documentTitle);
  pushLine(separator);

  const counterStr = invoice.receiptCounter ? invoice.receiptCounter.toString() : "---";
  const globalStr = invoice.receiptGlobalNo ? invoice.receiptGlobalNo.toString() : "---";
  if (suppressTaxDetails) {
    pushRow("TICKET NO:", invoice.invoiceNumber || invoice.id || "---");
  } else {
    pushRow("INVOICE NO:", `${counterStr}/${globalStr}`);
    if (invoice.receiptGlobalNo || invoice._offline || invoice._simulation || invoice.fiscalCode) {
      pushRow("FISCAL DAY NO:", (invoice.fiscalDayNo || "---").toString());
      pushRow("DEVICE SERIAL NO:", activeCompany?.fdmsDeviceSerialNo || activeCompany?.deviceSerialNo || "stack1");
      pushRow("DEVICE ID:", activeCompany?.fdmsDeviceId || activeCompany?.deviceId || "33697");
    }
  }
  if (!suppressTaxDetails) {
    pushRow("CUST REF NO:", invoice.invoiceNo || invoice.invoiceNumber || `INV-${invoice.id || "---"}`);
  }
  pushRow("DATE & TIME:", formatDateTime(invoice.issueDate || invoice.createdAt));
  if (cashierName) pushRow("CASHIER:", cashierName);

  const customerName = customer?.name;
  const isWalkIn = !customer || ["walk-in", "walk in", "guest"].some((s) => customerName?.toLowerCase().includes(s));
  if (!isWalkIn) {
    pushLine(separator);
    pushLine("BUYER:");
    pushWrapped(customer.name);
    if (customer.tin) pushLine(`TIN: ${customer.tin}`);
    if (customer.vatNumber) pushLine(`VAT No: ${customer.vatNumber}`);
  }

  pushLine(separator);
  pushLine("ITEMS");
  pushLine(suppressTaxDetails ? "QTY                  TOTAL" : "QTY        VAT       TOTAL");
  pushLine(separator);

  if (receiptItems.length === 0) {
    pushLine("NO ITEMS");
  }

  for (const item of receiptItems) {
    const qty = Number(item.quantity || 0);
    const price = Number(item.unitPrice ?? item.price ?? item.sellingPrice ?? 0);
    const computedTotal = price * qty;
    const total = Number.isFinite(Number(item.lineTotal)) ? Number(item.lineTotal) : computedTotal;
    const taxRate = parseFloat(item.taxRate || 0);
    const vatAmount = taxRate > 0 ? (total * (taxRate / 100)) / (1 + (taxRate / 100)) : 0;
    const desc = item.description || item.product?.name || item.name || "Item";
    pushWrapped(desc);
    pushLine((
      suppressTaxDetails
        ? `${qty.toFixed(2).padEnd(20)}${total.toFixed(2)}`
        : `${qty.toFixed(2).padEnd(10)}${vatAmount.toFixed(2).padEnd(10)}${total.toFixed(2)}`
    ).slice(0, width));
    pushLine(".".repeat(width));
  }

  pushLine(separator);
  pushRow(suppressTaxDetails ? "GRAND TOTAL:" : "GRAND TOTAL (Incl. VAT):", `${invoice.currency || "USD"} ${money(invoice.total || invoice.receiptTotal)}`);
  pushRow("AMT TENDERED:", `${invoice.currency || "USD"} ${money(invoice.paymentAmount || paidAmount || invoice.total)}`);
  pushRow("CHANGE:", `${invoice.currency || "USD"} ${money(invoice.change || 0)}`);
  pushLine(separator);
  pushRow("NUMBER OF ITEMS:", totalQty.toFixed(3));
  pushLine(separator);

  if (isVatPayer) {
    pushCenter("TAX SUMMARY");
    for (const group of Object.values(taxGroups) as any[]) {
      pushLine(`TAX CODE ${group.name} (${group.rate}%)`);
      pushRow("  NET AMT:", group.net.toFixed(2));
      pushRow("  VAT AMT:", group.tax.toFixed(2));
      pushRow("  TOTAL AMT:", group.gross.toFixed(2));
      pushLine(".".repeat(width));
    }
  }

  let verificationCode = invoice.verificationCode || "";
  if (!verificationCode && (invoice._simulation || invoice._offline || invoice.status === "draft")) {
    verificationCode = "9A2B-C48D-80FE-12A5-99BF";
  }
  if (verificationCode) {
    pushCenter("VERIFICATION CODE:");
    pushCenter(formatVerificationCode(verificationCode));
  }

  const qrData = invoice.qrCodeData || invoice.receiptQRData || invoice.verificationUrl || (invoice._simulation ? "https://fdms.zimra.co.zw/verify/SIMULATION-ONLY" : "");

  pushLine("");
  pushCenter(invoice.notes || invoice.receiptNotes || "Thank you for your business!");
  pushCenter("Powered by FiscalStack");

  try {
    await SunmiPrinter.enterPrintBuffer(true);
    for (const textLine of textLines) {
      await SunmiPrinter.printText(textLine);
    }
    if (qrData) {
      await SunmiPrinter.printLineWrap(1);
      await SunmiPrinter.printQrCode(qrData, 8, 2);
    }
    await SunmiPrinter.printLineWrap((config?.feedLines ?? 1) + 2);
    await SunmiPrinter.exitPrinterBuffer(true);
  } catch (e: any) {
    console.warn("[Printing] Sunmi buffer print failed, falling back to direct print:", e);
    await SunmiPrinter.printText("\n".repeat(2));
    for (const textLine of textLines) {
      await SunmiPrinter.printText(textLine);
    }
    if (qrData) {
      await SunmiPrinter.printQrCode(qrData, 8, 2);
    }
    await SunmiPrinter.printLineWrap((config?.feedLines ?? 1) + 2);
  }
};

export const getBluetoothDevices = async (): Promise<{ deviceName: string; macAddress: string }[]> => {
  const { Platform: RNPlatform, PermissionsAndroid, NativeModules } = require("react-native");
  const Constants = require("expo-constants").default;

  const scanTask = async () => {
    // 1. Mock Data for Expo Go testing without the native module
    // We must check the actual NativeModules because the JS wrapper always has the methods.
    if (!NativeModules.ThermalPrinterModule || Constants.appOwnership === "expo") {
      console.log("[Printing] Bluetooth scanning unavailable (Expo Go / Missing Native Module). Returning mock data.");
      return [
        { deviceName: "MOCK: POS-58 Thermal", macAddress: "00:11:22:33:44:55" },
        { deviceName: "MOCK: Z100 Internal", macAddress: "AA:BB:CC:DD:EE:FF" }
      ];
    }
  
    // 2. Request Android 12+ Runtime Permissions
    if (RNPlatform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        ]);
        const connectOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
        const scanOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
        if (!connectOk || !scanOk) {
          console.warn("[Printing] Bluetooth permissions not granted by user – scan skipped.");
          return [];
        }
      } catch (permError) {
        console.warn("[Printing] Permission request skipped (likely Android < 12):", permError);
      }
    }
  
    // 3. Scan for devices
    const devices = await ThermalPrinterModule.getBluetoothDeviceList();
    return Array.isArray(devices) ? devices : [];
  };

  try {
    const SCAN_TIMEOUT_MS = 8000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Bluetooth scan timed out after 8s")), SCAN_TIMEOUT_MS)
    );
    
    // Race EVERYTHING - including the permission popup if the user ignores it
    const devices = await Promise.race([scanTask(), timeout]);
    
    console.log("[Printing] Bluetooth scan returned", devices.length, "devices");
    return devices;
  } catch (error: any) {
    if (error?.message?.includes("timed out")) {
      console.warn("[Printing] Bluetooth scan timed out – check that Bluetooth is on and the device is paired.");
    } else {
      console.error("[Printing] Failed to scan bluetooth devices:", error);
    }
    return [];
  }
};
