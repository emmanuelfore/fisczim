# Pass-Through Fiscalization — Integrator Instruction Sheet

**Endpoint:** `POST /api/v1/fiscalize`
**Machine-readable contract:** `GET /api-docs/openapi.json` → `paths["/api/v1/fiscalize"]` → `components.schemas.PassThroughFiscalizePayload`
**Interactive docs:** `GET /api-docs` (tag **Pass-through**)
**Source of truth (validation):** [`server/api/v1/fiscalize.ts`](../server/api/v1/fiscalize.ts) — the Zod schema is authoritative; this sheet mirrors it.

"Pass-through" means: you send a sale, we return a fiscal receipt. You do **not** have to create customers, products or invoices in FiscalStack first, and you never talk to the fiscal authority directly. The one payload works with whichever fiscal provider your company is registered with — the routing happens server-side.

---

## 1. What you need before the first call

| # | Requirement | Where it comes from | If missing |
|---|---|---|---|
| 1 | **API key** in header `X-API-Key` | FiscalStack dashboard → your company's integration/API-key settings | `401 MISSING_API_KEY` / `401 INVALID_API_KEY` |
| 2 | `Content-Type: application/json` | you | `400 VALIDATION_ERROR` |
| 3 | **Registered fiscal device** on the company, or on the branch the invoice belongs to — the device id, activation key, private key and certificate your provider issued | device registration in the dashboard | `422 FISCALIZATION_FAILED` — the message names the company or branch with no device |
| 4 | **Open fiscal day** | `POST /api/v1/fiscal/open-day` (the engine also auto-opens/recovers a stale day) | `422 FISCALIZATION_FAILED` |
| 5 | **Tax types configured** — STANDARD / ZERO_RATED / EXEMPT rates + default HS codes | company tax settings | items fall back to `99001000` / `99002000` / `99003000` and the company default rate |
| 6 | Rate budget | global limiter: 5000 req / 15 min per IP on `/api/*` | `429` |

The key **is** the tenant: company id, currency, VAT rates, device, fiscal-day state and the walk-in customer all come from the company behind the key. Never put a company id in the payload.

Device health, same header, same key — all read-only, safe to poll:

| Call | What it tells you |
|---|---|
| `GET /api/v1/fiscal/status` | Live fiscal-day status from the gateway (`fiscalDayStatus`, `lastFiscalDayNo`, counters) |
| `GET /api/v1/fiscal/config` | Taxpayer identity, operating mode, the live tax table and **`certificateValidTill`** — renew the device certificate before that date; an expired certificate blocks every receipt |
| `GET /api/v1/fiscal/server-certificate` | The gateway's public certificate chain (`?thumbprint=` selects one on some gateways) |

Each returns `{ provider, data }`, where `data` is the raw payload from whichever gateway your company is registered with.

### Renewing the device certificate

When `certificateValidTill` is close, or the gateway starts rejecting receipts with a certificate error:

```bash
curl -X POST "https://fiscalstack.com/api/v1/fiscal/certificate/issue" \
  -H "X-API-Key: $FISCALSTACK_API_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

The response carries `confirmationRequired`. If it is `true`, follow with `POST /api/v1/fiscal/certificate/confirm`; if `false`, the new certificate is already active. The key pair is generated and stored server-side and never returned — send your own `certificateRequest` (PEM CSR) only if the private key must stay with you.

Renewal invalidates cached signing keys, so do it between closing one fiscal day and opening the next, then let every till or desktop client re-provision.

---

## 2. Minimum viable request

A valid, fiscalized receipt from this body alone:

```json
{ "items": [ { "name": "Widget", "quantity": 1, "unitPrice": 100 } ] }
```

```bash
curl -X POST "https://fiscalstack.com/api/v1/fiscalize" \
  -H "X-API-Key: $FISCALSTACK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"name":"Widget","quantity":1,"unitPrice":100}]}'
