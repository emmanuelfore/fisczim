# FiscalBridge

Cross-platform fiscal interface application for FiscalStack - A modern Electron-based replacement for the Windows Forms Interface application.

## Features

- **File Monitoring**: Automatically watches configured folders for new receipt files
- **Receipt Parsing**: Parses POS receipt files using configurable patterns (port of ReadFile.cs)
- **Fiscalization**: Integrates with Fiskaztech API for ZIMRA compliance
- **Z-Reports**: Generate and print Z-Reports
- **License Management**: Secure license storage and validation
- **Receipt Printing**: Thermal printer support with QR code generation
- **PDF Invoice Stamping**: Print PDF invoices as-is with the fiscal QR/details stamped onto the original layout
- **Non-Receipt Pass-Through**: Files that are not receipts are printed unchanged instead of being fiscalised
- **Fiscal Day Management**: Open/close fiscal days, track receipt counters
- **Receipt Hash Tracking**: Maintains fiscal day continuity with SHA-256 hashing
- **Device Configuration**: Full config.ini equivalent with VAT rates, TIN, device settings
- **Live ZIMRA VAT Rates**: Standard rates are read from the device's `GetConfig` response, so invoices are never signed with a stale or derived rate
- **VAT-Inclusive/Exclusive Setting**: Prices are treated as VAT-inclusive by default; choose Auto to reconcile them against the invoice's printed totals, or Exclusive for net-priced invoices
- **Cross-Platform**: Runs on Linux, Windows, and macOS

## Installation

### Development Setup

```bash
cd FiscalBridge
npm install
npm start
```

### Building for Production

```bash
# Linux
npm run build:linux

# Windows
npm run build:win
```

## Configuration

FiscalBridge uses a setup wizard for initial configuration:

1. **Folder Configuration**: Set source (receipts from POS) and target (processed receipts) folders
2. **Currency Configuration**: Define currency keywords and names for receipt parsing
3. **Receipt Parsing**: Configure line markers, tax rates, and parsing patterns
4. **Printer Setup**: Select thermal printer and upload company logo
5. **License Setup**: Enter FiscalStack license key and API credentials

### PDF invoices and files that are not receipts

Two settings in **Settings → Printing** control what happens to incoming PDFs and
to files that are not receipts at all:

| Setting | Value | Behaviour |
| --- | --- | --- |
| **PDF Invoice Output** | `fiscalCopy` (default) | A generated fiscal copy with QR, logo and counters is saved to the target folder and printed. |
| | `stamp` | The fiscal QR + data block is stamped onto a copy of the original PDF (layout preserved). The untouched original is moved to the originals folder and the stamped PDF is printed. |
| **Files That Are Not Receipts** | `print` (default) | If no profile matches and the legacy parser finds no line items, the file is printed unchanged, recorded with status `Printed` and left in place. |
| | `review` | The file is recorded as `Needs Review` instead of being printed. |

Stamp mode places the block in the bottom-left area of the last page; override the
position with `pdfStampBox: { x, y, width, height }` (PDF points) in `config.json`
or in the config file in the app's user-data folder. If stamping fails, FiscalBridge
falls back to generating a normal fiscal copy so the document is never lost.

Pass-through and stamped documents can be re-printed from the document drawer, and
their statuses can be filtered in the document list (`Printed`, `Print Failed`).

## Architecture

### Main Process (`main.js`)
- Electron main process handling
- File system monitoring via chokidar
- IPC handlers for file operations
- Printer management
- License encryption/decryption
- Fiscal configuration management

### Renderer Process (`renderer.js`)
- UI logic and state management
- Setup wizard navigation
- Dashboard monitoring
- API integration with Fiskaztech
- Receipt printing coordination

### Receipt Parser (`receiptParser.js`)
- Port of C# ReadFile.cs functionality
- Parses receipt text files
- Extracts invoice data, line items, and customer information
- Builds XML for API submission

### Parser profiles (`profiles/`)
- Profile-driven PDF/receipt parsing (`parserEngine.js`), used by Parser Lab and file monitoring
- Starter profiles are seeded into the app's user-data folder on startup:
  - MEMP / Sage tax invoices
  - Palladium `Fiscal Tax Invoice` / `Fiscal Credit Note` (single `palladium-fiscal` profile that auto-detects the document type; see `paladium samples/`)
- Append-only versions (`<id>@<version>.json`) with detection fingerprints, layout/field rules, tax mapping and validation checks

### Data Models (`dataModels.js`)
- Receipt, ReceiptLine, ReceiptTax, ReceiptPayment
- BuyerData, BuyerContacts, BuyerAddress
- CardDetails, ZReport, DeviceStatus
- CreditDebitNote support
- FiscalConfig (config.ini equivalent)

