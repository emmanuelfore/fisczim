export type Brand = "fiscalstack" | "fiscalzone" | "fiscalstack_lesotho";

export interface BrandConfig {
  name: string;
  logo: string;
  supportEmail: string;
  website: string;
  whatsappMessage: string;
  heroTitle: string;
  heroSubtitle: string;
  /** HSL triple used by the landing page. */
  primaryColor: string;
  /** Exact brand hex — the single source of truth for the app theme. */
  primaryColorHex: string;
}

const BRAND_CONFIGS: Record<Brand, BrandConfig> = {
  fiscalstack: {
    name: "FiscalStack",
    logo: "/fiscalstack-logo.png",
    supportEmail: "info@fiscalstack.co.zw",
    website: "https://fiscalstack.co.zw",
    whatsappMessage: "Hi FiscalStack! I'd like to learn more about your fiscalization platform.",
    heroTitle: "Seamless Fiscal Compliance Invoicing.",
    heroSubtitle: "Manage customers, products, and fiscalization in one secure platform.",
    primaryColor: "256 90% 60%",
    primaryColorHex: "#2563eb",
  },
  fiscalzone: {
    name: "FiscalZone",
    logo: "/fiscalzone-logo.png",
    supportEmail: "support@fiscalzone.com",
    website: "https://fiscalzone.com",
    whatsappMessage: "Hi FiscalZone! I'd like to learn more about your fiscalization platform.",
    heroTitle: "Next-Gen Fiscal Compliance.",
    heroSubtitle: "The most reliable way to manage your fiscalization and business growth.",
    primaryColor: "210 100% 50%",
    primaryColorHex: "#0088ff",
  },
  fiscalstack_lesotho: {
    // The branch is Lekuka: it carries the real FiscalStack logo and the main
    // FiscalStack blue, but it is marketed under its own name.
    name: "Lekuka",
    // Same real FiscalStack mark as the main site, not a separate placeholder.
    logo: "/fiscalstack-logo.png",
    supportEmail: "info@fiscalstack.co.ls",
    website: "https://fiscalstack.co.ls",
    whatsappMessage: "Hi Lekuka! I'd like to learn more about your fiscalization platform.",
    heroTitle: "Seamless Fiscal Compliance Invoicing.",
    heroSubtitle: "Manage customers, products, and Lekuka fiscalization in one secure platform.",
    // Identical blue to the main FiscalStack brand, so the Lesotho branch looks
    // the same everywhere — landing, auth and dashboard.
    primaryColor: "221 73% 53%",
    primaryColorHex: "#2563eb",
  },
};

const brandEnv = (import.meta.env.VITE_APP_BRAND as string)?.toLowerCase();

function detectBrand(): Brand {
  if (brandEnv === "fiscalzone") return "fiscalzone";
  if (brandEnv === "fiscalstack_lesotho") return "fiscalstack_lesotho";
  if (brandEnv === "lesotho") return "fiscalstack_lesotho";
  // Runtime detection: if the hostname is fiscalstack.co.ls, use Lesotho brand
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("fiscalstack.co.ls")) return "fiscalstack_lesotho";
  }
  return "fiscalstack";
}

export const currentBrand: Brand = detectBrand();
export const brand = BRAND_CONFIGS[currentBrand];
