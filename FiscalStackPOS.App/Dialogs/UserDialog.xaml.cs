using System.Windows;
using System.Windows.Controls;

namespace FiscalStackPOS.Dialogs
{
    public partial class UserDialog : Window
    {
        public PosUser User;

        public UserDialog(string defaultUsername = "")
        {
            InitializeComponent();
            CmbAccess.Items.Add(AppServices.T("lvl.cashier")); CmbAccess.Items.Add(AppServices.T("lvl.supervisor")); CmbAccess.Items.Add(AppServices.T("lvl.admin"));
            CmbAccess.SelectedIndex = 0;
            TxtUsername.Text = defaultUsername;
        }

        private void OnSave(object sender, RoutedEventArgs e)
        {
            string username = TxtUsername.Text.Trim();
            string pass = TxtPass.Password;
            if (username.Length == 0) { Err(AppServices.T("ud.req")); return; }
            if (pass.Length < 4) { Err(AppServices.T("ud.passShort")); return; }
            if (pass != TxtPass2.Password) { Err(AppServices.T("ud.mismatch")); return; }
            int level = CmbAccess.SelectedIndex == 2 ? 3 : (CmbAccess.SelectedIndex == 1 ? 2 : 1);

            User = UserStore.Create(username, TxtFull.Text.Trim(), pass, level);
            DialogResult = true;
        }

        private void Err(string s) { LblError.Text = s; LblError.Visibility = Visibility.Visible; }
    }
}