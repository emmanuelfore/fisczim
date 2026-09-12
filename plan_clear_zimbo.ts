import { db } from "./server/db";
import { sql } from "drizzle-orm";

const companyId = 89;

async function main() {
  console.log(`Starting to clear data for company ${companyId}...`);

  // First, we find all foreign key relationships in the database
  const fkQuery = await db.execute(sql`
    SELECT
        tc.table_name AS child_table,
        kcu.column_name AS child_column,
        ccu.table_name AS parent_table,
        ccu.column_name AS parent_column
    FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
  `);

  const relations = fkQuery.rows;
  
  // Find all tables that have a company_id column
  const tablesWithCompanyIdRes = await db.execute(sql`
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'company_id' AND table_schema = 'public'
  `);
  const baseTables = tablesWithCompanyIdRes.rows.map(r => r.table_name as string);

  // Filter out tables we DO NOT want to delete data from
  const excludeTables = [
    'companies', 'company_users', 'company_roles', 'company_access_roles', 
    'branches', 'users', 'tax_types', 'tax_categories', 'currencies', 
    'departments', 'positions', 'approval_requests', 'company_partners'
  ];
  
  const tablesToClear = new Set<string>();
  
  baseTables.forEach(t => {
    if (!excludeTables.includes(t)) {
      tablesToClear.add(t);
    }
  });

  // Find child tables that reference our base tables (like invoice_items referencing invoices)
  // We'll do a few passes to find indirect children too
  let added = true;
  while (added) {
    added = false;
    for (const rel of relations) {
      if (tablesToClear.has(rel.parent_table as string) && !excludeTables.includes(rel.child_table as string) && !tablesToClear.has(rel.child_table as string)) {
        tablesToClear.add(rel.child_table as string);
        added = true;
      }
    }
  }

  const tablesArray = Array.from(tablesToClear);
  console.log(`Found ${tablesArray.length} tables to clear.`);

  // Build a dependency map to know which tables to clear first (children before parents)
  const edges: { [child: string]: string[] } = {};
  tablesArray.forEach(t => edges[t] = []);

  for (const rel of relations) {
    const child = rel.child_table as string;
    const parent = rel.parent_table as string;
    if (tablesArray.includes(child) && tablesArray.includes(parent)) {
      // Avoid self-references in dependency graph
      if (child !== parent) {
        edges[child].push(parent);
      }
    }
  }

  // Topological sort
  const sorted: string[] = [];
  const visited: { [key: string]: boolean } = {};
  const inPath: { [key: string]: boolean } = {};

  function visit(node: string) {
    if (inPath[node]) return; // Cycle detected, ignore for simple sorting
    if (!visited[node]) {
      inPath[node] = true;
      for (const parent of edges[node] || []) {
        visit(parent);
      }
      inPath[node] = false;
      visited[node] = true;
      sorted.push(node);
    }
  }

  tablesArray.forEach(t => visit(t));
  
  // `sorted` contains tables such that parents come before children.
  // We want to delete children BEFORE parents, so we reverse it.
  const deletionOrder = sorted.reverse();
  
  console.log("Deletion order:");
  deletionOrder.forEach((t, i) => console.log(`${i+1}. ${t}`));

  // Generate delete statements
  // Since some tables don't have company_id directly, we must delete using subqueries
  // Actually, a simpler way is to just delete records from base tables in topological order, 
  // but if we delete from child, we need to know its path to company_id.
  
  // A better approach for the script: 
  // We can just use the dependency graph to build DELETE statements with WHERE column IN (SELECT ...)
  
  // But wait! If we do it manually, we can be much more precise.
  
  // Let's use a brute force delete loop:
  // Iterate through all deletionOrder tables.
  // For each table, if it has company_id, delete where company_id = 89.
  // If it doesn't, we can try to find a path. 
  // But wait, what if we just use a generic recursive CTE or simple subquery generation?
  // Let's output the relationships to a file so we can see them.
  console.log("Saving table list to clear_plan.json");
  const fs = require('fs');
  fs.writeFileSync('clear_plan.json', JSON.stringify({ deletionOrder, relations, baseTables }, null, 2));

  process.exit(0);
}

main().catch(console.error);
