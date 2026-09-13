using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Newtonsoft.Json;

namespace FiscalStackPOS.Views
{
    public partial class HistoryView : UserControl
    {
        private readonly ObservableCollection<JournalRow> rows = new ObservableCollection<JournalRow>();

        public HistoryView()
        {
            InitializeComponent();
            Grid.ItemsSource = rows;
            Localize();
            Refresh();
        }

        public void Localize()
        {
            ColInvoice.Header = AppServices.T("hist.colInvoice");
            ColTime.Header = AppServices.T("hist.colTime");
            ColAmount.Header = AppServices.T("hist.colAmount");
            ColPayment.Header = AppServices.T("hist.colPayment");
            ColQr.Header = AppServices.T("hist.colQr");
            ColStatus.Header = AppServices.T("hist.colStatus");
        }

        public void OnActivated() { Refresh(); }

        private Window Owner { get { return Window.GetWindow(this); } }

        private void Refresh()
        {
            rows.Clear();
            var all = (AppServices.Journal == null ? new List<JournalEntry>() : AppServices.Journal.All()).OrderByDescending(x => x.InvoiceNumber).ToList();
            foreach (var e in all) rows.Add(new JournalRow(e));
            LblInfo.Text = string.Format(AppServices.T("hist.info"), all.Count, all.Count(x => !x.Submitted));
        }

        private JournalRow Selected()
        {
            return Grid.SelectedItem as JournalRow;
        }

        private static PosSale Deserialize(JournalEntry e)
        {
            if (!string.IsNullOrEmpty(e.SnapshotJson))
            {
                try { var s = JsonConvert.DeserializeObject<PosSale>(e.SnapshotJson); if (s != null) return s; } catch { }
            }
            var fallback = new PosSale { InvoiceNumber = e.InvoiceNumber, Currency = e.Currency, PaymentMethod = e.PaymentMethod, InvoiceFlag = e.Flag, Created = e.Created };
            fallback.Items.Add(new PosItem { Name = string.Format(AppServices.T("hist.headerOnly"), e.InvoiceNumber), Quantity = 1, Price = e.Amount, TaxRate = e.Amount > 0 ? e.Vat / e.Amount : 0m });
            return fallback;
        }

        private void OnReprint(object sender, RoutedEventArgs e)
        {
            var row = Selected();
            if (row == null) return;
            var sale = Deserialize(row.Entry);
            var res = new FiscalResult
            {
                Ok = true, Code = "1", Message = row.Entry.InvoiceNumber,
                DataXml = row.Entry.DataXml, QrUrl = row.Entry.QrUrl,
                DeviceHash = row.Entry.DeviceHash, FiscalDayNo = row.Entry.FiscalDayNo,
                ReceiptGlobalNo = row.Entry.ReceiptGlobalNo, SerialNumber = AppServices.Card.SerialNumber
            };
            try
            {
                bool preview = AppServices.State.Settings.ShowPrintPreview;
                if (preview)
                {
                    var bmp = ThermalPrinter.Render(sale, res, AppServices.Card,
                        AppServices.State.Settings.ReceiptWidth, AppServices.State.Settings.LogoFile);
                    var pv = new Dialogs.PrintPreviewDialog(bmp, row.Entry.InvoiceNumber);
                    if (pv.ShowDialog() == true)
                        ThermalPrinter.PrintBitmap(bmp, AppServices.State.Settings.PrinterName, false, "FISCAL RECEIPT");
                }
                else
                {
                    ThermalPrinter.Print(sale, res, AppServices.Card,
                        AppServices.State.Settings.PrinterName, AppServices.State.Settings.ReceiptWidth,
                        false, AppServices.State.Settings.LogoFile);
                }
                AppServices.Journal.Update(row.Entry.Id, x => x.Printed = true);
                Refresh();
            }
            catch (Exception ex) { MessageBox.Show(Owner,  string.Format(AppServices.T("hist.reprintFail"), ex.Message), AppServices.T("hist.reprint"), MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void OnRefund(object sender, RoutedEventArgs e)
        {
            var row = Selected();
            if (row == null) return;
            var original = Deserialize(row.Entry);
            if (original.Subtotal <= 0) return;
            if (MessageBox.Show(Owner,  string.Format(AppServices.T("hist.refundQ"), original.InvoiceNumber,
                original.Currency, original.Subtotal.ToString("0.00")),
                AppServices.T("hist.refund"), MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;

            var cn = new PosSale
            {
                InvoiceNumber = InvoiceNumbers.Next(AppServices.State),
                Currency = original.Currency,
                PaymentMethod = original.PaymentMethod,
                Created = DateTime.Now,
                CustomerName = original.CustomerName,
                CustomerTin = original.CustomerTin,
                CustomerVat = original.CustomerVat,
                InvoiceFlag = "02",
                OriginalInvoiceNumber = original.InvoiceNumber,
                InvoiceComment = AppServices.T("hist.creditNote") + " " + original.InvoiceNumber
            };
            foreach (var it in original.Items)
                cn.Items.Add(new PosItem { Name = it.Name, HsCode = it.HsCode, Quantity = it.Quantity, Price = it.Price, TaxRate = it.TaxRate });

            var dlg = new Dialogs.CheckoutDialog(cn);
            if (dlg.ShowDialog() == true)
            {
                AppServices.NotifyStatus();
                Refresh();
            }
        }

        private void OnSubmit(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!AppServices.Submitter.IsOnline())
                {
                    MessageBox.Show(Owner,  AppServices.T("hist.offline"), AppServices.T("hist.submit"), MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }
                var outcome = AppServices.Submitter.SubmitPending(AppServices.State.CurrentFiscalDayNo, AppServices.State.CurrentFiscalDate);
                LblInfo.Text = outcome.Message + (string.IsNullOrEmpty(outcome.Archived) ? "" : "\n" + AppServices.T("hist.archived") + ": " + outcome.Archived);
                AppServices.NotifyStatus();
                Refresh();
            }
            catch (Exception ex) { MessageBox.Show(Owner,  string.Format(AppServices.T("hist.submitFail"), ex.Message), AppServices.T("hist.submit"), MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void OnRefresh(object sender, RoutedEventArgs e) { Refresh(); }
    }
}