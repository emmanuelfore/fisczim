using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class ReceiptLine
    {
        public string ReceiptLineName { get; set; }
        public int ReceiptLineNo { get; set; }
        public decimal ReceiptLineQuantity { get; set; }
        public string ReceiptLineType { get; set; }
        public decimal ReceiptLineTotal { get; set; }
        public int TaxID { get; set; }
        public string ReceiptLineHSCode { get; set; }
        public decimal ReceiptLinePrice { get; set; }
        public string TaxCode { get; set; }
        public decimal TaxPercent { get; set; }
        public object Taxable { get; internal set; }
        public object Tax { get; internal set; }
    }
}
