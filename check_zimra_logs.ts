import 'dotenv/config';
import { db } from './server/db';
import { zimraLogs } from './shared/schema';
import { eq, desc } from 'drizzle-orm';

async function run() {
  const logs = await db.select()
    .from(zimraLogs)
    .where(eq(zimraLogs.companyId, 57))
    .orderBy(desc(zimraLogs.createdAt))
    .limit(5);

  logs.forEach(log => {
    console.log(`Endpoint: ${log.endpoint}, Status: ${log.statusCode}, Error: ${log.errorMessage}`);
    console.log(`Request:`, JSON.stringify(log.requestPayload, null, 2));
    console.log(`Response:`, JSON.stringify(log.responsePayload, null, 2));
    console.log('-------------------');
  });
  
  process.exit(0);
}

run().catch(console.error);
