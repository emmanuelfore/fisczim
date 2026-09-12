import { db, pool } from './server/db';
import { approveRequest } from './server/lib/approvals';

async function run() {
  try {
    // approveRequest(requestId, companyId, reviewerId, isSuperAdmin, reviewNotes)
    console.log("Approving request 4...");
    const res = await approveRequest(4, 23, "6e09d2cb-b3e6-4b26-aff7-8ac312270b9d", true, "Test");
    console.log("Success:", res);
  } catch(e) {
    console.error("Failed to approve:", e);
  } finally {
    await pool.end();
  }
}
run();
