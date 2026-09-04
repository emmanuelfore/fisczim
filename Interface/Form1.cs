
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.ComponentModel;
using System.Configuration;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Reporting.WinForms;
using System.Drawing.Printing;
using System.ServiceProcess;
using System.Windows.Forms;
using System.Drawing.Imaging;
using System.Web.Services.Description;

namespace Revmax_Interface_Promun
{


    public partial class RevMaxInterfaceWizard : Form
    {
        FiscalStackClient client = new FiscalStackClient();
        string Discount = "";
        string CustomerNumber = "";
        RootObject rootinv = new RootObject();
        Invoice printInvoice = new Invoice();
        List<item> list = new List<item>();

        XmlDocument xmldoc1 = new XmlDocument();
        string receiptPath = "";

        List<ReadCurrencies> CurrenciesList = new List<ReadCurrencies>();

        CardDetails CardDetails = new CardDetails();
        ZReportStructure zReport = new ZReportStructure();

        // ── Smart Features ──────────────────────────────────────────
        private OfflineQueue _offlineQueue = new OfflineQueue();
        private OfflineCrypto _offlineCrypto = new OfflineCrypto();
        private SchedulerService _scheduler;
        private System.Windows.Forms.Timer _statusTimer;
        private System.Windows.Forms.Timer _retryTimer;
        private ConnectionStatus _currentStatus = ConnectionStatus.Unknown;
        private string _lastReceiptJson = null;



        public RevMaxInterfaceWizard()
        {
            InitializeComponent();
            AppBranding.ApplyIcon(this, this.notifyIcon1);

            //  reportViewer1.LocalReport.EnableExternalImages = true;

            Task.Run(async () =>
            {
                if (!HasConfiguredApiKey()) return;

                try
                {
                    string j = await client.GetDeviceAsync();
                    CardDetails = (CardDetails) JsonConvert.DeserializeObject<CardDetails>(j);
                    
                    // Save device details to cache
                    if (CardDetails != null)
                    {
                        DeviceCacheManager.Save(CardDetails, isOffline: false);
                        
                        // Update UI labels with company details
                        if (IsHandleCreated)
                        {
                            BeginInvoke(new Action(() =>
                            {
                                if (CardDetails.Data != null)
                                {
                                    lblStatusCompany.Text = "Company: " + (CardDetails.Data.CompanyName ?? "—");
                                    lblStatusDevice.Text = "Device ID: " + (DeviceCacheManager.Current.DeviceId ?? "—");
                                    lblStatusFiscalDay.Text = "Fiscal Day: " + (DeviceCacheManager.Current.FiscalDay ?? "—");
                                    AppendLog("[DEVICE] Connected — " + (CardDetails.Data.CompanyName ?? "Unknown company"));
                                }
                            }));
                        }
                    }
                    
                    try {
                        string stateJson = await client.GetOfflineStateAsync();
                        if (!string.IsNullOrEmpty(stateJson)) {
                            _offlineCrypto.SaveState(stateJson);
                        }
                    } catch { }
                }
                catch (Exception ex)
                {
                    // Load from cache when API fails
                    DeviceCacheManager.UpdateOfflineMode(true);
                    
                    if (IsHandleCreated)
                    {
                        BeginInvoke(new Action(() =>
                        {
                            // Populate UI from cache
                            var meta = DeviceCacheManager.Current;
                            if (meta != null && !string.IsNullOrEmpty(meta.CompanyName))
                            {
                                lblStatusCompany.Text = "Company: " + meta.CompanyName + " (Cached)";
                                lblStatusDevice.Text = "Device ID: " + (meta.DeviceId ?? "—");
                                lblStatusFiscalDay.Text = "Fiscal Day: " + (meta.FiscalDay ?? "—");
                                AppendLog("[DEVICE] Using cached data — " + meta.CompanyName);
                            }
                            else
                            {
                                lblStatusCompany.Text = "Company: Not configured";
                                lblStatusDevice.Text = "Device ID: —";
                                lblStatusFiscalDay.Text = "Fiscal Day: —";
                            }
                            
                            notifyIcon1.ShowBalloonTip(5000, "FiscalStack", "Using cached device details (Offline mode)", ToolTipIcon.Info);
                        }));
                    }
                }
            });

            //MessageBox.Show(printInvoice.Cashier);

            // Start smart services
            EnsureRuntimeDefaults();
            InitSmartFeatures();




            if (File.Exists(AppDomain.CurrentDomain.BaseDirectory.ToString() + "CurConf.interface"))
            {
                try
                {
                    LoadCurrencyConfig();
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Currency config could not be loaded. " + ex.Message, "FiscalStack", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            else
            {
                EnsureDefaultCurrencyConfig();
                LoadCurrencyConfig();
            }

        }




        private void EnsureRuntimeDefaults()
        {
            EnsureDirectorySetting("SourceFolder", "DevReceipts");
            EnsureDirectorySetting("TargetFolder", "DevBackup");
            EnsureDefaultCurrencyConfig();
        }

        private string EnsureDirectorySetting(string key, string fallbackFolderName)
        {
            string configuredPath = ConfigurationManager.AppSettings.Get(key);
            string path = configuredPath;

            if (string.IsNullOrWhiteSpace(path))
            {
                path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, fallbackFolderName);
                addToConfig(key, path);
            }

            Directory.CreateDirectory(path);
            return path;
        }

        private void EnsureDefaultCurrencyConfig()
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "CurConf.interface");
            if (File.Exists(path)) return;

