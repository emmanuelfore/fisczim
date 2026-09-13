using System.Globalization;
using System.Windows;

namespace FiscalStackPOS.Dialogs
{
    public partial class TillDialog : Window
    {
        public decimal StartingCash;

        public TillDialog()
        {
            InitializeComponent();
            LblCur.Text = string.Format(AppServices.T("till.startingCash"), AppServices.CurrencySymbol);
        }

        private void OnOpen(object sender, RoutedEventArgs e)
        {
            decimal d;
            if (!decimal.TryParse(TxtCash.Text.Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out d) || d < 0)
            {
                LblError.Text = AppServices.T("till.enterAmount");
                LblError.Visibility = Visibility.Visible;
                return;
            }
            StartingCash = d;
            DialogResult = true;
        }

        private void OnSkip(object sender, RoutedEventArgs e)
        {
            StartingCash = 0m;
            DialogResult = false;
        }
    }
}