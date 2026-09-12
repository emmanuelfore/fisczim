# FiscalBridge

Cross-platform fiscal interface application for FiscalStack - A modern Electron-based replacement for the Windows Forms Interface application.

## Features

- **File Monitoring**: Automatically watches configured folders for new receipt files
- **Receipt Parsing**: Parses POS receipt files using configurable patterns (port of ReadFile.cs)
- **Fiscalization**: Integrates with Fiskaztech API for ZIMRA compliance
- **Z-Reports**: Generate and print Z-Reports
- **License Management**: Secure license storage and validation
- **Receipt Printing**: Thermal printer support with QR code generation
- **Fiscal Day Management**: Open/close fiscal days, track receipt counters
- **Receipt Hash Tracking**: Maintains fiscal day continuity with SHA-256 hashing
- **Device Configuration**: Full config.ini equivalent with VAT rates, TIN, device settings
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

FiscalBridge replaces RevMax API calls with Fiskaztech API:

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
| RevMaxInterfaceWizard.cs | Setup Wizard (Web UI) |
| Form1.cs (Timer-based file watching) | chokidar file monitoring |
| ReadFile.cs (Receipt parsing) | receiptParser.js |
| RevmaxAPI.dll calls | Fiskaztech API HTTP calls |
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
