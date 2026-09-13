import { useActiveCompany } from "./use-active-company";

export type FiscalAuthority = "ZIMRA" | "LEKUKA";

export function useFiscalAuthority() {
    const { activeCompany } = useActiveCompany(true);
    
    const fiscalProvider = activeCompany?.fiscalProvider as FiscalAuthority || 
                          (activeCompany?.country === "Lesotho" ? "LEKUKA" : "ZIMRA");
    
    const isLesotho = fiscalProvider === "LEKUKA";
    
    return {
        fiscalProvider,
        isLesotho,
        isZimbabwe: !isLesotho,
        
        // Authority names
        authorityName: isLesotho ? "RSL" : "ZIMRA",
        authorityFullName: isLesotho ? "Revenue Services Lesotho" : "Zimbabwe Revenue Authority",
        authorityShortName: isLesotho ? "LEKUKA" : "ZIMRA",
        
        // Portal/Verification
        portalName: isLesotho ? "LEKUKA Portal" : "ZIMRA Portal",
        verifyLabel: isLesotho ? "Verify with RSL" : "Verify with ZIMRA",
        verifyUrl: isLesotho ? "https://lekuka.rsl.co.ls/verify" : "https://fdms.zimra.co.zw/verify",
        
        // Settings
        settingsRoute: isLesotho ? "/lekuka-settings" : "/zimra-settings",
        settingsLabel: isLesotho ? "LEKUKA Settings" : "ZIMRA Settings",
        
        // Tax
        taxIdLabel: isLesotho ? "RSL Tax ID" : "ZIMRA Tax ID",
        taxCodeLabel: isLesotho ? "RSL Tax Code" : "ZIMRA Tax Code",
        
        // Device
        deviceLabel: isLesotho ? "LEKUKA Device" : "ZIMRA Device",
        deviceIdLabel: isLesotho ? "LEKUKA Device ID" : "ZIMRA Device ID",
        
        // Logs
        logsLabel: isLesotho ? "LEKUKA Logs" : "ZIMRA Logs",
        logsRoute: isLesotho ? "/lekuka-logs" : "/zimra-logs",
        
        // Day management
        fiscalDayLabel: isLesotho ? "Fiscal Day" : "Fiscal Day",
        
        // Currency
        defaultCurrency: isLesotho ? "LSL" : "USD",
    };
}