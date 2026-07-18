import 'dotenv/config';
import { db } from './server/db';
import { zimraLogs } from './shared/schema';
import { eq, desc } from 'drizzle-orm';

async function run() {
  const companyId = 57;
  try {
    const logs = await db.select()
      .from(zimraLogs)
      .where(eq(zimraLogs.companyId, companyId))
      .orderBy(desc(zimraLogs.createdAt))
      .limit(5);
    
    for (const log of logs) {
      if (log.endpoint.includes('CloseDay')) {
        console.log("CloseDay Log ID:", log.id);
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
