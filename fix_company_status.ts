import 'dotenv/config';
import { db } from './server/db.js';
import { companies } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
    await db.update(companies).set({ 
        fiscalDayOpen: false,
        lastFiscalDayStatus: 'FiscalDayClosed',
        dailyReceiptCount: 0
    }).where(eq(companies.id, 57));
    console.log('Company 57 marked as Closed in DB');
    process.exit(0);
}
main();
