using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace FiscalStackPOS
{
    /// <summary>Minimal INotifyPropertyChanged base.</summary>
    public class NotifyBase : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;
        protected void On(string name) { if (PropertyChanged != null) PropertyChanged(this, new PropertyChangedEventArgs(name)); }
    }

    /// <summary>Product row model for the register tile grid.</summary>
    public class ProductVm : NotifyBase
    {
        public Product Product;

        public ProductVm(Product p, string currencySymbol, bool pricesIncludeVat)
        {
            Product = p;
            CurrencySymbol = currencySymbol;
            PricesIncludeVat = pricesIncludeVat;
            UnitPrice = p.Price;
            if (!pricesIncludeVat && p.TaxRate > 0)
                UnitPrice = Math.Round(p.Price * (1m + Math.Max(0m, p.TaxRate)), 2);
            LoadImage();
        }

        public string CurrencySymbol { get; private set; }
        public bool PricesIncludeVat { get; private set; }

        public string DisplayName { get { return Product.Name; } }
        public string Barcode { get { return Product.Barcode; } }
        public string Category { get { return Product.Category; } }
        public string Initial
        {
            get
            {
                if (string.IsNullOrEmpty(Product.Name)) return "?";
                return Product.Name.Substring(0, 1).ToUpperInvariant();
            }
        }
        public decimal UnitPrice { get; set; }
        public string PriceLabel
        {
            get
            {
                var sx = CurrencySymbol == null ? "" : CurrencySymbol + " ";
                return sx + UnitPrice.ToString("0.00");
            }
        }
        public ImageSource ImageBitmap { get; private set; }

        private void LoadImage()
        {
            try
            {
                if (!string.IsNullOrEmpty(Product.ImagePath) && File.Exists(Product.ImagePath))
                {
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.UriSource = new Uri(Product.ImagePath, UriKind.Absolute);
                    bmp.EndInit();
                    bmp.Freeze();
                    ImageBitmap = bmp;
                }
            }
            catch { ImageBitmap = null; }
        }
    }

    /// <summary>Row model for the products management grid.</summary>
    public class ProductRow
    {
        public Product Product;
        public ProductRow(Product p, string currencySymbol) { Product = p; Currency = currencySymbol; }
        public string Currency { get; private set; }
        public string Name { get { return Product.Name; } }
        public string Code { get { return Product.Code; } }
        public string Barcode { get { return Product.Barcode; } }
        public string Category { get { return Product.Category; } }
        public string PriceLabel { get { return (Currency == null ? "" : Currency + " ") + Product.Price.ToString("0.00"); } }
        public string VatLabel { get { return (Product.TaxRate * 100m).ToString("0.#"); } }
        public string ImagePath { get { return Product.ImagePath; } }
    }

    /// <summary>Row model for the users grid.</summary>
    public class PosUserRow
    {
        public PosUser User;
        public PosUserRow(PosUser u) { User = u; }
        public string Username { get { return User.Username; } }
        public string FullName { get { return User.FullName; } }
        public string Access
        {
            get
            {
                if (User.AccessLevel >= 3) return AppServices.T("lvl.admin");
                if (User.AccessLevel >= 2) return AppServices.T("lvl.supervisor");
                return AppServices.T("lvl.cashier");
            }
        }
        public string EnabledText { get { return User.IsEnabled ? AppServices.T("common.yes") : AppServices.T("common.no"); } }
    }

    /// <summary>Row model for the receipt history grid.</summary>
    public class JournalRow
    {
        public JournalEntry Entry;
        public JournalRow(JournalEntry e) { Entry = e; }
        public string Invoice { get { return Entry.InvoiceNumber; } }
        public string Time { get { return Entry.Created.ToString("yyyy-MM-dd  HH:mm:ss"); } }
        public string Amount { get { return Entry.Amount.ToString("0.00"); } }
        public string Payment { get { return string.IsNullOrEmpty(Entry.PaymentMethod) ? "-" : Entry.PaymentMethod; } }
        public string Status
        {
            get
            {
                string s = Entry.Submitted ? "submitted" : "queued";
                if (Entry.Printed) s += " / printed";
                return s;
            }
        }
        public string Qr { get { return Entry.QrUrl.Length > 0 ? "yes" : "-"; } }
    }

    /// <summary>One cart line (sale item) with change notification for qty/total edits.</summary>
    public class CartLineVm : NotifyBase
    {
        public PosItem Item;

        public CartLineVm(PosItem item, string currencySymbol)
        {
            Item = item;
            CurrencySymbol = currencySymbol;
        }

        public string CurrencySymbol { get; private set; }

        public string Name { get { return Item.Name; } }
        public decimal TaxRate { get { return Item.TaxRate; } }

        public decimal Quantity
        {
            get { return Item.Quantity; }
            set { Item.Quantity = value; On("Quantity"); On("QuantityLabel"); On("LineTotalLabel"); On("LineTotal"); }
        }
        public decimal Price
        {
            get { return Item.Price; }
            set { Item.Price = value; On("Price"); On("LineTotalLabel"); On("LineTotal"); }
        }
        public string QuantityLabel { get { return Quantity.ToString("0.##"); } }
        public string LineTotalLabel
        {
            get { return (CurrencySymbol == null ? "" : CurrencySymbol + " ") + Item.Amount.ToString("0.00"); }
        }
        public string UnitLabel
        {
            get { return (CurrencySymbol == null ? "" : CurrencySymbol + " ") + Item.Price.ToString("0.00"); }
        }
        public decimal LineTotal { get { return Item.Amount; } }
    }
}