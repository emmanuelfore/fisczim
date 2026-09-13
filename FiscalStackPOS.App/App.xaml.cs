using System;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace FiscalStackPOS
{
    public partial class App : Application
    {
        private static readonly string CrashLog = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "startup-error.log");

        private void LogCrash(string stage, Exception ex)
        {
            try
            {
                File.AppendAllText(CrashLog, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " [" + stage + "] " +
                    (ex == null ? "" : ex.ToString() + Environment.NewLine));
            }
            catch { }
        }

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            DispatcherUnhandledException += (s, args) => { LogCrash("dispatcher", args.Exception); };
            AppDomain.CurrentDomain.UnhandledException += (s, args) =>
                LogCrash("appdomain", args.ExceptionObject as Exception);

            // hidden probe: construct every view/dialog to surface XAML errors
            if (e.Args.Contains("--uitest")) { RunUITest(); return; }

            try
            {
                Bootstrap();
            }
            catch (Exception ex)
            {
                LogCrash("startup", ex);
                MessageBox.Show("Startup failed: " + ex.Message + "\n\nDetails: " + CrashLog,
                    "FiscalStack POS", MessageBoxButton.OK, MessageBoxImage.Error);
                Shutdown(-1);
            }
        }

        private void Bootstrap()
        {

            // ---- visual theme: light + brand accent ----
            try
            {
                var mgr = ModernWpf.ThemeManager.Current;
                mgr.ApplicationTheme = ModernWpf.ApplicationTheme.Light;
                mgr.AccentColor = Color.FromRgb(0x63, 0x66, 0xF1); // #6366F1 indigo
            }
            catch { }

            // ---- services ----
            AppServices.State = PosStateStore.Load();
            if (AppServices.State == null) { AppServices.State = new PosState(); PosStateStore.Save(AppServices.State); }
            AppServices.SetLanguage(AppServices.State.Language);

            // Ensure C:\ProgramData\FiscalStack is fully writable by all users
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c icacls \"C:\\ProgramData\\FiscalStack\" /grant Users:(OI)(CI)F /T",
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                System.Diagnostics.Process.Start(psi)?.WaitForExit(3000);
            }
            catch { }

            // pin ZIMRA endpoints (incl. QRURL) so the engine never uses its stale compiled default
            ZimraEndpoints.Ensure();

            AppServices.Device = new FiscalStackDevice();
            AppServices.Journal = ReceiptJournal.Load();
            AppServices.Submitter = new SubmissionService(AppServices.Device, AppServices.State, AppServices.Journal);

            AppServices.Products = ProductStore.Load();
            if (AppServices.Products == null || AppServices.Products.Count == 0)
            {
                AppServices.Products = ProductStore.SampleCatalog();
                ProductStore.Save(AppServices.Products);
            }

            AppServices.Users = UserStore.Load();

            // license / company info for the header
            try
            {
                AppServices.Card = AppServices.Device.ReadCard(AppServices.Device.GetCardDetails());
            }
            catch { AppServices.Card = new CardInfo(); }

            try
            {
                var lic = AppServices.Device.ReadLicense(AppServices.Device.GetLicense());
                if (AppServices.Card != null)
                {
                    if (lic.LicenseStatus.Length > 0) AppServices.Card.LicenseStatus = lic.LicenseStatus;
                    if (lic.LicenseCompany.Length > 0) AppServices.Card.LicenseCompany = lic.LicenseCompany;
                    if (lic.LicenseExpiry.Length > 0) AppServices.Card.LicenseExpiry = lic.LicenseExpiry;
                }
            }
            catch { }

            // ---- first run: create the owner/admin ----
            if (AppServices.Users.Count == 0)
            {
                var fr = new Dialogs.FirstRunDialog { Owner = null };
                if (fr.ShowDialog() != true) { Shutdown(); return; }
                AppServices.Users.Add(UserStore.Create(fr.Username, fr.FullName, fr.Password, 3));
                UserStore.Save(AppServices.Users);
            }

            // ---- login ----
            var login = new Dialogs.LoginDialog();
            if (login.ShowDialog() != true) { Shutdown(); return; }
            AppServices.CurrentUser = login.LoggedInUser;
            AppServices.State.CurrentUsername = AppServices.CurrentUser.Username;
            AppServices.State.CurrentFullName = string.IsNullOrEmpty(AppServices.CurrentUser.FullName)
                ? AppServices.CurrentUser.Username : AppServices.CurrentUser.FullName;
            AppServices.State.CurrentAccessLevel = AppServices.CurrentUser.AccessLevel;
            PosStateStore.Save(AppServices.State);

            // public data dir lock possible in shipped deployments; ok.

            // ---- open till ----
            if (!AppServices.State.TillOpen)
            {
                var till = new Dialogs.TillDialog();
                if (till.ShowDialog() == true)
                {
                    TillState.Open(AppServices.State, till.StartingCash, AppServices.CurrentUser.FullName);
                    PosStateStore.Save(AppServices.State);
                }
            }

            // ---- main window ----
            var win = new MainWindow();
            win.Closed += (s2, e2) =>
            {
                PosStateStore.Save(AppServices.State);
                AppServices.StopTimers();
                try { AppServices.Device.Dispose(); } catch { }
                Shutdown();
            };
            win.Show();

            AppServices.StartTimers();
        }

        // hidden probe: construct every view/dialog (XAML parse + ctor check)
        private void RunUITest()
        {
            AppServices.State = new PosState();
            AppServices.Products = ProductStore.SampleCatalog();
            AppServices.Journal = new ReceiptJournal();
            AppServices.CurrentUser = new PosUser { Username = "probe", FullName = "Probe", AccessLevel = 3 };
            AppServices.Card = new CardInfo();

            int ok = 0, fail = 0;
            Action<string, Func<object>> check = (name, fn) =>
            {
                try { fn(); ok++; LogCrash("uitest", new Exception(name + ": OK")); }
                catch (Exception ex) { fail++; LogCrash("uitest", new Exception(name + ": FAIL\n" + ex)); }
            };

            check("MainWindow", () => new MainWindow());
            check("PosView", () => new Views.PosView());
            check("ProductsView", () => new Views.ProductsView());
            check("HistoryView", () => new Views.HistoryView());
            check("ReportsView", () => new Views.ReportsView());
            check("UsersView", () => new Views.UsersView());
            check("SettingsView", () => new Views.SettingsView());
            check("FirstRunDialog", () => new Dialogs.FirstRunDialog());
            check("LoginDialog", () => new Dialogs.LoginDialog());
            check("TillDialog", () => new Dialogs.TillDialog());
            check("ProductDialog", () => new Dialogs.ProductDialog(new Product()));
            check("UserDialog", () => new Dialogs.UserDialog("probe"));
            check("ItemDialog", () => new Dialogs.ItemDialog());
            check("HoldPickerDialog", () => new Dialogs.HoldPickerDialog(new System.Collections.Generic.List<HoldEntry>()));
            check("ReasonDialog", () => (Dialogs.ReasonDialog)
                typeof(Dialogs.ReasonDialog).GetConstructor(
                    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance,
                    null, Type.EmptyTypes, null).Invoke(null));
            check("CheckoutDialog", () => new Dialogs.CheckoutDialog(new PosSale()));
            var bmp = new System.Drawing.Bitmap(200, 80);
            var g = System.Drawing.Graphics.FromImage(bmp);
            g.Clear(System.Drawing.Color.White);
            g.Dispose();
            var probeBmp = bmp;
            check("PrintPreviewDialog", () => new Dialogs.PrintPreviewDialog(probeBmp, "probe"));
            probeBmp.Dispose();

            LogCrash("uitest", new Exception("RESULT ok=" + ok + " fail=" + fail));
            Shutdown(fail == 0 ? 0 : 1);
        }
    }
}