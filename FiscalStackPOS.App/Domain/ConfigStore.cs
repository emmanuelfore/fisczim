using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Newtonsoft.Json;

namespace FiscalStackPOS
{
    /// <summary>Well-known folders and files used by the product.</summary>
    public static class AppPaths
    {
        public static string OverrideDataDir = null;   // test isolation

        public static string DataDir
        {
            get
            {
                if (!string.IsNullOrEmpty(OverrideDataDir)) return OverrideDataDir;
                string d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "FiscalStack");
                if (!Directory.Exists(d)) Directory.CreateDirectory(d);
                return d;
            }
        }
        public static string AppDir { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        public static string DeviceConfig    { get { return Path.Combine(DataDir, "config.ini"); } }
        public static string PosState        { get { return Path.Combine(DataDir, "pos_state.json"); } }
        public static string Journal         { get { return Path.Combine(DataDir, "receipts.json"); } }
        public static string ProductsFile    { get { return Path.Combine(DataDir, "products.json"); } }
        public static string HoldsFile       { get { return Path.Combine(DataDir, "holds.json"); } }
        public static string SubmissionsDir  { get { return Path.Combine(DataDir, "Submissions"); } }
    }

    /// <summary>
    /// Minimal INI reader/writer matching the FiscalStack engine format:
    /// KEY=VALUE lines, ';' and '#' comments, [sections] ignored.
    /// </summary>
    public class IniFile
    {
        public List<KeyValuePair<string, string>> Entries = new List<KeyValuePair<string, string>>();
        private readonly Dictionary<string, int> Index = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        public static IniFile Load(string path)
        {
            IniFile ini = new IniFile();
            if (File.Exists(path))
            {
                foreach (string raw in File.ReadAllLines(path))
                {
                    string line = raw.Trim();
                    if (line.Length == 0) continue;
                    if (line.StartsWith("[") && line.EndsWith("]")) continue;
                    if (line.StartsWith(";") || line.StartsWith("#")) continue;
                    int idx = line.IndexOf('=');
                    if (idx <= 0) continue;
                    ini.Set(line.Substring(0, idx).Trim(), line.Substring(idx + 1).Trim());
                }
            }
            return ini;
        }

        public string Get(string key, string fallback)
        {
            int i;
            return Index.TryGetValue(key, out i) ? Entries[i].Value : fallback;
        }

        public void Set(string key, string value)
        {
            int i;
            if (Index.TryGetValue(key, out i)) Entries[i] = new KeyValuePair<string, string>(key, value);
            else { Index[key] = Entries.Count; Entries.Add(new KeyValuePair<string, string>(key, value)); }
        }

        public void Save(string path)
        {
            StringBuilder sb = new StringBuilder();
            foreach (var kv in Entries) sb.Append(kv.Key).Append('=').Append(kv.Value).Append("\r\n");
            AtomicWrite(path, sb.ToString());
        }

