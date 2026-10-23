# Zoho Books → FiscalStack automation

## Extension-first installation

The supported integration is the **FiscalStack for Zoho Books extension** in
[`zoho-extension/`](../zoho-extension/). Installing it supplies the invoice
fields, manual fiscalisation button and custom function, sidebar status widgets,
custom views, and PDF template as extension components. The customer
only enters their FiscalStack base URL and API key in the extension setup form;
they do **not** configure Zoho buttons, custom fields, views or templates
manually.

The older server-webhook path below remains available only for organisations
already using it. Do not combine the two paths for one Zoho organisation: both
are capable of submitting the same sent invoice.

```
Zoho Books extension (user selects Fiscalise with FiscalStack)
        │ custom-button function
        ▼
POST /api/v1/fiscalize (company API key)
        │
GET /api/v1/zoho-extension/qr-url (company API key)
        ▼
extension writes its invoice fields → extension PDF template renders QR + proof
```

See [`zoho-extension/README.md`](../zoho-extension/README.md) for publisher and
tenant installation responsibilities.

---

## Legacy server-webhook installation

When a Zoho Books invoice is **sent**, Zoho calls a FiscalStack webhook. FiscalStack
fiscalises the invoice, stores the ZIMRA receipt, writes the fiscal fields back to
the Zoho invoice's custom fields, and exposes a public QR image that the Zoho
invoice template can render.

```
Zoho Books (invoice status = Sent)
        │  workflow rule → webhook
        ▼
POST /api/webhooks/zoho-books/<webhook-token>
        │  1. verify signature (optional)
        │  2. fetch invoice + contact from Zoho Books API
        │  3. POST /api/v1/fiscalize (internal, company API key)
        │  4. PUT invoice custom_fields
        ▼
GET /api/public/fiscal/qr?c=<companyId>&invoice=<no>&t=<token>
        │  (URL stored in "Fiscal QR Image")
        ▼
Zoho invoice template shows QR + fiscal fields
```

## 1. Apply the database migration

```bash
psql "$DATABASE_URL" -f migrations/0071_zoho_books_automation.sql
# or, if you manage schema with drizzle-kit:
npm run db:push
```

This creates `zoho_connections` and `zoho_fiscal_events`.

## 2. Create a Zoho OAuth client

1. Open <https://api-console.zoho.com> and create a **Self Client**.
2. Generate a code with scopes:
   `ZohoBooks.invoices.ALL,ZohoBooks.contacts.READ,ZohoBooks.settings.READ`
3. Exchange the code for a **refresh token**:

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d grant_type=authorization_code \
  -d client_id=... -d client_secret=... \
  -d code=... -d redirect_uri=https://www.zoho.com/books
```

## 3. Save the connection

```bash
npm run zoho:connect -- \
  --company-id 1 \
  --org-id 60000000000 \
  --client-id 1000.XXXX \
  --client-secret XXXX \
  --refresh-token 1000.XXXX \
  --region com \
  --webhook-secret "a-random-12-to-50-char-secret"
