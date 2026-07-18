import 'dotenv/config';
import { db } from './server/db';
import { zimraLogs } from './shared/schema';
import { eq, desc, gte } from 'drizzle-orm';

async function run() {
  const cutoff = new Date('2026-07-18T12:00:00+02:00');
  const logs = await db.select()
    .from(zimraLogs)
    .where(eq(zimraLogs.companyId, 57))
    .orderBy(desc(zimraLogs.createdAt))
    .limit(5);

  console.log(`Logs found: ${logs.length}`);
  logs.forEach(log => {
    console.log(`At: ${log.createdAt}`);
    console.log(`Endpoint: ${log.endpoint}, Status: ${log.statusCode}, Error: ${log.errorMessage}`);
    if (log.endpoint === 'Invoice Submission') {
      console.log(`Request receiptLines:`, JSON.stringify(log.requestPayload.receipt?.receiptLines, null, 2));
      console.log(`Request receiptTaxes:`, JSON.stringify(log.requestPayload.receipt?.receiptTaxes, null, 2));
      console.log(`Response errors:`, JSON.stringify(log.responsePayload?.validationErrors, null, 2));
    }
    console.log('-------------------');
  });
  process.exit(0);
}

run().catch(console.error);
