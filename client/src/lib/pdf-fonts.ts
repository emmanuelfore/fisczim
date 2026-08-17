import { Font } from "@react-pdf/renderer";
import { getLocale } from "@/lib/i18n";

// Noto Sans SC "chinese-simplified" subset covers both basic latin and the
// common simplified-Chinese glyphs, so a single source per weight is enough
// (react-pdf v4 resolves exactly one source per family/weight).
const FONT_SOURCE =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.1.0/files";

let cjkRegistered = false;

function registerCjkPdfFont() {
  if (cjkRegistered) return;
  cjkRegistered = true;
  try {
    Font.register({
      family: "NotoSansSC",
      fonts: [
        {
          src: `${FONT_SOURCE}/noto-sans-sc-chinese-simplified-400-normal.woff`,
          fontWeight: 400,
        },
        {
          src: `${FONT_SOURCE}/noto-sans-sc-chinese-simplified-700-normal.woff`,
          fontWeight: 700,
        },
      ],
    });
  } catch (error) {
    console.warn("Failed to load Noto Sans SC fonts for PDF", error);
    cjkRegistered = false;
  }
}

export const CJK_PDF_FONT = "NotoSansSC";

// Returns the font family a PDF should use for the current locale, falling
// back to the passed-in family when English is active. Intended to be read
// from PDF components, which render in a separate tree without context.
export function pdfFontFamily(fallback: string): string {
  if (getLocale() === "zh") {
    registerCjkPdfFont();
    return CJK_PDF_FONT;
  }
  return fallback;
}