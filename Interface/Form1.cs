
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
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
        string Currency = "";
        string BranchName = "";
        string InvoiceNumber = "";
        string Discount = "";
        string CustomerName = "";
        string CustomerNumber = "";
        string ReceiptGlobalNumber = "";
        string CustomerVATNumber = "";
        string CustomerTIN = "";
        string CustomerEmail = "";
        string CustomerAddress = "";// #TagName
        string CustomerTelephoneNumber = "";
        string CustomerBPN = "";
        string InvoiceAmount = "";
        string InvoiceFlag = "";
        string Cashier = "";
        string InvoiceComment = "";
        string ItemsXML = "";
        string CurrenciesXML = "";
        string InvoiceTaxAmount = "";
        string code = "";
        // string ItemsXML = "";
        string Currencies = "";
        string Signature = "";
        string QRCode = "";
        string companyName = "";
        string companyVAT = "";
        string companyAddress = "";
        string companyBPN = "";
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

            this.reportViewer1.RefreshReport();

            Task.Run(async () =>
            {
                if (!HasConfiguredApiKey()) return;

                try
                {
                    string j = await client.GetDeviceAsync();
                    CardDetails = (CardDetails) JsonConvert.DeserializeObject<CardDetails>(j);
                }
                catch (Exception ex)
                {
                    if (IsHandleCreated)
                    {
                        BeginInvoke(new Action(() =>
                            notifyIcon1.ShowBalloonTip(5000, "FiscalStack", "Device details could not be refreshed: " + ex.Message, ToolTipIcon.Warning)));
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
                XmlDataDocument xmldoc1 = new XmlDataDocument();
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

        private void timer1_Tick(object sender, EventArgs e)
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

                    if (Fiscalize(readFile.ReadInvoice(receipt, ConfigurationManager.AppSettings.Get("VatFlag"), CurrenciesList)))
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
                        Tax = Math.Round(Convert.ToDecimal(item.Tax), 2).ToString()
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
            ReportParameter[] reportParameters = new ReportParameter[33];
            string imagePath = new Uri(ConfigurationManager.AppSettings.Get("LogoFile")).AbsoluteUri;
            reportParameters[0] = new ReportParameter("ImagePath", imagePath);
            reportParameters[1] = new ReportParameter("CompanyName", CardDetails.Data.CompanyName);
            reportParameters[2] = new ReportParameter("Address", CardDetails.Data.Address);
            /*reportParameters[1] = new ReportParameter("CompanyName", companyName);
            reportParameters[2] = new ReportParameter("Address", companyAddress);*/
            //reportParameters[3] = new ReportParameter("BpnNumber", companyBPN);
            //reportParameters[4] = new ReportParameter("VatNumber", companyVAT);
            reportParameters[3] = new ReportParameter("TIN", CardDetails.Data.TIN);
            reportParameters[4] = new ReportParameter("VatNumber", CardDetails.Data.VAT);
            reportParameters[5] = new ReportParameter("Signature", rootinv.VerificationCode);
            reportParameters[6] = new ReportParameter("InvoiceNumber", rootinv.Data.Receipt.InvoiceNo);
            reportParameters[7] = new ReportParameter("Tax", rootinv.Data.Receipt.ReceiptTaxes.Sum(item => item.TaxAmount).ToString() );
            //reportParameters[7] = new ReportParameter("Tax", rootinv.Receipt.ReceiptTaxes[0].TaxAmount.ToString() );
            reportParameters[8] = new ReportParameter("Total", rootinv.Data.Receipt.ReceiptTotal.ToString());
            reportParameters[9] = new ReportParameter("Cashier", String.IsNullOrEmpty(printInvoice.Cashier)?null:printInvoice.Cashier);
            reportParameters[10] = new ReportParameter("Date", rootinv.Data.Receipt.ReceiptDate.ToString());
            reportParameters[11] = new ReportParameter("Currency", printInvoice.Currency);
            reportParameters[12] = new ReportParameter("ReceiptLabel", rootinv.Data.Receipt.ReceiptType.Equals("FiscalInvoice")?"FISCAL TAX INVOICE":rootinv.Data.Receipt.ReceiptType);
            reportParameters[13] = new ReportParameter("CustomerName", String.IsNullOrEmpty(printInvoice.CustomerName) ? null : printInvoice.CustomerName);
            reportParameters[14] = new ReportParameter("CustomerNum", CustomerNumber);
            reportParameters[15] = new ReportParameter("Discount", Discount);
            reportParameters[15] = new ReportParameter("DeviceId", rootinv.DeviceId);
            reportParameters[16] = new ReportParameter("ReceiptGlobalNumber", rootinv.Data.Receipt.ReceiptGlobalNo.ToString());
            reportParameters[17] = new ReportParameter("ReceiptNumber", rootinv.Data.Receipt.ReceiptCounter.ToString());
            reportParameters[18] = new ReportParameter("FiscalDay", rootinv.FiscalDay);
            reportParameters[19] = new ReportParameter("ReceiptId",rootinv.Data.Receipt.CreditDebitNote != null ? rootinv.Data.Receipt.CreditDebitNote.receiptGlobalNo : null);
            //reportParameters[19] = new ReportParameter("ReceiptId", rootinv.Receipt.CreditDebitNote.receiptGlobalNo);
            reportParameters[20] = new ReportParameter("DeviceSerial", CardDetails.Data.SerialNumber);

            reportParameters[21] = new ReportParameter("BuyerRegisterName", rootinv.Data.Receipt.BuyerData != null ? rootinv.Data.Receipt.BuyerData.buyerRegisterName : null);
            reportParameters[22] = new ReportParameter("Email", printInvoice.Email);
            reportParameters[23] = new ReportParameter("Phone", printInvoice.Phone);
            reportParameters[24] = new ReportParameter("Reason", printInvoice.Reason);
            reportParameters[25] = new ReportParameter("Tendered", printInvoice.Tendered);
            reportParameters[26] = new ReportParameter("Change", printInvoice.Change);
            reportParameters[27] = new ReportParameter("InvoiceComment", String.IsNullOrEmpty(printInvoice.InvoiceComment) ? null : printInvoice.InvoiceComment);
            reportParameters[28] = new ReportParameter("CustomerVATNumber", String.IsNullOrEmpty(printInvoice.CustomerVATNumber) ? null : printInvoice.CustomerVATNumber);
            reportParameters[29] = new ReportParameter("CustomerTIN", String.IsNullOrEmpty(printInvoice.CustomerTIN) ? null : printInvoice.CustomerTIN);
            reportParameters[30] = new ReportParameter("CustomerAddress", String.IsNullOrEmpty(printInvoice.CustomerAddress) ? null : printInvoice.CustomerAddress);
            reportParameters[31] = new ReportParameter("CustomerEmail", String.IsNullOrEmpty(printInvoice.CustomerEmail) ? null : printInvoice.CustomerEmail);
            reportParameters[32] = new ReportParameter("CustomerTelephoneNumber", String.IsNullOrEmpty(printInvoice.CustomerTelephoneNumber) ? null : printInvoice.CustomerTelephoneNumber);
            /* reportParameters[17] = new ReportParameter("OriginalInvoiceNumber", printInvoice.OriginalInvoiceNumber);
            reportParameters[18] = new ReportParameter("OriginalInvoiceGlobalNumber", printInvoice.OriginalInvoiceGlobalNumber);*/





            reportViewer1.LocalReport.EnableExternalImages = true;
            reportViewer1.LocalReport.SetParameters(reportParameters);
            reportViewer1.LocalReport.DataSources.Add(reportDataSource);
            reportViewer1.LocalReport.DataSources.Add(reportDataSource2);

            QRCoder.QRCodeGenerator qRCodeGenerator = new QRCoder.QRCodeGenerator();
            QRCoder.QRCodeData qRCodeData = qRCodeGenerator.CreateQrCode(rootinv.QRcode, QRCoder.QRCodeGenerator.ECCLevel.Q);
            QRCoder.QRCode qRCode = new QRCoder.QRCode(qRCodeData);

            Bitmap bmp = qRCode.GetGraphic(7);
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












        private bool Fiscalize(Invoice invoice)
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
                var jar = client.FiscalizeAsync(payload).Result;
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

                return true;
            }
            catch (Exception ex)
            {
                // Enqueue to offline queue for automatic retry
                try
                {
                    _offlineQueue.Enqueue(invoice.InvoiceNumber, payload);
                    SetStatus(ConnectionStatus.Offline);
                    notifyIcon1.ShowBalloonTip(3000, "FiscalStack — Offline Queue", "Invoice " + invoice.InvoiceNumber + " queued offline for automatic retry.", ToolTipIcon.Warning);
                }
                catch { }

                HistoryManager.AddRecord(invoice.InvoiceNumber, false, "Enqueued Offline: " + ex.Message, invoice.InvoiceAmount.ToString(), "");
                return true; // Allow receipt generation / POS operation to continue
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
                    DeviceCacheManager.Save(details);
                }
                SetStatus(ConnectionStatus.Online);
            }
            catch
            {
                string apiKey = ConfigurationManager.AppSettings.Get("ApiKey");
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

            this.reportViewer1.RefreshReport();
 
        }

        private void notifyIcon1_MouseDoubleClick(object sender, MouseEventArgs e)
        {

        }

        private void reportViewer1_Load(object sender, EventArgs e)
        {

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



        private void tableLayoutPanel1_Paint(object sender, PaintEventArgs e)
        {

        }
    }
}

