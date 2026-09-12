import { config } from "dotenv";
config();
import { pool } from "../server/db.js";

async function createCustomerStatementsView() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop the view if it exists so we can recreate it
    await client.query(`DROP VIEW IF EXISTS customer_statements_view CASCADE;`);

    // Create the view
    // A single consolidated view per customer combining:
    // stock_on_hand, open_orders, sales_history, account_balance
    // We can use JSON aggregation to group these into structured JSON.
    const sql = `
CREATE VIEW customer_statements_view AS
SELECT 
    c.id AS customer_id,
    c.company_id,
    c.name AS customer_name,
    c.credit_limit,
    c.opening_balance,
    -- ACCOUNT BALANCE
    COALESCE(SUM(inv.total), 0) AS total_invoiced,
    COALESCE(SUM(inv.paid_amount), 0) AS total_paid,
    (c.opening_balance + COALESCE(SUM(inv.total), 0) - COALESCE(SUM(inv.paid_amount), 0)) AS outstanding_balance,
    
    -- AGING BUCKETS (0-30, 31-60, 61-90, 90+)
    SUM(CASE WHEN inv.status != 'paid' AND CURRENT_DATE - inv.due_date::date <= 30 THEN inv.total - inv.paid_amount ELSE 0 END) AS aging_current,
    SUM(CASE WHEN inv.status != 'paid' AND CURRENT_DATE - inv.due_date::date BETWEEN 31 AND 60 THEN inv.total - inv.paid_amount ELSE 0 END) AS aging_30,
    SUM(CASE WHEN inv.status != 'paid' AND CURRENT_DATE - inv.due_date::date BETWEEN 61 AND 90 THEN inv.total - inv.paid_amount ELSE 0 END) AS aging_60,
    SUM(CASE WHEN inv.status != 'paid' AND CURRENT_DATE - inv.due_date::date > 90 THEN inv.total - inv.paid_amount ELSE 0 END) AS aging_90_plus,

    -- JSON Aggregations for arrays
    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'stock_id', s.id,
                'product_id', p.id,
                'product_name', p.name,
                'customer_sku', cp.customer_sku,
                'quantity', s.quantity,
                'uom', s.uom,
                'warehouse_id', s.location_id,
                'batch_id', s.batch_id,
                'last_movement_date', s.last_movement_date
            )
        ), '[]'::json)
        FROM customer_stock s
        JOIN products p ON p.id = s.product_id
        LEFT JOIN customer_products cp ON cp.product_id = s.product_id AND cp.customer_id = s.customer_id
        WHERE s.customer_id = c.id
    ) AS stock_on_hand,

    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'sales_order_id', so.id,
                'order_number', so.order_number,
                'issue_date', so.issue_date,
                'status', so.status,
                'total', so.total,
                'invoiced_to_date', COALESCE((
                    SELECT SUM(i.total) FROM invoices i WHERE i.sales_order_id = so.id
                ), 0)
            )
        ), '[]'::json)
        FROM sales_orders so
        WHERE so.customer_id = c.id AND so.status NOT IN ('closed', 'draft')
    ) AS open_orders,

    (
        SELECT COALESCE(json_agg(
            json_build_object(
                'invoice_id', i.id,
                'invoice_number', i.invoice_number,
                'issue_date', i.issue_date,
                'due_date', i.due_date,
                'status', i.status,
                'total', i.total,
                'paid_amount', i.paid_amount
            ) ORDER BY i.issue_date DESC
        ), '[]'::json)
        FROM invoices i
        WHERE i.customer_id = c.id
    ) AS sales_history

FROM customers c
LEFT JOIN invoices inv ON inv.customer_id = c.id AND inv.status != 'cancelled'
GROUP BY c.id, c.company_id, c.name, c.credit_limit, c.opening_balance;
    `;

    await client.query(sql);
    await client.query('COMMIT');
    console.log("customer_statements_view created successfully.");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating view:", err);
    throw err;
  } finally {
    client.release();
  }
}

createCustomerStatementsView().then(() => process.exit(0)).catch(() => process.exit(1));
