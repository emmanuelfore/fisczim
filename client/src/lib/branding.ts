export type Brand = "fiscalstack" | "fiscalzone";

export interface BrandConfig {
  name: string;
  logo: string;
  supportEmail: string;
  website: string;
  whatsappMessage: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryColor: string;
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
  },
};

const brandEnv = (import.meta.env.VITE_APP_BRAND as string)?.toLowerCase();
export const currentBrand: Brand = (brandEnv === "fiscalzone") ? "fiscalzone" : "fiscalstack";
export const brand = BRAND_CONFIGS[currentBrand];
