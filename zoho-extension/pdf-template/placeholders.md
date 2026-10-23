# Zoho Books placeholder mapping

Replace each symbolic token in `fiscalstack-invoice-template.html` with the
matching value from Zoho Books’ **Insert Placeholder** menu when publishing.

| Symbolic token family | Zoho Books source |
| --- | --- |
| `ORGANISATION_*` | Organisation profile fields |
| `CUSTOMER_*` | Invoice customer / billing fields |
| `INVOICE_*` | Invoice header, amount, notes, and terms fields |
| `INVOICE_LINE_ITEM_ROWS` | Repeating Invoice → Line Items table row: item number, description, quantity, rate, discount, tax, tax amount, and item total |
| `TAX_SUMMARY_ROWS` | Repeating Invoice → Tax Summary table row, grouped by rate/type |
| `FISCAL_*_PLACEHOLDER`, `ZIMRA_DEVICE_ID_PLACEHOLDER`, `VERIFICATION_CODE_PLACEHOLDER` | Corresponding FiscalStack extension invoice custom fields |

Keep the line-item and tax-summary rows as Zoho template repeaters. Zoho can
then paginate items and group taxes correctly rather than attempting tax
calculation in a static HTML template.
