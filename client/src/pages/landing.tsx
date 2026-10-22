import { useBranding } from "@/hooks/use-branding";
import FiscalStackLanding from "./landing/FiscalStackLanding";
import FiscalZoneLanding from "./landing/FiscalZoneLanding";

export default function LandingPage() {
  const { currentBrand } = useBranding();

  if (currentBrand === "fiscalzone") {
    return <FiscalZoneLanding />;
  }

  // Lesotho uses the same FiscalStack layout but the component
  // already detects the domain and swaps ZIMRA → RSL / LEKUKA at runtime.
  return <FiscalStackLanding />;
}
