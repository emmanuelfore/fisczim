using System.Windows;

namespace FiscalStackPOS.Dialogs
{
    public partial class ReasonDialog : Window
    {
        public string Selected;

        private ReasonDialog()
        {
            InitializeComponent();
            CmbReason.Items.Add(AppServices.T("void.reason1"));
            CmbReason.Items.Add(AppServices.T("void.reason2"));
            CmbReason.Items.Add(AppServices.T("void.reason3"));
            CmbReason.Items.Add(AppServices.T("void.reason4"));
            CmbReason.Items.Add(AppServices.T("void.reason5"));
            CmbReason.SelectedIndex = 0;
        }

        public static string Pick(Window owner)
        {
            var dlg = new ReasonDialog { Owner = owner };
            return dlg.ShowDialog() == true ? dlg.Selected : null;
        }

        private void OnVoid(object sender, RoutedEventArgs e)
        {
            Selected = CmbReason.SelectedItem != null ? CmbReason.SelectedItem.ToString() : AppServices.T("void.reason5");
            DialogResult = true;
        }
    }
}