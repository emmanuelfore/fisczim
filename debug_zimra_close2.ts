import 'dotenv/config';
import { db } from './server/db';
import { zimraLogs } from './shared/schema';
import { eq, desc, ilike } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  try {
    const logs = await db.select()
      .from(zimraLogs)
      .where(eq(zimraLogs.companyId, companyId))
      .orderBy(desc(zimraLogs.createdAt))
      .limit(50);
    
    let found = false;
    for (const log of logs) {
      if (log.endpoint.includes('CloseDay') || log.endpoint.includes('day-close')) {
        found = true;
        console.log("CloseDay Log ID:", log.id);
        console.log("Request:", log.requestPayload);
        console.log("Response:", log.responsePayload);
        console.log("------------------------");
        break; // just show the latest one
      }
    }
    if (!found) console.log("No CloseDay logs found.");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
