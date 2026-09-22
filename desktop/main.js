const { app, BrowserWindow, screen, ipcMain, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const fetch = require('node-fetch'); // or use built-in fetch in Node 18+

// JWT verification cache
let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_TTL = 60 * 60 * 1000; // 1 hour

// Configure Logger
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
log.info('[Main] App starting...');

const { SerialPort } = require('serialport');

const PROD_URL = 'https://fiscalstack.co.zw/pos-login';
const DEV_URL = 'http://localhost:5001/pos-login';

// Prevent two writers on the same IndexedDB LevelDB (top corruption cause)
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  log.warn('[Main] Second instance detected — quitting.');
  app.quit();
}

// ─── Offline credential vault ───────────────────────────────────────────────
// Encrypted file in userData that survives IndexedDB corruption AND
// `clear-storage`. This is what lets Electron terminals log in offline even
// when the renderer IndexedDB backing store is wedged.
const OFFLINE_CREDS_FILE = 'offline-creds.enc';

function offlineCredsPath() {
  return path.join(app.getPath('userData'), OFFLINE_CREDS_FILE);
}

function loadOfflineCreds() {
  try {
    const p = offlineCredsPath();
    if (!fs.existsSync(p)) return {};
    const buf = fs.readFileSync(p);
    let json;
    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(buf);
    } else {
      json = Buffer.from(buf.toString('utf8'), 'base64').toString('utf8');
    }
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    log.error('[offline-creds] Load failed:', err.message);
    return {};
  }
}

