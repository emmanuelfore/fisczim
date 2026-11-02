import "dotenv/config";
import { generateAccessToken } from "../server/lib/jwt.js";
import { storage } from "../server/storage.js";
import { db } from "../server/db.js";

const base = process.env.PROBE_BASE || "http://127.0.0.1:5001";

async function main() {
  const found: any = await db.execute(
    `select u.id, u.email, cu.company_id, cu.role
       from users u
       join company_users cu on cu.user_id = u.id
      where coalesce(u.is_super_admin, false) = false
      order by cu.company_id, u.id limit 20`
  );
  const rows = found.rows ?? found;
  // Prefer a member/cashier so we also prove non-owner roles are still scoped.
  const user: any = rows.find((r: any) => r.role !== "owner") ?? rows[0];
  if (!user) throw new Error("no non-superadmin user found");
  console.log(`candidates: ${rows.slice(0, 5).map((r: any) => `${r.email}/${r.role}@c${r.company_id}`).join(", ")}`);

  const owned: any[] = await storage.getCompanies(user.id);
  const ownedIds = owned.map((c: any) => Number(c.id));
  const companiesRows: any = await db.execute("select id, name from companies order by id");
  const allCompanies = companiesRows.rows ?? companiesRows;
  const foreign: any = allCompanies.find(
    (c: any) => !ownedIds.includes(Number(c.id)) && Number(c.id) !== Number(user.company_id)
  );

  console.log(`user=${user.email} sessionCompany=${user.company_id} owns=[${ownedIds.join(",")}]`);
  if (!foreign) {
    console.log("NO_FOREIGN_COMPANY — cannot prove cross-tenant block");
    return;
  }
  console.log(`foreignCompany=${foreign.id} (${foreign.name})`);

  const token = generateAccessToken({ userId: user.id, email: user.email ?? "", name: user.email ?? "" });

  const probe = async (label: string, url: string, extra: Record<string, string> = {}) => {
    const res = await fetch(`${base}${url}`, {
      headers: { Authorization: `Bearer ${token}`, ...extra },
    });
    const text = await res.text();
    console.log(`[${label}] ${res.status} ${url} -> ${text.slice(0, 100).replace(/\s+/g, " ")}`);
  };

  await probe("own-query-param", `/api/accounting/trial-balance?companyId=${user.company_id}`);
  await probe("own-session-default", "/api/accounting/trial-balance");
  await probe("FOREIGN-query-param", `/api/accounting/trial-balance?companyId=${foreign.id}`);
  await probe("FOREIGN-accounts", `/api/accounting/accounts?companyId=${foreign.id}`);
  await probe("FOREIGN-journal", `/api/accounting/journal?companyId=${foreign.id}`);
  await probe("FOREIGN-header", "/api/accounting/trial-balance", { "X-Company-ID": String(foreign.id) });
}

main().catch((e) => { console.error(e); process.exit(1); });
