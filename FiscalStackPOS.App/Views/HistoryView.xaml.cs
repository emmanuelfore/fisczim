using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Newtonsoft.Json;

namespace FiscalStackPOS.Views
{
    public partial class HistoryView : UserControl
    {
        private readonly ObservableCollection<JournalRow> rows = new ObservableCollection<JournalRow>();
        private readonly ObservableCollection<CashRow> cashRows = new ObservableCollection<CashRow>();
        private readonly ObservableCollection<TaxRow> taxRows = new ObservableCollection<TaxRow>();
        private readonly ObservableCollection<PayRow> payRows = new ObservableCollection<PayRow>();
        private readonly List<JournalEntry> all = new List<JournalEntry>();

        public HistoryView()
        {
            InitializeComponent();
            Grid.ItemsSource = rows;
            CashierGrid.ItemsSource = cashRows;
            TaxGrid.ItemsSource = taxRows;
            PayGrid.ItemsSource = payRows;
            Localize();
            Refresh();
        }

        public void Localize()
        {
            ColTime.Header = AppServices.T("hist.colTime");
            ColInvoice.Header = AppServices.T("hist.colInvoice");
            ColCashier.Header = AppServices.T("hist.colCashier");
            ColType.Header = AppServices.T("hist.colType");
            ColLayout.Header = AppServices.T("hist.colItems");
            ColNet.Header = AppServices.T("hist.colNet");
            ColVat.Header = AppServices.T("hist.colVat");
            ColAmount.Header = AppServices.T("hist.colAmount");
            ColPayment.Header = AppServices.T("hist.colPayment");
            ColQr.Header = AppServices.T("hist.colQr");
            ColStatus.Header = AppServices.T("hist.colStatus");
            ColCashWho.Header = AppServices.T("hist.colWho");
            ColCashSales.Header = AppServices.T("hist.colSales");
            ColCashCount.Header = AppServices.T("hist.count");
            ColTaxRate.Header = AppServices.T("hist.colRate");
            ColTaxGross.Header = AppServices.T("hist.colGross");
            ColTaxAmount.Header = AppServices.T("hist.colTax");
            ColTaxCount.Header = AppServices.T("hist.count");
            ColPayMethod.Header = AppServices.T("hist.colMethod");
            ColPaySales.Header = AppServices.T("hist.colSales");
            ColPayCount.Header = AppServices.T("hist.count");
        }

        public void OnActivated() { Refresh(); }

        private Window Owner { get { return Window.GetWindow(this); } }

        public void Refresh()
        {
            all.Clear();
            if (AppServices.Journal != null) all.AddRange(AppServices.Journal.All());
            BuildFilterOptions();
            ApplyFilters();
        }

        // ------------------------------------------------------------------ filters

        private void BuildFilterOptions()
        {
            string selCash = Selected(CmbCashier);
            string selPay = Selected(CmbPayment);
            string selRate = Selected(CmbRate);
            string selFlag = Selected(CmbFlag);

            var cash = all.Select(x => NormalizeCashier(x.Cashier)).Where(x => x.Length > 0).Distinct().OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            cash.Insert(0, AppServices.T("hist.all"));
            var pays = all.Select(x => Norm(x.PaymentMethod)).Where(x => x.Length > 0).Distinct().OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            pays.Insert(0, AppServices.T("hist.all"));
            var rates = all.SelectMany(RateLabels).Distinct().OrderBy(x => x).ToList();
            rates.Insert(0, AppServices.T("hist.all"));
            var flags = new List<string> { AppServices.T("hist.all"), AppServices.T("hist.sale"), AppServices.T("hist.credit"), AppServices.T("hist.debit") };

            FillCombo(CmbCashier, cash, selCash);
            FillCombo(CmbPayment, pays, selPay);
            FillCombo(CmbRate, rates, selRate);
            FillCombo(CmbFlag, flags, selFlag);
        }

        private static void FillCombo(ComboBox combo, List<string> items, string keep)
        {
            combo.Items.Clear();
            foreach (var s in items) combo.Items.Add(s);
            var def = items.Count > 0 ? items[0] : "";
            string pick = keep ?? "";
            if (pick.Length == 0 || !items.Contains(pick)) pick = def;
            combo.SelectedItem = pick;
        }

        private static string Selected(ComboBox combo)
        {
            return combo != null && combo.SelectedItem != null ? combo.SelectedItem.ToString() : "";
        }

        private static string Norm(string s) { return string.IsNullOrWhiteSpace(s) ? "" : s.Trim().ToUpperInvariant(); }
        private static string NormalizeCashier(string s) { return string.IsNullOrWhiteSpace(s) ? "" : s.Trim(); }

