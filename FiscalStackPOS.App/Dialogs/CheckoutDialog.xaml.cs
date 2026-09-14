using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using Newtonsoft.Json;

namespace FiscalStackPOS.Dialogs
{
    public partial class CheckoutDialog : Window
    {
        private readonly PosSale sale;
        private string method = "CASH";
        private bool fiscalized;
        private FiscalResult lastResult;

        public CheckoutDialog(PosSale sale)
        {
            InitializeComponent();
            this.sale = sale;

            decimal sub = 0, vat = 0;
            foreach (var it in sale.Items)
            {
                sub += it.Amount; vat += it.Tax;
                var row = new Border
                {
                    BorderBrush = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0xE2, 0xE8, 0xF0)),
                    BorderThickness = new Thickness(0, 0, 0, 1),
                    Padding = new Thickness(0, 4, 0, 4),
                    Child = new Grid { Children = {
                        new TextBlock { Text = it.Name, FontSize = 12 },
                        new TextBlock { Text = (sale.Currency + " " + it.Amount.ToString("0.00")),
                                        HorizontalAlignment = HorizontalAlignment.Right, FontWeight = FontWeights.SemiBold } } }
                };
                ItemsHost.Children.Add(row);
            }
            LblTotal.Text = AppServices.T("pos.total") + "   " + sale.Currency + " " + sub.ToString("0.00") + "   (" +
                AppServices.T("pos.vat") + " " + vat.ToString("0.00") + ")";

