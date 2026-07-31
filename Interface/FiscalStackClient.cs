using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using System.Configuration;

namespace Revmax_Interface_Promun
{
    public class FiscalStackClient
    {
        private readonly HttpClient _httpClient;

        public FiscalStackClient()
        {
            _httpClient = new HttpClient();
            var baseUrl = ConfigurationManager.AppSettings.Get("ApiEndpoint") ?? "https://fiscalstack.co.zw/api/v1/";
            if (!baseUrl.EndsWith("/"))
            {
                baseUrl += "/";
            }
            _httpClient.BaseAddress = new Uri(baseUrl);

            var apiKey = ConfigurationManager.AppSettings.Get("ApiKey");
            if (!string.IsNullOrEmpty(apiKey))
            {
                _httpClient.DefaultRequestHeaders.Add("X-API-Key", apiKey);
            }
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public async Task<string> GetDeviceAsync()
        {
            var response = await _httpClient.GetAsync("fiscal/device");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        public async Task<string> GetOfflineStateAsync()
        {
            var response = await _httpClient.GetAsync("fiscal/offline-state");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        public async Task<string> FiscalizeAsync(object payload)
        {
            var json = JsonConvert.SerializeObject(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("fiscalize", content);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                throw new Exception("Fiscalization failed (" + response.StatusCode + "): " + errorContent);
            }
            
            return await response.Content.ReadAsStringAsync();
        }

        public async Task<string> CloseDayAsync()
        {
            var content = new StringContent("{\"action\": \"close\"}", Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync("fiscal/close-day", content);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                throw new Exception("Close Day failed (" + response.StatusCode + "): " + errorContent);
            }
            
            return await response.Content.ReadAsStringAsync();
        }
    }

    public class PassThroughFiscalizeRequest
    {
        [JsonProperty("items")]
        public System.Collections.Generic.List<PassThroughItem> Items { get; set; }

        [JsonProperty("buyer")]
        public FiscalBuyer Buyer { get; set; }

        [JsonProperty("invoiceNumber")]
        public string InvoiceNumber { get; set; }

        [JsonProperty("date")]
        public string Date { get; set; }

        [JsonProperty("paymentMethod")]
        public string PaymentMethod { get; set; }

        [JsonProperty("currency")]
        public string Currency { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("transactionType")]
        public string TransactionType { get; set; }
        
        [JsonProperty("relatedInvoiceNumber")]
        public string RelatedInvoiceNumber { get; set; }

        [JsonProperty("offlineSignature")]
        public string OfflineSignature { get; set; }

        [JsonProperty("offlineReceiptCounter")]
        public int OfflineReceiptCounter { get; set; }

        [JsonProperty("offlineGlobalReceiptCounter")]
        public int OfflineGlobalReceiptCounter { get; set; }

        [JsonProperty("offlineFiscalDay")]
        public int OfflineFiscalDay { get; set; }

        [JsonProperty("offlinePreviousHash")]
        public string OfflinePreviousHash { get; set; }

        [JsonProperty("offlineDate")]
        public string OfflineDate { get; set; }
    }

    public class PassThroughItem
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("quantity")]
        public decimal Quantity { get; set; }

        [JsonProperty("unitPrice")]
        public decimal UnitPrice { get; set; }

        [JsonProperty("taxRate")]
        public decimal TaxRate { get; set; }
    }

    public class FiscalBuyer
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("vatNumber")]
        public string VatNumber { get; set; }

        [JsonProperty("tin")]
        public string Tin { get; set; }

        [JsonProperty("phone")]
        public string Phone { get; set; }

        [JsonProperty("email")]
        public string Email { get; set; }
    }
}
