import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const companyId = Number(process.argv[2] || 54);
const csvPath = process.argv[3] || "tmp/product-costs.csv";
const data = fs.readFileSync(csvPath, "utf8");

const rows = data
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(1)
  .map((line, index) => {
    const parts = line.split(",");
    const department = parts.pop()?.trim();
    const costRaw = parts.pop()?.trim();
    const name = parts.join(",").trim();
    const cost = Number(costRaw);
    if (!name || !department || !Number.isFinite(cost)) {
      throw new Error(`Bad row ${index + 2}: ${line}`);
    }
    return { name, cost, department };
  });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 1000,
  max: 1,
});

const client = await pool.connect();
const summary = {
  suppliedRows: rows.length,
  updatedProducts: 0,
  matchedByNameAndDepartment: 0,
  matchedByNameOnly: 0,
  matchedByCompactName: 0,
  matchedByCompactNameWithoutDepartment: 0,
  matchedByCompatibleCategory: 0,
  matchedByUniquePrefix: 0,
  notFound: [],
  ambiguous: [],
  duplicateInputNames: [],
};

try {
  await client.query("begin");
  const products = await client.query(
    `select id, name, category
     from products
     where company_id = $1`,
    [companyId],
  );

  const norm = (value) => String(value || "").trim().toLowerCase();
  const compact = (value) => norm(value).replace(/[^a-z0-9]/g, "");
  const categoryCompatible = (productCategory, department) => {
    const productNorm = norm(productCategory);
    const deptNorm = norm(department);
    const productCompact = compact(productCategory);
    const deptCompact = compact(department);
    return productNorm === deptNorm
      || productNorm.includes(deptNorm)
      || deptNorm.includes(productNorm)
      || productCompact.includes(deptCompact)
      || deptCompact.includes(productCompact);
  };
  const byName = new Map();
  const byNameAndDepartment = new Map();
  const byCompactName = new Map();
  for (const product of products.rows) {
    const nameKey = norm(product.name);
    const deptKey = `${nameKey}\u0000${norm(product.category)}`;
    const compactNameKey = compact(product.name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    if (!byNameAndDepartment.has(deptKey)) byNameAndDepartment.set(deptKey, []);
    if (!byCompactName.has(compactNameKey)) byCompactName.set(compactNameKey, []);
    byName.get(nameKey).push(product);
    byNameAndDepartment.get(deptKey).push(product);
    byCompactName.get(compactNameKey).push(product);
  }

  const inputNameCounts = new Map();
  for (const row of rows) {
    const key = norm(row.name);
    inputNameCounts.set(key, (inputNameCounts.get(key) || 0) + 1);
  }
  summary.duplicateInputNames = rows
    .filter((row, index, all) => inputNameCounts.get(norm(row.name)) > 1 && all.findIndex((r) => norm(r.name) === norm(row.name)) === index)
    .map((row) => row.name);

  const updatesById = new Map();
  for (const row of rows) {
    const nameKey = norm(row.name);
    const deptKey = `${nameKey}\u0000${norm(row.department)}`;
    let found = byNameAndDepartment.get(deptKey) || [];

    if (found.length === 0) {
      found = byName.get(nameKey) || [];
      if (found.length === 0) {
        const compactName = compact(row.name);
        const compactDepartment = compact(row.department);
        const compactWithoutDepartment = compactName.endsWith(compactDepartment)
          ? compactName.slice(0, -compactDepartment.length)
          : compactName;

        const compactMatches = byCompactName.get(compactName) || [];
        const compactDepartmentMatches = compactMatches.filter((product) => categoryCompatible(product.category, row.department));
        if (compactDepartmentMatches.length > 0) {
          found = compactDepartmentMatches;
          summary.matchedByCompactName += found.length;
        } else if (compactWithoutDepartment && compactWithoutDepartment !== compactName) {
          const compactTrimmedMatches = (byCompactName.get(compactWithoutDepartment) || [])
            .filter((product) => categoryCompatible(product.category, row.department));
          if (compactTrimmedMatches.length > 0) {
            found = compactTrimmedMatches;
            summary.matchedByCompactNameWithoutDepartment += found.length;
          }
        }

        if (found.length === 0) {
          const compatibleNameMatches = (byName.get(nameKey) || [])
            .filter((product) => categoryCompatible(product.category, row.department));
          if (compatibleNameMatches.length > 0) {
            found = compatibleNameMatches;
            summary.matchedByCompatibleCategory += found.length;
          }
        }

        if (found.length === 0) {
          const departmentWords = norm(row.department).split(/\s+/).filter(Boolean);
          const departmentPrefixes = departmentWords.map((_, index) => compact(departmentWords.slice(0, index + 1).join(" ")));
          const variants = new Set([compactName, compactWithoutDepartment].filter(Boolean));
          for (const suffix of [...departmentPrefixes, "abs", "wheelb", "uj"]) {
            if (suffix && compactName.endsWith(suffix)) {
              variants.add(compactName.slice(0, -suffix.length));
            }
          }
          const prefixMatches = products.rows.filter((product) => {
            const productKey = compact(product.name);
            return Array.from(variants).some((sourceKey) => (
              sourceKey.length >= 4
              && productKey.length >= 4
              && (productKey.startsWith(sourceKey) || sourceKey.startsWith(productKey))
              && categoryCompatible(product.category, row.department)
            ));
          });
          if (prefixMatches.length === 1) {
            found = prefixMatches;
            summary.matchedByUniquePrefix += found.length;
          }
        }

        if (found.length === 0) {
          summary.notFound.push(row.name);
          continue;
        }
      } else {
        summary.matchedByNameOnly += found.length;
      }
    } else {
      summary.matchedByNameAndDepartment += found.length;
    }

    if (found.length > 1) {
      summary.ambiguous.push({ name: row.name, matched: found.length });
    }

    for (const product of found) {
      updatesById.set(product.id, {
        id: product.id,
        cost: row.cost.toFixed(2),
        department: row.department,
      });
    }
  }

  const updates = Array.from(updatesById.values());
  if (updates.length > 0) {
    const result = await client.query(
      `update products p
       set cost_price = v.cost,
           category = v.department
       from jsonb_to_recordset($2::jsonb) as v(id int, cost numeric, department text)
       where p.company_id = $1
         and p.id = v.id`,
      [companyId, JSON.stringify(updates)],
    );
    summary.updatedProducts = result.rowCount || 0;
  }

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify(summary, null, 2));
