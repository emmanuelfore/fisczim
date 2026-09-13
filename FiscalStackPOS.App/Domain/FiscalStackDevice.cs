using System;
using System.Security;
using System.Text;
using System.Xml.Linq;
using System.Xml;
using FiscalStack;
using Newtonsoft.Json.Linq;

namespace FiscalStackPOS
{
    /// <summary>Parsed company info from GetCardDetails / GetLicense.</summary>
    public class CardInfo
    {
        public string CompanyName, Address, TIN, VAT, SerialNumber, LicenseStatus = "";
        public string LicenseCompany = "";
        public string LicenseExpiry = "";
        public bool Ok;
    }

    /// <summary>Parsed result of a FiscalizeSale call.</summary>
    public class FiscalResult
    {
        public bool Ok;
        public string Code = "";
        public string Message = "";
        public string DataXml = "";
        public string QrUrl = "";
        public string DeviceHash = "";
        public string FiscalDayNo = "";
        public string ReceiptGlobalNo = "";
        public string SerialNumber = "";
    }

    /// <summary>
    /// Single-instance thread-safe wrapper around the clean-room FiscalStack
    /// server-to-server engine (FiscalStack.dll). Every method returns the raw
    /// FiscalStack JSON envelope; licensing is enforced by the engine from the
    /// APIKEY + ACTIVATIONSERVER config. Fully offline-capable.
    /// </summary>
    public sealed class FiscalStackDevice : IDisposable
    {
        private readonly FiscalStack.FiscalStack lib;
        private readonly object gate = new object();
        private bool disposed;

        public FiscalStackDevice() { lib = new FiscalStack.FiscalStack(); }

        private string Call(Func<string> fn)
        {
            try { lock (gate) return fn(); }
            catch (Exception ex) { return FailureText(ex); }
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            GC.SuppressFinalize(this);
        }

        // ---- licensing / company -----------------------------------------
        public string GetCardDetails() { return Call(() => lib.GetCardDetails()); }
        public string GetLicense()     { return Call(() => lib.GetLicense()); }
        public string SetLicense(string key) { return Call(() => lib.SetLicense(key)); }
        public string GetCertificateDetails() { return Call(() => lib.GetCertificateDetails()); }
        public string GenerateDeviceCertificates(string serial, string key, string deviceId)
        { return Call(() => lib.GenerateDeviceCertificates(serial, key, deviceId)); }
        public string VerifyCertificateDetails(string serial, string key, string deviceId)
        { return Call(() => lib.VerifyCertificateDetails(serial, key, deviceId)); }

        // ---- introspection ------------------------------------------------
        public string GetConfig()  { return Call(() => lib.GetConfig()); }
        public string GetStatus()  { return Call(() => lib.GetStatus()); }
        public string GetDeviceStatus() { return Call(() => lib.GetDeviceStatus()); }
        public string GetDeviceConfig() { return Call(() => lib.GetDeviceConfig()); }

        // ---- fiscal day -----------------------------------------------------
        public string OpenDay()  { return Call(() => lib.OpenDay()); }
        public string CloseDay() { return Call(() => lib.CloseDay()); }
        public string ZReport()  { return Call(() => lib.ZReport()); }

        // ---- transactions ----------------------------------------------------
        public string TransactM(string currency, string email, string invoiceNo, string customerName,
            string customerVat, string address, string phone, string tin, string amount, string taxAmount,
            string flag, string comment, string originalInvoiceNo, string itemsXml, string currenciesXml)
        {
            return Call(() => lib.TransactM(currency, email, invoiceNo, customerName, customerVat, address,
                phone, tin, amount, taxAmount, flag, comment, originalInvoiceNo, itemsXml, currenciesXml));
        }

        public string GetTransaction(string invoiceNo) { return Call(() => lib.GetTransaction(invoiceNo)); }
        public string GetTransaction1(string invoiceNo) { return Call(() => lib.GetTransaction1(invoiceNo)); }

