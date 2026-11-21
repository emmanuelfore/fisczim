# FiscalPrinter

Locally installed Fiscal Stack product (separate from FiscalBridge).

**Flow (POS text):** print job lands in a spool folder → parse POS receipt → `POST /api/v1/fiscalize` → **silent print** of fiscal receipt (QR + verification + day/counters) on a **local printer**.

**Flow (PDF invoice):** PDF lands in the spool → parse the A4 invoice → `POST /api/v1/fiscalize` → **stamp the real QR + fiscal data onto a copy** → silent-print the stamped PDF. The original invoice is never modified.

**Training mode:** offline sample invoices/credit notes and training QR stamps (no API call, no invoice changed).

## About “HTML”

HTML is **not** the product output. It is only the **receipt layout** fed into the OS print API (same pattern as FiscalBridge Electron `webContents.print`).

| What users see | What happens internally |
|----------------|-------------------------|
| App tray / window + paper from their printer | Layout receipt in memory as HTML → send to Windows/Linux printer driver |
| Optional: nothing on screen | Silent print with QR + fiscal fields |

`saveDebugHtml: false` by default — no HTML files are left on disk for normal installs.

## Install / run

```bash
cd FiscalPrinter
cp config.example.json config.json
# set apiKey + printerName
npm install
npm start                 # local Electron app
```

Headless (Linux dev without UI print):

```bash
npm run watch
npm run test:pos
```

Windows installer:

```bash
npm run build:win
```

This works from Windows, or from Linux/macOS with Wine installed. Outputs:

- `dist/FiscalPrinter Setup 0.1.0.exe` — NSIS installer (x64)
- `dist/win-unpacked/FiscalPrinter.exe` — the app itself, for a portable copy

The installer is not code-signed, so Windows shows a SmartScreen
"Unknown publisher" prompt. Choose **More info → Run anyway**, or sign
`dist/win-unpacked/FiscalPrinter.exe` with your own certificate.

Installed builds keep `config.json`, `spool/` and generated PDFs under the
per-user data folder (`%APPDATA%\\FiscalPrinter`), because the program files
inside `resources/app.asar` are read-only.

## POS parsing

Uses the same marker style as **Interface / FiscalBridge** (`Order No.`, `Items count`, qty/price/amount lines with decimals). Configure markers under `parse` in `config.json`.

Also accepts FiscalStack JSON jobs (`samples/sample-invoice.json`).

## PDF invoice parsing

`.pdf` files are read with `pdfjs-dist` (pure JS, no Poppler/pdftotext binary
needed on Windows) and understood as the Palladium A4 layout:

- `Fiscal Tax Invoice` and `Fiscal Credit Note`
- Number / Date / Reference / Required / Account / Reason / Sales Person
- Seller + buyer details, TIN/VAT, addresses and bank accounts
- Line items: HS Code, Item, Description, Quantity, Unit, Price Inc, VAT, Total Inc
- Totals: Subtotal, Discount, Delivery, VAT Total, Invoice Total
- Credit-note reference (`REV-IN-…`) is mapped to `relatedInvoiceNumber`

```bash
npm run parse -- ./samples/sample-invoice-palladium.pdf
npm run parse -- ./samples/sample-credit-note-palladium.pdf
```

The spool watcher accepts `.pdf` as well. PDFs take the PDF-first pipeline:

```
PDF → parse → POST /api/v1/fiscalize → stamp real QR + fiscal data on a COPY
    → silent-print the stamped PDF → original moved to spool/processed
```

**The original invoice PDF is never modified.** The stamped copy is written to
`spool/fiscal-receipts/…fiscal.pdf`.

## Training mode

Offline sample documents for training staff. Nothing in this path calls the
fiscal API, writes an invoice or consumes a fiscal counter. Every copy carries
a `TRAINING — NOT A VALID FISCAL INVOICE` watermark and a training QR.

```bash
npm run training:invoice          # A4 sample invoice (HTML)
npm run training:credit           # sample credit note (HTML)
npm run training:pdf              # sample invoice as PDF
npm run training:stamp:samples    # stamp a training QR on the bundled PDFs
```

The Electron app has a **Training mode** panel: preview a sample, save it as a
PDF, print it, or pick an existing invoice PDF and produce a stamped training
copy (source untouched).

## Windows virtual printer later

Point Print-to-PDF / RedMon / a port monitor at `spoolFolder`. FiscalPrinter (already running locally) fiscalizes and prints the fiscal copy with QR.

## vs FiscalBridge

| | FiscalBridge | FiscalPrinter |
|--|--------------|---------------|
| Input | POS file drop (configured) | Virtual-print spool (any app → print) |
| API | Fiskaztech-style paths in bridge | FiscalStack `/api/v1/fiscalize` (Interface) |
| Output | Print fiscal receipt | Print fiscal receipt (QR + proof) |
