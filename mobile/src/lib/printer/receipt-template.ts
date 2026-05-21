import { MobileTaggedEncoder, TextAlignment } from "./esc-pos-encoder";

export interface ReceiptData {
  company: any;
  branch?: any;
  invoice: any;
  customer?: any;
  items: any[];
  user?: any;
  paperWidth?: number;
  suppressTaxDetails?: boolean;
}

export class ReceiptTemplate {
  /**
   * Formats a Standard Fiscal Receipt for ZIMRA Compliance
   * Matches the desktop version exactly, but using the tagged mobile encoder
   */
  static formatFiscalReceipt(data: ReceiptData): string {
    const { company, branch, invoice, customer, items, paperWidth, suppressTaxDetails } = data;
    const encoder = new MobileTaggedEncoder();
    const width = paperWidth === 80 ? 42 : 32; // Default thermal widths for 80mm and 58mm

    const activeCompany = branch || company;
    const isVatPayer = !suppressTaxDetails && !!company.vatNumber;

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
    encoder.bold(true);
    encoder.line(company.name.toUpperCase());
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
    encoder.line(suppressTaxDetails ? "QTY  DESCRIPTION       TOTAL" : "QTY  DESCRIPTION       TOTAL");
    encoder.bold(false);
    encoder.separator(width);

    items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      const total = Number(item.lineTotal || (Number(item.price) * qty));
      const desc = (item.description || item.name || "Item").substring(0, 15);
      encoder.tableRow(`${qty.toFixed(0)}x ${desc}`, total.toFixed(2), width);
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
    encoder.feed(3);

    return encoder.encode();
  }
}
