import "dotenv/config";
import { db, pool } from "../server/db.js";
import { invoices, payments, posShifts } from "../shared/schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";

async function run() {
  console.log("[Backfill] Starting invoice cashier backfill...");

  const before = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(and(eq(invoices.isPos, true), isNull(invoices.createdBy)));

  const beforeCount = Number(before[0]?.count || 0);
  console.log(`[Backfill] POS invoices with NULL createdBy before: ${beforeCount}`);

  const pass1 = await db.execute(sql`
    update invoices i
    set created_by = s.user_id
    from pos_shifts s
    where i.is_pos = true
      and i.created_by is null
      and i.shift_id = s.id
      and s.user_id is not null
  `);
  console.log(`[Backfill] Pass 1 (from shift user) updated rows: ${pass1.rowCount ?? 0}`);

  const pass2 = await db.execute(sql`
    update invoices i
    set created_by = p.created_by
    from (
      select distinct on (invoice_id) invoice_id, created_by
      from payments
      where created_by is not null
      order by invoice_id, created_at desc
    ) p
    where i.is_pos = true
      and i.created_by is null
      and i.id = p.invoice_id
  `);
  console.log(`[Backfill] Pass 2 (from payment creator) updated rows: ${pass2.rowCount ?? 0}`);

  const after = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(and(eq(invoices.isPos, true), isNull(invoices.createdBy)));

  const afterCount = Number(after[0]?.count || 0);
  console.log(`[Backfill] POS invoices with NULL createdBy after: ${afterCount}`);
  console.log(`[Backfill] Total fixed: ${beforeCount - afterCount}`);
}

run()
  .catch((err) => {
    console.error("[Backfill] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
