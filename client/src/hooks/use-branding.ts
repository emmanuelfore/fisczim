import { currentBrand, brand } from "@/lib/branding";

export function useBranding() {
  return {
    brand,
    currentBrand,
    isFiscalStack: currentBrand === "fiscalstack",
    isFiscalZone: currentBrand === "fiscalzone",
    isFiscalStackLesotho: currentBrand === "fiscalstack_lesotho",
    primaryColor: brand.primaryColor,
  };
}
