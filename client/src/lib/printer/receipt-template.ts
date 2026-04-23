import { EscPosEncoder, TextAlignment, TextSize } from "./esc-pos-encoder";
import { format } from "date-fns";

export interface ReceiptData {
  company: any;
  branch?: any;
  invoice: any;
  customer?: any;
  items: any[];
  user?: any;
}

export class ReceiptTemplate {
  /**
   * Formats a Standard Fiscal Receipt for ZIMRA Compliance
   * @param data The combination of company, branch, invoice and customer data
   * @param options printer options like paper width, auto-cut, etc.
   */
  static formatFiscalReceipt(data: ReceiptData, options: any = {}): Uint8Array {
    const { company, branch, invoice, customer, items } = data;
    const encoder = new EscPosEncoder();
    
    // Default to 32 chars (58mm) if not specified
    const width = options.width || 32;
    const autoCut = options.autoCut !== false;
    const openDrawer = !!options.openDrawer;
    const feedLines = options.feedLines ?? 1;
    const doubleHeightHeader = options.doubleHeightHeader !== false;

    const activeCompany = branch || company;
    const isVatPayer = !!company.vatNumber;

    // Robust centering helper that handles different receipt widths
    const centerText = (text: string, w: number): string => {
      if (!text) return "";
      const trimmed = text.trim();
      if (trimmed.length >= w) return trimmed.substring(0, w);
      const padding = Math.floor((w - trimmed.length) / 2);
      return " ".repeat(padding) + trimmed;
    };

    // Helper for multi-line centered text
    const centerWrapped = (text: string, w: number) => {
        const words = text.split(" ");
        let lines: string[] = [];
        let current = "";
        
        words.forEach(word => {
            if ((current + word).length > w) {
                if (current) lines.push(centerText(current, w));
                current = word;
            } else {
                current += (current ? " " : "") + word;
            }
        });
        if (current) lines.push(centerText(current, w));
        lines.forEach(l => encoder.line(l));
    };

    let documentTitle = "INVOICE";
    if (invoice.transactionType === 'CreditNote' || invoice.type === 'credit_note') documentTitle = "CREDIT NOTE";
    else if (invoice.transactionType === 'DebitNote' || invoice.type === 'debit_note') documentTitle = "DEBIT NOTE";
    
    if (invoice._offline || invoice._simulation) {
      documentTitle = isVatPayer ? "FISCAL TAX INVOICE" : "FISCAL INVOICE";
    }

    const formatVerificationCode = (code: string) => {
      if (!code) return "";
      return code.replace(/-/g, "").match(/.{1,4}/g)?.join("-") || code;
    };

    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const taxGroups = items.reduce((acc: any, item: any) => {
      const taxRate = parseFloat(item.taxRate || 0);
      const total = parseFloat(item.lineTotal || (Number(item.unitPrice || item.price) * Number(item.quantity)));
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

    // 1. Initial State
    encoder.initialize();

    // 2. Header Section
    encoder.align(TextAlignment.Center);
    encoder.bold(true);
    if (doubleHeightHeader) encoder.size(TextSize.DoubleHeight);
    encoder.line(company.name.toUpperCase().trim());

    encoder.size(TextSize.Normal);
    encoder.bold(false);
    if (branch && branch.name !== company.name) {
      encoder.line(branch.name.trim());
    }

    const addressParts = [activeCompany.address, activeCompany.city, activeCompany.province].filter(Boolean);
    addressParts.forEach(part => encoder.line(part.trim()));

    if (activeCompany.phone) encoder.line(`TEL: ${activeCompany.phone.trim()}`);
    if (activeCompany.email) encoder.line(`EMAIL: ${activeCompany.email.trim()}`);

    encoder.align(TextAlignment.Left); 
    encoder.separator(width);

    encoder.align(TextAlignment.Center);
    if (company.tin) encoder.line(`TIN: ${company.tin.trim()}`);
    if (isVatPayer) encoder.line(`VAT No: ${company.vatNumber.trim()}`);

    encoder.align(TextAlignment.Left);
    encoder.separator(width);

    encoder.align(TextAlignment.Center);
    encoder.bold(true);
    encoder.line(documentTitle.trim());
    encoder.bold(false);
    encoder.align(TextAlignment.Left);
    encoder.separator(width);

    // 3. Transaction Info
    encoder.align(TextAlignment.Left);
    const counterStr = invoice.receiptCounter ? invoice.receiptCounter.toString() : "---";
    const globalStr = invoice.receiptGlobalNo ? invoice.receiptGlobalNo.toString() : "---";
    encoder.tableRow("INVOICE NO:", `${counterStr}/${globalStr}`, width);

    if (invoice.receiptGlobalNo || invoice._offline || invoice._simulation) {
      encoder.tableRow("FISCAL DAY NO:", (invoice.fiscalDayNo || "---").toString(), width);
      encoder.tableRow("DEVICE SERIAL NO:", (activeCompany.fdmsDeviceSerialNo || activeCompany.deviceSerialNo || "stack1"), width);
      encoder.tableRow("DEVICE ID:", (activeCompany.fdmsDeviceId || activeCompany.deviceId || "33697"), width);
    }

    encoder.tableRow("CUST REF NO:", (invoice.invoiceNo || invoice.invoiceNumber || `INV-${invoice.id || "---"}`), width);
    encoder.tableRow("DATE & TIME:", format(new Date(invoice.issueDate || Date.now()), "dd/MM/yyyy HH:mm:ss"), width);

    if (data.user) {
      encoder.tableRow("CASHIER:", data.user.name || data.user.username, width);
    }

    const isWalkIn = !customer || ["walk-in", "walk in", "guest"].some(s => customer.name?.toLowerCase().includes(s));
    if (!isWalkIn) {
      encoder.separator(width);
      encoder.bold(true);
      encoder.line("BUYER:");
      encoder.bold(false);
      encoder.line(customer.name);
      if (customer.tin) encoder.line(`TIN: ${customer.tin}`);
      if (customer.vatNumber) encoder.line(`VAT No: ${customer.vatNumber}`);
    }

    encoder.separator(width);

    // 4. Items List
    encoder.bold(true);
    if (width >= 42) {
      encoder.line("QTY   DESCRIPTION             VAT    TOTAL");
    } else {
      encoder.line("QTY   DESCRIPTION    VAT     TOTAL");
    }
    encoder.bold(false);
    encoder.separator(width);

    items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice || item.price || 0);
      const total = parseFloat(item.lineTotal || (price * qty));
      const taxRate = parseFloat(item.taxRate || 0);
      const vatAmount = (total * (taxRate / 100)) / (1 + (taxRate / 100));
      const desc = item.description || item.product?.name || "Item";

      if (width <= 32) {
        encoder.line(desc);
        const qtyS = qty.toFixed(2);
        const vatS = vatAmount.toFixed(2);
        const totalS = total.toFixed(2);
        encoder.line(`  ${qtyS.padEnd(5)} x ${price.toFixed(2).padEnd(6)} ${vatS.padStart(6)} ${totalS.padStart(8)}`);
      } else {
        const qtyS = qty.toFixed(2).padEnd(6);
        const totalS = total.toFixed(2).padStart(8);
        const vatS = vatAmount.toFixed(2).padStart(6);
        const descMax = width - 6 - 8 - 6 - 3; 
        const descRow = desc.substring(0, descMax).padEnd(descMax);
        encoder.line(`${qtyS}${descRow} ${vatS} ${totalS}`);
        if (desc.length > descMax) encoder.line(`      ${desc.substring(descMax)}`);
        if (qty !== 1) encoder.line(`      Price: ${price.toFixed(2)} each`);
      }
    });

