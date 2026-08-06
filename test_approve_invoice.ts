import { db, pool } from './server/db';
import { approvalRequests } from './shared/schema';
import { eq } from 'drizzle-orm';
import { approveRequest } from './server/lib/approvals';

async function run() {
  try {
    const requests = await db.select().from(approvalRequests).where(eq(approvalRequests.type, "invoice_issue")).limit(1);
    if (requests.length === 0) {
      console.log("No invoice_issue approval requests found");
      return;
    }
    const request = requests[0];
    console.log("Found request:", request.id, "Status:", request.status);
    
    // Attempt to execute approve
    // But since we wiped approval requests or maybe it's pending, let's just log the payload
    console.log("Payload:", JSON.stringify(request.payload, null, 2));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}
run();
