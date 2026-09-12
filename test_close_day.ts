import 'dotenv/config';
import { db } from './server/db.js';
import { companies } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { ZimraDevice } from './server/zimra.js';
import { storage } from './server/storage.js';

async function main() {
    const comp = await db.query.companies.findFirst({
        where: eq(companies.id, 57)
    });
    if (!comp) {
        console.error('Company not found');
        process.exit(1);
    }
    
    console.log(`Company 57 current day: ${comp.currentFiscalDayNo}`);
    
    const device = new ZimraDevice({
        deviceId: comp.fdmsDeviceId!,
        deviceSerialNo: comp.fdmsDeviceSerialNo!,
        activationKey: comp.fdmsActivationKey!,
        certificate: comp.certificate!,
        privateKey: comp.privateKey!,
        baseUrl: comp.zimraBaseUrl || 'https://fdmstest.zimra.co.zw'
    });

    try {
        const counters = await storage.calculateFiscalCounters(comp.id, comp.currentFiscalDayNo || 1);
        console.log("Counters to send:", counters);

        const fiscalDayDate = new Date().toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS format without Z

        const result = await device.closeDay(
            comp.currentFiscalDayNo || 1, 
            fiscalDayDate, 
            comp.dailyReceiptCount || 0, 
            counters
        );
        console.log("CloseDay Result:", result);
    } catch (e: any) {
        console.error("CloseDay Error:", e.response?.data || e.message);
    }
    process.exit(0);
}
main();
