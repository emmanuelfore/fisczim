import { currentBrand, brand } from "@/lib/branding";

export function useBranding() {
  return {
    brand,
    currentBrand,
    isFiscalStack: currentBrand === "fiscalstack",
    isFiscalZone: currentBrand === "fiscalzone",
    primaryColor: brand.primaryColor,
  };
}
