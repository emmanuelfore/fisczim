using System;
using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace FiscalStackPOS.Views
{
    public partial class SettingsView : UserControl
    {
        public SettingsView()
        {
            InitializeComponent();
            CmbWidth.Items.Add("48"); CmbWidth.Items.Add("80");
            LoadValues();
        }

        public void OnActivated() { LoadValues(); }

        private void LoadValues()
        {
            var s = AppServices.State.Settings;
            TxtPrinter.Text = s.PrinterName;
            CmbWidth.SelectedItem = s.ReceiptWidth == "80" ? "80" : "48";
            ChkPrint.IsChecked = s.AutoPrint;
            ChkPreview.IsChecked = s.ShowPrintPreview;
            ChkDrawer.IsChecked = s.OpenDrawerOnPrint;
            TxtLogo.Text = s.LogoFile;
            TxtPrefix.Text = s.InvoicePrefix;
            TxtDigits.Text = s.InvoiceDigits.ToString();
            TxtCurrency.Text = s.InvoiceCurrency;
            ChkVatIncl.IsChecked = s.PricesIncludeVat;
            TxtInterval.Text = s.OnlineCheckIntervalSec.ToString();
            ChkAutoSubmit.IsChecked = s.SubmitWhenOnline;
            TxtDataDir.Text = AppPaths.DataDir;
            LblActivResult.Text = "";

            CmbLanguage.SelectionChanged -= OnLanguage;
            foreach (var it in CmbLanguage.Items)
            {
                var ci = it as ComboBoxItem;
                if (ci != null && (string)ci.Tag == AppServices.State.Language) { CmbLanguage.SelectedItem = ci; break; }
            }
            CmbLanguage.SelectionChanged += OnLanguage;

            // Load ZIMRA env from config
            CmbEnv.SelectionChanged -= OnEnv;
            var cfg = System.IO.File.Exists(AppPaths.DeviceConfig)
                ? IniFile.Load(AppPaths.DeviceConfig) : new IniFile();
            string zimra = cfg.Get("ZIMRASERVER", "https://fdmsapi.zimra.co.zw");
            foreach (var it in CmbEnv.Items)
            {
                var ci = it as ComboBoxItem;
                if (ci != null && string.Equals((string)ci.Tag, zimra, StringComparison.OrdinalIgnoreCase))
                {
                    CmbEnv.SelectedItem = ci;
                    break;
                }
            }
            CmbEnv.SelectionChanged += OnEnv;

            string license = AppServices.Card != null && AppServices.Card.Ok
                ? AppServices.T("set.licenceActive") + " · " + AppServices.Card.SerialNumber
                : AppServices.T("set.notActivated");
            if (AppServices.Card != null && AppServices.Card.LicenseCompany.Length > 0)
                license = string.Format(AppServices.T("set.licenceInfo"), AppServices.Card.LicenseCompany,
                    (AppServices.Card.LicenseExpiry.Length > 0 ? AppServices.Card.LicenseExpiry : "?"));
            if (AppServices.Card != null && AppServices.Card.LicenseStatus.Length > 0)
                license += "\n" + string.Format(AppServices.T("set.status"), AppServices.Card.LicenseStatus);
            LblLicenseInfo.Text = license;
        }

        private void OnSave(object sender, RoutedEventArgs e)
        {
            var s = AppServices.State;
            s.Settings.PrinterName = TxtPrinter.Text.Trim();
            s.Settings.ReceiptWidth = (CmbWidth.SelectedItem as string) == "80" ? "80" : "48";
            s.Settings.AutoPrint = ChkPrint.IsChecked == true;
            s.Settings.ShowPrintPreview = ChkPreview.IsChecked == true;
            s.Settings.OpenDrawerOnPrint = ChkDrawer.IsChecked == true;
            s.Settings.LogoFile = TxtLogo.Text.Trim();
            s.Settings.InvoicePrefix = TxtPrefix.Text.Trim().Length > 0 ? TxtPrefix.Text.Trim().ToUpperInvariant() : "INV";
            int digits; s.Settings.InvoiceDigits = int.TryParse(TxtDigits.Text, out digits) && digits > 0 && digits <= 12 ? digits : 6;
            s.Settings.InvoiceCurrency = TxtCurrency.Text.Trim().Length > 0 ? TxtCurrency.Text.Trim().ToUpperInvariant() : "USD";
            s.Settings.PricesIncludeVat = ChkVatIncl.IsChecked == true;
            int sec; s.Settings.OnlineCheckIntervalSec = int.TryParse(TxtInterval.Text, out sec) && sec >= 10 ? sec : 60;
            s.Settings.SubmitWhenOnline = ChkAutoSubmit.IsChecked == true;
            PosStateStore.Save(s);
            AppServices.NotifyStatus();
            LblSaved.Text = string.Format(AppServices.T("set.savedAt"), DateTime.Now.ToString("HH:mm:ss"));
        }

        private void OnLanguage(object sender, SelectionChangedEventArgs e)
        {
            var ci = CmbLanguage.SelectedItem as ComboBoxItem;
            if (ci == null) return;
            string lang = (string)ci.Tag;
            AppServices.State.Language = lang;
            AppServices.SetLanguage(lang);
            PosStateStore.Save(AppServices.State);
        }

        private void OnApplyKey(object sender, RoutedEventArgs e)
        {
            string key = TxtApiKey.Text.Trim();
            if (key.Length == 0) { LblActivResult.Text = AppServices.T("set.pasteFirst"); return; }
            try
            {
                var cfg = System.IO.File.Exists(AppPaths.DeviceConfig)
                    ? IniFile.Load(AppPaths.DeviceConfig) : new IniFile();
                cfg.Set("APIKEY", key);
                cfg.Set("ACTIVATIONSERVER", "https://fiscalstack.co.zw");
                cfg.Save(AppPaths.DeviceConfig);

                AppServices.Device = new FiscalStackDevice();
                string lic = AppServices.Device.GetLicense();
                var card = AppServices.Device.ReadLicense(lic);
                AppServices.Card = card;
                AppServices.TrackFiscalDay();
                AppServices.NotifyStatus();

                if (card.Ok)
                {
                    LblActivResult.Text = AppServices.T("set.licenceActive") + ": " + card.LicenseCompany +
                        (card.LicenseExpiry.Length > 0 ? "  \u00b7  " + string.Format(AppServices.T("set.expires"), card.LicenseExpiry) : "");
                }
                else
                {
                    LblActivResult.Text = string.Format(AppServices.T("set.engineSays"),
                        (card.LicenseStatus.Length > 0 ? card.LicenseStatus : "key not accepted"));
                }
                LoadValues();
            }
            catch (Exception ex) { LblActivResult.Text = string.Format(AppServices.T("set.failed"), ex.Message); }
        }

        private void OnLogo(object sender, RoutedEventArgs e)
        {
            var ofd = new OpenFileDialog { Filter = "Images (*.png;*.jpg;*.jpeg;*.bmp;*.gif)|*.png;*.jpg;*.jpeg;*.bmp;*.gif|All files (*.*)|*.*" };
            if (ofd.ShowDialog() == true) TxtLogo.Text = ofd.FileName;
        }

        private void OnEnv(object sender, SelectionChangedEventArgs e)
        {
            var ci = CmbEnv.SelectedItem as ComboBoxItem;
            if (ci == null) return;
            string zimraUrl = (string)ci.Tag;
            if (string.IsNullOrEmpty(zimraUrl)) return;

            bool isTest = zimraUrl.IndexOf("test", StringComparison.OrdinalIgnoreCase) >= 0;
            string verifUrl = isTest ? "https://fdmstest.zimra.co.zw" : "https://fdms.zimra.co.zw";

            try
            {
                // Save to both locations like SettingsForm.Save does
                SaveEnvConfig(zimraUrl, verifUrl);

                string envName = isTest ? AppServices.T("set.envTest") : AppServices.T("set.envProd");
                LblActivResult.Text = string.Format(AppServices.T("set.envSaved"), envName);
            }
            catch { }
        }

        private void SaveEnvConfig(string zimraUrl, string verifUrl)
        {
            var cfg = System.IO.File.Exists(AppPaths.DeviceConfig)
                ? IniFile.Load(AppPaths.DeviceConfig) : new IniFile();
            cfg.Set("ZIMRASERVER", zimraUrl);
            cfg.Set("VERIFICATIONSERVER", verifUrl);
            cfg.Set("QRURL", verifUrl);
            cfg.Save(AppPaths.DeviceConfig);
            // Keep app-dir config in sync for the engine
            try { cfg.Save(Path.Combine(AppPaths.AppDir, "config.ini")); } catch { }
        }

        private void OnOpenData(object sender, RoutedEventArgs e)
        {
            try { System.Diagnostics.Process.Start("explorer.exe", "\"" + AppPaths.DataDir + "\""); }
            catch { }
        }
    }
}