            string xml = "<CurrencyTags>" +
                         "<currency><keyword>USD</keyword><Name>USD</Name></currency>" +
                         "<currency><keyword>US$</keyword><Name>USD</Name></currency>" +
                         "<currency><keyword>ZWL</keyword><Name>ZWL</Name></currency>" +
                         "<currency><keyword>Z$</keyword><Name>ZWL</Name></currency>" +
                         "</CurrencyTags>";
            File.WriteAllText(path, xml);
        }

        private void LoadCurrencyConfig()
        {
            CurrenciesList.Clear();
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "CurConf.interface");
            if (!File.Exists(path)) return;

            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read))
            {
                XmlDocument xmldoc1 = new XmlDocument();
                xmldoc1.Load(fs);
                XmlNodeList xmlnode1 = xmldoc1.GetElementsByTagName("currency");

                for (int i = 0; i <= xmlnode1.Count - 1; i++)
                {
                    CurrenciesList.Add(new ReadCurrencies
                    {
                        Keyword = xmlnode1[i].ChildNodes.Item(0).InnerText.Trim(),
                        Name = xmlnode1[i].ChildNodes.Item(1).InnerText.Trim(),
                    });
                }
            }
        }

        private bool HasConfiguredApiKey()
        {
            return !string.IsNullOrWhiteSpace(ConfigurationManager.AppSettings.Get("ApiKey"));
        }

        private async void timer1_Tick(object sender, EventArgs e)
        {

            ReadFile readFile = new ReadFile();


            timer1.Stop();
            try
            {
                string sourceFolder = EnsureDirectorySetting("SourceFolder", "DevReceipts");
                string targetFolder = EnsureDirectorySetting("TargetFolder", "DevBackup");

                if (string.IsNullOrWhiteSpace(sourceFolder) || !Directory.Exists(sourceFolder))
                {
                    SetStatus(ConnectionStatus.Error);
                    return;
                }

                foreach (var receipt in Directory.GetFiles(sourceFolder))
                {
                    //MessageBox.Show(receipt.ToString());
                    receiptPath = "";

                    if (await Fiscalize(readFile.ReadInvoice(receipt, ConfigurationManager.AppSettings.Get("VatFlag"), CurrenciesList)))
                    {
                        receiptPath = receipt;
                        Print("FISCAL INVOICE");
                        //Print("COPY INVOICE");

                        //File.Move(receipt, ConfigurationManager.AppSettings.Get("TargetFolder") + "\\REVMAX_" + DateTime.Now + ".txt");
                    }
                    list.Clear();

                    // invoice = readFile.ReadInvoice(receipt, ConfigurationManager.AppSettings.Get("VatFlag"), CurrenciesList);
                }

                if (!String.IsNullOrEmpty(receiptPath))
                {
                    File.Copy(receiptPath, Path.Combine(targetFolder, "FISCALSTACK_" + DateTime.Now.ToString("dd_MM_yyyy_HH_mm_ss") + ".txt"), true);
                    try
                    {
                        File.Delete(receiptPath);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("We could not delete the file. Please check the file permissions. " + ex.Message);
                    }
                }
            }
            catch (Exception ex)
            {
                SetStatus(ConnectionStatus.Error);
                notifyIcon1.ShowBalloonTip(5000, "FiscalStack", "Receipt watcher paused: " + ex.Message, ToolTipIcon.Warning);
            }
            finally
            {
                receiptPath = "";
                timer1.Start();
            }

        }
        private void Print(String ReceiptLabel)
        {
                      
            
            List<item> itemlist = new List<item>();
            List<TaxTable> taxTables = new List<TaxTable>();

            foreach (var taxItem in rootinv.Data.Receipt.ReceiptTaxes)
            {
                if (taxItem.TaxPercent.Equals(0) && taxItem.TaxCode.Equals("B"))
                {
                    taxTables.Add(new TaxTable
                    {
                        TaxPercent = "0",
                        NetAmount = taxItem.SalesAmountWithTax - taxItem.TaxAmount,
                        TaxAmount = taxItem.TaxAmount,
                        SalesAmountWithTax = taxItem.SalesAmountWithTax
                    });
                }

                if (taxItem.TaxPercent.Equals(0) && taxItem.TaxCode.Equals("C"))
                {
                    taxTables.Add(new TaxTable
                    {
                        TaxPercent = "EX",
                        NetAmount = taxItem.SalesAmountWithTax,
                        TaxAmount = taxItem.TaxAmount,
                        SalesAmountWithTax = taxItem.SalesAmountWithTax
                    });
                }

                if (taxItem.TaxCode.Equals("A"))
                {
                    taxTables.Add(new TaxTable
                    {
                        TaxPercent = taxItem.TaxPercent.ToString(),
                        NetAmount = taxItem.SalesAmountWithTax - taxItem.TaxAmount,
                        TaxAmount = taxItem.TaxAmount,
                        SalesAmountWithTax = taxItem.SalesAmountWithTax
                    });
                }

                /*if (taxItem.TaxPercent.Equals(15))
                {
                    taxTables.Add(new TaxTable
                    {
                        TaxPercent = "15",
                        NetAmount = taxItem.SalesAmountWithTax - taxItem.TaxAmount,
                        TaxAmount = taxItem.TaxAmount,
                        SalesAmountWithTax = taxItem.SalesAmountWithTax
                    });
                }*/


            }
            
            try
            {
                foreach (var item in printInvoice.items)
                {
                    itemlist.Add(new item()
                    {
                        ITEMCODE = item.ITEMCODE,
                        ITEMNAME1 = item.ITEMNAME1,
                        Quantity = item.Quantity.ToString(),
                        Price = item.Price.ToString(),
                        Amount = item.Amount.ToString(),
                        Taxable = item.Taxable.ToString(),
                        Tax = Math.Round(Convert.ToDecimal(item.Tax), 2).ToString(),
                        // ZIMRA required fields
                        HSCode = item.HSCode ?? "",
                        ReceiptLineType = rootinv.Data.Receipt.ReceiptType == "CreditNote" ? "Refund" : "Sale"
                    });
                }                
            }
            catch (Exception)
            {
                MessageBox.Show("ITEMNAME1/Quantity/Price/Amount tag missing.");
            }

            //MessageBox.Show(JsonConvert.SerializeObject(list, Newtonsoft.Json.Formatting.Indented));


            LocalReport localReport = reportViewer1.LocalReport;
            reportViewer1.LocalReport.ReportPath = "Report1.rdlc";

            reportViewer1.LocalReport.DataSources.Clear();


            ReportDataSource reportDataSource = new ReportDataSource("DataSet1", itemlist);
            ReportDataSource reportDataSource2 = new ReportDataSource("TaxTable", taxTables);
            string logoFile = ConfigurationManager.AppSettings.Get("LogoFile");
            string imagePath = !string.IsNullOrEmpty(logoFile) ? new Uri(logoFile).AbsoluteUri : "";
            var rp = new List<ReportParameter>();
            rp.Add(new ReportParameter("ImagePath", imagePath ?? ""));
            rp.Add(new ReportParameter("CompanyName", (CardDetails != null && CardDetails.Data != null && CardDetails.Data.CompanyName != null) ? CardDetails.Data.CompanyName : ""));
            rp.Add(new ReportParameter("Address", (CardDetails != null && CardDetails.Data != null && CardDetails.Data.Address != null) ? CardDetails.Data.Address : ""));
            rp.Add(new ReportParameter("TIN", (CardDetails != null && CardDetails.Data != null && CardDetails.Data.TIN != null) ? CardDetails.Data.TIN : ""));
            rp.Add(new ReportParameter("VatNumber", (CardDetails != null && CardDetails.Data != null && CardDetails.Data.VAT != null) ? CardDetails.Data.VAT : ""));
            rp.Add(new ReportParameter("Signature", rootinv.VerificationCode ?? ""));
            rp.Add(new ReportParameter("InvoiceNumber", rootinv.Data.Receipt.InvoiceNo ?? ""));
            rp.Add(new ReportParameter("Tax", (rootinv.Data.Receipt.ReceiptTaxes != null) ? rootinv.Data.Receipt.ReceiptTaxes.Sum(item => item.TaxAmount).ToString() : "0.00"));
            rp.Add(new ReportParameter("Total", rootinv.Data.Receipt.ReceiptTotal.ToString()));
            rp.Add(new ReportParameter("Cashier", printInvoice.Cashier ?? ""));
            rp.Add(new ReportParameter("Date", rootinv.Data.Receipt.ReceiptDate.ToString()));
            rp.Add(new ReportParameter("Currency", printInvoice.Currency ?? ""));
            
            // Receipt label based on transaction type (POS format)
            string receiptLabel = "FISCAL TAX INVOICE";
            if (rootinv.Data.Receipt.ReceiptType == "CreditNote")
                receiptLabel = "CREDIT NOTE";
            else if (rootinv.Data.Receipt.ReceiptType == "DebitNote")
                receiptLabel = "DEBIT NOTE";
            rp.Add(new ReportParameter("ReceiptLabel", receiptLabel));
            
            rp.Add(new ReportParameter("CustomerName", printInvoice.CustomerName ?? ""));
            rp.Add(new ReportParameter("CustomerNum", CustomerNumber ?? ""));
            rp.Add(new ReportParameter("Discount", Discount ?? "0.00"));
            rp.Add(new ReportParameter("DeviceId", rootinv.DeviceId ?? ""));
            rp.Add(new ReportParameter("ReceiptGlobalNumber", rootinv.Data.Receipt.ReceiptGlobalNo.ToString()));
            rp.Add(new ReportParameter("ReceiptNumber", rootinv.Data.Receipt.ReceiptCounter.ToString()));
            rp.Add(new ReportParameter("FiscalDay", rootinv.FiscalDay ?? ""));
            rp.Add(new ReportParameter("ReceiptId", (rootinv.Data.Receipt.CreditDebitNote != null && rootinv.Data.Receipt.CreditDebitNote.receiptGlobalNo != null) ? rootinv.Data.Receipt.CreditDebitNote.receiptGlobalNo : ""));
            rp.Add(new ReportParameter("DeviceSerial", (CardDetails != null && CardDetails.Data != null && CardDetails.Data.SerialNumber != null) ? CardDetails.Data.SerialNumber : ""));
            rp.Add(new ReportParameter("BuyerRegisterName", (rootinv.Data.Receipt.BuyerData != null && rootinv.Data.Receipt.BuyerData.buyerRegisterName != null) ? rootinv.Data.Receipt.BuyerData.buyerRegisterName : ""));
            rp.Add(new ReportParameter("Email", printInvoice.Email ?? ""));
            rp.Add(new ReportParameter("Phone", printInvoice.Phone ?? ""));
            rp.Add(new ReportParameter("Reason", printInvoice.Reason ?? (rootinv.Data.Receipt.ReceiptNotes?.ToString() ?? "")));
            rp.Add(new ReportParameter("Tendered", printInvoice.Tendered ?? ""));
            rp.Add(new ReportParameter("Change", printInvoice.Change ?? ""));
            rp.Add(new ReportParameter("InvoiceComment", printInvoice.InvoiceComment ?? ""));
            rp.Add(new ReportParameter("CustomerVATNumber", printInvoice.CustomerVATNumber ?? ""));
            rp.Add(new ReportParameter("CustomerTIN", printInvoice.CustomerTIN ?? ""));
            rp.Add(new ReportParameter("CustomerAddress", printInvoice.CustomerAddress ?? ""));
            rp.Add(new ReportParameter("CustomerEmail", printInvoice.CustomerEmail ?? ""));
            rp.Add(new ReportParameter("CustomerTelephoneNumber", printInvoice.CustomerTelephoneNumber ?? ""));
            
            // Credit/Debit Note specific fields
            rp.Add(new ReportParameter("RelatedInvoiceNumber", printInvoice.OriginalInvoiceNumber ?? (rootinv.Data.Receipt.CreditDebitNote?.originalInvoiceNo ?? "")));
            rp.Add(new ReportParameter("OriginalInvoiceGlobalNumber", printInvoice.OriginalInvoiceGlobalNumber ?? (rootinv.Data.Receipt.CreditDebitNote?.originalReceiptGlobalNo?.ToString() ?? "")));
            
            // Exchange rate (POS format)
            rp.Add(new ReportParameter("ExchangeRate", printInvoice.ExchangeRate ?? "1.00"));
            
            // Fiscal code (POS format)
            rp.Add(new ReportParameter("FiscalCode", rootinv.VerificationCode ?? ""));
            
            // ZIMRA payment method
            string paymentMethod = "CASH";
            if (rootinv.Data.Receipt.ReceiptPayments != null && rootinv.Data.Receipt.ReceiptPayments.Count > 0)
            {
                paymentMethod = rootinv.Data.Receipt.ReceiptPayments[0].MoneyTypeCode ?? "CASH";
            }
            rp.Add(new ReportParameter("PaymentMethod", paymentMethod));
            
            // Number of items (ZIMRA requirement)
            decimal totalItems = printInvoice.items.Sum(item => Convert.ToDecimal(item.Quantity));
            rp.Add(new ReportParameter("NumberOfItems", totalItems.ToString("F3")));
            
            /* reportParameters[17] = new ReportParameter("OriginalInvoiceNumber", printInvoice.OriginalInvoiceNumber);
            reportParameters[18] = new ReportParameter("OriginalInvoiceGlobalNumber", printInvoice.OriginalInvoiceGlobalNumber);*/





            reportViewer1.LocalReport.EnableExternalImages = true;
            reportViewer1.LocalReport.SetParameters(rp.ToArray());
            reportViewer1.LocalReport.DataSources.Add(reportDataSource);
            reportViewer1.LocalReport.DataSources.Add(reportDataSource2);

            QRCoder.QRCodeGenerator qRCodeGenerator = new QRCoder.QRCodeGenerator();
            QRCoder.QRCodeData qRCodeData = qRCodeGenerator.CreateQrCode(rootinv.QRcode, QRCoder.QRCodeGenerator.ECCLevel.Q);
            QRCoder.QRCode qRCode = new QRCoder.QRCode(qRCodeData);

            Bitmap bmp = qRCode.GetGraphic(12);
            using (MemoryStream ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Bmp);
                ReportData reportData = new ReportData();
                ReportData.QRCodeRow qRCodeRow = reportData.QRCode.NewQRCodeRow();
                qRCodeRow.Image = ms.ToArray();
                reportData.QRCode.AddQRCodeRow(qRCodeRow);

                ReportDataSource reportDataSource1 = new ReportDataSource();
                reportDataSource1.Name = "ReportData";
                reportDataSource1.Value = reportData.QRCode;

                reportViewer1.LocalReport.DataSources.Add(reportDataSource1);

            }
            /*            PaperSize paperSize = new PaperSize("receipt", 80, 297);
                        PageSettings pageSettings = new PageSettings();
                        pageSettings.PaperSize = paperSize;
                        reportViewer1.SetPageSettings(pageSettings);*/


            // MessageBox.Show(reportViewer1.LocalReport.GetDefaultPageSettings().PaperSize.ToString()); 

            reportViewer1.RefreshReport();
            reportViewer1.LocalReport.Print();
            //printInvoice.Clear();



            // printInvoice = null;
            //  DirectoryCopy(ConfigurationManager.AppSettings.Get("SourceFolder"), ConfigurationManager.AppSettings.Get("TargetFolder"));


        }








        private void btnInstall_Click()
        {
            MessageBox.Show("FiscalStack does not require a local service installation.");
        }






        private void btnLogs_Click(object sender, EventArgs e)
        {
            MessageBox.Show("Logs are managed entirely within the FiscalStack web dashboard. Please log in to your portal to view fiscalization logs.");
        }












        private async Task<bool> Fiscalize(Invoice invoice)
        {
            if (!HasConfiguredApiKey())
            {
                SetStatus(ConnectionStatus.Error);
                HistoryManager.AddRecord(invoice.InvoiceNumber, false, "API key is not configured.", invoice.InvoiceAmount.ToString(), "");
                return false;
            }

            printInvoice = invoice;

            var payload = new PassThroughFiscalizeRequest
            {
                InvoiceNumber = invoice.InvoiceNumber,
                Date = DateTime.Now.ToString("o"),
                PaymentMethod = "CASH",
                Currency = invoice.Currency,
                TransactionType = invoice.InvoiceFlag == "02" ? "CreditNote" : "FiscalInvoice",
                Notes = invoice.InvoiceComment,
                Buyer = new FiscalBuyer
                {
                    Name = invoice.CustomerName,
                    Tin = invoice.CustomerTIN,
                    VatNumber = invoice.CustomerVATNumber,
                    Email = invoice.CustomerEmail,
                    Phone = invoice.CustomerTelephoneNumber
                },
                Items = new System.Collections.Generic.List<PassThroughItem>()
            };

            foreach (var item in printInvoice.items)
            {
                decimal tRate = Convert.ToDecimal(item.TaxR) * 100;
                if (tRate == 15m) tRate = 15.5m; // Coerce legacy 15% to ZIMRA 15.5% standard

                payload.Items.Add(new PassThroughItem
                {
                    Name = item.ITEMNAME1,
                    Quantity = Convert.ToDecimal(item.Quantity),
                    UnitPrice = Convert.ToDecimal(item.Price),
                    TaxRate = tRate
                });
            }

            try
            {
                var jar = await client.FiscalizeAsync(payload);
                var res = JsonConvert.DeserializeObject<dynamic>(jar);
                
                // Construct rootinv for reportViewer
                rootinv = new RootObject
                {
                    Code = "1",
                    VerificationCode = res.fiscalCode,
                    QRcode = res.qrCode,
                    DeviceId = res.receiptNumber != null ? res.receiptNumber.ToString() : null,
                    FiscalDay = (res.receipt != null && res.receipt.fiscalDayNo != null) ? res.receipt.fiscalDayNo.ToString() : null,
                    Data = new Data
                    {
                        Receipt = new Receipt
                        {
                            InvoiceNo = res.receipt != null ? res.receipt.invoiceNo : null,
                            ReceiptTotal = res.receipt != null ? res.receipt.receiptTotal : null,
                            ReceiptDate = res.receipt != null ? res.receipt.receiptDate : null,
                            ReceiptGlobalNo = res.receipt != null ? res.receipt.receiptGlobalNo : null,
                            ReceiptCounter = res.receipt != null ? res.receipt.receiptCounter : null,
                            ReceiptType = payload.TransactionType,
                            ReceiptTaxes = new System.Collections.Generic.List<ReceiptTax>()
                        }
                    }
                };

                // Parse taxes from response
                if (res.receipt != null && res.receipt.receiptTaxes != null)
                {
                    foreach (var tax in res.receipt.receiptTaxes)
                    {
                        decimal taxPct = Convert.ToDecimal(tax.taxPercent);
                        string tCode = "A";
                        if (taxPct == 0) tCode = "B";

                        rootinv.Data.Receipt.ReceiptTaxes.Add(new ReceiptTax
                        {
                            TaxPercent = taxPct,
                            TaxCode = tCode,
                            TaxAmount = Convert.ToDecimal(tax.taxAmount),
                            SalesAmountWithTax = Convert.ToDecimal(tax.salesAmountWithTax)
                        });
                    }
                }

                if (res.receipt != null && res.receipt.fiscalDayNo != null)
                {
                    DeviceCacheManager.UpdateFiscalDay(res.receipt.fiscalDayNo.ToString());
                }

                HistoryManager.AddRecord(invoice.InvoiceNumber, true, "", invoice.InvoiceAmount.ToString(), jar);
                AppendLog("[OK] Invoice " + invoice.InvoiceNumber + " fiscalized online — $" + invoice.InvoiceAmount);
                return true;
            }
            catch (Exception ex)
            {
                if (_offlineCrypto.IsConfigured())
                {
                    try
                    {
                        // Generate Offline Signature
                        string stringToSign;
                        string signature = _offlineCrypto.GenerateOfflineSignatureString(payload, out stringToSign);
                        string verificationCode = _offlineCrypto.CalculateVerificationCode(signature);

                        payload.OfflineSignature = signature;
                        payload.OfflineReceiptCounter = _offlineCrypto.State.DailyReceiptCount + 1;
                        payload.OfflineGlobalReceiptCounter = _offlineCrypto.State.LastReceiptGlobalNo + 1;
                        payload.OfflineFiscalDay = _offlineCrypto.State.CurrentFiscalDayNo;
                        payload.OfflinePreviousHash = (_offlineCrypto.State.DailyReceiptCount == 0) ? "" : _offlineCrypto.State.LastFiscalHash;
                        payload.OfflineDate = payload.Date;

                        // Calculate new hash based on the signed data for the next receipt
                        // According to ZIMRA, the hash of the current receipt is SHA256 of the signature string!
                        // Actually ZIMRA previous hash is SHA256 of the PREVIOUS signature string, or hash of the signature?
                        // "Previous receipt hash – base64(SHA256(previous signature))"
                        // But wait! ZIMRA spec says: "previous receipt hash is base64 of SHA256 of PREVIOUS RECEIPT HASH?" 
                        // Wait, let's just use a SHA256 of the signature as the hash for the next one.
                        using (var sha256 = System.Security.Cryptography.SHA256.Create())
                        {
                            byte[] sigBytes = Convert.FromBase64String(signature);
                            byte[] hashBytes = sha256.ComputeHash(sigBytes);
                            string nextHash = Convert.ToBase64String(hashBytes);
                            _offlineCrypto.IncrementCounters(nextHash);
                        }

                        // Manually construct rootinv to print an offline fiscal receipt
                        rootinv = new RootObject
                        {
                            Code = "1",
                            VerificationCode = verificationCode,
                            QRcode = string.Format("https://fdms.zimra.co.zw/r?d={0}&r={1}&v={2}", _offlineCrypto.State.DeviceId, payload.OfflineGlobalReceiptCounter, verificationCode),
                            DeviceId = _offlineCrypto.State.DeviceId,
                            FiscalDay = payload.OfflineFiscalDay.ToString(),
                            Data = new Data
                            {
                                Receipt = new Receipt
                                {
                                    InvoiceNo = invoice.InvoiceNumber,
                                    ReceiptTotal = Convert.ToDecimal(invoice.InvoiceAmount),
                                    ReceiptDate = DateTime.Now,
                                    ReceiptGlobalNo = payload.OfflineGlobalReceiptCounter,
                                    ReceiptCounter = payload.OfflineReceiptCounter,
                                    ReceiptType = payload.TransactionType,
                                    ReceiptTaxes = new System.Collections.Generic.List<ReceiptTax>()
                                }
                            }
                        };
                        
                        // Parse taxes for offline report
                        foreach (var item in printInvoice.items)
                        {
                            decimal tRate = Convert.ToDecimal(item.TaxR) * 100;
                            if (tRate == 15m) tRate = 15.5m;
                            
                            string tCode = (tRate == 0) ? "B" : "A";
                            decimal qty = Convert.ToDecimal(item.Quantity);
                            decimal price = Convert.ToDecimal(item.Price);
                            decimal lineTotal = qty * price;
                            decimal taxAmt = lineTotal * (tRate / 100m);
                            
                            rootinv.Data.Receipt.ReceiptTaxes.Add(new ReceiptTax
                            {
                                TaxPercent = tRate,
                                TaxCode = tCode,
                                TaxAmount = taxAmt,
                                SalesAmountWithTax = lineTotal + taxAmt
                            });
                        }

                        // Enqueue to offline queue with the populated payload
                        _offlineQueue.Enqueue(invoice.InvoiceNumber, payload);
                        SetStatus(ConnectionStatus.Offline);
                        notifyIcon1.ShowBalloonTip(3000, "FiscalStack — Offline Sync", string.Format("Invoice {0} signed locally (Offline) and queued.", invoice.InvoiceNumber), ToolTipIcon.Warning);
                        AppendLog("[OFFLINE] Invoice " + invoice.InvoiceNumber + " signed offline and queued.");
                        
                        HistoryManager.AddRecord(invoice.InvoiceNumber, true, "Offline Signed & Queued", invoice.InvoiceAmount.ToString(), "");
                        return true;
                    }
                    catch (Exception cryptoEx)
                    {
                        HistoryManager.AddRecord(invoice.InvoiceNumber, false, "Offline Signing Failed: " + cryptoEx.Message, invoice.InvoiceAmount.ToString(), "");
                        AppendLog("[FAIL] Invoice " + invoice.InvoiceNumber + " — Offline signing error: " + cryptoEx.Message);
                        return false;
                    }
                }
                else
                {
                    HistoryManager.AddRecord(invoice.InvoiceNumber, false, "Fiscalization Failed & Offline Not Configured: " + ex.Message, invoice.InvoiceAmount.ToString(), "");
                    AppendLog("[FAIL] Invoice " + invoice.InvoiceNumber + " — " + ex.Message);
                    return false;
                }
            }
        }


        public void addToConfig(string key, string value)
        {
            Configuration config = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
            config.AppSettings.Settings.Remove(key);
            config.AppSettings.Settings.Add(key, value);
            config.Save(ConfigurationSaveMode.Modified);
            ConfigurationManager.RefreshSection("appSettings");
        }

        // ── Smart Feature: Initialise all background services ────────────────
        private void InitSmartFeatures()
        {
            // 5. Status indicator — poll connection every 15s
            _statusTimer = new System.Windows.Forms.Timer();
            _statusTimer.Interval = 15000;
            _statusTimer.Tick += async (s, e) => await RefreshStatusAsync();
            _statusTimer.Start();

            // 2. Offline sync queue retry — every 60s
            _retryTimer = new System.Windows.Forms.Timer();
            _retryTimer.Interval = 60000;
            _retryTimer.Tick += async (s, e) => await RetryOfflineQueueAsync();
            _retryTimer.Start();

            // 3. Auto end-of-day scheduler
            _scheduler = new SchedulerService(client, notifyIcon1, msg =>
            {
                // log to console if needed
            });
            _scheduler.Start();

            // Initial status check
            Task.Run(async () =>
            {
                if (!HasConfiguredApiKey())
                {
                    SetStatus(ConnectionStatus.Error);
                    return;
                }

                try
                {
                    await client.GetDeviceAsync();
                    SetStatus(ConnectionStatus.Online);
                }
                catch
                {
                    string apiKey = ConfigurationManager.AppSettings.Get("ApiKey");
                    SetStatus(string.IsNullOrEmpty(apiKey) ? ConnectionStatus.Error : ConnectionStatus.Offline);
                }
            });
        }

        // ── Smart Feature 5: Update tray icon colour based on status ─────────
        private void SetStatus(ConnectionStatus status)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => SetStatus(status)));
                return;
            }
            _currentStatus = status;
            StatusIndicator.Apply(notifyIcon1, status, _offlineQueue.Count);

            string statusLabel = status == ConnectionStatus.Online ? "ONLINE"
                               : status == ConnectionStatus.Offline ? "OFFLINE (queued)"
                               : "ERROR / Not configured";
            AppendLog("[STATUS] " + statusLabel);
        }

        private void AppendLog(string message)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => AppendLog(message)));
                return;
            }
            try
            {
                string line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + message + "\n";
                txtLog.AppendText(line);
                txtLog.ScrollToCaret();
            }
            catch { }
        }

        private async Task RefreshStatusAsync()
        {
            if (!HasConfiguredApiKey())
            {
                SetStatus(ConnectionStatus.Error);
                return;
            }

            try
            {
                string j = await client.GetDeviceAsync();
                CardDetails details = JsonConvert.DeserializeObject<CardDetails>(j);
                if (details != null)
                {
                    CardDetails = details;
                    DeviceCacheManager.Save(details, isOffline: false);
                    // Populate Status tab labels
                    if (details.Data != null)
                    {
                        lblStatusCompany.Text = "Company: " + (details.Data.CompanyName ?? "—");
                        lblStatusDevice.Text  = "Device ID: " + (DeviceCacheManager.Current.DeviceId ?? "—");
                        lblStatusFiscalDay.Text = "Fiscal Day: " + (DeviceCacheManager.Current.FiscalDay ?? "—");
                        AppendLog("[DEVICE] Connected — " + (details.Data.CompanyName ?? "Unknown company"));
                    }
                }
                // Populate API info labels
                string ep = ConfigurationManager.AppSettings.Get("ApiEndpoint") ?? "—";
                string ak = ConfigurationManager.AppSettings.Get("ApiKey") ?? "";
                lblStatusApiKey.Text = "API Key: " + (string.IsNullOrEmpty(ak) ? "Not configured" : ak.Substring(0, Math.Min(8, ak.Length)) + "...");
                lblStatusEndpoint.Text = "Endpoint: " + ep;
                try {
                    string stateJson = await client.GetOfflineStateAsync();
                    if (!string.IsNullOrEmpty(stateJson)) {
                        _offlineCrypto.SaveState(stateJson);
                    }
                } catch { }
                SetStatus(ConnectionStatus.Online);
            }
            catch
            {
                // Update offline mode and load from cache
                DeviceCacheManager.UpdateOfflineMode(true);
                
                var meta = DeviceCacheManager.Current;
                if (meta != null && !string.IsNullOrEmpty(meta.CompanyName))
                {
                    lblStatusCompany.Text = "Company: " + meta.CompanyName + " (Cached)";
                    lblStatusDevice.Text = "Device ID: " + (meta.DeviceId ?? "—");
                    lblStatusFiscalDay.Text = "Fiscal Day: " + (meta.FiscalDay ?? "—");
                    AppendLog("[DEVICE] Using cached data — " + DeviceCacheManager.GetCacheStatus());
                }
                else
                {
                    lblStatusCompany.Text = "Company: Not configured";
                    lblStatusDevice.Text = "Device ID: —";
                    lblStatusFiscalDay.Text = "Fiscal Day: —";
                }
                
                string apiKey = ConfigurationManager.AppSettings.Get("ApiKey") ?? "";
                string ep2 = ConfigurationManager.AppSettings.Get("ApiEndpoint") ?? "—";
                lblStatusApiKey.Text = "API Key: " + (string.IsNullOrEmpty(apiKey) ? "Not configured" : apiKey.Substring(0, Math.Min(8, apiKey.Length)) + "...");
                lblStatusEndpoint.Text = "Endpoint: " + ep2;
                SetStatus(string.IsNullOrEmpty(apiKey) ? ConnectionStatus.Error : ConnectionStatus.Offline);
            }
        }

        // ── Smart Feature 2: Offline queue retry ────────────────────────────
        private async Task RetryOfflineQueueAsync()
        {
            if (_offlineQueue.Count == 0) return;
            if (!HasConfiguredApiKey())
            {
                SetStatus(ConnectionStatus.Error);
                return;
            }
            if (_currentStatus != ConnectionStatus.Online) return;

            var items = _offlineQueue.GetAll();
            foreach (var item in items)
            {
                try
                {
                    object payload = JsonConvert.DeserializeObject(item.PayloadJson);
                    string result = await client.FiscalizeAsync(payload);
                    _lastReceiptJson = result;
                    _offlineQueue.Remove(item.Id);
                    
                    HistoryManager.AddRecord(item.Id, true, "Recovered from offline queue", "", result);

                    notifyIcon1.ShowBalloonTip(4000,
                        "FiscalStack — Synced",
                        "Offline invoice synced successfully: " + item.Id.Substring(0, 8),
                        ToolTipIcon.Info);
                }
                catch (Exception ex)
                {
                    _offlineQueue.UpdateRetry(item.Id, ex.Message);
                }
            }
            SetStatus(_offlineQueue.Count > 0 ? ConnectionStatus.Offline : ConnectionStatus.Online);
        }

        // ── Smart Feature 4: Receipt Preview ─────────────────────────────────
        private void viewLastReceiptToolStripMenuItem_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(_lastReceiptJson))
            {
                MessageBox.Show("No receipt has been generated yet in this session.", "FiscalStack", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            ReceiptPreviewForm.ShowFromJson(_lastReceiptJson, CardDetails);
        }

        private void Form1_Load(object sender, EventArgs e)


        {
 
        }

        private void notifyIcon1_MouseDoubleClick(object sender, MouseEventArgs e)
        {

        }

        private void reportViewer1_Load(object sender, EventArgs e)
        {
            try
            {
                var defaultParams = new List<ReportParameter>();
                foreach (ReportParameterInfo param in reportViewer1.LocalReport.GetParameters())
                {
                    defaultParams.Add(new ReportParameter(param.Name, ""));
                }
                if (defaultParams.Count > 0)
                    reportViewer1.LocalReport.SetParameters(defaultParams);
            }
            catch { }
        }

        private void printDocument1_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {

        }

        private void moveFile()
        {

            try
            {
                string sourcePath = ConfigurationManager.AppSettings.Get("SourceFolder");
                string targetPath = ConfigurationManager.AppSettings.Get("TargetFolder");
                string fileName = string.Empty;
                string destFile = string.Empty;


                if (System.IO.Directory.Exists(sourcePath))
                {
                    string[] files = System.IO.Directory.GetFiles(sourcePath);

                    // Copy the files and overwrite destination files if they already exist. 
                    foreach (string s in files)
                    {
                        // Use static Path methods to extract only the file name from the path.
                        fileName = System.IO.Path.GetFileName(s);
                        destFile = System.IO.Path.Combine(targetPath, fileName);
                        System.IO.File.Copy(s, destFile, true);
                    }
                }
                else
                {
                    Console.WriteLine("Source path does not exist!");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error moving file" + ex.Message);
            }


        }

        private void dashboardToolStripMenuItem_Click(object sender, EventArgs e)
        {
            DashboardForm dashboard = new DashboardForm(_offlineQueue, client, CardDetails);
            dashboard.Show();
        }

        private void exitToolStripMenuItem_Click(object sender, EventArgs e)
        {
            try
            {
                var jar = client.CloseDayAsync().Result;
                var res = JsonConvert.DeserializeObject<RootObject>(jar);
                
                if (res.Code == "1")
                {
                    MessageBox.Show(res.Message);
                }
                else
                {
                    MessageBox.Show("Failed to close Fiscal Day: " + res.Message);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to close day: " + ex.Message);
            }
        }

        private void openTestToolToolStripMenuItem_Click(object sender, EventArgs e)
        {
            TestToolForm testTool = new TestToolForm();
            testTool.Show();
        }

        private async void getDeviceDetailsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            try
            {
                string j = await client.GetDeviceAsync();
                CardDetails details = JsonConvert.DeserializeObject<CardDetails>(j);
                CardDetails = details;
                StringBuilder msg = new StringBuilder();
                msg.AppendLine("Code: " + details.Code);
                msg.AppendLine("Message: " + details.Message);
                if (details.Data != null)
                {
                    msg.AppendLine("Company: " + details.Data.CompanyName);
                    msg.AppendLine("TIN: " + details.Data.TIN);
                    msg.AppendLine("VAT: " + details.Data.VAT);
                    msg.AppendLine("Serial: " + details.Data.SerialNumber);
                }
                MessageBox.Show(msg.ToString(), "FiscalStack Device Details");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to get device details: " + ex.Message, "FiscalStack Device Details");
            }
        }



        private void retrainInterfaceToolStripMenuItem_Click(object sender, EventArgs e)
        {
            Wizard wizardForm = new Wizard();
            wizardForm.ShowDialog();
        }

        private void exitToolStripMenuItem1_Click(object sender, EventArgs e)
        {
            Application.Exit();
        }



        // tableLayoutPanel removed — layout now uses TabControl matching TestToolForm structure
    }
}

