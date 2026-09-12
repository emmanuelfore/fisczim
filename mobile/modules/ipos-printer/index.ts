import IPosPrinterModule from './src/IPosPrinterModule';

export enum PrinterStatus {
  NORMAL = 0,
  PAPERLESS = 1,
  THP_HIGH_TEMPERATURE = 2,
  MOTOR_HIGH_TEMPERATURE = 3,
  IS_BUSY = 4,
  ERROR_UNKNOWN = 5,
}

export enum Alignment {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2,
}

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export interface ReceiptOptions {
  businessName?: string;
  address?: string;
  phone?: string;
  tinNumber?: string;
  receiptNumber?: string;
  date?: string;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  paymentMethod?: string;
  qrCode?: string;
  footerText?: string;
}

/**
 * Check if the iPOS Printer service package is installed on the device
 */
export async function isAvailable(): Promise<boolean> {
  return await IPosPrinterModule.isAvailable();
}

/**
 * Get current status of the printer
 */
export async function getPrinterStatus(): Promise<PrinterStatus> {
  return await IPosPrinterModule.getPrinterStatus();
}

/**
 * Initialize the printer
 */
export async function printerInit(): Promise<boolean> {
  return await IPosPrinterModule.printerInit();
}

/**
 * Alias for printerInit()
 */
export async function init(): Promise<boolean> {
  return await printerInit();
}

/**
 * Set printer print depth (density) (1 to 10)
 */
export async function setPrinterPrintDepth(depth: number): Promise<boolean> {
  return await IPosPrinterModule.setPrinterPrintDepth(depth);
}

/**
 * Set printer font size
 * @param fontSize Font size (e.g. 16, 24, 32, 48)
 */
export async function setPrinterPrintFontSize(fontSize: number): Promise<boolean> {
  return await IPosPrinterModule.setPrinterPrintFontSize(fontSize);
}

/**
 * Set printer alignment
 * @param alignment 0: Left, 1: Center, 2: Right
 */
export async function setPrinterPrintAlignment(alignment: Alignment): Promise<boolean> {
  return await IPosPrinterModule.setPrinterPrintAlignment(alignment);
}

/**
 * Print plain text
 */
export async function printText(text: string): Promise<boolean> {
  return await IPosPrinterModule.printText(text);
}

/**
 * Print text with specified font and size
 */
export async function printSpecifiedTypeText(text: string, fontName: string = 'ST', fontSize: number = 24): Promise<boolean> {
  return await IPosPrinterModule.printSpecifiedTypeText(text, fontName, fontSize);
}

/**
 * Print columns / table text
 */
export async function printColumnsText(
  textArray: string[],
  widthArray: number[],
  alignArray: number[]
): Promise<boolean> {
  return await IPosPrinterModule.printColumnsText(textArray, widthArray, alignArray);
}

/**
 * Print Base64 encoded Bitmap image
 */
export async function printBitmap(alignment: Alignment, bitmapWidth: number, base64Image: string): Promise<boolean> {
  return await IPosPrinterModule.printBitmap(alignment, bitmapWidth, base64Image);
}

/**
 * Print Barcode
 */
export async function printBarCode(
  data: string,
  symbology: number = 8,
  height: number = 162,
  width: number = 2,
  alignment: Alignment = Alignment.CENTER
): Promise<boolean> {
  return await IPosPrinterModule.printBarCode(data, symbology, height, width, alignment);
}

/**
 * Print QR Code
 */
export async function printQRCode(
  data: string,
  moduleSize: number = 8,
  errorCorrectionLevel: number = 2
): Promise<boolean> {
  return await IPosPrinterModule.printQRCode(data, moduleSize, errorCorrectionLevel);
}

/**
 * Perform paper feed / line feed
 */
export async function printerPerformPrint(feedLines: number = 3): Promise<boolean> {
  return await IPosPrinterModule.printerPerformPrint(feedLines);
}

/**
 * Feed paper (Alias for printerPerformPrint)
 */
export async function feedPaper(lines: number = 3): Promise<boolean> {
  return await printerPerformPrint(lines);
}

