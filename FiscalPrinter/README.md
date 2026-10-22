# FiscalPrinter

Locally installed Fiscal Stack product (separate from FiscalBridge).

**Flow:** print job lands in a spool folder → parse POS receipt → `POST /api/v1/fiscalize` → **silent print** of fiscal receipt (QR + verification + day/counters) on a **local printer**.

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

Windows installer (needs Windows or CI):

```bash
npm run build:win
```

## POS parsing

Uses the same marker style as **Interface / FiscalBridge** (`Order No.`, `Items count`, qty/price/amount lines with decimals). Configure markers under `parse` in `config.json`.

Also accepts FiscalStack JSON jobs (`samples/sample-invoice.json`).

## Windows virtual printer later

Point Print-to-PDF / RedMon / a port monitor at `spoolFolder`. FiscalPrinter (already running locally) fiscalizes and prints the fiscal copy with QR.

## vs FiscalBridge

| | FiscalBridge | FiscalPrinter |
|--|--------------|---------------|
| Input | POS file drop (configured) | Virtual-print spool (any app → print) |
| API | Fiskaztech-style paths in bridge | FiscalStack `/api/v1/fiscalize` (Interface) |
| Output | Print fiscal receipt | Print fiscal receipt (QR + proof) |
