using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Windows;

namespace FiscalStackPOS.Views
{
    public partial class UsersView : System.Windows.Controls.UserControl
    {
        private readonly ObservableCollection<PosUserRow> rows = new ObservableCollection<PosUserRow>();

        public UsersView()
        {
            InitializeComponent();
            Grid.ItemsSource = rows;
            Localize();
            Refresh();
        }

        public void Localize()
        {
            ColUser.Header = AppServices.T("usr.colUser");
            ColFull.Header = AppServices.T("usr.colFull");
            ColAccess.Header = AppServices.T("usr.colAccess");
            ColEnabled.Header = AppServices.T("usr.colEnabled");
        }

        public void OnActivated() { Refresh(); }

        private List<PosUser> Users { get { return AppServices.Users; } }
        private Window Owner { get { return Window.GetWindow(this); } }

        private void Refresh()
        {
            rows.Clear();
            foreach (var u in Users)
                rows.Add(new PosUserRow(u));
        }

        private PosUser SelectedUser()
        {
            var r = Grid.SelectedItem as PosUserRow;
            return r != null ? r.User : null;
        }

        private void OnNew(object sender, RoutedEventArgs e)
        {
            var dlg = new Dialogs.UserDialog();
            if (dlg.ShowDialog() == true)
            {
                if (UserStore.Find(Users, dlg.User.Username) != null)
                {
                    MessageBox.Show(Owner, AppServices.T("usr.exists"), AppServices.T("usr.title"), MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                Users.Add(dlg.User);
                UserStore.Save(Users);
                Refresh();
            }
        }

        private void OnReset(object sender, RoutedEventArgs e)
        {
            var u = SelectedUser();
            if (u == null) return;
            string adminId = UserStore.CurrentAdminId(Users);
            var dlg = new Dialogs.UserDialog(u.Username);
            if (dlg.ShowDialog() == true)
            {
                u.Salt = dlg.User.Salt;
                u.Hash = dlg.User.Hash;
                u.FullName = dlg.User.FullName;
                if (u.Id == adminId || dlg.User.AccessLevel > u.AccessLevel) u.AccessLevel = dlg.User.AccessLevel;
                UserStore.Save(Users);
                Refresh();
            }
        }

        private void OnToggle(object sender, RoutedEventArgs e)
        {
            var u = SelectedUser();
            if (u == null) return;
            string adminId = UserStore.CurrentAdminId(Users);
            if (u.Id == adminId && u.IsEnabled)
            {
                int enabledAdmins = 0;
                foreach (var uu in Users)
                    if (uu.IsEnabled && uu.AccessLevel >= 3) enabledAdmins++;
                if (enabledAdmins <= 1)
                {
                    MessageBox.Show(Owner, AppServices.T("usr.onlyAdmin"),
                        AppServices.T("usr.title"), MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
            }
            u.IsEnabled = !u.IsEnabled;
            UserStore.Save(Users);
            Refresh();
        }

        private void OnDelete(object sender, RoutedEventArgs e)
        {
            var u = SelectedUser();
            if (u == null) return;
            string adminId = UserStore.CurrentAdminId(Users);
            if (u.Id == adminId)
            {
                MessageBox.Show(Owner, AppServices.T("usr.ownerDel"), AppServices.T("usr.title"), MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (MessageBox.Show(Owner, string.Format(AppServices.T("usr.deleteQ"), u.Username), AppServices.T("usr.title"),
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            Users.Remove(u);
            UserStore.Save(Users);
            Refresh();
        }
    }
}