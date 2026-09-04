import { useActiveCompany } from "./use-active-company";

export type FiscalAuthority = "ZIMRA" | "LEKAKU";

export function useFiscalAuthority() {
    const { activeCompany } = useActiveCompany(true);
    
    const fiscalProvider = activeCompany?.fiscalProvider as FiscalAuthority || 
                          (activeCompany?.country === "Lesotho" ? "LEKAKU" : "ZIMRA");
    
    const isLesotho = fiscalProvider === "LEKAKU";
    
    return {
        fiscalProvider,
        isLesotho,
        isZimbabwe: !isLesotho,
        
        // Authority names
        authorityName: isLesotho ? "RSL" : "ZIMRA",
        authorityFullName: isLesotho ? "Revenue Services Lesotho" : "Zimbabwe Revenue Authority",
        authorityShortName: isLesotho ? "LEKAKU" : "ZIMRA",
        
        // Portal/Verification
        portalName: isLesotho ? "LEKAKU Portal" : "ZIMRA Portal",
        verifyLabel: isLesotho ? "Verify with RSL" : "Verify with ZIMRA",
        verifyUrl: isLesotho ? "https://lekaku.rsl.co.ls/verify" : "https://fdms.zimra.co.zw/verify",
        
        // Settings
        settingsRoute: isLesotho ? "/lekaku-settings" : "/zimra-settings",
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