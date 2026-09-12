/**
 * Mobile ESC/POS Tagged Encoder
 * Matches the interface of the desktop encoder but produces 
 * the tagged string format required by react-native-thermal-printer.
 */

export enum TextAlignment {
  Left = "L",
  Center = "C",
  Right = "R",
}

export class MobileTaggedEncoder {
  private buffer: string = "";
  private alignment: TextAlignment = TextAlignment.Left;
  private isBold: boolean = false;
  private isItalic: boolean = false;

  constructor() {
    this.initialize();
  }

  initialize(): this {
    this.buffer = "";
    this.alignment = TextAlignment.Left;
    this.isBold = false;
    this.isItalic = false;
    return this;
  }

  align(alignment: TextAlignment): this {
    this.alignment = alignment;
    return this;
  }

  bold(on: boolean = true): this {
    this.isBold = on;
    return this;
  }

  italic(on: boolean = true): this {
    this.isItalic = on;
    return this;
  }

  /** Sizing is limited in standard tagged format, we map it to bold if large */
  size(size: number): this {
    if (size > 0) this.isBold = true;
    return this;
  }

  text(value: string): this {
    if (!value) return this;
    
    let content = value;
    if (this.isBold) content = `<b>${content}</b>`;
    // Italic isn't natively supported by tags but we can shim or skip
    
    const tag = `[${this.alignment}]`;
    this.buffer += `${tag}${content}`;
    return this;
  }

  line(value: string = ""): this {
    this.text(value);
    this.buffer += "\n";
    return this;
  }

  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
       this.buffer += "\n";
    }
    return this;
  }

  /** Tags don't support cut directly in payload, handled by printerWidth/autoCut props */
  cut(): this {
    return this;
  }

  /** Tags don't support cashDrawer directly in payload, handled by openCashbox prop */
  cashDrawer(): this {
    return this;
  }

  qrcode(data: string, size: number = 20): this {
    // Use the standard ESC/POS QR code command format that react-native-thermal-printer supports
    // Size parameter controls module size - larger values = bigger QR code
    this.buffer += `[C]<qrcode size='${size}'>${data}</qrcode>\n`;
    return this;
  }

  separator(width: number = 32, char: string = "-"): this {
    this.line(char.repeat(width));
    return this;
  }

  tableRow(left: string, right: string, width: number = 32): this {
    // Since tags are applied per-line in the library version we have,
    // we use the [L]...[R] combined tag format if supported, 
    // otherwise manual padding.
    
    const paddingCount = width - left.length - right.length;
    const padding = paddingCount > 0 ? " ".repeat(paddingCount) : " ";
    
    // Most react-native-thermal-printer versions support [L]...[R] in same line
    // Or we can just use manual padding which is safer across all models
    this.line(`${left}${padding}${right}`);
    return this;
  }

  encode(): string {
    return this.buffer;
  }
}
