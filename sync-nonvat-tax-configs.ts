import { storage } from "./server/storage.js";
import { ZimraDevice } from "./server/zimra.js";
import { getZimraLogger } from "./server/lib/fiscalization.js";
import { db } from "./server/db.js"; // Initialize DB connection

async function syncNonVatTaxConfigs() {
    console.log("Starting bulk sync of tax configurations for non-VAT registered companies...");
    
    try {
        const companies = await storage.getAllCompanies();
        
        const targetCompanies = companies.filter(company => {
            const hasZimraCredentials = Boolean(company.fdmsDeviceId);
            // Check if explicitly non-VAT registered
            const explicitlyNotVatRegistered = company.vatRegistered === false || company.vatEnabled === false;
            
            return hasZimraCredentials && explicitlyNotVatRegistered;
        });

        console.log(`Found ${targetCompanies.length} non-VAT registered companies with ZIMRA credentials.`);

        for (const company of targetCompanies) {
            console.log(`\n----------------------------------------`);
            console.log(`Processing company: ${company.name} (ID: ${company.id})`);
            
            try {
                const baseUrl = company.zimraEnvironment === 'production' 
                    ? 'https://fdmsapi.zimra.co.zw' 
                    : 'https://fdmsapitest.zimra.co.zw';

                const device = new ZimraDevice({
                    deviceId: company.fdmsDeviceId!,
                    deviceSerialNo: company.fdmsDeviceSerialNo || "UNKNOWN",
                    activationKey: company.fdmsApiKey || "",
                    privateKey: company.zimraPrivateKey || undefined,
                    certificate: company.zimraCertificate || undefined,
                    baseUrl
                }, getZimraLogger(company.id));

                console.log(`Fetching config from ZIMRA for device ${company.fdmsDeviceId}...`);
                const config = await device.getConfig();
                
                const taxes = config.applicableTaxes || config.taxLevels || [];
                if (taxes.length === 0) {
                    console.log(`Warning: No taxes found in ZIMRA config for company ${company.id}`);
                    continue;
                }

                console.log(`Syncing ${taxes.length} taxes to database...`);
                const syncedTaxes = await storage.syncTaxTypes(company.id, taxes);
                
                console.log(`Successfully synced tax types. Non-VAT configurations applied.`);
            } catch (err: any) {
                console.error(`Error processing company ${company.id}:`, err.message || err);
            }
        }
        
        console.log(`\n----------------------------------------`);
        console.log("Bulk sync completed.");
    } catch (err) {
        console.error("Fatal error during sync:", err);
    } finally {
        // Force exit if any connections stay open
        setTimeout(() => process.exit(0), 1000);
    }
}

syncNonVatTaxConfigs();
