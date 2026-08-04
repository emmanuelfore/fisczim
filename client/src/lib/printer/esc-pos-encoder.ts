/**
 * ESC/POS Command Encoder for Thermal Printers
 * Supports standard text, alignment, sizing, and ZIMRA-required QR codes.
 */

export enum TextAlignment {
  Left = 0,
  Center = 1,
  Right = 2,
}

export enum TextSize {
  Normal = 0,
  DoubleHeight = 0x01,
  DoubleWidth = 0x10,
  Large = 0x11,
}

export class EscPosEncoder {
  private buffer: number[] = [];
  private encoder: TextEncoder = new TextEncoder();

  constructor() {
    this.initialize();
  }

  /** Reset printer state */
  initialize(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /** Set text alignment */
  align(alignment: TextAlignment): this {
    this.buffer.push(0x1b, 0x61, alignment);
    return this;
  }

  /** Set bold mode */
  bold(on: boolean = true): this {
    this.buffer.push(0x1b, 0x45, on ? 1 : 0);
    return this;
  }

  /** Set text size using GS ! n command */
  size(size: TextSize): this {
    this.buffer.push(0x1d, 0x21, size);
    return this;
  }

  /** Set italic mode */
  italic(on: boolean = true): this {
    this.buffer.push(0x1b, 0x34, on ? 1 : 0);
    return this;
  }

  /** Write raw text to buffer */
  text(value: string): this {
    const bytes = this.encoder.encode(value);
    this.buffer.push(...Array.from(bytes));
    return this;
  }

  /** Write text and then a newline */
  line(value: string = ""): this {
    this.text(value);
    this.buffer.push(0x0a); // LF
    return this;
  }

  /** Multiple newlines */
  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
       this.buffer.push(0x0a);
    }
    return this;
  }

  /** Full paper cut */
  cut(): this {
    this.buffer.push(0x1d, 0x56, 0x00);
    return this;
  }

  /** Open cash drawer connected to the printer */
  cashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0, 25, 250);
    return this;
  }

  /**
   * Native QR Code Generation (ZIMRA Requirement)
   * Uses the GS ( k command
   */
  qrcode(data: string, size: number = 6): this {
    const safeData = String(data || "");
    const pL = (safeData.length + 3) % 256;
    const pH = Math.floor((safeData.length + 3) / 256);

    // 1. Function 167: Set QR Model
    this.buffer.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    
    // 2. Function 169: Set QR Module Size
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);

    // 3. Function 180: Store data
    this.buffer.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    const bytes = this.encoder.encode(safeData);
    this.buffer.push(...Array.from(bytes));

    // 4. Function 181: Print QR from symbol storage
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);

    return this;
  }

  /** Print a 1-bit raster image using GS v 0. Width is in pixels, data is packed MSB-first. */
  rasterImage(width: number, height: number, data: Uint8Array): this {
    const bytesPerRow = Math.ceil(width / 8);
    if (data.length !== bytesPerRow * height) return this;

    this.buffer.push(
      0x1d, 0x76, 0x30, 0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
      ...Array.from(data)
    );
    return this;
  }

  /** Draw a thin line separator with optional custom character */
  separator(width: number = 32, char: string = "-"): this {
    this.line(char.repeat(width));
    return this;
  }

  /** Print a two-column row with padding */
  tableRow(left: string, right: string, width: number = 32): this {
    const safeR = String(right ?? "");
    const safeRight = safeR.length > width ? safeR.substring(0, width) : safeR;
    const leftRoom = width - safeRight.length - 1;
    let label = String(left ?? "");
    if (leftRoom <= 0) {
      label = "";
    } else if (label.length > leftRoom && leftRoom <= 3) {
      label = label.substring(0, leftRoom);
    } else if (label.length > leftRoom) {
      label = label.substring(0, leftRoom - 3) + "...";
    }
    const padding = " ".repeat(Math.max(1, width - label.length - safeRight.length));
    this.line(label + padding + safeRight);
    return this;
  }

  /** Get the final Uint8Array buffer to send to printer */
  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
