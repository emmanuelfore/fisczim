import { db } from "./server/db.js";
import { sql } from "drizzle-orm";
import * as schema from "./shared/schema.js";

async function checkMissing() {
  const result = await db.execute(sql`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
  `);
  
  const dbTables = new Map();
  for (const row of result.rows) {
    if (!dbTables.has(row.table_name)) {
      dbTables.set(row.table_name, new Set());
    }
    dbTables.get(row.table_name).add(row.column_name);
  }

  console.log("Checking for missing tables and columns...");
  
  // schema exports are pgTable objects, which have Symbol(drizzle:Name) internally, but we can just use the config
  const missing = [];
  
  for (const key of Object.keys(schema)) {
    const table = schema[key];
    if (table && table._ && table._.name) {
      const tableName = table._.name;
      const columns = table._.columns;
      
      if (!dbTables.has(tableName)) {
        missing.push(`Table missing: ${tableName}`);
        continue;
      }
      
      const dbCols = dbTables.get(tableName);
      for (const colKey of Object.keys(columns)) {
        const colName = columns[colKey].name;
        if (!dbCols.has(colName)) {
          missing.push(`Column missing: ${tableName}.${colName}`);
        }
      }
    }
  }
  
  if (missing.length === 0) {
    console.log("No missing tables or columns found!");
  } else {
    console.log("Missing items:");
    for (const item of missing) {
      console.log(item);
    }
  }
  
  process.exit(0);
}

checkMissing().catch(err => {
  console.error(err);
  process.exit(1);
});
