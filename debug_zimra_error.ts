import 'dotenv/config';
import { db } from './server/db';
import { zimraLogs } from './shared/schema';
import { desc, ilike, eq } from 'drizzle-orm';

async function run() {
  try {
    const logs = await db.select()
      .from(zimraLogs)
      .where(ilike(zimraLogs.responsePayload, '%RCPT025%'))
      .orderBy(desc(zimraLogs.createdAt))
      .limit(5);
    
    if (logs.length === 0) {
      console.log("No logs with RCPT025 found.");
    } else {
      for (const log of logs) {
        console.log("Log ID:", log.id, "Company:", log.companyId, "Endpoint:", log.endpoint);
        console.log("Request:", log.requestPayload);
        console.log("Response:", log.responsePayload);
        console.log("------------------------");
      }
    }
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