        public static void AtomicWrite(string path, string content)
        {
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, content, Encoding.UTF8);
            File.Copy(tmp, path, true);
            try { File.Delete(tmp); } catch { }
        }
    }

    /// <summary>
    /// ZIMRA endpoint authority. The compiled FiscalStack.dll carries a stale
    /// hardcoded QRURL fallback, so the app must always pin ZIMRASERVER,
    /// VERIFICATIONSERVER and QRURL (= verification server) into both the
    /// ProgramData config and the app-dir config. Test pair uses
    /// fdmsapitest/fdmstest, prod pair uses fdmsapi/fdms.
    /// </summary>
    public static class ZimraEndpoints
    {
        public const string TestZimra = "https://fdmsapitest.zimra.co.zw";
        public const string TestVerif = "https://fdmstest.zimra.co.zw";
        public const string ProdZimra = "https://fdmsapi.zimra.co.zw";
        public const string ProdVerif = "https://fdms.zimra.co.zw";

        public static bool IsTest(string zimraUrl)
        {
            return !string.IsNullOrEmpty(zimraUrl) &&
                zimraUrl.IndexOf("test", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        /// <summary>
        /// Reads ZIMRASERVER from the device config, derives the matching
        /// VERIFICATIONSERVER + QRURL pair, and writes all three back to both
        /// config locations. Returns the effective ZIMRA server URL.
        /// </summary>
        public static string Ensure()
        {
            try
            {
                IniFile cfg = File.Exists(AppPaths.DeviceConfig)
                    ? IniFile.Load(AppPaths.DeviceConfig) : new IniFile();
                string zimra = cfg.Get("ZIMRASERVER", ProdZimra);
                if (string.IsNullOrEmpty(zimra)) zimra = ProdZimra;
                bool test = IsTest(zimra);
                string verif = test ? TestVerif : ProdVerif;
                cfg.Set("ZIMRASERVER", zimra);
                cfg.Set("VERIFICATIONSERVER", verif);
                cfg.Set("QRURL", verif);
                cfg.Save(AppPaths.DeviceConfig);
                try { cfg.Save(Path.Combine(AppPaths.AppDir, "config.ini")); }
                catch { }
                return zimra;
            }
            catch { return ""; }
        }
    }

    /// <summary>POS preferences persisted in pos_state.json (runtime-editable).</summary>
    public class PosSettings
    {
        public string PrinterName = "";
        public string ReceiptWidth = "48";          // "48" or "80"
        public bool AutoPrint = true;
        public bool ShowPrintPreview = false;
        public string LogoFile = "";
        public string InvoiceCurrency = "USD";
        public int OnlineCheckIntervalSec = 60;
        public bool SubmitWhenOnline = true;
        public string InvoicePrefix = "INV";
        public int InvoiceDigits = 6;
        public bool PricesIncludeVat = true;        // shelf prices are VAT-inclusive
        public bool OpenDrawerOnPrint = false;      // send ESC/POS drawer pulse after a sale print

        public string CurrencySymbol
        {
            get
            {
                switch ((InvoiceCurrency ?? "").ToUpperInvariant())
                {
                    case "USD": case "ZWL": case "ZAR": case "AUD": case "CAD": return "$";
                    case "EUR": return "€";
                    case "GBP": return "£";
                    case "BWP": return "P";
                    default: return (InvoiceCurrency ?? "") + " ";
                }
            }
        }
    }

    /// <summary>POS counters + misc state.</summary>
    public class PosState
    {
        public PosSettings Settings = new PosSettings();
        public int InvoiceSequence = 1;
        public string CurrentFiscalDayNo = "";
        public string CurrentFiscalDate = "";
        public string Language = "en";      // "en" or "zh-CN"

        // logged-in session
        public string CurrentUsername = "";
        public string CurrentFullName = "";
        public int CurrentAccessLevel = 0;

        // cash register / till
        public bool TillOpen = false;
        public decimal StartingCash = 0m;
        public string TillOpenedUtc = "";
        public string TillOpenedBy = "";
        public int ZReportSequence = 0;
    }

    /// <summary>Cash-register helper: till status + opened-at time.</summary>
    public static class TillState
    {
        public static bool IsOpen(PosState s) { return s.TillOpen; }

        public static void Open(PosState s, decimal startingCash, string byUser)
        {
            s.TillOpen = true;
            s.StartingCash = Math.Max(0m, startingCash);
            s.TillOpenedUtc = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture);
            s.TillOpenedBy = byUser;
            PosStateStore.Save(s);
        }

        public static void Close(PosState s)
        {
            s.TillOpen = false;
            s.StartingCash = 0m;
            s.TillOpenedUtc = "";
            s.TillOpenedBy = "";
            PosStateStore.Save(s);
        }

        public static DateTime? OpenedAt(PosState s)
        {
            DateTime d;
            if (string.IsNullOrEmpty(s.TillOpenedUtc)) return null;
            if (DateTime.TryParse(s.TillOpenedUtc, null, System.Globalization.DateTimeStyles.RoundtripKind, out d)) return d.ToLocalTime();
            return null;
        }
    }

    /// <summary>Loads/saves pos_state.json safely.</summary>
    public static class PosStateStore
    {
        public static PosState Load()
        {
            try
            {
                if (File.Exists(AppPaths.PosState))
                    return JsonConvert.DeserializeObject<PosState>(File.ReadAllText(AppPaths.PosState)) ?? new PosState();
            }
            catch { }
            return new PosState();
        }

        public static void Save(PosState state)
        {
            try { IniFile.AtomicWrite(AppPaths.PosState, JsonConvert.SerializeObject(state, Formatting.Indented)); }
            catch { }
        }
    }

    /// <summary>Next invoice number (prefix + zero-padded sequence).</summary>
    public static class InvoiceNumbers
    {
        public static string Next(PosState state)
        {
            string s = state.Settings.InvoicePrefix ?? "INV";
            int digits = state.Settings.InvoiceDigits;
            if (digits < 1) digits = 1;
            string num = state.InvoiceSequence.ToString("D" + digits.ToString());
            state.InvoiceSequence++;
            return s + num;
        }
    }
}