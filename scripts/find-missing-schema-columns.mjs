import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const schema = await import("../shared/schema.ts");

const tableNameSymbol = Symbol.for("drizzle:Name");
const columnsSymbol = Symbol.for("drizzle:Columns");

function sqlType(column) {
  const type = column.getSQLType();
  if (type === "serial") return "serial";
  return type;
}

function defaultSql(column) {
  const defaultValue = column.default;
  if (defaultValue === undefined) return "";
  if (typeof defaultValue === "number") return ` DEFAULT ${defaultValue}`;
  if (typeof defaultValue === "boolean") return ` DEFAULT ${defaultValue}`;
  if (typeof defaultValue === "string") return ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
  if (defaultValue?.queryChunks) {
    const text = defaultValue.queryChunks
      .map((chunk) => chunk.value?.join?.("") ?? "")
      .join("");
    return text ? ` DEFAULT ${text}` : "";
  }
  return "";
}

function columnDefinition(column) {
  const clauses = [`"${column.columnName}"`, column.type];
  if (column.primary) clauses.push("PRIMARY KEY");
  if (column.notNull && !column.primary) clauses.push("NOT NULL");
  if (column.defaultClause) clauses.push(column.defaultClause.trim());
  return clauses.join(" ");
}

function createTableSql(table) {
  const columns = table.columns
    .map((column) => `  ${columnDefinition(column)}`)
    .join(",\n");
  return `CREATE TABLE IF NOT EXISTS "${table.tableName}" (\n${columns}\n);`;
}

const tables = Object.entries(schema)
  .map(([exportName, value]) => ({ exportName, value }))
  .filter(({ value }) => value && typeof value === "object" && value[tableNameSymbol] && value[columnsSymbol])
  .map(({ exportName, value }) => ({
    exportName,
    tableName: value[tableNameSymbol],
    columns: Object.values(value[columnsSymbol]).map((column) => ({
      propertyName: column.name,
      columnName: column.name,
      type: sqlType(column),
      defaultClause: defaultSql(column),
      notNull: Boolean(column.notNull),
      primary: Boolean(column.primary),
    })),
  }));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const existing = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `);

  const existingTables = new Set(existing.rows.map((row) => row.table_name));
  const existingColumns = new Set(existing.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingTableDefs = tables
    .filter((table) => !existingTables.has(table.tableName))
    .sort((a, b) => a.tableName.localeCompare(b.tableName));
  const missingTables = missingTableDefs.map((table) => table.tableName);
  const missing = [];

  for (const table of tables) {
    if (!existingTables.has(table.tableName)) continue;
    for (const column of table.columns) {
      if (!existingColumns.has(`${table.tableName}.${column.columnName}`)) {
        missing.push({ table: table.tableName, ...column });
      }
    }
  }

  const grouped = new Map();
  for (const column of missing) {
    if (!grouped.has(column.table)) grouped.set(column.table, []);
    grouped.get(column.table).push(column);
  }

  const statements = missingTableDefs.map(createTableSql);
  for (const [table, columns] of grouped) {
    for (const column of columns) {
      statements.push(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column.columnName}" ${column.type}${column.defaultClause};`
      );
    }
  }

  const result = { missingTables, missing, sql: statements.join("\n") };
  const writeIndex = process.argv.indexOf("--write-sql");
  if (writeIndex !== -1) {
    const file = process.argv[writeIndex + 1];
    if (!file) {
      console.error("--write-sql requires a file path.");
      process.exitCode = 1;
    } else {
      fs.writeFileSync(file, `${result.sql}\n`);
      console.log(JSON.stringify({
        missingTables: result.missingTables,
        missingColumnCount: result.missing.length,
        file,
      }, null, 2));
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await client.end();
}
