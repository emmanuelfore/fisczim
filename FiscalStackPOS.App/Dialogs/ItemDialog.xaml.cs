using System.Globalization;
using System.Windows;

namespace FiscalStackPOS.Dialogs
{
    public partial class ItemDialog : Window
    {
        public string ItemName = "";
        public decimal Qty = 1m;
        public decimal Price = 0m;
        public decimal TaxRate = 0m;
        public string HsCode = "";

        public ItemDialog()
        {
            InitializeComponent();
            LblPrice.Text = string.Format(AppServices.T("pd.price"), AppServices.CurrencySymbol);
        }

        private void OnAdd(object sender, RoutedEventArgs e)
        {
            ItemName = TxtName.Text.Trim();
            if (ItemName.Length == 0) { Err(AppServices.T("item.descReq")); return; }
            Qty = Parse(TxtQty.Text); if (Qty <= 0) Qty = 1m;
            Price = Parse(TxtPrice.Text);
            if (Price < 0) Price = 0m;
            TaxRate = Parse(TxtVat.Text) / 100m;
            HsCode = TxtHs.Text.Trim();
            DialogResult = true;
        }

        private void Err(string msg) { LblError.Text = msg; LblError.Visibility = Visibility.Visible; }

        private static decimal Parse(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0m;
            decimal d;
            return decimal.TryParse(s.Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out d) ? d : 0m;
        }
    }
}