        private static IEnumerable<string> RateLabels(JournalEntry e)
        {
            var seen = new List<string>();
            foreach (var it in ItemsOf(e))
            {
                string l = RateLabel(it.TaxRate);
                if (!seen.Contains(l)) seen.Add(l);
            }
            return seen;
        }

        private static string RateLabel(decimal rate)
        {
            return (rate * 100m).ToString("0.###") + "%";
        }

        private static List<PosItem> ItemsOf(JournalEntry e)
        {
            try
            {
                if (!string.IsNullOrEmpty(e.SnapshotJson))
                {
                    var s = JsonConvert.DeserializeObject<PosSale>(e.SnapshotJson);
                    if (s != null && s.Items.Count > 0) return s.Items;
                }
            }
            catch { }
            var f = new PosItem { Name = AppServices.T("hist.headerOnly"), Quantity = 1, Price = e.Amount, TaxRate = e.Amount > 0 ? e.Vat / e.Amount : 0m };
            return new List<PosItem> { f };
        }

        public void ApplyFilters()
        {
            DateTime? from = DpFrom == null ? null : DpFrom.SelectedDate;
            DateTime? to = DpTo == null ? null : DpTo.SelectedDate;
            string cashier = Selected(CmbCashier);
            string pay = Selected(CmbPayment);
            string rate = Selected(CmbRate);
            string flag = Selected(CmbFlag);

            var allTxt = AppServices.T("hist.all");
            var list = all.Where(e =>
            {
                if (from.HasValue && e.Created.Date < from.Value.Date) return false;
                if (to.HasValue && e.Created.Date > to.Value.Date) return false;
                if (cashier.Length > 0 && cashier != allTxt && !string.Equals(NormalizeCashier(e.Cashier), cashier, StringComparison.OrdinalIgnoreCase)) return false;
                if (pay.Length > 0 && pay != allTxt && !string.Equals(Norm(e.PaymentMethod), pay, StringComparison.OrdinalIgnoreCase)) return false;
                if (rate.Length > 0 && rate != allTxt && !RateLabels(e).Contains(rate)) return false;
                if (flag.Length > 0 && flag != allTxt)
                {
                    string want = flag == AppServices.T("hist.credit") ? "02" : flag == AppServices.T("hist.debit") ? "03" : "01";
                    if (!string.Equals(e.Flag, want, StringComparison.Ordinal)) return false;
                }
                return true;
            }).OrderByDescending(x => x.Created).ToList();

            BuildRows(list);
            BuildSummary(list);
        }

        private void BuildRows(List<JournalEntry> list)
        {
            rows.Clear();
            foreach (var e in list) rows.Add(new JournalRow(e));
            LblInfo.Text = string.Format(AppServices.T("hist.info"), list.Count, list.Count(x => !x.Submitted));
        }

        private void BuildSummary(List<JournalEntry> list)
        {
            string sym = AppServices.CurrencySymbol + " ";
            decimal gross = 0, vat = 0;
            var cash = new Dictionary<string, decimal>();
            var cashCount = new Dictionary<string, int>();
            var pays = new Dictionary<string, decimal>();
            var payCount = new Dictionary<string, int>();
            var taxes = new SortedDictionary<string, TaxAcc>();
            var taxCount = new Dictionary<string, HashSet<string>>();

            foreach (var e in list)
            {
                gross += e.Amount; vat += e.Vat;
                string who = NormalizeCashier(e.Cashier);
                if (who.Length == 0) who = "-";
                cash[who] = cash.ContainsKey(who) ? cash[who] + e.Amount : e.Amount;
                cashCount[who] = cashCount.ContainsKey(who) ? cashCount[who] + 1 : 1;

                string m = Norm(e.PaymentMethod);
                if (m.Length == 0) m = "-";
                pays[m] = pays.ContainsKey(m) ? pays[m] + e.Amount : e.Amount;
                payCount[m] = payCount.ContainsKey(m) ? payCount[m] + 1 : 1;

                foreach (var it in ItemsOf(e))
                {
                    string rate = RateLabel(it.TaxRate);
                    if (!taxes.ContainsKey(rate)) taxes[rate] = new TaxAcc();
                    taxes[rate].Gross += it.Amount;
                    taxes[rate].Tax += it.Tax;
                    if (!taxCount.ContainsKey(rate)) taxCount[rate] = new HashSet<string>();
                    taxCount[rate].Add(e.Id);
                }
            }

            LblGross.Text = sym + gross.ToString("0.00");
            LblTax.Text = sym + vat.ToString("0.00");
            LblNet.Text = sym + (gross - vat).ToString("0.00");
            LblCount.Text = list.Count.ToString();

            cashRows.Clear();
            foreach (var kv in cash.OrderByDescending(x => x.Value))
                cashRows.Add(new CashRow { Who = kv.Key, Sales = sym + kv.Value.ToString("0.00"), Count = cashCount[kv.Key].ToString() });

            payRows.Clear();
            foreach (var kv in pays.OrderByDescending(x => x.Value))
                payRows.Add(new PayRow { Method = kv.Key, Sales = sym + kv.Value.ToString("0.00"), Count = payCount[kv.Key].ToString() });

            taxRows.Clear();
            foreach (var kv in taxes.Reverse())
                taxRows.Add(new TaxRow { Rate = kv.Key, Gross = sym + kv.Value.Gross.ToString("0.00"), Tax = sym + kv.Value.Tax.ToString("0.00"), Count = taxCount[kv.Key].Count.ToString() });
        }

