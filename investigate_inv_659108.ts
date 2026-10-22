import 'dotenv/config';
import { pool } from "./server/db.js";

async function main() {
  const invoiceNumber = "INV-659108";

  console.log(`=== Investigating invoice ${invoiceNumber} ===\n`);

  // 1. Find the invoice
  const invoiceRes = await pool.query(`
    SELECT i.*, c.name as company_name, c.vat_registered
    FROM invoices i
    JOIN companies c ON c.id = i.company_id
    WHERE i.invoice_number = $1
  `, [invoiceNumber]);

  if (invoiceRes.rows.length === 0) {
    console.log(`❌ Invoice ${invoiceNumber} not found`);
    await pool.end();
    return;
  }

  const invoice = invoiceRes.rows[0];
  console.log("📄 INVOICE DETAILS:");
  console.log(`  ID: ${invoice.id}`);
  console.log(`  Company: ${invoice.company_name} (ID: ${invoice.company_id})`);
  console.log(`  VAT Registered: ${invoice.vat_registered}`);
  console.log(`  Status: ${invoice.status}`);
  console.log(`  FDMS Status: ${invoice.fdms_status}`);
  console.log(`  Validation Status: ${invoice.validation_status}`);
  console.log(`  Fiscal Code: ${invoice.fiscal_code || 'NULL'}`);
  console.log(`  Fiscal Day No: ${invoice.fiscal_day_no}`);
  console.log(`  Created At: ${invoice.created_at}`);
  console.log(`  Is POS: ${invoice.is_pos}`);
  console.log(`  Total: ${invoice.total}`);
  console.log(`  Currency: ${invoice.currency}\n`);

  // 2. Find fiscalization job
  const jobRes = await pool.query(`
    SELECT * FROM fiscalization_jobs
    WHERE invoice_id = $1
    ORDER BY created_at DESC
  `, [invoice.id]);

  if (jobRes.rows.length === 0) {
    console.log(`❌ No fiscalization job found for invoice ${invoiceNumber}`);
  } else {
    console.log(`📋 FISCALIZATION JOBS (${jobRes.rows.length} found):`);
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

  // 3. Find ZIMRA logs
  const zimraLogsRes = await pool.query(`
    SELECT * FROM zimra_logs
    WHERE invoice_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [invoice.id]);

  if (zimraLogsRes.rows.length === 0) {
    console.log(`❌ No ZIMRA logs found for invoice ${invoiceNumber}`);
  } else {
    console.log(`📡 ZIMRA LOGS (${zimraLogsRes.rows.length} found):`);
    zimraLogsRes.rows.forEach((log, idx) => {
      console.log(`  Log #${idx + 1}:`);
      console.log(`    ID: ${log.id}`);
      console.log(`    Endpoint: ${log.endpoint}`);
      console.log(`    Status Code: ${log.status_code || 'NULL'}`);
      console.log(`    Error Message: ${log.error_message || 'NULL'}`);
      console.log(`    Created At: ${log.created_at}`);
      console.log(`    Request Payload (first 500 chars): ${log.request_payload ? JSON.stringify(log.request_payload).slice(0, 500) : 'NULL'}`);
      console.log(`    Response Payload (first 500 chars): ${log.response_payload ? JSON.stringify(log.response_payload).slice(0, 500) : 'NULL'}\n`);
    });
  }

  // 4. Check for other failed invoices from same company
  const failedInvoicesRes = await pool.query(`
    SELECT i.invoice_number, i.status, i.fdms_status, i.fiscal_code, i.created_at,
           fj.status as job_status, fj.last_error_message, fj.attempt_count
    FROM invoices i
    LEFT JOIN fiscalization_jobs fj ON i.id = fj.invoice_id
    WHERE i.company_id = $1
      AND i.fiscal_code IS NULL
      AND COALESCE(i.status, '') <> 'cancelled'
      AND i.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY i.created_at DESC
    LIMIT 20
  `, [invoice.company_id]);

  console.log(`\n📊 OTHER NON-FISCALIZED INVOICES (last 7 days):`);
  console.log(`  Total: ${failedInvoicesRes.rows.length}`);
  failedInvoicesRes.rows.forEach((inv, idx) => {
    console.log(`  ${idx + 1}. ${inv.invoice_number} - FDMS: ${inv.fdms_status}, Job: ${inv.job_status}, Attempts: ${inv.attempt_count}, Error: ${inv.last_error_message || 'NONE'}`);
  });

  await pool.end();
}

main().catch(console.error);