```

---

## 3. Payload reference

### Top level

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `items` | array (min 1) | **yes** | — | see item table |
| `transactionType` | enum | no | `FiscalInvoice` | `FiscalInvoice` \| `CreditNote` \| `DebitNote` |
| `paymentMethod` | enum | no | `CASH` | `CASH`, `CARD`, `MOBILE`, `TRANSFER`, `BANK_TRANSFER`, `ECOCASH`, `ONE_MONEY`, `EFT`, `RTGS`, `ZIPIT` — mapped to your provider's money type for you |
| `splitPayments` | `[{ method, amount }]` | no | — | split tenders; overrides `paymentMethod`. Amounts **must** sum to the gross total or preflight `RCPT039` rejects |
| `currency` | ISO 4217 | no | **your company currency** | 3 letters, e.g. `USD`, `ZWG`, `LSL`. Omit it unless you bill in a second currency; a code your account does not trade in comes back as a readable `400` |
| `invoiceNumber` | string | no | stored exactly as you send it; auto `INV-xxxx` / `CN-xxxx` / `DN-xxxx` when omitted | must be unique per company → else `409 DUPLICATE_INVOICE` |
| `date` | `YYYY-MM-DD` | no | today | receipt/invoice date |
| `buyer` | object | no | walk-in customer | see buyer table |
| `relatedInvoiceNumber` | string | **when CreditNote/DebitNote** | — | original invoice number, e.g. `INV-197` |
| `creditNoteReason` | string | **when CreditNote/DebitNote** | — | shown as `receiptNotes` |
| `offline*` | — | no | — | `offlineSignature`, `offlineReceiptCounter`, `offlineGlobalReceiptCounter`, `offlinePreviousHash`, `offlineFiscalDay`, `offlineDate` — only for FiscalBridge offline replay; omit for normal integration |

### `items[]`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** | — | appears on the receipt |
| `quantity` | number | **yes** | — | must be `> 0` |
| `unitPrice` | number | **yes** | — | `>= 0`. Tax-**exclusive** unless `taxInclusive: true` |
| `taxType` | enum | no | `STANDARD` | `STANDARD` (company VAT rate) \| `ZERO_RATED` (0%, taxable) \| `EXEMPT` (0%, out of scope) — mapped to your provider's tax ID for you |
| `taxInclusive` | boolean | no | `false` | `true` = `unitPrice` already contains VAT; we strip it |
| `hsCode` | string ≤ 8 | no | by `taxType` | `RCPT048` requires 4 or 8 digits; falls back to the tax type's configured default HS code |
| `sku` | string | no | — | your reference only — not sent to the fiscal authority |
| `discount` | number ≥ 0 | no | — | subtracted from the **line** total (absolute amount, not percent) |
| `additionalTaxes` | array | no | — | Per-line levies, passed through unchanged (only applied by providers that support them): `[{ taxID: number, taxType: "PercentageLevy"\|"FixedValueLevy"\|"WithholdingTax", taxRate: number, appliedForQuantity?: number }]` |

### `buyer` (all optional)

| Field | Rule |
|---|---|
| `name` / `registeredName` / `tradeName` | display names; `registeredName` wins if present |
| `tin` | as issued — 4–20 chars of letters, digits and `- / .`. Shapes vary by authority (fixed-length digits, or `200053040-8` style). Not re-formatted, not digit-gated |
| `vatNumber` | as issued — 4–20 chars; digit length depends on the issuing authority |
| `email` | valid email, ≤ 100 chars |
| `phone` | ≤ 20 chars |
| `province`, `street`, `houseNo`, `city` | granular address |

Buyer rules that come back as `422`: a buyer block is only sent to the fiscal authority when a `tin` is present, and `RCPT043` fires if buyer data has no TIN or no register name. With no identifiers at all, the receipt is issued to the company's walk-in customer.

### What you must NOT send

`subtotal`, `taxAmount`, `total`, tax IDs, fiscal counters, hashes, signatures. Totals are computed server-side and rounded **once per tax bucket** (preflight `RCPT027`/`RCPT037`); client-side totals get rejected as a red receipt.

---

## 4. Recipes

**Standard sale with a buyer**

```json
{
  "items": [
    { "name": "Widget A", "quantity": 2, "unitPrice": 10, "taxType": "STANDARD" },
    { "name": "Consulting", "quantity": 1, "unitPrice": 500, "taxType": "EXEMPT", "discount": 50 }
  ],
  "invoiceNumber": "POS-000123",
  "paymentMethod": "CARD",
  "date": "2026-10-31",
  "buyer": { "registeredName": "Acme Traders", "tin": "1234567890", "vatNumber": "123456789", "city": "Harare" }
}
```

**VAT-inclusive prices** (at a 15% rate, `unitPrice: 115` nets to 100 before tax):

```json
{ "items": [ { "name": "Bread", "quantity": 3, "unitPrice": 115, "taxInclusive": true } ] }
```

**Split tender** (must sum to the gross total):

```json
{
  "items": [ { "name": "Bundle", "quantity": 1, "unitPrice": 1000 } ],
  "splitPayments": [ { "method": "CASH", "amount": 400 }, { "method": "ECOCASH", "amount": 600 } ]
}
```

**Credit note** — both note fields are mandatory:

```json
{
  "transactionType": "CreditNote",
  "relatedInvoiceNumber": "INV-197",
  "creditNoteReason": "Goods returned — wrong size",
  "items": [ { "name": "Widget A", "quantity": 1, "unitPrice": 100 } ]
}
```

The original must exist for your company, already be fiscalized, be in the same currency, not be exceeded by the note total, and be inside the correction window (12 months unless your company/branch setting says otherwise).

---

## 5. Response

`200` — the transaction is fiscal. Persist all three proof fields against your document (amounts and rates below are illustrative; the real ones come from your company profile):

```json
{
  "success": true,
  "fiscalCode": "…",        // verification hash — store permanently
  "qrCode": "…",            // render on the customer receipt
  "receiptNumber": 1234,    // global receipt number
  "receipt": {
    "invoiceNo": "INV-1234",
    "receiptDate": "2026-10-31",
    "receiptType": "FiscalInvoice",
    "receiptCurrency": "USD",
    "receiptTotal": 115,
    "receiptCounter": 7,
    "receiptGlobalNo": 1234,
    "fiscalDayNo": 12,
    "receiptLinesTaxInclusive": false,
    "buyerData": { "buyerRegisterName": "…", "buyerTIN": "…", "buyerContacts": {}, "buyerAddress": {} },
    "receiptLines":  [ { "receiptLineNo": 1, "receiptLineName": "…", "receiptLineType": "Sale", "receiptLineQuantity": 1, "receiptLinePrice": 100, "receiptLineTotal": 100, "receiptLineHSCode": "99001000", "taxPercent": 15 } ],
    "receiptTaxes":  [ { "taxPercent": 15, "taxAmount": 15, "salesAmountWithTax": 115 } ],
    "receiptPayments": [ { "moneyTypeCode": "Card", "paymentAmount": 115 } ],
    "receiptNotes": "…"
  }
}
```

`receipt` is the exact structure submitted to the fiscal authority — print from it. `receiptLinePrice`/`receiptTotal` are negative on a CreditNote.

---

## 6. Errors

| Status | `error` | Meaning / action |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body rejected by schema; `details[]` gives `{ field, message }`. Note fields missing → specific message naming the field |
| 401 | `MISSING_API_KEY` / `INVALID_API_KEY` | header absent or not recognized |
| 404 | `NOT_FOUND` | `relatedInvoiceNumber` not found for your company |
| 409 | `DUPLICATE_INVOICE` | `invoiceNumber` already used |
| 422 | `FISCALIZATION_FAILED` | rejected by the fiscal authority or preflight. `hint` says what to fix; `issues[]` carries `RCPT###` codes when preflight blocked it (e.g. `RCPT013` already fiscalized, `RCPT039` payment mismatch, `RCPT024` line total, `RCPT048` HS code) |
| 500 | `INTERNAL_ERROR` | storage/customer/invoice failure |

