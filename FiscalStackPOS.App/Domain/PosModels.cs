using System;
using System.Collections.Generic;
using System.Globalization;

namespace FiscalStackPOS
{
    /// <summary>One cart line. Prices are entered VAT-inclusive.</summary>
    public class PosItem
    {
        public string Name = "";
        public string Code = "";
        public string HsCode = "";
        public decimal Quantity = 1m;
        public decimal Price = 0m;        // unit price, VAT-inclusive
        public decimal TaxRate = 0m;      // 0.155 etc.

        public decimal Amount { get { return Math.Round(Quantity * Price, 2); } }

        public decimal Tax
        {
            get
            {
                if (TaxRate <= 0m) return 0m;
                decimal gross = Amount;
                return Math.Round(gross - gross / (1m + TaxRate), 2);
            }
        }

        public decimal Net { get { return Math.Round(Amount - Tax, 2); } }
    }

    /// <summary>A complete sale sent to the FiscalStack engine.</summary>
    public class PosSale
    {
        public string InvoiceNumber = "";
        public string Currency = "USD";
        public string PaymentMethod = "CASH";
        public string CustomerName = "";
        public string CustomerVat = "";
        public string CustomerTin = "";
        public string CustomerPhone = "";
        public string CustomerAddress = "";
        public string CustomerEmail = "";
        public string InvoiceComment = "";
        public string OriginalInvoiceNumber = "";
        public string InvoiceFlag = "01";     // 01 sale, 02 credit note
        public string Cashier = "";
        public List<PosItem> Items = new List<PosItem>();
        public decimal Tendered = 0m;
        public DateTime Created = DateTime.Now;

        public decimal Subtotal { get { decimal s = 0m; foreach (var i in Items) s += i.Amount; return Math.Round(s, 2); } }
        public decimal VatTotal  { get { decimal s = 0m; foreach (var i in Items) s += i.Tax; return Math.Round(s, 2); } }
        public decimal NetTotal  { get { decimal s = 0m; foreach (var i in Items) s += i.Net; return Math.Round(s, 2); } }
        public decimal InvoiceTotal { get { return Subtotal; } } // prices are VAT-inclusive
        public decimal Change      { get { return Math.Round(Tendered - Subtotal, 2); } }
    }

    /// <summary>Persistent entry in the local receipt journal (the offline queue).</summary>
    public class JournalEntry
    {
        public string Id = Guid.NewGuid().ToString("N");
        public string InvoiceNumber = "";
        public string CreatedUtc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        public string FiscalDayNo = "0";
        public string ReceiptGlobalNo = "0";
        public string Currency = "USD";
        public string PaymentMethod = "CASH";
        public decimal Amount = 0m;
        public decimal Vat = 0m;
        public string Flag = "01";
        public string Cashier = "";
        public string CustomerName = "";
        public int ItemsCount = 0;
        public string QrUrl = "";
        public string DeviceHash = "";
        public string DataXml = "";
        public string ResponseMessage = "";
        public string SnapshotJson = "";      // full PosSale snapshot (reprint support)
        public bool Printed = false;
        public bool Submitted = false;
        public string Notes = "";

        public DateTime Created { get { DateTime d; return DateTime.TryParse(CreatedUtc, null, DateTimeStyles.RoundtripKind, out d) ? d.ToLocalTime() : DateTime.Now; } }
    }

    /// <summary>Saved (held) cart.</summary>
    public class HoldEntry
    {
        public string Id = Guid.NewGuid().ToString("N");
        public string Name = "Hold";
        public string CreatedUtc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        public List<PosItem> Items = new List<PosItem>();

        public DateTime Created { get { DateTime d; return DateTime.TryParse(CreatedUtc, null, DateTimeStyles.RoundtripKind, out d) ? d.ToLocalTime() : DateTime.Now; } }
    }

    /// <summary>Catalog product.</summary>
    public class Product
    {
        public string Id = Guid.NewGuid().ToString("N");
        public string Name = "";
        public string Category = "";
        public string Code = "";
        public string Barcode = "";
        public string HsCode = "";
        public string ImagePath = "";
        public decimal Price = 0m;
        public decimal TaxRate = 0.155m;
    }
}