function saveOfflineCreds(map) {
  try {
    const json = JSON.stringify(map);
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(offlineCredsPath(), safeStorage.encryptString(json));
    } else {
      log.warn('[offline-creds] Encryption unavailable — storing obfuscated (still hashed).');
      fs.writeFileSync(offlineCredsPath(), Buffer.from(json, 'utf8').toString('base64'), 'utf8');
    }
  } catch (err) {
    log.error('[offline-creds] Save failed:', err.message);
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// Must mirror the non-secure-context fallback in client/src/lib/offline-db.ts
function fallbackHash(password, salt) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const str = `${salt}::${password}::${salt.length}`;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i) + round;
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ (c + (h1 & 0xff)), 16777619);
    }
  }
  return `fb-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function hashMatches(value, salt, stored) {
  if (!salt || !stored) return false;
  if (stored.startsWith('fb-')) return fallbackHash(String(value), salt) === stored;
  return sha256Hex(String(value) + salt) === stored;
}

// Manager PIN cache helpers (Task 8.1)
const PIN_CACHE_KEY = 'manager-pin-cache';

function loadPinCache() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return {};
    const encPath = app.getPath('userData') + '/pin-cache.enc';
    if (!fs.existsSync(encPath)) return {};
    const buf = fs.readFileSync(encPath);
    const json = safeStorage.decryptString(buf);
    return JSON.parse(json);
  } catch { return {}; }
}

function savePinCache(cache) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(JSON.stringify(cache));
    fs.writeFileSync(app.getPath('userData') + '/pin-cache.enc', encrypted);
  } catch (err) {
    log.error('[savePinCache] Failed:', err.message);
  }
}

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

/**
 * Validates IPC input fields before passing to native APIs.
 * Each field is optional — only fields that are provided (not undefined) are validated.
 *
 * @param {object} opts
 * @param {string} [opts.html]        - Receipt HTML; must be a string ≤ 512 KB
 * @param {string} [opts.printerName] - Printer name; ≤ 256 chars, no path traversal
 * @param {string} [opts.pin]         - Manager PIN; must match /^\d{4,8}$/
 * @param {number} [opts.companyId]   - Company ID; must be a positive integer
 * @returns {{ error: string, code: 'VALIDATION_ERROR' } | null}
 */
function validateIpcInput({ html, printerName, pin, companyId } = {}) {
  if (html !== undefined) {
    if (typeof html !== 'string') {
      return { error: 'html must be a string', code: 'VALIDATION_ERROR' };
    }
    if (Buffer.byteLength(html, 'utf8') > 512 * 1024) {
      return { error: 'html exceeds maximum size of 512 KB', code: 'VALIDATION_ERROR' };
    }
  }

  if (printerName !== undefined && printerName !== null) {
    if (typeof printerName !== 'string') {
      return { error: 'printerName must be a string', code: 'VALIDATION_ERROR' };
    }
    if (printerName.length > 256) {
      return { error: 'printerName exceeds maximum length of 256 characters', code: 'VALIDATION_ERROR' };
    }
    if (printerName.includes('..') || printerName.includes('/') || printerName.includes('\\')) {
      return { error: 'printerName contains invalid path traversal characters', code: 'VALIDATION_ERROR' };
    }
  }

  if (pin !== undefined) {
    if (!/^\d{4,8}$/.test(pin)) {
      return { error: 'pin must be a string of 4 to 8 digits', code: 'VALIDATION_ERROR' };
    }
  }

  if (companyId !== undefined) {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return { error: 'companyId must be a positive integer', code: 'VALIDATION_ERROR' };
    }
  }

  return null;
}

/**
 * Resolves the URL to load in the main window using the following priority:
 * 1. `startUrl` field in config.json from app.getPath('userData')
 * 2. ELECTRON_START_URL environment variable
 * 3. Production URL if app.isPackaged
 * 4. Dev default: http://localhost:5001/pos-login
 */
function resolveStartUrl() {
  let url = null;

  // Priority 1: config.json in userData directory
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      if (config.startUrl) {
        url = config.startUrl;
      }
    }
  } catch (err) {
    console.error('[resolveStartUrl] Failed to read config.json:', err.message);
  }

  // Priority 2: ELECTRON_START_URL environment variable
  if (!url && process.env.ELECTRON_START_URL) {
    url = process.env.ELECTRON_START_URL;
  }

  // Priority 3: packaged production URL
  if (!url && app.isPackaged) {
    url = PROD_URL;
  }

  // Priority 4: dev default
  if (!url) {
    url = DEV_URL;
  }

  // Defensive: desktop must always land on /pos-login — rewrite stale /auth configs
  // (config.json may contain old https://fiscalstack.co.zw/auth from pre-fix builds)
  try {
    const u = new URL(url);
    if (u.pathname === '/auth' || u.pathname.startsWith('/auth/')) {
      log.warn(`[resolveStartUrl] Rewriting stale ${u.pathname} → /pos-login`);
      u.pathname = '/pos-login';
      u.search = '';
      url = u.toString();
      // Persist the fix so next launch is correct
      try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
        cfg.startUrl = url;
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      } catch {}
    }
  } catch {}

  log.info(`[resolveStartUrl] Resolved: ${url} (isPackaged=${app.isPackaged})`);
  return url;
}

/**
 * Reads config.json from userData and returns the parsed object, or {} on error.
 */
function readConfig() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[readConfig] Failed to read config.json:', err.message);
  }
  return {};
}

/**
 * Renders HTML in a hidden BrowserWindow and prints it silently to the named printer.
 * Shared by print-receipt and test-print handlers.
 *
 * @param {string} html - Full HTML string to print
 * @param {string|undefined} printerName - Target printer name, or undefined for system default
 * @returns {Promise<true>}
 */
function printHtmlToWindow(html, printerName) {
  return new Promise((resolve, reject) => {
    let printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    // 10-second load timeout
    const timeout = setTimeout(() => {
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.destroy();
        printWindow = null;
      }
      reject('Print timeout: page did not load within 10 seconds');
    }, 10000);

    printWindow.webContents.on('did-finish-load', () => {
      clearTimeout(timeout);
      printWindow.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: printerName || undefined,
        // Use no margins so the content itself controls positioning
        marginsType: 0,
        // Custom page size: match typical 80mm thermal roll width with a
        // very tall height so the content length drives the printed page
        // rather than the system default A4/Letter leaving blank space.
        pageSize: {
          width: 80000,   // 80 mm in microns
          height: 800000  // 800 mm tall — crops to content automatically
        }
      }, (success, errorType) => {
        if (!printWindow.isDestroyed()) {
          printWindow.destroy();
          printWindow = null;
        }
        if (success) {
          resolve(true);
        } else {
          reject(errorType);
        }
      });
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

/**
 * Registers all IPC handlers. Called once from createWindow().
 * @param {import('electron').BrowserWindow} mainWindow
 */
function registerIpcHandlers(mainWindow) {
  // Task 4.1: print-receipt — validate, render in hidden window, print silently
  ipcMain.handle('print-receipt', async (_event, html, printerName) => {
    const validationError = validateIpcInput({ html, printerName });
    if (validationError) {
      return Promise.reject(validationError.error);
    }
    return printHtmlToWindow(html, printerName);
  });

  // Task 4.2: get-printers — return system printer list mapped to { name, isDefault }
  ipcMain.handle('get-printers', async () => {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  });

  // Task 4.3: test-print — send a minimal test page to the named printer
  ipcMain.handle('test-print', async (_event, printerName) => {
    const validationError = validateIpcInput({ printerName });
    if (validationError) {
      return Promise.reject(validationError.error);
    }
    const testHtml = '<html><body><h1>Test Print</h1><p>POS Terminal Test Page</p></body></html>';
    return printHtmlToWindow(testHtml, printerName);
  });

  // print-raw — receive raw ESC/POS bytes from renderer and send to printer
  ipcMain.handle('print-raw', async (_event, data, printerName) => {
    const validationError = validateIpcInput({ printerName });
    if (validationError) {
      return Promise.reject(validationError.error);
    }

    const bytes = Buffer.from(data);

    if (bytes.length === 0) {
      return Promise.reject('Invalid raw data: Data is empty');
    }

    log.info(`[Main] print-raw: Received ${bytes.length} bytes for printer: ${printerName || 'System Default'}`);

    const ts = Date.now();
    const binPath = path.join(app.getPath('userData'), `receipt_${ts}.bin`);
    const ps1Path = path.join(app.getPath('userData'), `print_${ts}.ps1`);

    try {
      fs.writeFileSync(binPath, bytes);

      // Determine the printer name — fall back to the system default via WMI
      const printerLine = printerName
        ? `$printerName = ${JSON.stringify(printerName)}`
        : `$printerName = (Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)
