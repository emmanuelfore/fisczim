export type InvoiceTemplateId =
  | "modern"
  | "executive"
  | "emerald"
  | "midnight"
  | "minimal"
  | "classic"
  | "ledger"
  | "boutique"
  | "industrial"
  | "coral"
  | "legal"
  | "teal"
  | "sunrise"
  | "mono"
  | "royal"
  | "clean"
  | "compact"
  | "premium"
  | "retail"
  | "service";

export type InvoiceTemplate = {
  id: InvoiceTemplateId;
  name: string;
  description: string;
  accent: string;
  secondary: string;
  page: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  headerMode: "line" | "band" | "block";
  radius: number;
  density: "comfortable" | "compact";
};

export type InvoiceTemplateDesignerSettings = {
  defaultTemplateId: InvoiceTemplateId;
  accentColor?: string;
  logoPlacement: "left" | "center" | "right";
  qrPlacement: "header-right" | "header-center" | "footer";
  density: "comfortable" | "compact";
  showPartnership?: boolean;
  partnerLogoPlacement?: "side_by_side" | "primary_secondary" | "stacked" | "right_header";
};

export const invoiceTemplates: InvoiceTemplate[] = [
  { id: "modern", name: "Modern Blue", description: "Clean SaaS-style invoice with a confident blue accent.", accent: "#2563eb", secondary: "#dbeafe", page: "#ffffff", surface: "#f8fafc", text: "#0f172a", muted: "#64748b", border: "#dbe3ef", headerMode: "line", radius: 6, density: "comfortable" },
  { id: "executive", name: "Executive Slate", description: "Formal, boardroom-ready layout with strong contrast.", accent: "#111827", secondary: "#e5e7eb", page: "#ffffff", surface: "#f9fafb", text: "#111827", muted: "#6b7280", border: "#d1d5db", headerMode: "band", radius: 2, density: "comfortable" },
  { id: "emerald", name: "Emerald Trade", description: "Fresh commercial styling for distributors and retailers.", accent: "#059669", secondary: "#d1fae5", page: "#ffffff", surface: "#f0fdf4", text: "#064e3b", muted: "#4b6b5f", border: "#bbf7d0", headerMode: "block", radius: 6, density: "comfortable" },
  { id: "midnight", name: "Midnight Gold", description: "Premium dark header with a warm gold accent.", accent: "#b45309", secondary: "#fef3c7", page: "#ffffff", surface: "#fffbeb", text: "#111827", muted: "#6b7280", border: "#fde68a", headerMode: "band", radius: 4, density: "comfortable" },
  { id: "minimal", name: "Minimal White", description: "Quiet whitespace, light rules, and reduced visual weight.", accent: "#475569", secondary: "#f1f5f9", page: "#ffffff", surface: "#ffffff", text: "#0f172a", muted: "#64748b", border: "#e2e8f0", headerMode: "line", radius: 2, density: "comfortable" },
  { id: "classic", name: "Classic Ledger", description: "Traditional accounting document with compact details.", accent: "#1d4ed8", secondary: "#eff6ff", page: "#ffffff", surface: "#f8fafc", text: "#172033", muted: "#5b677a", border: "#cbd5e1", headerMode: "line", radius: 0, density: "compact" },
  { id: "ledger", name: "Ledger Green", description: "Accounting-led layout with crisp green totals.", accent: "#047857", secondary: "#ecfdf5", page: "#ffffff", surface: "#f7fee7", text: "#14532d", muted: "#64748b", border: "#d9f99d", headerMode: "line", radius: 3, density: "compact" },
  { id: "boutique", name: "Boutique Rose", description: "Soft but professional styling for design-led brands.", accent: "#be123c", secondary: "#ffe4e6", page: "#ffffff", surface: "#fff1f2", text: "#1f1720", muted: "#7f5a63", border: "#fecdd3", headerMode: "block", radius: 6, density: "comfortable" },
  { id: "industrial", name: "Industrial Steel", description: "Durable, technical look for workshops and manufacturers.", accent: "#334155", secondary: "#e2e8f0", page: "#ffffff", surface: "#f8fafc", text: "#0f172a", muted: "#475569", border: "#cbd5e1", headerMode: "band", radius: 1, density: "compact" },
  { id: "coral", name: "Coral Studio", description: "Warm accent with a friendly service-business feel.", accent: "#e11d48", secondary: "#ffe4e6", page: "#ffffff", surface: "#fff7ed", text: "#1f2937", muted: "#78716c", border: "#fed7aa", headerMode: "line", radius: 6, density: "comfortable" },
  { id: "legal", name: "Legal Plain", description: "Conservative template for regulated or document-heavy teams.", accent: "#1f2937", secondary: "#f3f4f6", page: "#ffffff", surface: "#ffffff", text: "#111827", muted: "#4b5563", border: "#d1d5db", headerMode: "line", radius: 0, density: "compact" },
  { id: "teal", name: "Teal Horizon", description: "Balanced teal system with calm section panels.", accent: "#0f766e", secondary: "#ccfbf1", page: "#ffffff", surface: "#f0fdfa", text: "#134e4a", muted: "#64748b", border: "#99f6e4", headerMode: "block", radius: 5, density: "comfortable" },
  { id: "sunrise", name: "Sunrise Amber", description: "Warm commercial document with clear totals.", accent: "#d97706", secondary: "#fef3c7", page: "#ffffff", surface: "#fffbeb", text: "#1f2937", muted: "#78716c", border: "#fde68a", headerMode: "line", radius: 5, density: "comfortable" },
  { id: "mono", name: "Mono Precision", description: "High-legibility monochrome layout for printing.", accent: "#000000", secondary: "#f5f5f5", page: "#ffffff", surface: "#ffffff", text: "#111111", muted: "#555555", border: "#d4d4d4", headerMode: "band", radius: 0, density: "compact" },
  { id: "royal", name: "Royal Indigo", description: "Polished indigo identity for professional services.", accent: "#4f46e5", secondary: "#e0e7ff", page: "#ffffff", surface: "#eef2ff", text: "#111827", muted: "#64748b", border: "#c7d2fe", headerMode: "block", radius: 6, density: "comfortable" },
  { id: "clean", name: "Clean Gray", description: "Neutral, simple, and easy for customers to scan.", accent: "#64748b", secondary: "#f1f5f9", page: "#ffffff", surface: "#f8fafc", text: "#0f172a", muted: "#64748b", border: "#e2e8f0", headerMode: "line", radius: 4, density: "comfortable" },
  { id: "compact", name: "Compact Pro", description: "Dense information display for long invoices.", accent: "#0f172a", secondary: "#e2e8f0", page: "#ffffff", surface: "#f8fafc", text: "#0f172a", muted: "#475569", border: "#cbd5e1", headerMode: "line", radius: 2, density: "compact" },
  { id: "premium", name: "Premium Carbon", description: "Dark premium masthead with crisp body sections.", accent: "#18181b", secondary: "#f4f4f5", page: "#ffffff", surface: "#fafafa", text: "#18181b", muted: "#71717a", border: "#d4d4d8", headerMode: "band", radius: 4, density: "comfortable" },
  { id: "retail", name: "Retail Fresh", description: "Bright, approachable retail layout with visible payment details.", accent: "#16a34a", secondary: "#dcfce7", page: "#ffffff", surface: "#f7fee7", text: "#14532d", muted: "#5f6f64", border: "#bbf7d0", headerMode: "block", radius: 6, density: "comfortable" },
  { id: "service", name: "Service Navy", description: "Trustworthy navy treatment for service teams and contractors.", accent: "#1e40af", secondary: "#dbeafe", page: "#ffffff", surface: "#eff6ff", text: "#172554", muted: "#64748b", border: "#bfdbfe", headerMode: "band", radius: 5, density: "comfortable" },
];

export const defaultInvoiceTemplateSettings: InvoiceTemplateDesignerSettings = {
  defaultTemplateId: "modern",
  logoPlacement: "left",
  qrPlacement: "header-right",
  density: "comfortable",
  showPartnership: false,
  partnerLogoPlacement: "side_by_side",
};

export function getInvoiceTemplate(id?: string | null) {
  return invoiceTemplates.find(template => template.id === id) || invoiceTemplates[0];
}

export function getStoredInvoiceTemplateSettings(companyId?: number | string | null): InvoiceTemplateDesignerSettings {
  if (typeof window === "undefined" || !companyId) return defaultInvoiceTemplateSettings;
  try {
    const stored = window.localStorage.getItem(`invoice_template_designer_${companyId}`);
    return stored ? { ...defaultInvoiceTemplateSettings, ...JSON.parse(stored) } : defaultInvoiceTemplateSettings;
  } catch {
    return defaultInvoiceTemplateSettings;
  }
}
