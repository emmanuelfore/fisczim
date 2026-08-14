import "dotenv/config";
import { db, pool } from "../server/db";
import { companyUsers } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

async function fix() {
    await db.update(companyUsers)
      .set({ role: "cashier" })
      .where(inArray(companyUsers.userId, [
          "f1f678a1-d654-4a79-9470-3109781da4a1", // emmanuelfore22
          "9699e9d3-5777-45ef-888c-7bcf957480d2", // foreemmanuel
          "c5769539-38fb-4558-9c91-df80c7b44cdf"  // johnmoyo
      ]));
    console.log("Restored back to cashiers in company 2.");
    pool.end();
}
fix();