        // ---- offline queue / FDMS submission primitives ---------------------
        public string GetUnProcessedTransactions(string fiscalDayNumber, int page, int pageSize)
        { return Call(() => lib.GetUnProcessedTransactions(fiscalDayNumber, page, pageSize)); }
        public string GetUnProcessedTransactionsByDate(string fiscalDate, int page, int pageSize)
        { return Call(() => lib.GetUnProcessedTransactionsByDate(fiscalDate, page, pageSize)); }
        public string GetUnProcessedTransactionsSummary(string fiscalDayNumber, string fiscalDate)
        { return Call(() => lib.GetUnProcessedTransactionsSummary(fiscalDayNumber, fiscalDate)); }
        public string ClearUnprocessedTransactions(string fiscalDayNumber)
        { return Call(() => lib.ClearUnprocessedTransactions(fiscalDayNumber)); }
        public string ClearUnprocessedTransactionsByDate(string fiscalDate)
        { return Call(() => lib.ClearUnprocessedTransactionsByDate(fiscalDate)); }
        public string SubmitFile(string fiscalDayNumber, string fiscalDate)
        { return Call(() => lib.SubmitFile(fiscalDayNumber, fiscalDate)); }

        // ---- POS helpers ------------------------------------------------------

        /// <summary>Fiscalises a POS sale (fully offline -> QR + device signature).</summary>
        public FiscalResult FiscalizeSale(PosSale sale, string companyAddress)
        {
            string raw = TransactM(
                sale.Currency,
                sale.CustomerEmail,
                sale.InvoiceNumber,
                sale.CustomerName,
                sale.CustomerVat,
                string.IsNullOrEmpty(sale.CustomerAddress) ? companyAddress : sale.CustomerAddress,
                sale.CustomerPhone,
                sale.CustomerTin,
                sale.Subtotal.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture),
                sale.VatTotal.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture),
                sale.InvoiceFlag,
                !string.IsNullOrEmpty(sale.InvoiceComment) ? sale.InvoiceComment :
                    (sale.OriginalInvoiceNumber.Length > 0 ? "Original: " + sale.OriginalInvoiceNumber : ""),
                sale.OriginalInvoiceNumber,
                BuildItemsXml(sale),
                BuildCurrenciesXml(sale));
            return ParseResult(raw);
        }

        /// <summary>Parses a FiscalizeSale JSON envelope + FDMSData XML.</summary>
        public static FiscalResult ParseResult(string raw)
        {
            FiscalResult r = new FiscalResult();
            if (string.IsNullOrEmpty(raw)) { r.Message = "Empty response"; return r; }
            try
            {
                JObject o = JObject.Parse(raw);
                r.Code = o["Code"] == null ? "" : o["Code"].ToString();
                r.Message = o["Message"] == null ? "" : o["Message"].ToString();
                r.Ok = r.Code == "1";
                string data = o["Data"] != null ? o["Data"].ToString() : "";
                if (!string.IsNullOrEmpty(data) && data.TrimStart().StartsWith("<"))
                {
                    r.DataXml = data;
                    XElement x = XElement.Parse(data);
                    r.QrUrl = El(x, "QRCode");
                    r.FiscalDayNo = El(x, "FiscalDayNo");
                    r.ReceiptGlobalNo = El(x, "ReceiptGlobalNo");
                    r.SerialNumber = El(x, "DeviceID");
                    XElement sig = x.Element("receiptDeviceSignature");
                    if (sig != null) r.DeviceHash = El(sig, "hash");
                }
            }
            catch (Exception ex) { r.Message = "Parse error: " + ex.Message; }
            return r;
        }

        /// <summary>Company info from the CardDetails envelope.</summary>
        public CardInfo ReadCard(string json)
        {
            CardInfo c = new CardInfo();
            try
            {
                JObject o = JObject.Parse(json);
                if (o["Code"] == null || o["Code"].ToString() != "1") return c;
                string data = o["Data"] != null ? o["Data"].ToString() : "";
                XElement x = XElement.Parse(data);
                c.CompanyName = El(x, "TaxPayerName");
                c.TIN = El(x, "TaxPayerTIN");
                c.VAT = El(x, "VatNumber");
                c.SerialNumber = El(x, "DeviceSerialNo");
                string branch = El(x, "DeviceBranchName");
                XElement addr = x.Element("DeviceBranchAddress");
                string city = addr != null ? El(addr, "city") : "";
                c.Address = (branch + (city.Length > 0 ? ", " + city : "")).Trim();
                c.Ok = !string.IsNullOrEmpty(c.CompanyName) || !string.IsNullOrEmpty(c.SerialNumber);
            }
            catch { }
            return c;
        }

        /// <summary>Company details + license expiry from GetLicense XML.</summary>
        public CardInfo ReadLicense(string json)
        {
            CardInfo c = new CardInfo();
            c.Ok = false;
            try
            {
                JObject o = JObject.Parse(json);
                if (o["Code"] == null || o["Code"].ToString() != "1") { c.LicenseStatus = o["Message"] != null ? o["Message"].ToString() : ""; return c; }
                string data = o["Data"] != null ? o["Data"].ToString() : "";
                XElement x = XElement.Parse(data);
                c.LicenseStatus = El(x, "Status");
                c.LicenseCompany = El(x, "CompanyName");
                c.SerialNumber = El(x, "SerialNumber");
                c.LicenseExpiry = El(x, "ExpiryDate");
                c.Ok = c.LicenseStatus.IndexOf("Active", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch { }
            return c;
        }

        public bool IsFiscalDayClosed(string statusJson)
        {
            try
            {
                JObject o = JObject.Parse(statusJson);
                if (o["Code"] == null || o["Code"].ToString() != "1" || o["Data"] == null) return false;
                JObject d = JObject.Parse(o["Data"].ToString());
                JToken s = d["FiscalDayStatus"];
                if (s == null) return false;
                return s.ToString().IndexOf("Closed", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch { return false; }
        }

        public string GetLastFiscalDayNo(string statusJson)
        {
            try
            {
                JObject o = JObject.Parse(statusJson);
                if (o["Code"] != null && o["Code"].ToString() == "1" && o["Data"] != null)
                {
                    JObject d = JObject.Parse(o["Data"].ToString());
                    JToken t = d["LastFiscalDayNo"];
                    if (t != null) return t.ToString();
                }
            }
            catch { }
            return "0";
        }

        // ---- XML builders ----------------------------------------------------

        public static string BuildItemsXml(PosSale sale)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("<ITEMS>");
            int n = 0;
            foreach (PosItem it in sale.Items)
            {
                n++;
                sb.Append("<ITEM>");
                sb.Append("<HH>").Append(n).Append("</HH>");
                sb.Append("<ITEMCODE>").Append(Esc(it.HsCode)).Append("</ITEMCODE>");
                sb.Append("<ITEMNAME1>").Append(Esc(it.Name)).Append("</ITEMNAME1>");
                sb.Append("<ITEMNAME2>").Append(Esc(it.Name)).Append("</ITEMNAME2>");
                sb.Append("<QTY>").Append(it.Quantity.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)).Append("</QTY>");
                sb.Append("<PRICE>").Append(it.Price.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)).Append("</PRICE>");
                sb.Append("<AMT>").Append(it.Amount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)).Append("</AMT>");
                sb.Append("<TAX>").Append(it.Tax.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)).Append("</TAX>");
                sb.Append("<TAXR>").Append(it.TaxRate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)).Append("</TAXR>");
                sb.Append("</ITEM>");
            }
            sb.Append("</ITEMS>");
            return sb.ToString();
        }

        public static string BuildCurrenciesXml(PosSale sale)
        {
            string c = string.IsNullOrEmpty(sale.Currency) ? "USD" : sale.Currency;
            StringBuilder sb = new StringBuilder();
            sb.Append("<CurrenciesReceived><Currency>");
            sb.Append("<Name>").Append(Esc(c)).Append("</Name>");
            sb.Append("<Amount>").Append(sale.Subtotal.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)).Append("</Amount>");
            sb.Append("<Rate>1</Rate>");
            sb.Append("</Currency></CurrenciesReceived>");
            return sb.ToString();
        }

        private static string El(XElement x, string name)
        {
            if (x == null) return "";
            XElement e = x.Element(name);
            return e == null ? "" : (e.Value ?? "").Trim();
        }

        private static string Esc(string s)
        {
            return string.IsNullOrEmpty(s) ? "" : SecurityElement.Escape(s);
        }

        private static string FailureText(Exception ex)
        {
            return "{\"Code\":\"0\",\"Message\":\"Engine exception: " +
                SecurityElement.Escape(ex.Message) + "\",\"Data\":\"\"}";
        }
    }
}