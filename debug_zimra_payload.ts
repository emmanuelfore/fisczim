import 'dotenv/config';
import { db } from './server/db';
import { zimraLogs } from './shared/schema';
import { eq } from 'drizzle-orm';

async function run() {
  try {
    const logs = await db.select()
      .from(zimraLogs)
      .where(eq(zimraLogs.id, 7670));
    
    if (logs.length > 0) {
      const log = logs[0];
      const request: any = log.requestPayload;
      console.log("Taxes sent:", JSON.stringify(request.receipt.receiptTaxes, null, 2));
    }
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