if (-not $printerName) { $printerName = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default = TRUE").Name }
if (-not $printerName) { throw "No default printer is configured." }`;

      // Write a proper multi-line .ps1 file — avoids all -Command quoting/newline issues
      const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
    public static string Send(string printer, byte[] bytes) {
        IntPtr h;
        var di = new DOCINFOA { pDocName = "FiscalStack Receipt", pDataType = "RAW" };
        if (!OpenPrinter(printer, out h, IntPtr.Zero))
            return "FAIL: Could not open printer [" + printer + "]. Win32 Error: " + Marshal.GetLastWin32Error();
        if (!StartDocPrinter(h, 1, di)) { ClosePrinter(h); return "FAIL: StartDocPrinter failed. Win32 Error: " + Marshal.GetLastWin32Error(); }
        if (!StartPagePrinter(h)) { EndDocPrinter(h); ClosePrinter(h); return "FAIL: StartPagePrinter failed."; }
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, p, bytes.Length);
        Int32 w;
        bool ok = WritePrinter(h, p, bytes.Length, out w);
        Marshal.FreeCoTaskMem(p);
        EndPagePrinter(h);
        EndDocPrinter(h);
        ClosePrinter(h);
        if (!ok) return "FAIL: WritePrinter failed. Win32 Error: " + Marshal.GetLastWin32Error();
        return "OK: " + w + " bytes written to [" + printer + "]";
    }
}
'@
Add-Type -TypeDefinition $code
${printerLine}
$binFile = ${JSON.stringify(binPath)}
$result = [RawPrint]::Send($printerName, [System.IO.File]::ReadAllBytes($binFile))
Write-Output $result
`.trimStart();

      fs.writeFileSync(ps1Path, psScript, 'utf8');
      log.info(`[print-raw] Script written to: ${ps1Path}`);

      return new Promise((resolve, reject) => {
        require('child_process').exec(
          `powershell -ExecutionPolicy Bypass -NonInteractive -File "${ps1Path}"`,
          (err, stdout, stderr) => {
            // Cleanup temp files
            for (const f of [binPath, ps1Path]) {
              if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) { }
            }
            const output = (stdout || '').trim();
            if (output) log.info(`[print-raw] Result: ${output}`);
            if (stderr && stderr.trim()) log.warn(`[print-raw] stderr: ${stderr.trim()}`);
            if (err) {
              log.error('[print-raw] Error:', err.message);
              return reject(err.message);
            }
            if (output.startsWith('FAIL:')) {
              log.error('[print-raw] Printer failure:', output);
              return reject(output);
            }
            log.info('[print-raw] Success:', output);
            resolve(true);
          }
        );
      });
    } catch (err) {
      for (const f of [binPath, ps1Path]) {
        if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) { }
      }
      log.error('[print-raw] Exception:', err.message);
      return Promise.reject(err.message);
    }
  });



  // Task 6.1: open-cash-drawer — send ESC/POS kick bytes [0x1B, 0x70, 0x00, 0x19, 0xFA] to the printer
  ipcMain.handle('open-cash-drawer', async (_event, printerName) => {
    if (printerName !== undefined) {
      const validationError = validateIpcInput({ printerName });
      if (validationError) {
        return Promise.reject(validationError.error);
      }
    }
    try {
      // Build HTML containing the raw ESC/POS cash drawer kick sequence as text content.
      // The bytes ESC p 0 25 250 (0x1B 0x70 0x00 0x19 0xFA) are embedded as actual characters.
      const kickBytes = String.fromCharCode(0x1B, 0x70, 0x00, 0x19, 0xFA);
      const drawerHtml = `<html><body><pre style="font-family:monospace">${kickBytes}</pre></body></html>`;
      return await printHtmlToWindow(drawerHtml, printerName);
    } catch (err) {
      return Promise.reject(typeof err === 'string' ? err : (err && err.message) ? err.message : 'Failed to open cash drawer');
    }
  });

  // Task 9.2: get-serial-ports — return available serial ports mapped to { path, manufacturer }
  ipcMain.handle('get-serial-ports', async () => {
    const ports = await SerialPort.list();
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer }));
  });

  // Local JWT verification (ES256) — avoids calling Supabase /auth/v1/user
  ipcMain.handle('verify-token-local', async (_event, token) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [headerB64, payloadB64, signatureB64] = parts;
      const header = JSON.parse(Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;

      if (header.alg === 'ES256') {
        // Fetch JWKS from Supabase
        const supabaseUrl = process.env.SUPABASE_URL || 'https://nopztclveukecdabuist.supabase.co';
        const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
        if (!response.ok) return null;
        const jwks = await response.json();
        const jwk = jwks.keys.find(k => k.kid === header.kid && k.alg === 'ES256' && k.crv === 'P-256');
        if (!jwk || !jwk.x || !jwk.y) return null;
        const x = Buffer.from(jwk.x.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        const y = Buffer.from(jwk.y.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        const pubKey = Buffer.concat([Buffer.from([0x04]), x, y]);
        // Create PEM for P-256
        const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.concat([Buffer.from([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00]), Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x.replace(/-/g, '+').replace(/_/g, '/'), 'base64'), Buffer.from(jwk.y.replace(/-/g, '+').replace(/_/g, '/'), 'base64')])]).toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
        const { createVerify } = require('crypto');
        const verify = require('crypto').createVerify('SHA256');
        verify.update(`${headerB64}.${payloadB64}`);
        const rawSig = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        // Convert raw r||s to DER
        if (rawSig.length !== 64) return null;
        const r = rawSig.subarray(0, 32);
        const s = rawSig.subarray(32, 64);
        const trim = (buf) => { let i = 0; while (i < buf.length - 1 && buf[i] === 0) i++; return buf.subarray(i); };
        const rTrim = (() => { let i = 0; while (i < r.length - 1 && r[i] === 0) i++; return r.subarray(i); })();
        const sTrim = (() => { let i = 0; while (i < s.length - 1 && s[i] === 0) i++; return s.subarray(i); })();
        const rFinal = (rTrim[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), rTrim]) : rTrim;
        const sFinal = (sTrim[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), sTrim]) : sTrim;
        const derSig = Buffer.concat([
          Buffer.from([0x30]),
          Buffer.from([2 + rFinal.length + 2 + sFinal.length]),
          Buffer.from([0x02]), Buffer.from([rFinal.length]), rFinal,
          Buffer.from([0x02]), Buffer.from([sFinal.length]), sFinal,
        ]);
        if (!verify.verify(pem, derSig)) return null;
        return { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata };
      }
      return null;
    } catch (e) {
    log.error('[Main] verify-token-local error:', e.message);
    return null;
  }
});

  // cache-manager-pins — store scrypt hashes fetched from the server for offline verification
  ipcMain.handle('cache-manager-pins', async (_event, companyId, hashes) => {
    const pinError = validateIpcInput({ companyId });
    if (pinError) return Promise.reject(pinError.error);
    if (!Array.isArray(hashes)) return Promise.reject('hashes must be an array');

    const cache = loadPinCache();
    // Store raw scrypt hashes (format: "scryptHex.salt") keyed by companyId
    cache[companyId] = { scryptHashes: hashes, cachedAt: new Date().toISOString() };
    savePinCache(cache);
    log.info(`[cache-manager-pins] Cached ${hashes.length} PIN hash(es) for company ${companyId}`);
  });

  // Task 8.1: verify-manager-pin — validate PIN and companyId; try online, fall back to cached scrypt hashes
  ipcMain.handle('verify-manager-pin', async (_event, pin, companyId) => {
    // Validate PIN format; companyId is optional — we'll handle 0/missing gracefully
    const pinError = validateIpcInput({ pin });
    if (pinError) return Promise.reject(pinError.error);

    const cache = loadPinCache();

    // Resolve effective companyId
    let effectiveCompanyId = (Number.isInteger(companyId) && companyId > 0) ? companyId : null;
    if (!effectiveCompanyId) {
      const keys = Object.keys(cache);
      if (keys.length === 1) {
        effectiveCompanyId = parseInt(keys[0]);
        log.warn(`[verify-manager-pin] companyId missing/invalid (${companyId}), falling back to cached companyId: ${effectiveCompanyId}`);
      }
    }

    // Try online verification first (if we have a valid companyId)
    if (effectiveCompanyId) {
      try {
        const startUrl = resolveStartUrl();
        const baseUrl = new URL(startUrl);
        const apiUrl = `${baseUrl.protocol}//${baseUrl.host}/api/companies/${effectiveCompanyId}/auth/verify-manager-pin`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          log.info(`[verify-manager-pin] Online verification succeeded for company ${effectiveCompanyId}`);
          return true;
        }
        if (response.status === 401) {
          log.warn(`[verify-manager-pin] Online verification denied for company ${effectiveCompanyId}`);
          return false;
        }
        // Non-401 error (5xx etc.) — fall through to offline cache
        log.warn(`[verify-manager-pin] Online returned ${response.status}, falling back to cache`);
      } catch (err) {
        log.warn('[verify-manager-pin] Online check failed, trying cache:', err.message);
      }

      // Offline: verify against scrypt hashes cached from the server
      const entry = cache[effectiveCompanyId];
      if (entry && Array.isArray(entry.scryptHashes) && entry.scryptHashes.length > 0) {
        for (const { pinHash } of entry.scryptHashes) {
          if (!pinHash || !pinHash.includes('.')) continue;
          const [storedHex, salt] = pinHash.split('.');
          try {
            const derived = await new Promise((resolve, reject) => {
              crypto.scrypt(pin, salt, 64, (err, buf) => err ? reject(err) : resolve(buf.toString('hex')));
            });
            if (derived === storedHex) {
              log.info(`[verify-manager-pin] Offline scrypt verification succeeded for company ${effectiveCompanyId}`);
              return true;
            }
          } catch (scryptErr) {
            log.error('[verify-manager-pin] scrypt error:', scryptErr.message);
          }
        }
        log.warn(`[verify-manager-pin] Offline scrypt verification failed for company ${effectiveCompanyId}`);
        return false;
      }

      log.warn(`[verify-manager-pin] No cached PIN hashes for company ${effectiveCompanyId}`);
      return false;
    }

    // No valid companyId — try all cached entries
    log.warn('[verify-manager-pin] No valid companyId — trying PIN against all cached entries');
    for (const entry of Object.values(cache)) {
      if (!entry.scryptHashes) continue;
      for (const { pinHash } of entry.scryptHashes) {
        if (!pinHash || !pinHash.includes('.')) continue;
        const [storedHex, salt] = pinHash.split('.');
        try {
          const derived = await new Promise((resolve, reject) => {
            crypto.scrypt(pin, salt, 64, (err, buf) => err ? reject(err) : resolve(buf.toString('hex')));
          });
          if (derived === storedHex) return true;
        } catch (scryptErr) {
          log.error('[verify-manager-pin] scrypt error:', scryptErr.message);
        }
      }
    }
    return false;
  });

  // Offline credential vault — renderer fallback when IndexedDB is wedged
  ipcMain.handle('offline-credentials-save', async (_event, record) => {
    try {
      if (!record || !record.email || !record.hash || !record.salt) return false;
      const map = loadOfflineCreds();
      const key = String(record.email).toLowerCase();
      const prev = map[key];
      // Preserve PIN hash across logins where the fresh user object omits the PIN
      if ((!record.pinHash || !record.pinSalt) && prev?.pinHash && prev?.pinSalt) {
        record.pinHash = prev.pinHash;
        record.pinSalt = prev.pinSalt;
      }
      map[key] = { ...record, email: key, savedAt: new Date().toISOString() };
      saveOfflineCreds(map);
      return true;
    } catch (err) {
      log.error('[offline-creds] Save IPC failed:', err.message);
      return false;
    }
  });

  ipcMain.handle('offline-credentials-verify', async (_event, email, password) => {
    try {
      const map = loadOfflineCreds();
      const rec = map[String(email || '').toLowerCase()];
      if (!rec) return null;
      if (hashMatches(password, rec.salt, rec.hash)) return rec.user || null;
      return null;
    } catch (err) {
      log.error('[offline-creds] Verify IPC failed:', err.message);
      return null;
    }
  });

  ipcMain.handle('offline-credentials-verify-pin', async (_event, email, pin) => {
    try {
      const map = loadOfflineCreds();
      const rec = map[String(email || '').toLowerCase()];
      if (!rec?.pinHash || !rec?.pinSalt) return null;
      if (hashMatches(pin, rec.pinSalt, rec.pinHash)) return rec.user || null;
      return null;
    } catch (err) {
      log.error('[offline-creds] Verify-PIN IPC failed:', err.message);
      return null;
    }
  });

  ipcMain.handle('offline-credentials-users', async () => {
    try {
      const map = loadOfflineCreds();
      return Object.values(map).map(r => r.user).filter(Boolean);
    } catch (err) {
      log.error('[offline-creds] Users IPC failed:', err.message);
      return [];
    }
  });

  // Task: clear-storage — clear all local data (IndexedDB, Cache, etc.) to fix corruption
  // NOTE: intentionally does NOT delete offline-creds.enc / pin-cache.enc so the
  // terminal can still log in offline immediately after a repair.
  ipcMain.handle('clear-storage', async () => {
    log.warn('[clear-storage] Clearing all session storage data...');
    const session = mainWindow.webContents.session;
    try {
      await session.clearStorageData({
        storages: ['indexeddb', 'cache', 'localstorage', 'websql', 'serviceworkers']
      });
      log.info('[clear-storage] Storage cleared successfully (credential vault preserved)');
      return true;
    } catch (err) {
      log.error('[clear-storage] Failed to clear storage:', err.message);
      throw err;
    }
  });

  // Task: install-update — quit and install the downloaded update
  ipcMain.handle('install-update', () => {
    log.info('[Updater] Installing update...');
    autoUpdater.quitAndInstall();
  });
}


