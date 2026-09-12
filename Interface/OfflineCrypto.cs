using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.OpenSsl;
using Org.BouncyCastle.Security;

namespace Revmax_Interface_Promun
{
    public class OfflineStateData
    {
        [JsonProperty("privateKey")]
        public string PrivateKey { get; set; }

        [JsonProperty("deviceId")]
        public string DeviceId { get; set; }

        [JsonProperty("lastFiscalHash")]
        public string LastFiscalHash { get; set; }

        [JsonProperty("currentFiscalDayNo")]
        public int CurrentFiscalDayNo { get; set; }

        [JsonProperty("dailyReceiptCount")]
        public int DailyReceiptCount { get; set; }

        [JsonProperty("lastReceiptGlobalNo")]
        public int LastReceiptGlobalNo { get; set; }
    }

    public class OfflineCrypto
    {
        private static readonly string StateFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "offline_state.json");
        private OfflineStateData _state;

        public OfflineStateData State
        {
            get { return _state; }
        }

        public OfflineCrypto()
        {
            LoadState();
        }

        public void SaveState(string json)
        {
            File.WriteAllText(StateFile, json);
            LoadState();
        }

        private void LoadState()
        {
            if (File.Exists(StateFile))
            {
                try
                {
                    string json = File.ReadAllText(StateFile);
                    _state = JsonConvert.DeserializeObject<OfflineStateData>(json);
                }
                catch { _state = null; }
            }
        }

        public bool IsConfigured()
        {
            return _state != null && !string.IsNullOrEmpty(_state.PrivateKey) && !string.IsNullOrEmpty(_state.DeviceId);
        }

        public void IncrementCounters(string newHash)
        {
            if (_state != null)
            {
                _state.DailyReceiptCount++;
                _state.LastReceiptGlobalNo++;
                _state.LastFiscalHash = newHash;
                SaveState(JsonConvert.SerializeObject(_state, Formatting.Indented));
            }
        }

        private string GetHashBase64(string data)
        {
            using (var sha256 = SHA256.Create())
            {
                byte[] bytes = Encoding.UTF8.GetBytes(data);
                byte[] hash = sha256.ComputeHash(bytes);
                return Convert.ToBase64String(hash);
            }
        }

        public string SignData(string data)
        {
            string pk = (_state != null) ? _state.PrivateKey : null;
            if (string.IsNullOrEmpty(pk))
                throw new Exception("Missing offline private key");

            using (var reader = new StringReader(pk))
            {
                var pemReader = new PemReader(reader);
                var keyPair = (AsymmetricCipherKeyPair)pemReader.ReadObject();
                
                var signer = SignerUtilities.GetSigner("SHA-256withRSA");
                signer.Init(true, keyPair.Private);
                
                byte[] bytes = Encoding.UTF8.GetBytes(data);
                signer.BlockUpdate(bytes, 0, bytes.Length);
                byte[] signature = signer.GenerateSignature();
                
                return Convert.ToBase64String(signature);
            }
        }

        public string CalculateVerificationCode(string signatureBase64)
        {
            try
            {
                byte[] signatureBytes = Convert.FromBase64String(signatureBase64);
                string hex = BitConverter.ToString(signatureBytes).Replace("-", "").ToUpper();
                
                using (var md5 = MD5.Create())
                {
                    byte[] hexBytes = Encoding.UTF8.GetBytes(hex);
                    byte[] md5Hash = md5.ComputeHash(hexBytes);
                    string md5Hex = BitConverter.ToString(md5Hash).Replace("-", "").ToUpper();
                    return string.Format("{0}-{1}-{2}-{3}", md5Hex.Substring(0, 4), md5Hex.Substring(4, 4), md5Hex.Substring(8, 4), md5Hex.Substring(12, 4));
                }
            }
            catch (Exception)
            {
                return "";
            }
        }