        private class TaxAcc { public decimal Gross; public decimal Tax; }

        private class CashRow { public string Who = ""; public string Sales = ""; public string Count = ""; }
        private class TaxRow { public string Rate = ""; public string Gross = ""; public string Tax = ""; public string Count = ""; }
        private class PayRow { public string Method = ""; public string Sales = ""; public string Count = ""; }

        private void OnFilterChanged(object sender, SelectionChangedEventArgs e)
        {
            if (Grid == null || rows == null) return;
            ApplyFilters();
        }

        private void OnReset(object sender, RoutedEventArgs e)
        {
            if (DpFrom != null) DpFrom.SelectedDate = null;
            if (DpTo != null) DpTo.SelectedDate = null;
            BuildFilterOptions();
            ApplyFilters();
        }

        // ------------------------------------------------------------------ actions

        private JournalRow Selected()
        {
            return Grid.SelectedItem as JournalRow;
        }

        private static PosSale Deserialize(JournalEntry e)
        {
            if (!string.IsNullOrEmpty(e.SnapshotJson))
            {
                try { var s = JsonConvert.DeserializeObject<PosSale>(e.SnapshotJson); if (s != null) { s.Cashier = e.Cashier; return s; } } catch { }
            }
            var fallback = new PosSale { InvoiceNumber = e.InvoiceNumber, Currency = e.Currency, PaymentMethod = e.PaymentMethod, InvoiceFlag = e.Flag, Created = e.Created, Cashier = e.Cashier };
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
                        ThermalPrinter.PrintEscPos(sale, res, AppServices.Card,
                            AppServices.State.Settings.ReceiptWidth, AppServices.State.Settings.PrinterName);
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
            catch (Exception ex) { MessageBox.Show(Owner, string.Format(AppServices.T("hist.reprintFail"), ex.Message), AppServices.T("hist.reprint"), MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void OnRefund(object sender, RoutedEventArgs e)
        {
            var row = Selected();
            if (row == null) return;
            var original = Deserialize(row.Entry);
            if (original.Subtotal <= 0) return;
            if (MessageBox.Show(Owner, string.Format(AppServices.T("hist.refundQ"), original.InvoiceNumber,
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
                cn.Items.Add(new PosItem { Name = it.Name, Code = it.Code, HsCode = it.HsCode, Quantity = it.Quantity, Price = it.Price, TaxRate = it.TaxRate });

            var dlg = new Dialogs.CheckoutDialog(cn);
            if (dlg.ShowDialog() == true)
            {
                AppServices.NotifyStatus();
                Refresh();
            }
        }

        private async void OnSubmit(object sender, RoutedEventArgs e)
        {
            LblInfo.Text = AppServices.T("hist.submit") + " ...";
            try
            {
                var outcome = await System.Threading.Tasks.Task.Run(() =>
                {
                    if (!AppServices.Submitter.IsOnline()) return null;
                    return AppServices.Submitter.SubmitPending(AppServices.State.CurrentFiscalDayNo, AppServices.State.CurrentFiscalDate);
                });
                if (outcome == null)
                {
                    MessageBox.Show(Owner, AppServices.T("hist.offline"), AppServices.T("hist.submit"), MessageBoxButton.OK, MessageBoxImage.Information);
                    LblInfo.Text = "";
                    return;
                }
                LblInfo.Text = outcome.Message + (string.IsNullOrEmpty(outcome.Archived) ? "" : "\n" + AppServices.T("hist.archived") + ": " + outcome.Archived);
                AppServices.NotifyStatus();
                Refresh();
            }
            catch (Exception ex) { MessageBox.Show(Owner, string.Format(AppServices.T("hist.submitFail"), ex.Message), AppServices.T("hist.submit"), MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void OnRefresh(object sender, RoutedEventArgs e) { Refresh(); }
    }
}