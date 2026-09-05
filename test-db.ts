import { db } from "./server/db";
import { companies } from "./shared/schema";

async function test() {
  try {
    const res = await db.select().from(companies).limit(1);
    console.log("Success:", res.length);
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
test();
