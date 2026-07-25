using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    internal class Invoice
    {
        internal string CustomerNumber;

        public string Currency { get; set; }
        public string BranchName { get; set; }
        public string InvoiceNumber { get; set; }
        public string CustomerName { get; set; }
        public string CustomerVATNumber { get; set; }
        public string CustomerAddress { get; set; }
        public string CustomerEmail { get; set; }
        public string CustomerTIN { get; set; }
        public string CustomerTelephoneNumber { get; set; }
        public string CustomerBPN { get; set; }
        public string InvoiceAmount { get; set; }
        public string InvoiceTaxAmount { get; set; }
        public string InvoiceFlag { get; set; }
        public string Phone { get; set; }
        public string Email { get; set; }
        public string Change { get; set; }
        public string Reason { get; set; }
        public string Tendered { get; set; }
        public string Cashier { get; set; }
        public string InvoiceComment { get; set; }
        public string ItemsXML { get; set; }
        public string CurrenciesXML { get; set; }
        public string CustomerNum { get; internal set; }
        public string Discount { get; internal set; }
        public string DeviceId { get; internal set; }
        public string ReceiptGlobalNumber { get; internal set; }
        public List<item> items { get; set; }
    }
}
