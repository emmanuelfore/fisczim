using System.Text.RegularExpressions;
using System.Windows;

namespace FiscalStackPOS.Dialogs
{
    public partial class FirstRunDialog : Window
    {
        public string Username = "";
        public string FullName = "";
        public string Password = "";

        public FirstRunDialog() { InitializeComponent(); }

        private void OnCreate(object sender, RoutedEventArgs e)
        {
            string u = TxtUsername.Text.Trim();
            string f = TxtFullName.Text.Trim();
            string p = TxtPassword.Password;
            string c = TxtConfirm.Password;

            if (u.Length < 2) { ShowError(AppServices.T("fr.usrShort")); return; }
            if (!Regex.IsMatch(u, "^[A-Za-z0-9._-]+$")) { ShowError(AppServices.T("fr.usrChars")); return; }
            if (p.Length < 4) { ShowError(AppServices.T("ud.passShort")); return; }
            if (p != c) { ShowError(AppServices.T("fr.mismatch")); return; }

            Username = u; FullName = f; Password = p;
            DialogResult = true;
        }

        private void ShowError(string msg)
        {
            LblError.Text = msg;
            LblError.Visibility = Visibility.Visible;
        }
    }
}