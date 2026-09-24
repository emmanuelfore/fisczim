import { useActiveCompany } from "./use-active-company";
import { isLekakuProvider } from "@shared/lekaku";

export type FiscalAuthority = "ZIMRA" | "LEKAKU";

export function useFiscalAuthority() {
    const { activeCompany } = useActiveCompany(true);

    const isLesotho = isLekakuProvider(activeCompany?.fiscalProvider, activeCompany?.country);
    const fiscalProvider: FiscalAuthority = isLesotho ? "LEKAKU" : "ZIMRA";
    
    return {
        fiscalProvider,
        isLesotho,
        isZimbabwe: !isLesotho,
        
        // Authority names
        authorityName: isLesotho ? "RSL" : "ZIMRA",
        authorityFullName: isLesotho ? "Revenue Services Lesotho" : "Zimbabwe Revenue Authority",
        authorityShortName: isLesotho ? "LEKAKU" : "ZIMRA",
        
        // Portal/Verification — RSL invoice portal (test carries :8443)
        portalName: isLesotho ? "LEKAKU Portal" : "ZIMRA Portal",
        verifyLabel: isLesotho ? "Verify with RSL" : "Verify with ZIMRA",
        verifyUrl: isLesotho
            ? ((activeCompany as any)?.zimraEnvironment === "production"
                ? "https://invoice.rsl.org.ls/"
                : "https://invoice.rsl.org.ls:8443/")
            : "https://fdms.zimra.co.zw/verify",
        
        // Settings — single device setup page; it switches authority
        // (ZIMRA vs LEKAKU endpoint) based on the active company.
        settingsRoute: "/tax-settings",
        settingsLabel: isLesotho ? "LEKAKU Settings" : "ZIMRA Settings",
        
        // Tax
        taxIdLabel: isLesotho ? "RSL Tax ID" : "ZIMRA Tax ID",
        taxCodeLabel: isLesotho ? "RSL Tax Code" : "ZIMRA Tax Code",
        
        // Device
        deviceLabel: isLesotho ? "LEKAKU Device" : "ZIMRA Device",
        deviceIdLabel: isLesotho ? "LEKAKU Device ID" : "ZIMRA Device ID",
        
        // Logs
        logsLabel: isLesotho ? "LEKAKU Logs" : "ZIMRA Logs",
        logsRoute: isLesotho ? "/lekaku-logs" : "/zimra-logs",
        
        // Day management
        fiscalDayLabel: isLesotho ? "Fiscal Day" : "Fiscal Day",
        
        // Currency
        defaultCurrency: isLesotho ? "LSL" : "USD",
    };
}