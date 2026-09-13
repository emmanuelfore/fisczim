using System.Windows;

namespace FiscalStackPOS.Dialogs
{
    public partial class LoginDialog : Window
    {
        public PosUser LoggedInUser;

        public LoginDialog()
        {
            InitializeComponent();
            Loaded += (s, e) => { TxtUsername.Focus(); };
        }

        private void OnSignIn(object sender, RoutedEventArgs e)
        {
            string u = TxtUsername.Text.Trim();
            string p = TxtPassword.Password;

            PosUser user;
            if (!UserStore.Validate(AppServices.Users, u, p, out user))
            {
                ShowError(user == null ? AppServices.T("login.noUser") : AppServices.T("login.badPass"));
                return;
            }
            if (user.AccessLevel < 1) { ShowError(AppServices.T("login.noPerm")); return; }
            LoggedInUser = user;
            DialogResult = true;
        }

        private void ShowError(string msg)
        {
            LblError.Text = msg;
            LblError.Visibility = Visibility.Visible;
        }
    }
}