using System;
using System.Windows;
using System.Windows.Threading;

namespace FiscalStackPOS
{
    public partial class MainWindow : Window
    {
        private readonly Views.PosView posView = new Views.PosView();
        private readonly Views.ProductsView productsView = new Views.ProductsView();
        private readonly Views.HistoryView historyView = new Views.HistoryView();
        private readonly Views.ReportsView reportsView = new Views.ReportsView();
        private readonly Views.UsersView usersView = new Views.UsersView();
        private readonly Views.SettingsView settingsView = new Views.SettingsView();
        private readonly DispatcherTimer clockTimer;

        public MainWindow()
        {
            InitializeComponent();

            LblCompany.Text = CompanyName();
            LblUser.Text = AppServices.UserLabel;
            LblAvatar.Text = AppServices.Initials;
            AppServices.StatusChanged += RefreshStatus;
            RefreshStatus();

            clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            clockTimer.Tick += (s, e) => LblClock.Text = DateTime.Now.ToString("yyyy-MM-dd   HH:mm:ss");
            clockTimer.Start();

            posView.IsVisibleChanged += (s, e) => { if ((bool)e.NewValue) posView.OnActivated(); };
            Host.Content = posView;
        }

        private string CompanyName()
        {
            var c = AppServices.Card;
            string n = "";
            if (c != null)
            {
                if (!string.IsNullOrEmpty(c.LicenseCompany)) n = c.LicenseCompany;
                else if (!string.IsNullOrEmpty(c.CompanyName)) n = c.CompanyName;
            }
            return string.IsNullOrEmpty(n) ? "Untitled company" : n;
        }

        private void OnNav(object sender, RoutedEventArgs e)
        {
            var radio = sender as System.Windows.Controls.RadioButton;
            if (radio == null) return;
            string tag = (radio.Tag ?? "").ToString();
            if (Host == null) return;   // fired during XAML parse (IsChecked=True); ctor sets the initial view
            switch (tag)
            {
                case "products": Host.Content = productsView; productsView.OnActivated(); break;
                case "history": Host.Content = historyView; historyView.OnActivated(); break;
                case "reports": Host.Content = reportsView; reportsView.OnActivated(); break;
                case "users": Host.Content = usersView; usersView.OnActivated(); break;
                case "settings": Host.Content = settingsView; settingsView.OnActivated(); break;
                default: Host.Content = posView; posView.OnActivated(); break;
            }
        }

        private void OnQuit(object sender, RoutedEventArgs e) { Close(); }

        private void RefreshStatus()
        {
            if (AppServices.Online) { ChipOnline.Background = System.Windows.Media.Brushes.Transparent; LblOnline.Text = "online"; }
            else { ChipOnline.Background = System.Windows.Media.Brushes.Transparent; LblOnline.Text = "offline"; }

            AppServices.QueueCount = AppServices.Journal == null ? 0 : AppServices.Journal.Unsubmitted().Count;
            LblQueue.Text = "queue " + AppServices.QueueCount;
            LblQueue.Foreground = AppServices.QueueCount > 0
                ? (System.Windows.Media.Brush)FindResource("WarnBrush")
                : (System.Windows.Media.Brush)FindResource("TextSecondaryLightBrush");
            ChipQueue.Background = System.Windows.Media.Brushes.Transparent;

            LblTill.Text = AppServices.TillLabel;
            LblDay.Text = AppServices.DayLabel;
        }

        protected override void OnClosed(EventArgs e)
        {
            AppServices.StatusChanged -= RefreshStatus;
            if (clockTimer != null) clockTimer.Stop();
            base.OnClosed(e);
        }
    }
}