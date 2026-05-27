import "dotenv/config";
import { db } from "../server/db";
import { zimraLogs } from "../shared/schema";
import { desc, eq } from "drizzle-orm";

async function run() {
  const logs = await db.select()
    .from(zimraLogs)
    .where(eq(zimraLogs.endpoint, 'Device Registration'))
    .orderBy(desc(zimraLogs.createdAt))
    .limit(5);
  
  if (logs.length === 0) {
    console.log("No 'Register Device' logs found. Fetching any recent logs...");
    const anyLogs = await db.select().from(zimraLogs).orderBy(desc(zimraLogs.createdAt)).limit(5);
    console.log(JSON.stringify(anyLogs, null, 2));
  } else {
    console.log(JSON.stringify(logs, null, 2));
  }
  process.exit(0);
}

run().catch(console.error);