    encoder.separator(width);

    // 5. Totals
    encoder.bold(true);
    encoder.tableRow(`GRAND TOTAL (Incl. VAT):`, `${invoice.currency || "USD"} ${Number(invoice.total || invoice.receiptTotal).toFixed(2)}`, width);
    encoder.bold(false);
    encoder.tableRow(`AMT TENDERED:`, `${invoice.currency || "USD"} ${Number(invoice.paymentAmount || invoice.total).toFixed(2)}`, width);
    encoder.tableRow(`CHANGE:`, `${invoice.currency || "USD"} ${Number(invoice.change || 0).toFixed(2)}`, width);
    encoder.separator(width);
    encoder.tableRow("NUMBER OF ITEMS:", totalQty.toFixed(3), width);
    encoder.separator(width);

    // 6. Taxes Summary
    if (isVatPayer) {
      encoder.align(TextAlignment.Center).bold(true).line("TAX SUMMARY").bold(false).align(TextAlignment.Left);
      Object.values(taxGroups).forEach((group: any) => {
        encoder.line(`TAX CODE ${group.name} (${group.rate}%)`);
        encoder.tableRow("  NET AMT:", group.net.toFixed(2), width);
        encoder.tableRow("  VAT AMT:", group.tax.toFixed(2), width);
        encoder.tableRow("  TOTAL AMT:", group.gross.toFixed(2), width);
        encoder.separator(width, ".");
      });
    }

    // 7. Fiscal Section
    encoder.align(TextAlignment.Center);
    let verificationCode = invoice.verificationCode || "";
    if (!verificationCode && (invoice._simulation || invoice._offline || invoice.status === 'draft')) {
      verificationCode = "9A2B-C48D-80FE-12A5-99BF";
    }

    if (verificationCode) {
      encoder.line("VERIFICATION CODE:");
      encoder.bold(true).line(formatVerificationCode(verificationCode)).bold(false);
    }

    const qrData = invoice.qrCodeData || invoice.receiptQRData || (invoice._simulation ? "https://fdms.zimra.co.zw/verify/SIMULATION-ONLY" : "");
    if (qrData) {
      encoder.feed(1).qrcode(qrData, 3);
      encoder.line("Verify at:");
      encoder.line("https://fdms.zimra.co.zw/verify");
    }

    // 8. Footer
    encoder.feed(1).align(TextAlignment.Center).italic(true);
    encoder.line((invoice.notes || invoice.receiptNotes || "Thank you for your business!").trim());
    encoder.line("Powered by FiscalStack").italic(false).align(TextAlignment.Left);

    // 9. End of receipt
    if (feedLines > 0) encoder.feed(feedLines);
    if (autoCut) encoder.cut();
    if (openDrawer) encoder.cashDrawer();

    return encoder.encode();
  }
}
