import { supabaseAdmin } from "../server/supabase.js";
import { users, companyUsers } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { db } from "../server/db.js";
if (!supabaseAdmin) { console.log("no admin client"); process.exit(1); }
const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) { console.log("list error:", error.message); process.exit(1); }
const interesting = (data?.users || []).filter(u => {
  const e = (u.email || "").toLowerCase();
  return e.includes("moyo") || e.includes("conductor") || e.includes("rhymy") || e.includes("fore");
});
for (const u of interesting) {
  const dbUser = await db.select().from(users).where(eq(users.id, u.id)).limit(1).then(r => r[0]);
  const links = await db.select().from(companyUsers).where(eq(companyUsers.userId, u.id));
  console.log(u.email, "=> id:", u.id, "| dbUser:", dbUser ? "yes" : "NO", "| links:", links.length, links.map(l => `${l.companyId}:${l.role}`).join(",") || "NONE");
}
process.exit(0);
