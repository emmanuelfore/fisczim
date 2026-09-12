import { db } from "./server/db.js";
import { companies, apiLogs } from "./shared/schema.js";
import { eq, desc } from "drizzle-orm";
import * as http from "http";

async function run() {
  // Get any company with an API key
  const company = await db.query.companies.findFirst({
    where: (companies, { isNotNull }) => isNotNull(companies.apiKey)
  });

  if (!company) {
    console.log("No company with API key found.");
    process.exit(0);
  }
  console.log(`Testing with company ${company.id}, key ${company.apiKey}`);

  // Create a minimal JSON payload to trigger schema validation error (which should still be logged!)
  const payload = JSON.stringify({ items: [] });
  
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/fiscalize',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      'x-api-key': company.apiKey
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      console.log("Response status:", res.statusCode);
      
      // Wait a moment for async logger to finish
      await new Promise(r => setTimeout(r, 1000));

      const logs = await db.select()
        .from(apiLogs)
        .where(eq(apiLogs.companyId, company.id))
        .orderBy(desc(apiLogs.createdAt))
        .limit(1);

      console.log("Latest log endpoint:", logs[0]?.endpoint);
      console.log("Latest log status:", logs[0]?.statusCode);
      process.exit(0);
    });
  });

  req.on('error', e => {
    console.error(`Problem with request: ${e.message}`);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}
run();
