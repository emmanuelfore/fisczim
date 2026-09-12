# HCC Z100/CS10 Printer — Expo Native Module

Reverse-engineered from the Flutter plugin `cs10_z100_pos_printer`.
SDK source: `classes.jar` → `vpos.apipackage.PosApiHelper`

---

## File Overview

```
hcc_printer_module/
├── android/
│   ├── src/main/java/com/hccprinter/
│   │   ├── HCCPrinterModule.kt       ← Native module (calls PosApiHelper)
│   │   └── HCCPrinterPackage.kt      ← Package registration
│   ├── build.gradle.txt              ← Dependency additions for build.gradle
│   └── MainApplication.patch.kt     ← How to register package
└── src/
    └── HCCPrinter.ts                 ← JavaScript/TypeScript API
```

---

## Setup Steps

### 1. Prebuild (bare workflow)
```bash
npx expo prebuild
```

### 2. Copy the SDK JAR
```bash
cp classes.jar android/app/libs/classes.jar
```

### 3. Copy the native module files
```bash
# Create package folder
mkdir -p android/app/src/main/java/com/hccprinter

cp HCCPrinterModule.kt  android/app/src/main/java/com/hccprinter/
cp HCCPrinterPackage.kt android/app/src/main/java/com/hccprinter/
```

### 4. Edit `android/app/build.gradle`
Add inside `dependencies {}`:
```groovy
implementation fileTree(dir: 'libs', include: ['*.jar', '*.aar'])
implementation 'com.google.zxing:core:3.5.2'
```

Add inside `android {}`:
```groovy
packagingOptions {
    pickFirst '**/libc++_shared.so'
    pickFirst '**/libPrint.so'
}
```

### 5. Register the package in `MainApplication.kt`
```kotlin
import com.hccprinter.HCCPrinterPackage

// inside getPackages():
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages + listOf(HCCPrinterPackage())
```

### 6. Copy the TypeScript file
```bash
cp HCCPrinter.ts src/utils/HCCPrinter.ts  # or wherever you keep utils
```

### 7. Build (NOT Expo Go — must be a custom build)
```bash
npx expo run:android
# or
eas build --platform android --profile development
```

---

## Usage

```typescript
import { printReceipt, checkStatus } from './utils/HCCPrinter';

// Check printer is ready
const status = await checkStatus();
console.log(status); // 'success' | 'needsPaper' | 'highTemperature' | ...

// Print a receipt
const result = await printReceipt({
  lines: [
    { text: 'ACME STORE',          align: 'center', bold: true, fontSize: 'large' },
    { text: '─────────────────',   align: 'center' },
    { text: 'Item A         $1.00' },
    { text: 'Item B         $2.50' },
    { text: '─────────────────',   align: 'center' },
    { text: 'TOTAL          $3.50', bold: true },
    { text: 'Thank you!',          align: 'center', fontSize: 'small' },
  ],
  qrCode: 'https://yourapp.com/receipt/456',
  feedLines: 5,
});

if (!result.success) {
  console.error('Print failed:', result.error);
}
```

---

## SDK Methods Used (from `vpos.apipackage.PosApiHelper`)

| SDK Method              | Used For                        |
|-------------------------|---------------------------------|
| `PrintInit()`           | Initialize printer              |
| `PrintClose()`          | Close / clear queue             |
| `PrintCheckStatus()`    | Get status code                 |
| `PrintSetAlign(int)`    | 0=left, 1=center, 2=right       |
| `PrintSetFont(b,b,b)`   | width, height, type             |
| `PrintStr(String)`      | Queue a text string             |
| `PrintStart()`          | Trigger physical print          |
| `PrintQrCode_Cut(...)`  | Queue a QR code                 |

---

## Error Codes

| Code   | Meaning                        |
|--------|--------------------------------|
| 0      | Success                        |
| -1     | Out of paper                   |
| -2     | Temperature too high           |
| -3     | Low battery voltage            |
| 9998   | Not initialized                |
| 9999   | Unsupported device             |
| -4001  | Printer busy                   |
| -4002  | No paper                       |
| -4004  | Printer fault                  |
| -4005  | Overheating                    |
