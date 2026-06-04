import { MobileTaggedEncoder, TextAlignment } from "./esc-pos-encoder";

export interface ReceiptData {
  company: any;
  branch?: any;
  invoice: any;
  customer?: any;
  items: any[];
  user?: any;
  paperWidth?: number;
  printerWidth?: number;
  feedLines?: number;
  doubleHeightHeader?: boolean;
  receiptShowLogo?: boolean;
  suppressTaxDetails?: boolean;
}

export class ReceiptTemplate {
  /**
   * Formats a Standard Fiscal Receipt for ZIMRA Compliance
   * Matches the desktop version exactly, but using the tagged mobile encoder
   */
  static formatFiscalReceipt(data: ReceiptData): string {
    const { company, branch, invoice, customer, items, paperWidth, printerWidth, feedLines, doubleHeightHeader, receiptShowLogo, suppressTaxDetails } = data;
    const encoder = new MobileTaggedEncoder();
    const width = printerWidth || (paperWidth === 80 ? 42 : 32); // 32ch = 58mm, 42ch = 80mm

    const activeCompany = branch || company;
    const isVatPayer = !suppressTaxDetails && !!company.vatNumber;
    const wrapText = (text: string, max: number): string[] => {
      const clean = String(text || "").replace(/\s+/g, " ").trim();
      if (!clean) return [];
      const lines: string[] = [];
      let current = "";
      for (const word of clean.split(" ")) {
        if (word.length > max) {
          if (current) {
            lines.push(current);
            current = "";
          }
          for (let i = 0; i < word.length; i += max) lines.push(word.slice(i, i + max));
          continue;
        }
        const next = current ? `${current} ${word}` : word;
        if (next.length > max) {
          if (current) lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) lines.push(current);
      return lines;
    };
    const fitAmount = (value: number, max: number) => {
      const text = Number(value || 0).toFixed(2);
      return text.length > max ? text.slice(text.length - max) : text;
    };

    // Helper for centering
    const centerText = (text: string, w: number): string => {
      if (!text) return "";
      const trimmed = text.trim();
      const padding = Math.max(0, Math.floor((w - trimmed.length) / 2));
      return " ".repeat(padding) + trimmed;
    };

    let documentTitle = "INVOICE";
    if (invoice.transactionType === 'CreditNote' || invoice.type === 'credit_note') documentTitle = "CREDIT NOTE";
    else if (invoice.transactionType === 'DebitNote' || invoice.type === 'debit_note') documentTitle = "DEBIT NOTE";
    
    if (invoice._offline || invoice._simulation) {
      documentTitle = isVatPayer ? "FISCAL TAX INVOICE" : "FISCAL INVOICE";
    }
    if (suppressTaxDetails) {
      documentTitle = invoice.receiptTitle || "BUS TICKET";
    }

    // Group taxes
    const taxGroups = items.reduce((acc: any, item: any) => {
      const taxRate = parseFloat(item.taxRate || 0);
      const price = parseFloat(item.unitPrice || item.price || 0);
      const qty = parseFloat(item.quantity || 1);
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

    encoder.initialize();

    // 1. Header
    encoder.align(TextAlignment.Center);
    if (receiptShowLogo !== false && company.logoUrl) {
      encoder.line(`<img>${company.logoUrl}</img>`);
      encoder.feed(1);
    }
    encoder.bold(true);
    if (doubleHeightHeader !== false) encoder.size(1);
    encoder.line(company.name.toUpperCase());
    encoder.size(0);
    encoder.bold(false);

    if (branch && branch.name !== company.name) encoder.line(branch.name);
    
    if (activeCompany.address) encoder.line(activeCompany.address);
    if (activeCompany.city) encoder.line(activeCompany.city);
    if (activeCompany.phone) encoder.line(`TEL: ${activeCompany.phone}`);

    encoder.separator(width);

    // ZIMRA Company Details
    if (!suppressTaxDetails && company.tin) encoder.line(`TIN: ${company.tin}`);
    if (isVatPayer) encoder.line(`VAT No: ${company.vatNumber}`);

    encoder.separator(width);
    encoder.bold(true);
    encoder.line(documentTitle);
    encoder.bold(false);
    encoder.separator(width);

    // 2. Transaction Info
    encoder.align(TextAlignment.Left);
    const counterStr = invoice.receiptCounter || "---";
    const globalStr = invoice.receiptGlobalNo || "---";
    encoder.tableRow("INVOICE NO:", `${counterStr}/${globalStr}`, width);
    
    if (invoice.receiptGlobalNo || invoice._offline || invoice._simulation) {
      encoder.tableRow("FISCAL DAY NO:", (invoice.fiscalDayNo || "---").toString(), width);
      encoder.tableRow("DEVICE ID:", (activeCompany.fdmsDeviceId || activeCompany.deviceId || "33697"), width);
    }
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    const d = new Date(invoice.issueDate || Date.now());
    const dateStr = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear().toString().slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    encoder.tableRow("DATE & TIME:", dateStr, width);

    if (data.user) {
      encoder.tableRow("CASHIER:", data.user.name || "System", width);
    }

    if (customer && !customer.name?.toLowerCase().includes("walk-in")) {
      encoder.separator(width);
      encoder.bold(true);
      encoder.line("BUYER:");
      encoder.bold(false);
      encoder.line(customer.name);
      if (customer.tin) encoder.line(`TIN: ${customer.tin}`);
      if (customer.address) encoder.line(customer.address);
    }

    encoder.separator(width);

    // 3. Items List
    encoder.bold(true);
    if (width <= 32) {
      encoder.line("DESCRIPTION");
      encoder.line(suppressTaxDetails ? "QTY x PRICE             TOTAL" : "QTY x PRICE      VAT     TOTAL");
    } else {
      encoder.line(suppressTaxDetails ? "QTY   DESCRIPTION             TOTAL" : "QTY   DESCRIPTION             VAT    TOTAL");
    }
    encoder.bold(false);
    encoder.separator(width);

    items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice ?? item.price ?? item.sellingPrice ?? 0);
      const total = Number(item.lineTotal || (price * qty));
      const taxRate = parseFloat(item.taxRate || 0);
      const vatAmount = taxRate > 0 ? (total * (taxRate / 100)) / (1 + (taxRate / 100)) : 0;
      const desc = item.description || item.product?.name || item.name || "Item";

      if (width <= 32) {
        wrapText(desc, width).forEach(line => encoder.line(line));
        const qtyPrice = `${qty.toFixed(2)} x ${fitAmount(price, 7)}`.slice(0, 15);
        if (suppressTaxDetails) {
          encoder.line(`${qtyPrice.padEnd(width - 8)}${fitAmount(total, 8).padStart(8)}`);
        } else {
          encoder.line(`${qtyPrice.padEnd(width - 15)}${fitAmount(vatAmount, 6).padStart(6)} ${fitAmount(total, 8).padStart(8)}`);
        }
      } else {
        const qtyS = qty.toFixed(2).padEnd(6);
        const totalS = total.toFixed(2).padStart(8);
        const vatS = vatAmount.toFixed(2).padStart(6);
        const descMax = suppressTaxDetails ? width - 6 - 8 - 1 : width - 6 - 8 - 6 - 3;
        const descRow = desc.substring(0, descMax).padEnd(descMax);
        encoder.line(suppressTaxDetails ? `${qtyS}${descRow} ${totalS}` : `${qtyS}${descRow} ${vatS} ${totalS}`);
        if (desc.length > descMax) {
          wrapText(desc.substring(descMax), width - 6).forEach(line => encoder.line(`      ${line}`));
        }
        if (qty !== 1) encoder.line(`      Price: ${price.toFixed(2)} each`);
      }
    });

    encoder.separator(width);

    // 4. Totals
    encoder.bold(true);
    encoder.tableRow(`GRAND TOTAL:`, `${invoice.currency || "USD"} ${Number(invoice.total).toFixed(2)}`, width);
    encoder.bold(false);
    
    encoder.tableRow(`AMT TENDERED:`, `${invoice.currency || "USD"} ${Number(invoice.paymentAmount || invoice.total).toFixed(2)}`, width);
    encoder.tableRow(`CHANGE:`, `${invoice.currency || "USD"} ${Number(invoice.change || 0).toFixed(2)}`, width);

    encoder.separator(width);

    // 5. Taxes Summary
    if (isVatPayer) {
      encoder.align(TextAlignment.Center);
      encoder.bold(true);
      encoder.line("TAX SUMMARY");
      encoder.bold(false);
      encoder.align(TextAlignment.Left);

      Object.values(taxGroups).forEach((group: any) => {
        encoder.line(`TAX CODE ${group.name} (${group.rate}%)`);
        encoder.tableRow("  NET AMT:", group.net.toFixed(2), width);
        encoder.tableRow("  VAT AMT:", group.tax.toFixed(2), width);
        encoder.tableRow("  TOTAL AMT:", group.gross.toFixed(2), width);
        encoder.separator(width, ".");
      });
    }

    // 6. Fiscal QR
    const qrData = invoice.qrCodeData || invoice.receiptQRData || (invoice._simulation ? "https://fdms.zimra.co.zw/verify/simulation" : "");
    if (qrData) {
      encoder.feed(1);
      encoder.qrcode(qrData);
      encoder.align(TextAlignment.Center);
      encoder.line("Verify with ZIMRA");
      if (invoice.verificationCode) {
        encoder.line("CODE:");
        encoder.bold(true);
        encoder.line(invoice.verificationCode);
        encoder.bold(false);
      }
    }

    // 7. Footer
    encoder.feed(1);
    encoder.line(invoice.notes || "Thank you for your business!");
    encoder.line("--- End of Receipt ---");
    encoder.feed(Math.max(0, Number(feedLines ?? 3)));

    return encoder.encode();
  }
}