/**
 * High-level function to format and print a complete store/POS receipt
 */
export async function printReceipt(options: ReceiptOptions): Promise<boolean> {
  try {
    await printerInit();

    // 1. Header (Business Name)
    if (options.businessName) {
      await setPrinterPrintAlignment(Alignment.CENTER);
      await setPrinterPrintFontSize(32);
      await printText(`${options.businessName}\n`);
    }

    // 2. Subheader Info
    await setPrinterPrintAlignment(Alignment.CENTER);
    await setPrinterPrintFontSize(24);
    if (options.address) await printText(`${options.address}\n`);
    if (options.phone) await printText(`Tel: ${options.phone}\n`);
    if (options.tinNumber) await printText(`TIN: ${options.tinNumber}\n`);
    
    await printText("--------------------------------\n");

    // 3. Receipt Meta Info
    await setPrinterPrintAlignment(Alignment.LEFT);
    if (options.receiptNumber) await printText(`Receipt #: ${options.receiptNumber}\n`);
    if (options.date) await printText(`Date: ${options.date}\n`);
    if (options.paymentMethod) await printText(`Payment: ${options.paymentMethod}\n`);

    await printText("--------------------------------\n");

    // 4. Line Items — use plain printText with manual formatting.
    // printColumnsText is unreliable on some iPOS firmware versions.
    await setPrinterPrintAlignment(Alignment.LEFT);
    await setPrinterPrintFontSize(24);

    // Helper: left-pad a string to a fixed width
    const padEnd = (s: string, n: number) => s.slice(0, n).padEnd(n, ' ');
    const padStart = (s: string, n: number) => s.slice(0, n).padStart(n, ' ');

    // Header row: "ITEM            QTY   TOTAL"
    await printText(`${padEnd('ITEM', 18)}${padEnd('QTY', 6)}${'TOTAL'}\n`);
    await printText("--------------------------------\n");

    for (const item of options.items) {
      const itemTotal = (item.qty * item.price).toFixed(2);
      const name = item.name.slice(0, 18);
      const qty = String(item.qty);
      // Line 1: name   qty   total
      await printText(`${padEnd(name, 18)}${padEnd(qty, 6)}${itemTotal}\n`);
    }

    await printText("--------------------------------\n");

    // 5. Totals
    await setPrinterPrintAlignment(Alignment.RIGHT);
    if (options.subtotal !== undefined) {
      await printText(`Subtotal: $${options.subtotal.toFixed(2)}\n`);
    }
    if (options.tax !== undefined) {
      await printText(`Tax/VAT: $${options.tax.toFixed(2)}\n`);
    }

    await setPrinterPrintFontSize(32);
    await printText(`TOTAL: $${options.total.toFixed(2)}\n`);
    await setPrinterPrintFontSize(24);

    await printText("--------------------------------\n");

    // 6. QR Code
    if (options.qrCode) {
      await setPrinterPrintAlignment(Alignment.CENTER);
      await printQRCode(options.qrCode, 8, 2);
      await printText("\n");
    }

    // 7. Footer
    if (options.footerText) {
      await setPrinterPrintAlignment(Alignment.CENTER);
      await printText(`${options.footerText}\n`);
    }

    // 8. Feed paper — push content clear of the cutter before cutting.
    // printerPerformPrint alone triggers the cut without scrolling the paper up first.
    await printText("\n\n\n\n\n\n");
    await printerPerformPrint(4);

    return true;
  } catch (err) {
    console.error("Failed to print receipt via iPOS Printer service:", err);
    return false;
  }
}

export default {
  isAvailable,
  getPrinterStatus,
  printerInit,
  init,
  setPrinterPrintDepth,
  setPrinterPrintFontSize,
  setPrinterPrintAlignment,
  printText,
  printSpecifiedTypeText,
  printColumnsText,
  printBitmap,
  printBarCode,
  printQRCode,
  printerPerformPrint,
  feedPaper,
  printReceipt,
  PrinterStatus,
  Alignment,
};