### Config Manager (`configManager.js`)
- Fiscal configuration management
- Device counter tracking
- Fiscal day status management
- Receipt hash tracking for continuity
- VAT rate management
- TIN and device ID management

## API Integration

FiscalBridge replaces FiscalStack API calls with Fiskaztech API:

- `TransactM()` → `POST /api/companies/{id}/zimra/transact`
- `TransactMExt()` → `POST /api/companies/{id}/zimra/transact-ext`
- `GetCardDetails()` → `GET /api/zimra/device-details`
- `GetDeviceStatus()` → `GET /api/companies/{id}/zimra/device-status`
- `ZReport()` → `POST /api/companies/{id}/zimra/z-report`
- `GetTransaction()` → `GET /api/companies/{id}/zimra/transactions/{invoiceNumber}`
- `GetUnprocessedSummary()` → `GET /api/companies/{id}/zimra/transactions/unprocessed/summary`
- `GetUnprocessed()` → `GET /api/companies/{id}/zimra/transactions/unprocessed`
- `ClearUnprocessed()` → `DELETE /api/companies/{id}/zimra/transactions/unprocessed`
- `GetUnprocessedByDate()` → `GET /api/companies/{id}/zimra/transactions/unprocessed/by-date`
- `ClearUnprocessedByDate()` → `DELETE /api/companies/{id}/zimra/transactions/unprocessed/by-date`
- `ResetCounters()` → `POST /api/companies/{id}/zimra/config/reset`

## File Structure

```
FiscalBridge/
├── main.js           # Electron main process
├── preload.js        # Context bridge for IPC
├── renderer.js       # UI logic and API integration
├── receiptParser.js  # Receipt parsing logic
├── parserEngine.js   # Profile-driven document parsing
├── pdfStamp.js       # Stamps fiscal QR/data onto original PDF invoices
├── profiles/         # Append-only parser profiles seeded on startup
├── tests/            # Node test scripts (parser, Palladium, stamping)
├── dataModels.js     # Data structures (C# ports)
├── configManager.js  # Fiscal configuration management
├── index.html        # Main UI
├── styles.css        # Styling
├── package.json      # Dependencies and build config
└── README.md         # This file
```

## Migration from Windows Interface

The Windows Forms application has been fully emulated:

| Windows Feature | FiscalBridge Equivalent |
|----------------|------------------------|
| FiscalStackInterfaceWizard.cs | Setup Wizard (Web UI) |
| Form1.cs (Timer-based file watching) | chokidar file monitoring |
| ReadFile.cs (Receipt parsing) | receiptParser.js |
| FiscalStack API calls | Fiskaztech API HTTP calls |
| ReportViewer (Receipt printing) | Electron printing with QR codes |
| App.config (Settings) | Electron userData/config.json |
| config.ini (Fiscal config) | configManager.js + fiscal-config.json |
| License Checker | Encrypted license storage |
| item.cs, Invoice.cs, BuyerData.cs | dataModels.js |
| CardDetails.cs, ZReport.cs | dataModels.js |
| CreditDebitNote.cs | dataModels.js |
| Receipt.cs, ReceiptLine.cs | dataModels.js |
| ReceiptTax.cs, ReceiptPayment.cs | dataModels.js |
| Fiscal day management | configManager.js fiscal day methods |
| Receipt hash tracking | configManager.js SHA-256 hashing |

## Usage

1. **Initial Setup**: Run the app and complete the setup wizard
2. **Start Monitoring**: Click "Start Monitoring" on the dashboard
3. **Automatic Processing**: Receipt files are automatically processed when detected
4. **Fiscal Day Management**: Open/close fiscal days as needed
5. **Z-Reports**: Generate Z-Reports manually or at end of fiscal day
6. **Settings**: Modify configuration via Settings button

## Dashboard Features

- **Device Status**: View current fiscal device status
- **Card Details**: Get device/card information
- **Unprocessed**: View unprocessed transactions
- **Fiscal Day Controls**: Open/close fiscal days
- **Reset Counters**: Reset device counters (admin function)
- **Activity Log**: View recent processing activity

## Troubleshooting

### File Monitoring Not Working
- Ensure source folder path is correct
- Check file permissions
- Verify folder exists

### Printing Issues
- Ensure printer is selected in settings
- Test print from settings
- Check printer connection

### Fiscal Day Issues
- Check fiscal day status in dashboard
- Ensure fiscal day is open before processing receipts
- Use "Open Fiscal Day" button if needed

## Known Limitations

- **RDLC Report Format**: Receipt printing uses HTML format instead of exact RDLC report format from Windows app
- **ReportViewer**: Microsoft ReportViewer is Windows-specific; replaced with Electron printing

## License

MIT License - Fiscal Stack

## Support

For issues and support, contact Fiscal Stack support team.
