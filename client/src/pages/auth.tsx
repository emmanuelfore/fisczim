import { useBranding } from "@/hooks/use-branding";
import FiscalStackAuth from "./auth/FiscalStackAuth";
import FiscalZoneAuth from "./auth/FiscalZoneAuth";
import LekakuAuth from "./auth/LekakuAuth";

export default function AuthPage() {
  const { currentBrand } = useBranding();

  if (currentBrand === "fiscalzone") {
    return <FiscalZoneAuth />;
  }

  if (currentBrand === "fiscalstack_lesotho") {
    return <LekakuAuth />;
  }

  return <FiscalStackAuth />;
}