---

## 7. Retry rules (compliance-critical)

Every successful call mints **one real fiscal receipt** — there is no undo, and a duplicate receipt is a reporting problem.

- A `400`, `404`, `409` or `422` is safe to retry after you fix the cause: the temporary invoice record is deleted on failure, so the identical request behaves as if it never happened.
- A `200` means done. Never resend it.
- On a **timeout, connection drop or `5xx`** you don't know whether the receipt landed. Send your **own `invoiceNumber`** on every call: a retry then returns `409 DUPLICATE_INVOICE` instead of minting a second receipt. Reconcile the number via `GET /api/v1/invoices` — a live route, but the invoice/customer/product CRUD is deliberately not listed in `/api-docs`; pass-through is the documented integration path — then compare `fiscalCode` and `receiptGlobalNo` rather than firing blind.

---

## 8. Known constraints to plan around

- No lookup-by-invoice-number route yet — verification is via the paginated list in `GET /api/v1/invoices`.
- Buyer identifiers are passed through as sent. A malformed TIN or VAT number is rejected by the fiscal authority (`422`, code in `issues[]`/`message`), not by a local format rule — expect the authority's wording in that error.
- Some providers pin the receipt currency at the gateway (e.g. Lesotho-registered companies always issue in `LSL`). Send `currency` only if you need it echoed on the invoice record.
- `null` is accepted for every optional buyer field, so an ERP that emits `"tin": null` for a cash sale needs no client-side scrubbing.
