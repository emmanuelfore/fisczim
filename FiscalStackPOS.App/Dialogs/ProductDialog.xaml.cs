using System.Globalization;
using System.Windows;
using Microsoft.Win32;

namespace FiscalStackPOS.Dialogs
{
    public partial class ProductDialog : Window
    {
        public Product Product;

        public ProductDialog(Product product)
        {
            InitializeComponent();
            Product = product;
            LblPrice.Text = string.Format(AppServices.T("pd.price"), AppServices.CurrencySymbol);

            TxtName.Text = product.Name;
            TxtCode.Text = product.Code;
            TxtBarcode.Text = product.Barcode;
            TxtCategory.Text = product.Category;
            TxtHs.Text = product.HsCode;
            TxtPrice.Text = product.Price.ToString("0.00", CultureInfo.InvariantCulture);
            TxtVat.Text = (product.TaxRate * 100m).ToString("0.#", CultureInfo.InvariantCulture);
            TxtImage.Text = product.ImagePath;
        }

        private void OnBrowse(object sender, RoutedEventArgs e)
        {
            var ofd = new OpenFileDialog { Filter = "Images (*.png;*.jpg;*.jpeg;*.bmp;*.gif)|*.png;*.jpg;*.jpeg;*.bmp;*.gif|All files (*.*)|*.*" };
            if (ofd.ShowDialog() == true) TxtImage.Text = ofd.FileName;
        }

        private void OnSave(object sender, RoutedEventArgs e)
        {
            string name = TxtName.Text.Trim();
            if (name.Length == 0) { Err(AppServices.T("pd.nameReq")); return; }
            decimal price = Parse(TxtPrice.Text);
            if (price < 0) price = 0m;
            decimal vatPct = Parse(TxtVat.Text);
            if (vatPct < 0) vatPct = 0;

            Product.Name = name;
            Product.Code = TxtCode.Text.Trim();
            Product.Barcode = TxtBarcode.Text.Trim();
            Product.Category = TxtCategory.Text.Trim();
            Product.HsCode = TxtHs.Text.Trim();
            Product.Price = price;
            Product.TaxRate = vatPct / 100m;
            Product.ImagePath = TxtImage.Text.Trim();

            if (Product.Category.Length == 0) Product.Category = "General";
            DialogResult = true;
        }

        private void Err(string s) { LblError.Text = s; LblError.Visibility = Visibility.Visible; }

        private static decimal Parse(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0m;
            decimal d;
            return decimal.TryParse(s.Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out d) ? d : 0m;
        }
    }
}