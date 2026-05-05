import { NativeModules, Platform } from 'react-native';

const { HCCPrinter: _HCCPrinter } = NativeModules;

if (!_HCCPrinter) {
  console.warn(
    '[HCCPrinter] Native module not found. ' +
    'Make sure you are running a custom dev build (not Expo Go) ' +
    'and that HCCPrinterPackage is registered in MainApplication.'
  );
}

// ─── Status codes (mirrors Flutter plugin's PrinterCodes) ─────────────────────
export const PrinterCodes: Record<number, string> = {
  0:     'SUCCESS',
  [-1]:  'Short of Paper',
  [-2]:  'Temperature too high',
  [-3]:  'Low battery voltage',
  9998:  'Not initialized — call initPrinter() first',
  9999:  'Device not supported (requires CS10 or Z100)',
  [-4001]: 'PRINT BUSY',
  [-4002]: 'PRINT NO PAPER',
  [-4003]: 'PRINT DATA ERROR',
  [-4004]: 'PRINT FAULT',
  [-4005]: 'PRINT TOO HOT',
  [-4006]: 'PRINT UNFINISHED',
};

export type PrinterStatus = 'success' | 'needsPaper' | 'highTemperature' | 'lowBattery' | 'unknown';

function statusFromCode(code: number): PrinterStatus {
  switch (code) {
    case 0:  return 'success';
    case 1:  return 'needsPaper';
    case -2: return 'highTemperature';
    case -3: return 'lowBattery';
    default: return 'unknown';
  }
}

// ─── Alignment ────────────────────────────────────────────────────────────────
export type PrintAlign = 'left' | 'center' | 'right';
const ALIGN_MAP: Record<PrintAlign, number> = { left: 0, center: 1, right: 2 };

// ─── Font size ────────────────────────────────────────────────────────────────
export type FontSize = 'xsmall' | 'small' | 'medium' | 'large';
const FONT_SIZE_MAP: Record<FontSize, number> = {
  xsmall: 16,
  small:  20,
  medium: 24,
  large:  28,
};

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Initialize the printer. Must be called before any other method.
 * Returns true on success.
 */
export async function initPrinter(): Promise<boolean> {
  const code: number = await _HCCPrinter.printInit();
  if (code !== 0) {
    console.warn('[HCCPrinter] initPrinter failed:', PrinterCodes[code] ?? code);
  }
  return code === 0;
}

/**
 * Add a text line to the print queue.
 */
export async function addText(
  text: string,
  options?: {
    align?: PrintAlign;
    fontSize?: FontSize;
    bold?: boolean;
  }
): Promise<boolean> {
  const code: number = await _HCCPrinter.printString({
    text,
    align:    ALIGN_MAP[options?.align ?? 'left'],
    fontSize: FONT_SIZE_MAP[options?.fontSize ?? 'medium'],
    zoom:     options?.bold ? 33 : 0,
  });
  return code === 0;
}

/**
 * Add a QR code to the print queue.
 */
export async function addQrCode(
  data: string,
  options?: { width?: number; height?: number; align?: PrintAlign }
): Promise<boolean> {
  const code: number = await _HCCPrinter.printQrCode({
    data,
    width:  options?.width  ?? 300,
    height: options?.height ?? 300,
  });
  return code === 0;
}

/**
 * Trigger printing of everything in the queue.
 */
export async function printStart(): Promise<boolean> {
  const code: number = await _HCCPrinter.printStart();
  return code === 0;
}

/**
 * Close the printer and clear the queue.
 */
export async function printClose(): Promise<boolean> {
  const code: number = await _HCCPrinter.printClose();
  return code === 0;
}

/**
 * Check the current printer status.
 */
export async function checkStatus(): Promise<PrinterStatus> {
  const code: number = await _HCCPrinter.printCheckStatus();
  return statusFromCode(code);
}

// ─── High-level helper ────────────────────────────────────────────────────────

export interface ReceiptLine {
  text: string;
  align?: PrintAlign;
  fontSize?: FontSize;
  bold?: boolean;
}

/**
 * One-shot helper: init → queue lines + optional QR → print → close.
 *
 * Example:
 *   await printReceipt({
 *     lines: [
 *       { text: 'ACME Store',       align: 'center', bold: true },
 *       { text: '─────────────────', align: 'center' },
 *       { text: 'Item A      $1.00' },
 *       { text: 'Total       $1.00', bold: true },
 *     ],
 *     qrCode: 'https://example.com/receipt/123',
 *   });
 */
export async function printReceipt(options: {
  lines: ReceiptLine[];
  qrCode?: string;
  feedLines?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ok = await initPrinter();
    if (!ok) return { success: false, error: 'Printer initialization failed' };

    for (const line of options.lines) {
      await addText(line.text, {
        align:    line.align,
        fontSize: line.fontSize,
        bold:     line.bold,
      });
    }

    if (options.qrCode) {
      await addQrCode(options.qrCode, { align: 'center' });
    }

    // Feed blank lines at end so receipt tears cleanly
    const feed = options.feedLines ?? 4;
    for (let i = 0; i < feed; i++) {
      await addText('\n');
    }

    await printStart();
    await printClose();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
