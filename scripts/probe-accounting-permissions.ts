import "dotenv/config";
import { generateAccessToken } from "../server/lib/jwt.js";
import { db } from "../server/db.js";

const base = process.env.PROBE_BASE || "http://127.0.0.1:5001";

async function tokenFor(email: string) {
  const r: any = await db.execute(`select id, email from users where lower(email)=lower('${email}')`);
  const u = (r.rows ?? r)[0];
  if (!u) throw new Error(`no user ${email}`);
  return { token: generateAccessToken({ userId: u.id, email: u.email, name: u.email }), userId: u.id };
}

async function post(path: string, token: string, body: any) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  console.log(`${res.status} POST ${path} -> ${text.slice(0, 110).replace(/\s+/g, " ")}`);
}

async function main() {
  const cashier = await tokenFor("johnmoyo@gmail.com");
  const owner = await tokenFor("demo@zimra.com");

  console.log("--- cashier (company 2) : expect 403 everywhere ---");
  await post("/api/accounting/journal/999999/reverse?companyId=2", cashier.token, {});
  await post("/api/accounting/accounts?companyId=2", cashier.token, {});
  await post("/api/accounting/transfer?companyId=2", cashier.token, {});
  await post("/api/accounting/cashbook?companyId=2", cashier.token, {});
  await post("/api/accounting/periods/year-end-close?companyId=2", cashier.token, {});

  console.log("--- owner (company 1) : guard must NOT block, bogus id only ---");
  await post("/api/accounting/journal/999999/reverse?companyId=1", owner.token, {});
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
