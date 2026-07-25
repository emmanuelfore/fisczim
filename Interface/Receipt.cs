using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class Receipt
    {
        public string ReceiptType { get; set; }
        public string ReceiptCurrency { get; set; }
        public int ReceiptCounter { get; set; }
        public int ReceiptGlobalNo { get; set; }
        public string InvoiceNo { get; set; }
        public BuyerData BuyerData { get; set; }
        public object ReceiptNotes { get; set; }
        public DateTime ReceiptDate { get; set; }
        public CreditDebitNote CreditDebitNote { get; set; }
        public bool ReceiptLinesTaxInclusive { get; set; }
        public List<ReceiptLine> ReceiptLines { get; set; }
        public List<ReceiptTax> ReceiptTaxes { get; set; }
        public List<ReceiptPayment> ReceiptPayments { get; set; }
        public decimal ReceiptTotal { get; set; }
        public string ReceiptPrintForm { get; set; }
        public ReceiptDeviceSignature ReceiptDeviceSignature { get; set; }
    }
}
