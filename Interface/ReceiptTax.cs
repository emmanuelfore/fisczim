using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    
        public class ReceiptTax
        {
            [JsonProperty("salesAmountWithTax")]
            public decimal SalesAmountWithTax { get; set; }

            [JsonProperty("taxAmount")]
            public decimal TaxAmount { get; set; }

            [JsonProperty("taxID")]
            public int TaxID { get; set; }

            [JsonProperty("taxCode")]
            public string TaxCode { get; set; }

            [JsonProperty("taxPercent")]
            public decimal TaxPercent { get; set; }
        }
    
}
