/**
 * Create or update a Zoho Books connection for a company.
 *
 * Run with:
 *   npx tsx scripts/connect-zoho-books.ts \
 *     --company-id 1 \
 *     --org-id 60000000000 \
 *     --client-id 1000.XXXX \
 *     --client-secret XXXX \
 *     --refresh-token 1000.XXXX \
 *     --region com
 *
 * Values may also be supplied through ZOHO_* environment variables.
 */

import "dotenv/config";
import crypto from "crypto";
import { Pool } from "pg";

const REGIONS: Record<string, { apiRoot: string; accountsServer: string }> = {
  com: {
    apiRoot: "https://www.zohoapis.com/books/v3",
    accountsServer: "https://accounts.zoho.com",
  },
  eu: {
    apiRoot: "https://www.zohoapis.eu/books/v3",
    accountsServer: "https://accounts.zoho.eu",
  },
  in: {
    apiRoot: "https://www.zohoapis.in/books/v3",
    accountsServer: "https://accounts.zoho.in",
  },
  "com.au": {
    apiRoot: "https://www.zohoapis.com.au/books/v3",
    accountsServer: "https://accounts.zoho.com.au",
  },
  jp: {
    apiRoot: "https://www.zohoapis.jp/books/v3",
    accountsServer: "https://accounts.zoho.jp",
  },
};

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    if (current.includes("=")) {
      const [key, ...rest] = current.slice(2).split("=");
      args[key] = rest.join("=");
    } else {
      const key = current.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const companyId = Number(args["company-id"] || process.env.ZOHO_COMPANY_ID);
const orgId = String(args["org-id"] || process.env.ZOHO_ORG_ID || "").trim();
const clientId = String(args["client-id"] || process.env.ZOHO_CLIENT_ID || "").trim();
const clientSecret = String(
  args["client-secret"] || process.env.ZOHO_CLIENT_SECRET || "",
).trim();
const refreshToken = String(
  args["refresh-token"] || process.env.ZOHO_REFRESH_TOKEN || "",
).trim();
const region = String(args.region || process.env.ZOHO_REGION || "com").trim();
const webhookSecret =
  String(args["webhook-secret"] || process.env.ZOHO_WEBHOOK_SECRET || "").trim() || null;
const explicitWebhookToken = String(
  args["webhook-token"] || process.env.ZOHO_WEBHOOK_TOKEN || "",
).trim();
const settingsRaw = String(
  args.settings || process.env.ZOHO_SETTINGS_JSON || "",
).trim();

const missing = [
  ["company-id", companyId],
  ["org-id", orgId],
  ["client-id", clientId],
  ["client-secret", clientSecret],
  ["refresh-token", refreshToken],
].filter(([, value]) => !value);

if (missing.length > 0) {
  console.error(`Missing required arguments: ${missing.map(([key]) => key).join(", ")}`);
  process.exit(1);
}

if (!REGIONS[region]) {
  console.error(`Unknown region "${region}". Use one of: ${Object.keys(REGIONS).join(", ")}`);
  process.exit(1);
}

let settings: Record<string, any> | null = null;
if (settingsRaw) {
  try {
    settings = JSON.parse(settingsRaw);
  } catch (err: any) {
    console.error(`Invalid --settings JSON: ${err.message}`);
    process.exit(1);
  }
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const company = await pool.query("SELECT id, name, api_key FROM companies WHERE id = $1", [
      companyId,
    ]);
    if (company.rows.length === 0) {
      console.error(`Company ${companyId} not found`);
      process.exit(1);
    }

    const existing = await pool.query(
      "SELECT webhook_token, webhook_secret FROM zoho_connections WHERE company_id = $1 AND org_id = $2",
      [companyId, orgId],
    );

    const webhookToken =
      explicitWebhookToken ||
      existing.rows[0]?.webhook_token ||
      crypto.randomBytes(24).toString("hex");
    const resolvedSecret = webhookSecret ?? existing.rows[0]?.webhook_secret ?? null;
    const endpoints = REGIONS[region];

    const result = await pool.query(
      `INSERT INTO zoho_connections
         (company_id, org_id, region, api_root, accounts_server, client_id, client_secret,
          refresh_token, webhook_token, webhook_secret, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (company_id, org_id) DO UPDATE SET
         region = EXCLUDED.region,
         api_root = EXCLUDED.api_root,
         accounts_server = EXCLUDED.accounts_server,
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         refresh_token = EXCLUDED.refresh_token,
         webhook_token = EXCLUDED.webhook_token,
         webhook_secret = COALESCE(EXCLUDED.webhook_secret, zoho_connections.webhook_secret),
         settings = COALESCE(EXCLUDED.settings, zoho_connections.settings),
         access_token = NULL,
         token_expires_at = NULL,
         updated_at = now()
       RETURNING id, webhook_token, webhook_secret`,
      [
        companyId,
        orgId,
        region,
        endpoints.apiRoot,
        endpoints.accountsServer,
        clientId,
        clientSecret,
        refreshToken,
        webhookToken,
        resolvedSecret,
        settings ? JSON.stringify(settings) : null,
      ],
    );

    const row = result.rows[0];
    const baseUrl = (process.env.PUBLIC_BASE_URL || "https://fiscalstack.co.zw").replace(
      /\/+$/,
      "",
    );

    console.log("");
    console.log(`Zoho Books connection saved for company ${companyId} (${company.rows[0].name})`);
    console.log("");
    console.log("Webhook URL:");
    console.log(`  ${baseUrl}/api/webhooks/zoho-books/${row.webhook_token}`);
    if (row.webhook_secret) {
      console.log("");
      console.log("Webhook secret (signature verification):");
      console.log(`  ${row.webhook_secret}`);
    }
    if (!company.rows[0].api_key) {
      console.log("");
      console.log(
        "WARNING: this company has no API key. Generate one in FiscalStack before the automation can fiscalise.",
      );
    }
    console.log("");
    console.log("Next: create the invoice custom fields and workflow rule in Zoho Books.");
    console.log("See docs/zoho-books-automation.md");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
