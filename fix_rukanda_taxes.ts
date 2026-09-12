import 'dotenv/config';
import { db } from './server/db';
import { taxTypes } from './shared/schema';
import { storage } from './server/storage';
import { ZimraDevice } from './server/zimra';
import { getZimraLogger } from './server/lib/fiscalization';
import { eq } from 'drizzle-orm';

async function run() {
  try {
    const company = await storage.getCompany(57);
    if (!company) throw new Error("Company 57 not found");
    
    console.log(`Processing company: ${company.name} (ID: ${company.id})`);
    
    // First let's check current taxes
    const currentTaxes = await db.select().from(taxTypes).where(eq(taxTypes.companyId, 57));
    console.log("Current taxes count:", currentTaxes.length);

    // Let's remove existing taxes for company 57 to "remove system configured"
    await db.delete(taxTypes).where(eq(taxTypes.companyId, 57));
    console.log("Deleted existing taxes for company 57");

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
    } else {
        console.log(`Syncing ${taxes.length} taxes to database...`);
        const syncedTaxes = await storage.syncTaxTypes(company.id, taxes);
        console.log(`Successfully synced tax types.`);
    }

    // verify
    const newTaxes = await db.select().from(taxTypes).where(eq(taxTypes.companyId, 57));
    console.log("New taxes:", JSON.stringify(newTaxes, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
