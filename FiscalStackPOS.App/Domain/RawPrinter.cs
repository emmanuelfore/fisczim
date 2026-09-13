using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace FiscalStackPOS
{
    /// <summary>
    /// Low-level Windows spooler access for ESC/POS: opening the cash drawer
    /// (drawer pulse) and sending raw bytes to the thermal printer.
    /// </summary>
    public static class RawPrinter
    {
        private struct DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
        private struct PRINTER_DEFAULTS { public IntPtr pDatatype; public IntPtr pDevMode; public int DesiredAccess; }

        [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
        private static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool ClosePrinter(IntPtr hPrinter);
        [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
        private static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndDocPrinter(IntPtr hPrinter);
        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool StartPagePrinter(IntPtr hPrinter);
        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool EndPagePrinter(IntPtr hPrinter);
        [DllImport("winspool.drv", SetLastError = true)]
        private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

        public static string Resolve(string printerName)
        {
            if (string.IsNullOrEmpty(printerName) || printerName == "Default")
            {
                var ps = new System.Drawing.Printing.PrinterSettings();
                return ps.PrinterName;
            }
            return printerName;
        }

        /// <summary>Opens the cash drawer with an ESC/POS pulse (uses the receipt printer's drawer kick port).</summary>
        public static void DrawerPulse(string printerName, int onMs = 50, int offMs = 2000)
        {
            byte[] cmd = new byte[]
            {
                0x1B, 0x70, 0x00,                      // ESC p 0 => pulse pin 2
                0x19, 0xFA                            // on-time 25 units(each 2ms=50ms) + off-time 2000ms
            };
            SendBytes(printerName, cmd, "DRAWER PULSE");
        }

        /// <summary>Sends raw bytes to the printer and silently swallows failures.</summary>
        public static void SendBytes(string printerName, byte[] data, string docName)
        {
            if (data == null || data.Length == 0) return;
            string resolved = Resolve(printerName);
            if (string.IsNullOrEmpty(resolved)) return;
            if (resolved == "Microsoft XPS Document Writer" || resolved == "Microsoft Print to PDF") return;

            IntPtr hPrinter = IntPtr.Zero;
            if (!OpenPrinter(resolved, out hPrinter, IntPtr.Zero)) return;
            try
            {
                DOCINFOA di = new DOCINFOA();
                di.pDocName = docName ?? "FiscalStack POS";
                di.pDataType = "RAW";
                int job = StartDocPrinter(hPrinter, 1, ref di);
                if (job == 0) return;
                StartPagePrinter(hPrinter);
                int written = 0;
                WritePrinter(hPrinter, data, data.Length, out written);
                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }
    }
}