        // Mirrors the server's prepareReceipt taxCode fallback (assigned when the
        // receipt line has no taxCode): taxID 3 -> 'A' (Standard), 2 -> 'B' (Zero
        // Rated), 1 -> 'C' (Exempt), 4 -> 'E', anything else -> 'A'. Offline items
        // only carry a rate, so resolve the taxID the server would use
        // (ZimraDevice.getTaxID: 15.5/15 -> 3, 0 -> 2, else -> 3).
        private static string TaxCodeForRate(decimal rate)
        {
            int taxID = (rate == 15.5m || rate == 15m) ? 3 : (rate == 0 ? 2 : 3);
            if (taxID == 3) return "A";
            if (taxID == 2) return "B";
            if (taxID == 1) return "C";
            if (taxID == 4) return "E";
            return "A";
        }

        public string GenerateOfflineSignatureString(PassThroughFiscalizeRequest request, out string stringToSign)
        {
            if (!IsConfigured())
                throw new Exception("Offline state not fully configured.");

            int deviceId = int.Parse(_state.DeviceId);
            string rType = (request.TransactionType ?? "FiscalInvoice").ToUpper();
            string rCurr = (request.Currency ?? "USD").ToUpper();
            int rGlobal = _state.LastReceiptGlobalNo + 1;
            string rDate = request.Date;
            
            decimal total = 0;
            var taxMap = new Dictionary<string, KeyValuePair<decimal, decimal>>();

            foreach (var item in request.Items)
            {
                decimal lineTotal = item.Quantity * item.UnitPrice;

                if (rType == "CREDITNOTE")
                {
                    if (lineTotal > 0) lineTotal = -lineTotal;
                }

                decimal taxRate = item.TaxRate;
                string taxKey = taxRate.ToString("0.00");

                // ZIMRA signs the GROSS total (net + tax), aggregated unrounded
                // per tax bucket and rounded once — matches the server's
                // prepareReceipt exactly (RCPT027/RCPT037/RCPT020).
                decimal taxAmount = lineTotal * (taxRate / 100);
                decimal salesWithTax = lineTotal + taxAmount;
                total += salesWithTax;

                if (!taxMap.ContainsKey(taxKey))
                    taxMap[taxKey] = new KeyValuePair<decimal, decimal>(0, 0);

                var cur = taxMap[taxKey];
                taxMap[taxKey] = new KeyValuePair<decimal, decimal>(cur.Key + taxAmount, cur.Value + salesWithTax);
            }

            int rTotal = (int)Math.Round(total * 100);

            var sortedTaxes = taxMap.OrderBy(t => decimal.Parse(t.Key)).ToList();
            StringBuilder taxesStr = new StringBuilder();

            foreach (var tax in sortedTaxes)
            {
                decimal pct = decimal.Parse(tax.Key);
                // Always emit "0.00" for zero-rated lines to match the server's
                // prepareReceipt signature string (only taxID 1 Exempt omits the
                // percent, which cannot be distinguished offline).
                string pctStr = pct.ToString("0.00");
                int amount = (int)Math.Round(tax.Value.Key * 100);
                int sales = (int)Math.Round(tax.Value.Value * 100);
                // ZIMRA spec 13.2.1 concatenates each tax line as
                // taxCode || taxPercent || taxAmount || salesAmountWithTax.
                // The server's prepareReceipt always assigns a taxCode to the
                // payload taxes (3/else -> 'A', 2 -> 'B', 1 -> 'C', 4 -> 'E'),
                // so the offline signature must include it too, otherwise ZIMRA
                // rejects the synced receipt with RCPT020.
                taxesStr.Append(string.Format("{0}{1}{2}{3}", TaxCodeForRate(pct), pctStr, amount, sales));
            }

            string prevHash = (_state.DailyReceiptCount == 0) ? "" : _state.LastFiscalHash;

            stringToSign = string.Format("{0}{1}{2}{3}{4}{5}{6}{7}", deviceId, rType, rCurr, rGlobal, rDate, rTotal, taxesStr, prevHash);
            return SignData(stringToSign);
        }
    }
}
