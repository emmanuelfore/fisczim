import { db } from "./server/db";
import { sql } from "drizzle-orm";

const companyId = 89;

async function execute() {
  const statements = [
    `DELETE FROM customer_stock_transactions WHERE customer_stock_id IN (SELECT id FROM customer_stock WHERE customer_id IN (SELECT id FROM customers WHERE company_id = ${companyId}))`,
    `DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE company_id = ${companyId})`,
    `DELETE FROM supplier_payment_allocations WHERE payment_id IN (SELECT id FROM supplier_payments WHERE company_id = ${companyId})`,
    `DELETE FROM sales_order_audit_logs WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE company_id = ${companyId})`,
    
    `DELETE FROM inventory_cost_components WHERE inventory_transaction_id IN (SELECT id FROM inventory_transactions WHERE company_id = ${companyId})`,
    `DELETE FROM ledger_entries WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = ${companyId})`,
    `DELETE FROM goods_issues WHERE company_id = ${companyId}`,
    `DELETE FROM goods_receipts WHERE company_id = ${companyId}`,
    
    `DELETE FROM inventory_transactions WHERE company_id = ${companyId}`,

    `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${companyId})`,
    `DELETE FROM validation_errors WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${companyId})`,
    `DELETE FROM zimra_logs WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${companyId})`,
    `DELETE FROM zimra_logs WHERE company_id = ${companyId}`,
    `DELETE FROM quotation_items WHERE quotation_id IN (SELECT id FROM quotations WHERE company_id = ${companyId})`,
    `DELETE FROM sales_order_items WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE company_id = ${companyId})`,
    `DELETE FROM layby_items WHERE layby_id IN (SELECT id FROM laybys WHERE company_id = ${companyId})`,
    `DELETE FROM layby_payments WHERE layby_id IN (SELECT id FROM laybys WHERE company_id = ${companyId})`,
    
    `DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id = ${companyId})`,
    `DELETE FROM supplier_invoice_items WHERE supplier_invoice_id IN (SELECT id FROM supplier_invoices WHERE company_id = ${companyId})`,
    `DELETE FROM goods_delivery_note_items WHERE gdn_id IN (SELECT id FROM goods_delivery_notes WHERE company_id = ${companyId})`,
    
    `DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE company_id = ${companyId})`,
    `DELETE FROM stock_take_items WHERE stock_take_id IN (SELECT id FROM stock_takes WHERE company_id = ${companyId})`,
    `DELETE FROM journal_entry_draft_lines WHERE journal_entry_id IN (SELECT id FROM journal_entry_drafts WHERE company_id = ${companyId})`,
    `DELETE FROM cashbook_entry_lines WHERE cashbook_entry_id IN (SELECT id FROM cashbook_entries WHERE company_id = ${companyId})`,
    
    `UPDATE invoices SET related_invoice_id = NULL WHERE company_id = ${companyId}`,
    `DELETE FROM payments WHERE company_id = ${companyId}`,
    `DELETE FROM supplier_payments WHERE company_id = ${companyId}`,
    `DELETE FROM invoices WHERE company_id = ${companyId}`,
    `DELETE FROM quotations WHERE company_id = ${companyId}`,
    `DELETE FROM sales_orders WHERE company_id = ${companyId}`,
    `DELETE FROM laybys WHERE company_id = ${companyId}`,
    
    `DELETE FROM purchase_orders WHERE company_id = ${companyId}`,
    `DELETE FROM consignment_purchase_orders WHERE company_id = ${companyId}`,
    `DELETE FROM supplier_invoices WHERE company_id = ${companyId}`,
    `DELETE FROM goods_delivery_notes WHERE company_id = ${companyId}`,
    
    `DELETE FROM stock_transfers WHERE company_id = ${companyId}`,
    `DELETE FROM stock_takes WHERE company_id = ${companyId}`,
    
    `DELETE FROM journal_entry_drafts WHERE company_id = ${companyId}`,
    `DELETE FROM journal_entries WHERE company_id = ${companyId}`,
    `DELETE FROM cashbook_entries WHERE company_id = ${companyId}`,
    `DELETE FROM pos_shifts WHERE company_id = ${companyId}`,
    `DELETE FROM pos_holds WHERE company_id = ${companyId}`,
    
    `DELETE FROM bill_of_materials WHERE company_id = ${companyId}`,
    `DELETE FROM product_serial_numbers WHERE company_id = ${companyId}`,
    `DELETE FROM warranty_claims WHERE company_id = ${companyId}`,
    `DELETE FROM branch_stocks WHERE product_id IN (SELECT id FROM products WHERE company_id = ${companyId})`,
    `DELETE FROM inventory_location_stocks WHERE product_id IN (SELECT id FROM products WHERE company_id = ${companyId})`,
    `DELETE FROM customer_stock WHERE customer_id IN (SELECT id FROM customers WHERE company_id = ${companyId})`,
    `DELETE FROM customer_products WHERE customer_id IN (SELECT id FROM customers WHERE company_id = ${companyId})`,
    `DELETE FROM products WHERE company_id = ${companyId}`,
    `DELETE FROM product_categories WHERE company_id = ${companyId}`,
    `DELETE FROM inventory_locations WHERE company_id = ${companyId}`,
    
    `DELETE FROM bank_statements WHERE company_id = ${companyId}`,
    
    `UPDATE companies SET daily_receipt_count = 0, last_receipt_global_no = 0, current_fiscal_day_no = 0, fiscal_day_open = false, last_fiscal_hash = NULL WHERE id = ${companyId}`
  ];

  let changed = true;
  let iterations = 0;

  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    console.log(`--- Iteration ${iterations} ---`);
    for (const stmt of statements) {
      if (stmt.startsWith('UPDATE')) {
         try {
             await db.execute(sql.raw(stmt));
         } catch (e) {}
         continue;
      }
      try {
        const result: any = await db.execute(sql.raw(stmt));
        if (result.rowCount && result.rowCount > 0) {
            console.log(`Deleted ${result.rowCount} rows: ${stmt.substring(0, 60)}`);
            changed = true;
        }
      } catch (e: any) {
        // Suppress foreign key violation and table does not exist errors, as they are expected during brute force
      }
    }
  }
  
  console.log("Cleanup done after", iterations, "iterations.");
  process.exit(0);
}

execute();
