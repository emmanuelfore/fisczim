import { useBranding } from "@/hooks/use-branding";
import FiscalStackLanding from "./landing/FiscalStackLanding";
import FiscalZoneLanding from "./landing/FiscalZoneLanding";
import LekakuLanding from "./landing/LekakuLanding";

export default function LandingPage() {
  const { currentBrand } = useBranding();

  if (currentBrand === "fiscalzone") {
    return <FiscalZoneLanding />;
  }

  if (currentBrand === "fiscalstack_lesotho") {
    return <LekakuLanding />;
  }

  return <FiscalStackLanding />;
}