/**
 * Opens the configured serial port and forwards trimmed barcode strings to the renderer.
 * Logs and skips silently if the port is unavailable or not configured.
 *
 * @param {import('electron').BrowserWindow} mainWindow
 * @param {string|undefined} portPath - Serial port path from config.json.scannerPort
 */
function initBarcodeScanner(mainWindow, portPath) {
  if (!portPath) return;
  try {
    const port = new SerialPort({ path: portPath, baudRate: 9600 });
    let buffer = '';
    port.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        const barcode = line.trim();
        if (barcode) {
          mainWindow.webContents.send('barcode-scan', barcode);
        }
      }
    });
    port.on('error', (err) => {
      log.error('[initBarcodeScanner] Serial port error:', err.message);
    });
  } catch (err) {
    log.error('[initBarcodeScanner] Failed to open port:', err.message);
  }
}

/**
 * Auto-Updater Logic
 */
function setupAutoUpdater(mainWindow) {
  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for update...');
  });
  autoUpdater.on('update-available', (info) => {
    log.info(`[Updater] Update available: ${info.version}`);
    // Notify renderer (pos-login uses this)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });
  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] Update not available.');
  });
  autoUpdater.on('error', (err) => {
    log.error(`[Updater] Error: ${err.message}`);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%'; // Fixed 'percentage' vs 'percent'
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    log.info(`[Updater] ${log_message}`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[Updater] Update downloaded: ${info.version}. Ready to install.`);
  });

  // Check for updates on startup (only in production or if packaged)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// ─── Branded splash: never a blank moment ───────────────────────────────────
// The splash is a small frameless window shown INSTANTLY (before the main
// window even starts loading a URL). The main window stays hidden
// (show:false + dark backgroundColor) until the renderer sends "app-ready"
// — i.e. React has mounted AND the boot sequence finished. Then we fade
// the splash out (250ms) and reveal the app. No white flash, ever.
let splashWindow = null;
let appReadyReceived = false;

function splashHtml() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#0f172a;}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;transition:opacity .25s ease;}
body.fade{opacity:0;}
.dots span{display:inline-block;width:7px;height:7px;margin:0 3px;border-radius:99px;background:#6366f1;animation:bl 1.2s infinite ease-in-out;}
.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
@keyframes bl{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
.status{font-size:13px;color:#cbd5e1;min-height:20px;margin:12px 0 0;padding:0 24px;}
.bar{width:280px;height:6px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:12px;}
.fill{height:100%;width:4%;border-radius:99px;background:linear-gradient(90deg,#6366f1,#22d3ee);transition:width .3s ease;}
.pct{font-size:11px;color:#64748b;margin-top:6px;font-variant-numeric:tabular-nums;}
.slow{font-size:11px;color:#94a3b8;margin-top:10px;display:none;padding:0 24px;}
.err{display:none;margin-top:14px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);border-radius:12px;padding:10px 14px;font-size:12px;color:#fca5a5;max-width:320px;}
.btns{display:none;margin-top:12px;gap:8px;}
.btns button{border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer;}
.retry{background:#6366f1;color:#fff;}
.offline{background:rgba(255,255,255,.12);color:#fff;}
</style></head><body>
<div class="dots"><span></span><span></span><span></span></div>
<p class="status" id="st">Preparing your workspace…</p>
<div class="bar"><div class="fill" id="fl"></div></div>
<div class="pct" id="pc">4%</div>
<p class="slow" id="sl">Still preparing… large databases may take longer on first launch.</p>
<div class="err" id="er"></div>
<div class="btns" id="bt"><button class="retry" id="rt">Retry</button><button class="offline" id="co">Continue Offline</button></div>
<script>
var pct=4,fill=document.getElementById('fl'),pc=document.getElementById('pc'),st=document.getElementById('st');
var msgs=['Initializing application…','Loading inventory…','Preparing sales engine…','Connecting to FiscalStack…','Checking printer service…','Finalizing startup…'];var mi=0;
function set(p,m){pct=Math.max(pct,Math.min(100,p));fill.style.width=pct+'%';pc.textContent=Math.round(pct)+'%';if(m)st.textContent=m;}
var t=setInterval(function(){if(pct<24)pct+=2.5;else if(pct<60)pct+=.9;else if(pct<90)pct+=.35;else{mi=(mi+1)%msgs.length;st.textContent=msgs[mi];return;}fill.style.width=pct+'%';pc.textContent=Math.round(pct)+'%';},120);
setTimeout(function(){document.getElementById('sl').style.display='block';},8000);
try{window.electronAPI&&window.electronAPI.onSplashStatus&&window.electronAPI.onSplashStatus(function(s){clearInterval(t);set(s.pct||pct,s.msg);});}catch(e){}
function showErr(m){clearInterval(t);var e=document.getElementById('er');e.textContent=m;e.style.display='block';document.getElementById('bt').style.display='flex';}
document.getElementById('rt').onclick=function(){try{window.electronAPI.splashRetry();}catch(e){location.reload();}};
document.getElementById('co').onclick=function(){try{window.electronAPI.splashContinue();}catch(e){}};
window.__splashError=showErr;
window.__splashDone=function(){clearInterval(t);set(100,'Ready');document.body.classList.add('fade');};
</script></body></html>`)}`;
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0f172a',
    show: true,
    center: true,
    title: 'FieldPOS',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  splashWindow.loadURL(splashHtml());
  splashWindow.on('closed', () => { splashWindow = null; });
}

function pushSplash(pct, msg) {
  try { splashWindow?.webContents.send('splash-status', { pct, msg }); } catch {}
}

function revealMain(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // Fade the splash out (250ms), then reveal — never a POP or white gap.
  try { splashWindow?.webContents.executeJavaScript('window.__splashDone&&window.__splashDone()'); } catch {}
  setTimeout(() => {
    try {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    } catch {}
    splashWindow = null;
    try {
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
    } catch {}
  }, 260);
}

function registerStartupHandshake(mainWindow, posUrl) {
  // Re-entrant (macOS activate re-creates windows) — drop stale handlers first.
  for (const ch of ['renderer-alive', 'app-ready', 'splash-retry', 'splash-continue']) {
    try { ipcMain.removeHandler(ch); } catch {}
  }
  // Renderer mounted at least one frame (React loading in background).
  ipcMain.handle('renderer-alive', () => {
    pushSplash(18, 'Loading modules…');
    return true;
  });
  // React boot sequence finished → fade splash, show app.
  ipcMain.handle('app-ready', () => {
    if (appReadyReceived) return true;
    appReadyReceived = true;
    log.info('[Startup] app-ready received — revealing main window.');
    revealMain(mainWindow);
    return true;
  });
  ipcMain.handle('splash-retry', async () => {
    log.info('[Startup] splash retry — reloading main window.');
    pushSplash(10, 'Retrying…');
    try { await mainWindow.loadURL(posUrl); } catch {}
    return true;
  });
  ipcMain.handle('splash-continue', () => {
    log.info('[Startup] splash continue-offline — revealing main window.');
    appReadyReceived = true;
    revealMain(mainWindow);
    return true;
  });
  // Safety valve: never hang on the splash forever. After 30s, surface
  // Retry / Continue Offline instead of looking frozen.
  setTimeout(() => {
    if (!appReadyReceived && splashWindow && !splashWindow.isDestroyed()) {
      log.warn('[Startup] app-ready timeout (30s) — showing recovery options.');
      splashWindow.webContents
        .executeJavaScript(`window.__splashError&&window.__splashError('Startup is taking longer than expected. You can retry, or continue offline — essentials work without internet.')`)
        .catch(() => {});
    }
  }, 30000);
}

function createWindow() {
  // Requirement 3.6: disable the default application menu
  Menu.setApplicationMenu(null);

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const config = readConfig();

  // Splash appears immediately — before any URL load.
  createSplashWindow();

  // IndexedDB: no CSP or session partition overrides are set here, so the renderer
  // has full access to IndexedDB for offline credential caching, pending sales, and shift data.
  const mainWindow = new BrowserWindow({
    width: width,
    height: height,
    // Requirement 3.5: apply kiosk mode when enabled in config
    kiosk: config.kioskMode === true,
    backgroundColor: '#0f172a', // dark paint — never a white flash while loading
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: "POS Desktop Terminal",
    icon: path.join(__dirname, 'icon.png'), // Placeholder if icon exists
    show: false // hidden until renderer sends app-ready
  });

  // Open DevTools with Ctrl+Shift+I (toggle)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });


  registerIpcHandlers(mainWindow);

  initBarcodeScanner(mainWindow, config.scannerPort);

  const posUrl = resolveStartUrl();
  appReadyReceived = false;
  registerStartupHandshake(mainWindow, posUrl);

  // Surface load progress on the splash (never a frozen look).
  mainWindow.webContents.on('did-start-loading', () => pushSplash(30, 'Checking local database…'));
  mainWindow.webContents.on('did-finish-load', () => pushSplash(50, 'Loading user settings…'));
  mainWindow.webContents.on('did-fail-load', (_e, _code, desc) => {
    log.error(`[Startup] did-fail-load: ${desc}`);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents
        .executeJavaScript(`window.__splashError&&window.__splashError('Unable to connect. Offline mode is available — tried ${posUrl} (${String(desc).slice(0, 120)}).')`)
        .catch(() => {});
    }
  });
  mainWindow.loadURL(posUrl).catch(err => {
    log.error('[Startup] loadURL failed:', err.message);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents
        .executeJavaScript(`window.__splashError&&window.__splashError('POS application failed to load: ${String(err.message).slice(0, 160)}')`)
        .catch(() => {});
    }
    // Last-resort page inside the main window — dark branded, never white.
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem;}
.card{max-width:520px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2rem;}
h2{color:#fca5a5;margin-top:0;}code{color:#93c5fd;word-break:break-all;}
</style></head><body><div class="card">
<h2>POS Application Failed to Load</h2>
<p><strong>Attempted to start at:</strong> <code>${posUrl}</code></p>
<p><strong>Error:</strong> ${err.message}</p>
<p>If testing locally, create <code>config.json</code> in the app userData folder with <code>{"startUrl": "http://localhost:5001/pos-login"}</code>, or ensure your production domain is reachable. Offline mode is available once the app loads.</p>
</div></body></html>`)}`).catch(() => {});
  });

  // Requirement 3.4: intercept will-navigate and block external URLs (same-origin check).
  // Same-origin navigation (e.g., /pos → /reports/pos) is allowed; only cross-origin is blocked.
  // Defensive: never allow /auth in desktop — rewrite to /pos-login (api.ts 401 handler fallback)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      const origin = new URL(posUrl);
      if (target.origin !== origin.origin) {
        event.preventDefault();
        return;
      }
      if (target.pathname === '/auth' || target.pathname.startsWith('/auth/')) {
        event.preventDefault();
        log.warn(`[will-navigate] Blocking /auth → redirecting to /pos-login`);
        mainWindow.loadURL(new URL('/pos-login', origin).toString());
        return;
      }
    } catch (_err) {
      // Malformed URL — block it
      event.preventDefault();
    }
  });

  // SPA fallback: wouter uses history.pushState which doesn't fire will-navigate — catch in-page navigations too
  const redirectAuthToPosLogin = (_event, url) => {
    try {
      const target = new URL(url);
      if (target.pathname === '/auth' || target.pathname.startsWith('/auth/')) {
        log.warn(`[did-navigate] Blocking /auth → redirecting to /pos-login`);
        mainWindow.loadURL(new URL('/pos-login', new URL(posUrl).origin).toString());
      }
    } catch {}
  };
  mainWindow.webContents.on('did-navigate', redirectAuthToPosLogin);
  mainWindow.webContents.on('did-navigate-in-page', redirectAuthToPosLogin);

  // Requirement 3.3: block all new window creation
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', function () {
    app.quit();
  });

  // Initialize updater
  setupAutoUpdater(mainWindow);
}

app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('ready', () => {
  createWindow();
});

// Let the renderer flush IndexedDB writes before the LevelDB lock is released.
// Killing mid-write is the #1 cause of "Internal error opening backing store".
app.on('before-quit', () => {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send('app-closing'); } catch {}
    }
  } catch {}
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
