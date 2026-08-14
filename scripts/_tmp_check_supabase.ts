import { supabaseAdmin } from "../server/supabase.js";
import { users, companyUsers } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { db } from "../server/db.js";
if (!supabaseAdmin) { console.log("no admin client"); process.exit(1); }
const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) { console.log("list error:", error.message); process.exit(1); }
for (const u of data?.users || []) {
  const dbUser = await db.select().from(users).where(eq(users.id, u.id)).limit(1).then(r => r[0]);
  if (!dbUser) { console.log("SUPABASE-ONLY (no DB user):", u.email, u.id); continue; }
  const links = await db.select().from(companyUsers).where(eq(companyUsers.userId, u.id));
  console.log(u.email, "dbUser:", dbUser.email, "links:", links.length, links.map(l => `${l.companyId}:${l.role}`).join(",") || "NONE");
}
process.exit(0);
