import "dotenv/config";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "../server/db.js";
import { generateAccessToken } from "../server/lib/jwt.js";
import { journalEntries } from "../shared/schema.js";

const base = process.env.PROBE_BASE || "http://127.0.0.1:5001";
const companyId = Number(process.env.PROBE_COMPANY ?? 1);

async function token() {
  // The token is minted from the real user row, so the subject is never a default.
  const email = process.env.PROBE_USER;
  if (!email) throw new Error("PROBE_USER must name an admin user email");
  const r: any = await db.execute(sql`select id, email from users where lower(email)=lower(${email})`);
  const u = (r.rows ?? r)[0];
  if (!u) throw new Error(`no user ${email}`);
  return generateAccessToken({ userId: u.id, email: u.email, name: u.email });
}

async function get(path: string, token: string) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (res.status !== 200) {
    console.log(`${res.status} GET ${path} -> ${text.slice(0, 120).replace(/\s+/g, " ")}`);
  }
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

async function post(path: string, token: string, body?: any) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  console.log(`${res.status} POST ${path} -> ${text.slice(0, 120).replace(/\s+/g, " ")}`);
}

async function main() {
  const jwt = await token();

  // pick the most recent journal date and the newest journal on it
  const latest = await db.select({ d: sql<string>`max(date(${journalEntries.entryDate}))` })
    .from(journalEntries).where(eq(journalEntries.companyId, companyId));
  const asOf = latest[0].d;
  if (!asOf) throw new Error(`company ${companyId} has no journals`);

  const onDay = await db.select({ n: sql<number>`count(distinct ${journalEntries.id})` })
    .from(journalEntries)
    .where(and(eq(journalEntries.companyId, companyId), sql`date(${journalEntries.entryDate}) = ${asOf}`));
  console.log(`as-of ${asOf} has ${Number((onDay[0] as any).n)} journal(s) on that exact day`);

  const tb = await get(`/api/accounting/trial-balance?date=${asOf}&companyId=${companyId}`, jwt);
  const rows: any[] = tb.json?.lines ?? [];
  const debitTotal = Number(tb.json?.totalDebit ?? rows.reduce((s, r) => s + Number(r.debit || 0), 0));

  // getTrialBalance reports a net balance per account, so mirror that here and
  // compare the as-of day included against dropped — the bug being verified.
  const netTotals = async (bound: string) => {
    const r: any = await db.execute(sql`
      with nets as (
        select le.account_id,
               sum(case when le.type='DEBIT' then le.amount::numeric else -le.amount::numeric end) net
        from ledger_entries le
        join journal_entries je on je.id = le.journal_entry_id
        where je.company_id = ${companyId} and je.entry_date::date ${sql.raw(bound)} ${asOf}::date
        group by 1
      )
      select coalesce(sum(greatest(net,0)),0) debit, count(*) accounts from nets`);
    const row = (r.rows ?? r)[0];
    return { debit: Number(row.debit), accounts: Number(row.accounts) };
  };
  const truthDebitData = await netTotals("<=");
  const beforeDebitData = await netTotals("<");
  const truthDebit = truthDebitData.debit;
  const beforeDebit = beforeDebitData.debit;

  console.log(`trial-balance @${asOf}: http=${debitTotal.toFixed(2)} sql(inclusive)=${truthDebit.toFixed(2)} sql(exclusive of that day)=${beforeDebit.toFixed(2)}`);
  console.log(`as-of day included: ${Math.abs(debitTotal - truthDebit) < 0.01 ? "YES" : "NO"}`);
  const pl = await get(`/api/accounting/reports/profit-and-loss?to=${asOf}&companyId=${companyId}`, jwt);
  console.log(`profit-and-loss ${pl.status} keys=${Object.keys(pl.json || {}).join(",").slice(0, 60)}`);
  const bs = await get(`/api/accounting/reports/balance-sheet?date=${asOf}&companyId=${companyId}`, jwt);
  console.log(`balance-sheet ${bs.status} keys=${Object.keys(bs.json || {}).join(",").slice(0, 60)}`);
  const cf = await get(`/api/accounting/reports/cash-flow?from=2000-01-01&to=${asOf}&companyId=${companyId}`, jwt);
  console.log(`cash-flow ${cf.status} keys=${Object.keys(cf.json || {}).join(",").slice(0, 60)}`);
  const vat = await get(`/api/accounting/reports/vat-return?from=2000-01-01&to=${asOf}&companyId=${companyId}`, jwt);
  const naive: any = await db.execute(sql`
    select coalesce(sum(tax_amount::numeric),0) v from invoices
    where company_id=${companyId}
      and synced_with_fdms = true
      and (validation_status is null or validation_status not in ('red','invalid','grey'))
      and issue_date <= (${asOf}::date + interval '1 day')`);
  const filtered: any = await db.execute(sql`
    select coalesce(sum(tax_amount::numeric),0) v from invoices
    where company_id=${companyId}
      and lower(status) not in ('cancelled','void','draft','quote')
      and synced_with_fdms = true
      and (validation_status is null or validation_status not in ('red','invalid','grey'))
      and issue_date <= (${asOf}::date + interval '1 day')`);
  const excluded: any = await db.execute(sql`
    select status, count(*) n, coalesce(sum(tax_amount::numeric),0) v from invoices
    where company_id=${companyId} and lower(status) in ('cancelled','void','draft','quote')
      and issue_date <= (${asOf}::date + interval '1 day') group by 1`);
  console.log(`vat-return ${vat.status} outputVat=${(vat.json as any)?.outputVat}`);
  console.log(`  every status=${Number((naive.rows ?? naive)[0].v).toFixed(2)} fiscalised+taxable=${Number((filtered.rows ?? filtered)[0].v).toFixed(2)} excluded rows=${JSON.stringify((excluded.rows ?? excluded).map((r: any) => [r.status, r.n, Number(r.v)]))}`);

  console.log("--- stubbed endpoints: expect 501 ---");
  await post(`/api/accounting/budgets?companyId=${companyId}`, jwt, { accountId: 1, period: "2026-01", amount: 1 });
  await post(`/api/accounting/allocations?companyId=${companyId}`, jwt, {});
  await post(`/api/accounting/allocations/run?companyId=${companyId}`, jwt, {});
  await post(`/api/companies/${companyId}/accounting/run-eliminations`, jwt, {});
  await post(`/api/accounting/fixed-assets/999999/dispose?companyId=${companyId}`, jwt, {});
  await post(`/api/accounting/revaluation?companyId=${companyId}`, jwt, { cutOffDate: asOf });
  await get(`/api/accounting/budgets?companyId=${companyId}`, jwt);
  await get(`/api/accounting/allocations?companyId=${companyId}`, jwt);
  await get(`/api/companies/${companyId}/accounting/consolidated-trial-balance`, jwt);

  console.log("--- new permission keys must deny a non-finance role ---");
  const cashierEmail = process.env.PROBE_CASHIER;
  if (!cashierEmail) {
    console.log("PROBE_CASHIER unset; non-finance role check skipped");
  } else {
    const cashier: any = await db.execute(sql`select id, email from users where lower(email)=lower(${cashierEmail})`);
    const cu = (cashier.rows ?? cashier)[0];
    if (!cu) {
      console.log("cashier user not found; skipped");
    } else {
      const cashierJwt = generateAccessToken({ userId: cu.id, email: cu.email, name: cu.email });
      await post(`/api/accounting/budgets?companyId=2`, cashierJwt, { accountId: 1, period: "2026-01", amount: 1 });
      // Revaluation is guarded but returns 501, so a gate failure cannot write.
      await post(`/api/accounting/revaluation?companyId=2`, cashierJwt, { cutOffDate: asOf });
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
