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

    const config = await device.getConfig();
    const taxes = config.applicableTaxes || config.taxLevels || [];
    
    console.log("Zimra returned taxes:", JSON.stringify(taxes, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
run();
