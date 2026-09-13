using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace FiscalStackPOS
{
    /// <summary>
    /// Offline-first FDMS submission. While the machine is offline the engine
    /// fiscalises locally and queue entries accumulate; when online the service
    /// builds the signed FDMS file for each fiscal day (engine SubmitFile),
    /// POSTs it to ZIMRA FDMS, archives the payload, and clears the engine queue.
    /// </summary>
    public class SubmissionService
    {
        private readonly FiscalStackDevice device;
        private readonly PosState state;
        private readonly ReceiptJournal journal;
        private readonly HttpClient http;

        public SubmissionService(FiscalStackDevice device, PosState state, ReceiptJournal journal)
        {
            this.device = device;
            this.state = state;
            this.journal = journal;
            http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
        }

        public bool IsOnline()
        {
            string server = GetZimraServer();
            try
            {
                Uri u = new Uri(server);
                HttpClient quick = new HttpClient();
                quick.Timeout = TimeSpan.FromSeconds(4);
                var resp = quick.GetAsync("", HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult();
                bool ok = resp != null && (int)resp.StatusCode < 500;
                try { resp.Dispose(); } catch { }
                return ok;
            }
            catch { return false; }
        }

        private string GetZimraServer()
        {
            string s = DeviceConfigValue("ZIMRASERVER");
            if (string.IsNullOrEmpty(s)) s = "https://fdmsapi.zimra.co.zw";
            if (s.EndsWith("/")) s = s.TrimEnd('/');
            return s + "/";
        }

        private string GetVerificationServer()
        {
            string s = DeviceConfigValue("VERIFICATIONSERVER");
            if (string.IsNullOrEmpty(s)) s = "https://fdms.zimra.co.zw";
            if (s.EndsWith("/")) s = s.TrimEnd('/');
            return s + "/";
        }

        private string DeviceConfigValue(string key)
        {
            string path = AppPaths.DeviceConfig;
            if (!File.Exists(path)) path = Path.Combine(AppPaths.AppDir, "config.ini");
            IniFile ini = IniFile.Load(path);
            string v = ini.Get(key, "");
            return v;
        }

        /// <summary>
        /// Runs one submission pass for the current fiscal day. Returns a human
        /// readable result. Safe to call whenever (queues are small; payloads
        /// are idempotent per day).
        /// </summary>
        public SubmitOutcome SubmitPending(string fiscalDayNo, string fiscalDate)
        {
            SubmitOutcome o = new SubmitOutcome();
            if (string.IsNullOrEmpty(fiscalDayNo)) { o.Message = "No open fiscal day to submit."; return o; }
            // snapshot the queue summary before we touch anything
            string summary = device.GetUnProcessedTransactionsSummary(fiscalDayNo, fiscalDate);
            if (string.IsNullOrEmpty(summary)) { o.Message = "No queued transactions (empty engine response)."; return o; }

            string offlineCount = null;
            try
            {
                var jo = JObject.Parse(summary);
                offlineCount = jo["Data"] != null ? jo["Data"].ToString() : "";
            }
            catch { }

            string payload = device.SubmitFile(fiscalDayNo, fiscalDate);
            var parsed = ParseOutcome(payload);
            o.Ok = parsed.Ok;
            o.Message = parsed.Message;
            o.Day = fiscalDayNo;
            if (!parsed.Ok && !parsed.Code.StartsWith("0:")) return o; // hard failure

            // Archive the signed payload (only when the engine produced one).
            if (!string.IsNullOrEmpty(o.PayloadJson) && parsed.Ok)
            {
                try
                {
                    if (!Directory.Exists(AppPaths.SubmissionsDir)) Directory.CreateDirectory(AppPaths.SubmissionsDir);
                    string file = Path.Combine(AppPaths.SubmissionsDir,
                        "FDMS_" + fiscalDayNo + "_" + Safe(fiscalDate) + ".json");
                    IniFile.AtomicWrite(file, o.PayloadJson);
                    o.Archived = file;
                }
                catch (Exception ex) { o.Message += " | archive: " + ex.Message; }
            }

            if (parsed.Ok)
            {
                // POST the FDMS payload to ZIMRA
                string zimraServer = GetZimraServer();
                string submitUrl = zimraServer + "api/v1/fiscal/device/submitFile";
                bool posted = PostFdmsFile(submitUrl, o.PayloadJson, fiscalDayNo);
                
                if (posted)
                {
                    // mark journal entries + clear the engine queue for this day
                    journal.MarkSubmittedForDay(fiscalDayNo);
                    device.ClearUnprocessedTransactions(fiscalDayNo);
                    o.Message = "Day " + fiscalDayNo + (offlineCount == null ? "" : " (" + offlineCount + ")") +
                        ": FDMS file submitted to ZIMRA and archived" + (o.Archived.Length > 0 ? " -> " + o.Archived : "") + ". Queue cleared.";
                }
                else
                {
                    o.Message = "Day " + fiscalDayNo + ": FDMS file archived locally but FAILED to submit to ZIMRA. Will retry when online.";
                    o.Ok = false;
                }
            }
            return o;
        }

        private bool PostFdmsFile(string url, string jsonPayload, string fiscalDayNo)
        {
            try
            {
                // ZIMRA submitFile expects multipart/form-data with 'file' field containing base64 JSON
                string base64Payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(jsonPayload));
                
                using (var content = new MultipartFormDataContent())
                {
                    var fileContent = new StringContent(base64Payload);
                    fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/octet-stream");
                    content.Add(fileContent, "file", "fdms_" + fiscalDayNo + ".json");

                    var response = http.PostAsync(url, content).GetAwaiter().GetResult();
                    string respText = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    
                    // Check if successful
                    if (response.IsSuccessStatusCode)
                    {
                        try
                        {
                            var respObj = JObject.Parse(respText);
                            string code = null;
                            if (respObj["Code"] != null) code = respObj["Code"].ToString();
                            return code == "1";
                        }
                        catch { return response.IsSuccessStatusCode; }
                    }
                    return false;
                }
            }
            catch (Exception ex)
            {
                // Log but don't throw - let caller handle
                return false;
            }
        }

        private static string Safe(string s) { return string.IsNullOrEmpty(s) ? "0" : s.Replace('/', '-').Replace(' ', '_'); }

        internal static Outcome ParseOutcome(string raw)
        {
            Outcome r = new Outcome();
            if (string.IsNullOrEmpty(raw)) { r.Message = "Empty engine response."; return r; }
            try
            {
                var o = JObject.Parse(raw);
                r.Code = o["Code"] != null ? o["Code"].ToString() : "";
                r.Message = o["Message"] != null ? o["Message"].ToString() : "";
                r.Ok = r.Code == "1";
                r.PayloadJson = raw;
                if (r.Ok && o["Data"] != null && o["Data"].ToString().TrimStart().StartsWith("{"))
                    r.PayloadJson = o["Data"].ToString();
            }
            catch (Exception ex) { r.Message = "Parse error: " + ex.Message; }
            return r;
        }
    }

    public class Outcome
    {
        public bool Ok;
        public string Code = "";
        public string Message = "";
        public string PayloadJson = "";
    }

    public class SubmitOutcome : Outcome
    {
        public string Day = "";
        public string Archived = "";
    }
}