```

The script prints the webhook URL. Re-running it preserves the existing webhook
token/secret unless you pass new ones.

Optional settings (`--settings '<json>'` or `ZOHO_SETTINGS_JSON`):

```json
{
  "invoiceNumberPrefix": "ZOHO-",
  "paymentMethod": "CASH",
  "sentStatuses": ["sent", "viewed", "overdue"],
  "resendEmail": true,
  "taxMap": { "Standard Rate": "STANDARD", "Zero Rated": "ZERO_RATED", "Exempt": "EXEMPT" },
  "customFieldLabels": { "fiscalCode": "ZIMRA Hash", "qrImage": "QR Code Image" }
}
```

> The company must have an API key (FiscalStack → Settings → API). The internal
> fiscalisation call authenticates with it.

## 4. Create invoice custom fields in Zoho Books

Settings → Preferences → Invoices → **Custom Fields** (or Settings →
Customization → Custom Fields → Invoices). Create fields with these labels:

| Label | Purpose |
| --- | --- |
| `Fiscal Code` | ZIMRA fiscal hash |
| `Fiscal QR Image` | URL of the QR PNG (used by the template) |
| `Fiscal QR Data` | Raw QR payload (ZIMRA verification URL) |
| `Fiscal Receipt Counter` | Day receipt counter |
| `Fiscal Receipt Number` | Global receipt number |
| `Fiscal Day` | Fiscal day number |
| `ZIMRA Device ID` | Registered device id |
| `Verification Code` | 16-character receipt verification code |
| `Fiscal Verify URL` | ZIMRA verification URL |
| `Fiscal Status` | `Fiscalised` once complete |
| `Fiscal Date` | Fiscal date |

Labels are matched case/space-insensitively. Missing fields are reported in
`zoho_fiscal_events.details.missingCustomFields` but do not fail fiscalisation.

## 5. Create the webhook

Settings → Automation → **Workflows** → Webhooks → **+ New Webhook**:

- **URL**: the value printed by the connection script
- **Method**: `POST`
- **Body**: `Default Payload` (`application/json`)
- **HTTP Headers** (optional): `X-Zoho-Webhook-Token: <webhook-token>`
- **Security**: tick *I want to secure this webhook with a secret token* and enter
  the same `--webhook-secret` value (sent as `X-Zoho-Webhook-Signature`)

## 6. Create the workflow rule (trigger: invoice sent)

Settings → Automation → **Workflow Rules** → **+ New Workflow Rule**:

- Module: **Invoices**
- Workflow Type: **Event Based**
- Action Type: **Edited**
- Execute when: **any field is updated** (or select `Status`)
- Filter the triggers: `Status` `is` `Sent`
- Immediate Action: Type **Webhook** → select the webhook above

The webhook also re-checks the invoice status from the Zoho API, so a stray
event for a draft/void invoice is logged as `skipped` and never fiscalised.

## 7. Show the QR and ZIMRA fields on the invoice template

FiscalStack cannot inject data into a Zoho template at render time, so the
template reads the custom fields written back in step 3.

Settings → Preferences → Invoices → **Templates** → edit your template (HTML
mode). Add a block like the one below and replace the `[[...]]` markers with the
matching custom-field placeholders from the editor's **Insert Placeholder →
Invoice → Custom Fields** menu:

```html
<div class="zimra-fiscal">
  <div class="zimra-qr">
    <img src="[[Fiscal QR Image]]" width="120" height="120" alt="ZIMRA QR" />
  </div>
  <div class="zimra-fields">
    <p><strong>Fiscal Code:</strong> [[Fiscal Code]]</p>
    <p><strong>Receipt No:</strong> [[Fiscal Receipt Number]]</p>
    <p><strong>Fiscal Day:</strong> [[Fiscal Day]]</p>
    <p><strong>Device ID:</strong> [[ZIMRA Device ID]]</p>
    <p><strong>Verification Code:</strong> [[Verification Code]]</p>
    <p><strong>Verify:</strong> <a href="[[Fiscal Verify URL]]">[[Fiscal Verify URL]]</a></p>
    <p><strong>Status:</strong> [[Fiscal Status]]</p>
  </div>
</div>
```

Seller identity (name, address, TIN, VAT) comes from the Zoho organisation
profile; buyer TIN/VAT from the Zoho contact. Make sure those are filled in.

> **Timing note:** Zoho fires the "Sent" webhook when the status changes, which
> is usually the same action that emails the invoice. The fields are written back
> moments later. Set `"resendEmail": true` in the connection settings to have
> FiscalStack re-send the invoice automatically after the write-back, so the
> customer's copy contains the QR. Otherwise re-send manually or use Zoho's
> *Send Later*. FiscalStack stores the receipt, so nothing is lost.

## 8. Verify

```sql
-- Did the event run?
SELECT zoho_invoice_id, invoice_number, status, details, created_at
FROM zoho_fiscal_events
ORDER BY created_at DESC
LIMIT 20;

-- What did we write back?
SELECT invoice_number, fiscal_code, qr_code_data, receipt_global_no, fiscal_day_no, status
FROM invoices
ORDER BY created_at DESC
LIMIT 5;
```

Server logs are tagged `[ZohoWebhook]`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Event `failed`: missing invoice id | Use the **Default Payload** body in the Zoho webhook (or include `invoice_id`). |
| Event `skipped` | Invoice status is not in `sentStatuses`; check the workflow filter. |
| Event `failed`: company has no API key | Generate an API key in FiscalStack settings. |
| Event `failed`: invoice number already exists but is not fiscalised | Set `invoiceNumberPrefix` in the connection settings. |
| `missingCustomFields` in event details | Create the custom fields in Zoho with the labels from step 4. |
| Wrong tax classification | Set `taxMap` in the connection settings. |
| QR image 404 | The invoice is not fiscalised yet, or the URL is stale; re-run the workflow. |

## Security notes

- The webhook is public by design; the random `webhook_token` in the path and
  the optional HMAC signature protect it.
- The QR endpoint is public but requires the HMAC token embedded in the URL.
- OAuth credentials and refresh tokens are stored in `zoho_connections`; restrict
  database access accordingly.
