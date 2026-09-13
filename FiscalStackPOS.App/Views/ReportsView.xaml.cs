using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace FiscalStackPOS.Views
{
    public partial class ReportsView : UserControl
    {
        public ReportsView()
        {
            InitializeComponent();
            RefreshStatus();
        }

        public void OnActivated() { RefreshStatus(); }

        private Window Owner { get { return Window.GetWindow(this); } }

        private void RefreshStatus()
        {
            var s = AppServices.State;
            LblDayNo.Text = string.Format(AppServices.T("rep.dayNo"), string.IsNullOrEmpty(s.CurrentFiscalDayNo) ? AppServices.T("rep.none") : s.CurrentFiscalDayNo)
                        + "\n" + string.Format(AppServices.T("rep.dateF"), string.IsNullOrEmpty(s.CurrentFiscalDate) ? AppServices.T("rep.none") : s.CurrentFiscalDate);

            var todays = (AppServices.Journal == null ? new List<JournalEntry>() : AppServices.Journal.TodaysEntries()).ToList();
            decimal gross = todays.Sum(x => x.Amount);
            decimal vat = todays.Sum(x => x.Vat);
            int pending = todays.Count(x => !x.Submitted);
            string device = AppServices.Device == null ? AppServices.T("rep.unlicensed")
                : (AppServices.Card != null && AppServices.Card.SerialNumber.Length > 0 ? AppServices.Card.SerialNumber : AppServices.T("rep.unlicensed"));
            LblStatus.Text = string.Format(AppServices.T("rep.receiptsToday"), todays.Count)
                        + "\n" + string.Format(AppServices.T("rep.grossToday"), (s.Settings.CurrencySymbol == "" ? "" : s.Settings.CurrencySymbol + " ") + gross.ToString("0.00"))
                        + "\n" + string.Format(AppServices.T("rep.vatToday"), vat.ToString("0.00"))
                        + "\n" + string.Format(AppServices.T("rep.queued"), pending)
                        + "\n" + string.Format(AppServices.T("rep.device"), device);
            LblResult.Text = "";
        }

        private void Swap(bool busy, string msg)
        {
            if (msg != null) LblResult.Text = msg;
        }

        private void OnOpenDay(object sender, RoutedEventArgs e)
        {
            try
            {
                AppServices.EnsureFiscalDayOpen();
                AppServices.NotifyStatus();
                RefreshStatus();
                LblResult.Text = AppServices.T("rep.dayOpen");
            }
            catch (Exception ex) { LblResult.Text = string.Format(AppServices.T("rep.failed"), ex.Message); }
        }

        private void OnCloseDay(object sender, RoutedEventArgs e)
        {
            if (MessageBox.Show(Owner, AppServices.T("rep.closeQ"), AppServices.T("rep.fiscalDay"), MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            try
            {
                var res = AppServices.Device.CloseDay();
                var fr = FiscalStackDevice.ParseResult(res);
                LblResult.Text = fr.Ok ? string.Format(AppServices.T("rep.closed"), fr.Message) : string.Format(AppServices.T("rep.closeFailed"), fr.Message);
                AppServices.TrackFiscalDay();
                RefreshStatus();
                AppServices.NotifyStatus();
            }
            catch (Exception ex) { LblResult.Text = string.Format(AppServices.T("rep.failed"), ex.Message); }
        }

        private void OnX(object sender, RoutedEventArgs e)
        {
            try
            {
                var s = AppServices.State;
                var todays = AppServices.Journal.TodaysEntries().ToList();
                var lines = new List<string>();
                lines.Add("X REPORT");
                lines.Add(string.Format(AppServices.T("rep.xDay"), string.IsNullOrEmpty(s.CurrentFiscalDayNo) ? "-" : s.CurrentFiscalDayNo));
                lines.Add(string.Format(AppServices.T("rep.xReceipts"), todays.Count));
                lines.Add(string.Format(AppServices.T("rep.xGross"), s.Settings.CurrencySymbol + " " + todays.Sum(x => x.Amount).ToString("0.00")));
                lines.Add(string.Format(AppServices.T("rep.xVat"), todays.Sum(x => x.Vat).ToString("0.00")));
                lines.Add(string.Format(AppServices.T("rep.xQueued"), todays.Count(x => !x.Submitted)));
                ThermalPrinter.PrintLines("X REPORT", lines, s.Settings.PrinterName, s.Settings.ReceiptWidth, false, s.Settings.LogoFile);
                LblResult.Text = AppServices.T("rep.xSent");
            }
            catch (Exception ex) { LblResult.Text = string.Format(AppServices.T("rep.failed"), ex.Message); }
        }

        private async void OnZ(object sender, RoutedEventArgs e)
        {
            if (MessageBox.Show(Owner, AppServices.T("rep.zQ"),
                AppServices.T("rep.z"), MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            LblResult.Text = AppServices.T("rep.zRunning");
            try
            {
                var raw = await Task.Run(() => AppServices.Device.ZReport());
                var fr = FiscalStackDevice.ParseResult(raw);
                var s = AppServices.State;
                ThermalPrinter.PrintZReport(fr.DataXml, AppServices.Card, s.Settings.PrinterName, s.Settings.ReceiptWidth, false, s.Settings.LogoFile);
                AppServices.TrackFiscalDay();
                AppServices.State.ZReportSequence++;
                PosStateStore.Save(AppServices.State);
                RefreshStatus();
                AppServices.NotifyStatus();
                LblResult.Text = string.Format(AppServices.T("rep.zDone"), fr.Message);
            }
            catch (Exception ex) { LblResult.Text = string.Format(AppServices.T("rep.failed"), ex.Message); }
        }

        private void OnSubmit(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!AppServices.Submitter.IsOnline()) { LblResult.Text = AppServices.T("rep.offlineMsg"); return; }
                var outcome = AppServices.Submitter.SubmitPending(AppServices.State.CurrentFiscalDayNo, AppServices.State.CurrentFiscalDate);
                LblResult.Text = outcome.Message;
                AppServices.NotifyStatus();
                RefreshStatus();
            }
            catch (Exception ex) { LblResult.Text = string.Format(AppServices.T("rep.failed"), ex.Message); }
        }
    }
}