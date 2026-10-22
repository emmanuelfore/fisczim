import 'dotenv/config';
import { pool } from "./server/db.js";

async function main() {
  const invoiceId = 34004; // INV-659108

  console.log(`=== Querying logs for invoice ID ${invoiceId} (INV-659108) ===\n`);

  // 1. Fiscalization job logs
  const jobRes = await pool.query(`
    SELECT * FROM fiscalization_jobs
    WHERE invoice_id = $1
    ORDER BY created_at DESC
  `, [invoiceId]);

  console.log("📋 FISCALIZATION JOBS:");
  if (jobRes.rows.length === 0) {
    console.log("  No fiscalization jobs found");
  } else {
    jobRes.rows.forEach((job, idx) => {
      console.log(`  Job #${idx + 1}:`);
      console.log(`    ID: ${job.id}`);
      console.log(`    Status: ${job.status}`);
      console.log(`    Attempt Count: ${job.attempt_count}`);
      console.log(`    Last Error Code: ${job.last_error_code || 'NULL'}`);
      console.log(`    Last Error Message: ${job.last_error_message || 'NULL'}`);
      console.log(`    Next Attempt At: ${job.next_attempt_at}`);
      console.log(`    Completed At: ${job.completed_at || 'NULL'}`);
      console.log(`    Created At: ${job.created_at}`);
      console.log(`    Updated At: ${job.updated_at}\n`);
    });
  }

  // 2. ZIMRA logs
  const zimraLogsRes = await pool.query(`
    SELECT * FROM zimra_logs
    WHERE invoice_id = $1
    ORDER BY created_at DESC
    LIMIT 20
  `, [invoiceId]);

  console.log("📡 ZIMRA LOGS:");
  if (zimraLogsRes.rows.length === 0) {
    console.log("  No ZIMRA logs found");
  } else {
    zimraLogsRes.rows.forEach((log, idx) => {
      console.log(`  Log #${idx + 1}:`);
      console.log(`    ID: ${log.id}`);
      console.log(`    Endpoint: ${log.endpoint}`);
      console.log(`    Status Code: ${log.status_code || 'NULL'}`);
      console.log(`    Error Message: ${log.error_message || 'NULL'}`);
      console.log(`    Created At: ${log.created_at}`);
      console.log(`    Request Payload: ${log.request_payload ? JSON.stringify(log.request_payload).slice(0, 1000) : 'NULL'}`);
      console.log(`    Response Payload: ${log.response_payload ? JSON.stringify(log.response_payload).slice(0, 1000) : 'NULL'}\n`);
    });
  }

  // 3. Check all failed invoices for Rabyon (Company 91) with their job errors
  const failedInvoicesRes = await pool.query(`
    SELECT 
      i.id,
      i.invoice_number,
      i.created_at,
      fj.status as job_status,
      fj.last_error_message,
      fj.attempt_count,
      fj.created_at as job_created_at
    FROM invoices i
    LEFT JOIN fiscalization_jobs fj ON i.id = fj.invoice_id
    WHERE i.company_id = 91
      AND i.fiscal_code IS NULL
      AND COALESCE(i.status, '') <> 'cancelled'
      AND i.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY i.created_at DESC
    LIMIT 30
  `, []);

  console.log("\n📊 ALL FAILED INVOICES FOR RABYON (Company 91) - Last 7 Days:");
  console.log(`  Total: ${failedInvoicesRes.rows.length}`);
  failedInvoicesRes.rows.forEach((inv, idx) => {
    console.log(`  ${idx + 1}. ${inv.invoice_number} (ID: ${inv.id})`);
    console.log(`     Created: ${inv.created_at}`);
    console.log(`     Job Status: ${inv.job_status || 'NO JOB'}`);
    console.log(`     Attempts: ${inv.attempt_count || 'N/A'}`);
    console.log(`     Error: ${inv.last_error_message || 'NONE'}`);
    console.log(`     Job Created: ${inv.job_created_at || 'N/A'}\n`);
  });

  await pool.end();
}

main().catch(console.error);
