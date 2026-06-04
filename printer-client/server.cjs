/**
 * POS Silent Print Server
 * 
 * This is a standalone middleware to enable silent printing from the browser.
 * It receives HTML content, converts it to a temporary PDF, and sends it to the default printer.
 * 
 * Requirements:
 * - Node.js installed
 * - Dependencies: npm install express cors body-parser pdf-to-printer puppeteer-core
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const ptp = require('pdf-to-printer');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const port = 12312; // Default port for our print server

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Middleware for binary raw data
const rawParser = bodyParser.raw({ type: 'application/octet-stream', limit: '10mb' });

// Helper to find Chrome/Edge on Windows
function getEdgePath() {
    const paths = [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

app.post('/print', async (req, res) => {
    const { html, printerName } = req.body;

    if (!html) {
        return res.status(400).json({ error: 'No HTML content provided' });
    }

    const tempPdfPath = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
    let browser = null;

    try {
        console.log('--- Received print request ---');

        // 1. Render HTML to PDF using Edge (since it's usually on Windows)
        // Adjust executablePath if they have Chrome or want to use puppeteer's built-in one
        const executablePath = getEdgePath();

        if (!executablePath) {
            throw new Error('Microsoft Edge not found. Please install Edge or update executablePath in the script.');
        }

        browser = await puppeteer.launch({
            executablePath: executablePath,
            headless: true
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // POS Receipts are usually 80mm wide. Height is auto.
        await page.pdf({
            path: tempPdfPath,
            width: '80mm',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        console.log(`Generated PDF at: ${tempPdfPath}`);

        // 2. Send to printer
        const options = {};
        if (printerName) {
            options.printer = printerName;
        }

        console.log(`Sending to printer: ${printerName || 'Default'}`);
        await ptp.print(tempPdfPath, options);
        console.log('Print job sent successfully');

        res.json({ success: true, message: 'Print job sent' });

    } catch (error) {
        console.error('Print Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
        // Cleanup
        if (fs.existsSync(tempPdfPath)) {
            try { fs.unlinkSync(tempPdfPath); } catch (e) { }
        }
    }
});

app.post('/print-raw', rawParser, async (req, res) => {
    const data = req.body;
    const printerName = req.query.printer || req.query.printerName || req.headers['x-printer-name'];

    if (!data || data.length === 0) {
        console.error('Print-Raw: No data received');
        return res.status(400).json({ error: 'No raw data provided' });
    }

    const tempFilePath = path.join(os.tmpdir(), `receipt_${Date.now()}.bin`);
    
    try {
        console.log(`--- Received raw print request (${data.length} bytes) ---`);
        fs.writeFileSync(tempFilePath, data);

        // Windows command to send raw bytes to a printer (extremely robust for thermal printers)
        const printerTarget = printerName ? `"${printerName}"` : `(Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default = TRUE").Name`;
        
        // This PowerShell script uses P/Invoke to call Win32 Spooler APIs directly for bit-perfect raw data transfer
        const psCommand = `
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
                public static void Send(string printer, byte[] bytes) {
                    IntPtr h;
                    var di = new DOCINFOA { pDocName = "RAW", pDataType = "RAW" };
                    if (OpenPrinter(printer, out h, IntPtr.Zero)) {
                        if (StartDocPrinter(h, 1, di)) {
                            if (StartPagePrinter(h)) {
                                IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
                                Marshal.Copy(bytes, 0, p, bytes.Length);
                                Int32 w;
                                WritePrinter(h, p, bytes.Length, out w);
                                EndPagePrinter(h);
                                Marshal.FreeCoTaskMem(p);
                            }
                            EndDocPrinter(h);
                        }
                        ClosePrinter(h);
                    }
                }
            }
'@;
            Add-Type -TypeDefinition $code;
            [RawPrint]::Send(${printerTarget}, [System.IO.File]::ReadAllBytes('${tempFilePath.replace(/\\/g, '\\\\')}'));
        `.replace(/\n/g, ' ');
        
        require('child_process').exec(`powershell -Command "${psCommand}"`, (err) => {
            if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch(e) {}
            }
            if (err) {
                console.error('Native Raw Print Error:', err);
                return res.status(500).json({ error: 'Failed to send raw data to spooler: ' + err.message });
            }
            console.log('Raw bytes sent to spooler successfully');
            res.json({ success: true, message: 'Raw print job sent' });
        });

    } catch (error) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        console.error('Raw Print Exception:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/printers', async (req, res) => {
    try {
        const printers = await ptp.getPrinters();
        res.json(printers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({ status: 'running', port });
});

app.listen(port, () => {
    console.log(`POS Print Server running at http://localhost:${port}`);
    console.log(`Click to test: http://localhost:${port}/status`);
});
