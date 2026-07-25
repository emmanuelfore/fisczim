using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    internal class ResponseStruc
    {
        public bool Status { get; set; }
        public string Message { get; set; }

        public List<ReceiptTax> receiptTaxes { get; set; }
        public string qrCode { get; set; }
        public string verificationCode { get; set; }
        public string CompanyName { get; set; }
        public string CompanyAddress { get; set; }
        public string CompanyBPN { get; set; }
        public string CompanyVAT { get; set; }
    }
}