            string[] methods = { "CASH", "CARD", "MOBILE MONEY", "TRANSFER", "CHEQUE", "OTHER" };
            foreach (var m in methods)
            {
                var rb = new RadioButton
                {
                    Style = FindResource("PillButton") as Style,
                    Content = m,
                    Tag = m,
                    Margin = new Thickness(0, 0, 10, 10),
                    GroupName = "method",
                    IsChecked = m == "CASH"
                };
                rb.Checked += (s, e) => { method = (string)(s as RadioButton).Tag; };
                MethodsHost.Children.Add(rb);
            }
            TxtPaid.TextChanged += (s, e) => UpdateChange();
            Loaded += (s, e) => { TxtPaid.Focus(); UpdateChange(); };
        }

        private async void OnFiscalize(object sender, RoutedEventArgs e)
        {
            if (busy) return;
            busy = true; BtnFisc.IsEnabled = false;
            LblStatus.Text = AppServices.T("chk.fiscalizing");

            decimal paid = Parse(TxtPaid.Text);
            decimal tendered = paid > 0 ? paid : sale.Subtotal;
            sale.Tendered = Math.Round(tendered, 2);
            sale.PaymentMethod = method;
            sale.InvoiceFlag = ChkCredit.IsChecked == true ? "02" : "01";
            sale.OriginalInvoiceNumber = ChkCredit.IsChecked == true ? TxtOrigInv.Text.Trim() : "";
            sale.InvoiceComment = TxtComment.Text.Trim();
            sale.CustomerName = TxtCust.Text.Trim();
            sale.CustomerTin = TxtTin.Text.Trim();
            sale.CustomerVat = TxtCustVat.Text.Trim();
            sale.CustomerPhone = TxtPhone.Text.Trim();
            sale.CustomerAddress = TxtAddr.Text.Trim();
            sale.CustomerEmail = TxtEmail.Text.Trim();
            sale.Cashier = AppServices.CurrentUser == null ? "" : AppServices.CurrentUser.FullName;
            sale.Created = DateTime.Now;

            try
            {
                var res = await Task.Run(() =>
                {
                    AppServices.EnsureFiscalDayOpen();
                    return AppServices.Device.FiscalizeSale(sale, AppServices.Card.Address);
                });
                lastResult = res;
                fiscalized = res.Ok;
                if (res.Ok)
                {
                    LblStatus.Text = AppServices.T("chk.saleOk");
                    ShowResult(res);
                    AppServices.Journal.Add(new JournalEntry
                    {
                        InvoiceNumber = sale.InvoiceNumber,
                        FiscalDayNo = res.FiscalDayNo,
                        ReceiptGlobalNo = res.ReceiptGlobalNo,
                        Currency = sale.Currency,
                        PaymentMethod = sale.PaymentMethod,
                        Amount = sale.Subtotal,
                        Vat = sale.VatTotal,
                        Flag = sale.InvoiceFlag,
                        CustomerName = sale.CustomerName,
                        Cashier = AppServices.CurrentUser == null ? "" : AppServices.CurrentUser.FullName,
                        ItemsCount = sale.Items.Count,
                        QrUrl = res.QrUrl,
                        DeviceHash = res.DeviceHash,
                        DataXml = res.DataXml,
                        ResponseMessage = res.Message,
                        SnapshotJson = JsonConvert.SerializeObject(sale),
                        Printed = false,
                        Submitted = false
                    });

                    bool wantPrint = ChkPrint.IsChecked == true;
                    if (wantPrint) await Task.Run(() => PrintReceipt(res));
                    if (AppServices.State.Settings.OpenDrawerOnPrint)
                    {
                        try { RawPrinter.DrawerPulse(AppServices.State.Settings.PrinterName); } catch { }
                    }
                    BtnFisc.Visibility = Visibility.Collapsed;
                    BtnOk.Visibility = Visibility.Visible;
                }
                else
                {
                    LblStatus.Text = string.Format(AppServices.T("chk.failed"), res.Message);
                }
            }
            catch (Exception ex)
            {
                LblStatus.Text = AppServices.T("chk.engineError") + " " + ex.Message;
            }
            finally { busy = false; BtnFisc.IsEnabled = true; }
        }

        private bool busy;

        private void PrintReceipt(FiscalResult res)
        {
            try
            {
                bool preview = AppServices.State.Settings.ShowPrintPreview;
                if (preview)
                {
                    var bmp = ThermalPrinter.Render(sale, res, AppServices.Card,
                        AppServices.State.Settings.ReceiptWidth, AppServices.State.Settings.LogoFile);
                    Dispatcher.Invoke(System.Windows.Threading.DispatcherPriority.Normal, new Action(() =>
                    {
                        var pv = new PrintPreviewDialog(bmp, sale.InvoiceNumber);
                        if (pv.ShowDialog() == true)
                            ThermalPrinter.PrintEscPos(sale, res, AppServices.Card,
                                AppServices.State.Settings.ReceiptWidth, AppServices.State.Settings.PrinterName);
                    }));
                }
                else
                {
                    ThermalPrinter.Print(sale, res, AppServices.Card,
                        AppServices.State.Settings.PrinterName, AppServices.State.Settings.ReceiptWidth,
                        false, AppServices.State.Settings.LogoFile);
                }
            }
            catch (Exception ex) { Dispatcher.Invoke(() => LblStatus.Text = AppServices.T("chk.printFailed") + " " + ex.Message); }
        }

        private void ShowResult(FiscalResult res)
        {
            PendingCard.Visibility = Visibility.Collapsed;
            ResultCard.Visibility = Visibility.Visible;
            LblResultInv.Text = AppServices.T("chk.invoice") + " " + res.Message;
            LblResultInfo.Text = AppServices.T("chk.day") + " " + res.FiscalDayNo + "    ·    " + AppServices.T("chk.gno") + " " + res.ReceiptGlobalNo +
                "\n" + sale.Currency + " " + sale.Subtotal.ToString("0.00") +
                (res.QrUrl.Length > 0 ? "\n" + AppServices.T("chk.fiscalQr") : "\n" + AppServices.T("chk.noQr"));

            if (res.QrUrl.Length > 0)
            {
                try
                {
                    using (var gen = new QRCoder.QRCodeGenerator())
                    using (var qd = gen.CreateQrCode(res.QrUrl, QRCoder.QRCodeGenerator.ECCLevel.M))
                    using (var code = new QRCoder.QRCode(qd))
                    using (var bmp = code.GetGraphic(10))
                    {
                        ImgQr.Source = BitmapToSource(bmp);
                    }
                }
                catch { ImgQr.Visibility = Visibility.Collapsed; }
            }
            else ImgQr.Visibility = Visibility.Collapsed;

            AppServices.NotifyStatus();
        }

        private static BitmapSource BitmapToSource(System.Drawing.Bitmap bmp)
        {
            var ms = new System.IO.MemoryStream();
            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            ms.Position = 0;
            var bi = new BitmapImage();
            bi.BeginInit();
            bi.CacheOption = BitmapCacheOption.OnLoad;
            bi.StreamSource = ms;
            bi.EndInit();
            bi.Freeze();
            return bi;
        }

        private void UpdateChange()
        {
            decimal paid = Parse(TxtPaid.Text);
            decimal change = paid - sale.Subtotal;
            if (change >= 0) { LblChange.Text = change.ToString("0.00"); LblChange.Foreground = (System.Windows.Media.Brush)FindResource("SuccessBrush"); }
            else { LblChange.Text = ""; }
        }

        private void OnCreditToggle(object sender, RoutedEventArgs e)
        {
            bool on = ChkCredit.IsChecked == true;
            CreditFields.Visibility = on ? Visibility.Visible : Visibility.Collapsed;
            if (on) sale.InvoiceFlag = "02";
        }

        private void OnDone(object sender, RoutedEventArgs e)
        {
            DialogResult = fiscalized;
        }

        private static decimal Parse(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0m;
            decimal d;
            return decimal.TryParse(s.Replace(",", "."), NumberStyles.Any, CultureInfo.InvariantCulture, out d) ? d : 0m;
        }
    }
}