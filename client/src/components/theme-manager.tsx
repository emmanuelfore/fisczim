import { useEffect } from "react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { applyTheme } from "@/lib/utils";
import { brand } from "@/lib/branding";

export function ThemeManager() {
  const { activeCompany } = useActiveCompany();

  useEffect(() => {
    // Fall back to the brand blue so a tenant without an explicit colour still
    // gets the branch's own shade (Lesotho matches the main FiscalStack blue).
    applyTheme(activeCompany?.primaryColor || brand.primaryColorHex);
  }, [activeCompany?.primaryColor]);

  return null;
}
