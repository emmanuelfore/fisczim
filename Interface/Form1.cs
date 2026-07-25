
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
using RevmaxAPI;
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
        Revmaxlib revmalib = new Revmaxlib();
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



        public RevMaxInterfaceWizard()
        {
            InitializeComponent();

            //  reportViewer1.LocalReport.EnableExternalImages = true;

            this.reportViewer1.RefreshReport();

            string j = revmalib.GetCardDetails();
            //MessageBox.Show(j);

            CardDetails = (CardDetails) JsonConvert.DeserializeObject<CardDetails>(j);

            //MessageBox.Show((CardDetails) JsonConvert.DeserializeObject<CardDetails>(j));

            //MessageBox.Show(printInvoice.Cashier);




            if (File.Exists(AppDomain.CurrentDomain.BaseDirectory.ToString() + "CurConf.interface"))
            {
                using (FileStream fs = new FileStream(AppDomain.CurrentDomain.BaseDirectory.ToString() + "CurConf.interface", FileMode.Open, FileAccess.Read))
                {
                    XmlDataDocument xmldoc1 = new XmlDataDocument();
                    XmlNodeList xmlnode1;
                    XmlNodeList xmlnode2;


                    try
                    {
                        xmldoc1.Load(fs);
                        xmlnode1 = xmldoc1.GetElementsByTagName("currency");

                        for (int i = 0; i <= xmlnode1.Count - 1; i++)
                        {
                            CurrenciesList.Add(new ReadCurrencies
                            {
                                Keyword = xmlnode1[i].ChildNodes.Item(0).InnerText.Trim(),
                                Name = xmlnode1[i].ChildNodes.Item(1).InnerText.Trim(),
                            });

                        }

                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(ex.Message);
                    }

                }
            }
            else
            {
                MessageBox.Show("Currency Config not found.Contact Axis Solutions.");
            }

        }




        private void timer1_Tick(object sender, EventArgs e)
        {

            ReadFile readFile = new ReadFile();


            timer1.Stop();
            foreach (var receipt in Directory.GetFiles(ConfigurationManager.AppSettings.Get("SourceFolder")))
            {
                //MessageBox.Show(receipt.ToString());
                receiptPath = receipt.ToString();

                if (Fiscalize(readFile.ReadInvoice(receipt, ConfigurationManager.AppSettings.Get("VatFlag"), CurrenciesList)))
                {
                    Print("FISCAL INVOICE");
                    //Print("COPY INVOICE");

                    //File.Move(receipt, ConfigurationManager.AppSettings.Get("TargetFolder") + "\\REVMAX_" + DateTime.Now + ".txt");
                }
                list.Clear();

                // invoice = readFile.ReadInvoice(receipt, ConfigurationManager.AppSettings.Get("VatFlag"), CurrenciesList);
            }

            if (!String.IsNullOrEmpty(receiptPath))
            {
                File.Copy(receiptPath, ConfigurationManager.AppSettings.Get("TargetFolder") + "\\REVMAX_" + DateTime.Now.ToString("dd_mm_yyyy_HH_MM_ss") + ".txt");
                try
                {
                    File.Delete(receiptPath);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("We could not delete the file.Please check the file permissions." + ex.Message);
                }
            }

            receiptPath = "";
            timer1.Start();

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
            string status = "";


            try
            {
                if (Directory.Exists(@"C:\Revmax\Revmax") == false)
                {

                    Directory.CreateDirectory(@"C:\Revmax\Revmax");

                }


               moveDirectory(new DirectoryInfo(@"RevLive"), new DirectoryInfo(@"C:\Revmax\Revmax\RevLive"));



                status = CMDStart(@"C:\REVMAX\Revmax\RevLive\RevLive.exe", "/install");

                status = CMDStart(@"C:\REVMAX\Revmax\RevLive\RevLive.exe", "/start");



                checkServices();

            }
            catch (Exception ex)
            {

            }
        }

        private void moveDirectory(DirectoryInfo source, DirectoryInfo destination)
        {
            try
            {
                if (!destination.Exists)
                {
                    destination.Create();
                }

                // Copy all files.
                FileInfo[] files = source.GetFiles();
                foreach (FileInfo file in files)
                {
                    file.CopyTo(Path.Combine(destination.FullName,
                        file.Name));
                }

                // Process subdirectories.
                DirectoryInfo[] dirs = source.GetDirectories();
                foreach (DirectoryInfo dir in dirs)
                {
                    // Get destination directory.
                    string destinationDir = Path.Combine(destination.FullName, dir.Name);

                    // Call CopyDirectory() recursively.
                    moveDirectory(dir, new DirectoryInfo(destinationDir));
                }
            }
            catch (Exception)
            {
                // TODO: Handle the exception that has been thrown
            }

        }

        private string CMDStart(string programme, string arguments)
        {
            System.Diagnostics.Process process = new System.Diagnostics.Process();
            System.Diagnostics.ProcessStartInfo startInfo = new System.Diagnostics.ProcessStartInfo();
            startInfo.WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden;
            startInfo.FileName = $"{programme}";
            startInfo.Arguments = $" {arguments}";
            startInfo.Verb = "runas";
            process.StartInfo = startInfo;
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.CreateNoWindow = true;
            process.Start();
            string result = process.StandardOutput.ReadToEnd();
            return result;
        }

        private void checkServices()
        {
            ServiceController[] services = ServiceController.GetServices();
            ServiceController scLive;
            ServiceController scPortal;

            if (Array.Exists(services, element => element.ServiceName.ToString() == "RevLive"))
            {
                scLive = new ServiceController("RevLive");



            }
            CMDStart(@"C:\REVMAX\Revmax\RevLive\RevLive.exe", "/start");

        }






        private void btnLogs_Click(object sender, EventArgs e)
        {
            string folderPath = @"C:\ProgramData\RevMax\Info\Logs";
            string status = "";

            if (Directory.Exists(folderPath))
            {
                System.Diagnostics.Process process = new System.Diagnostics.Process();
                System.Diagnostics.ProcessStartInfo startInfo = new System.Diagnostics.ProcessStartInfo();
                startInfo.WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden;
                startInfo.FileName = $"explorer.exe";
                startInfo.Arguments = $" {folderPath}";
                startInfo.Verb = "runas";
                process.StartInfo = startInfo;
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;
                process.Start();

            }

        }












        private bool Fiscalize(Invoice invoice)
        {

            // return true;
            //MessageBox.Show(JsonConvert.SerializeObject(invoice, Newtonsoft.Json.Formatting.Indented));
            HandleResponse handleResponse = new HandleResponse();


            //MessageBox.Show($"CustomerEmail: {invoice.CustomerEmail}\nCustomername: {invoice.CustomerName}\nCustomerTIN: {invoice.CustomerTIN}\nCustomerVAT: {invoice.CustomerVATNumber}\nCustomerAddress: {invoice.CustomerAddress}\nCustomerTell: {invoice.CustomerTelephoneNumber}");
            
           /* string itemsXMLSAmple = "<ITEMS><ITEM><HH> 1 </HH> <ITEMCODE> 06007038001317 </ITEMCODE><ITEMNAME1> THE PRODUCT </ITEMNAME1><ITEMNAME2> VANILLA SNAPS 500G </ITEMNAME2><QTY> 1 </QTY><PRICE> 1000 </PRICE><AMT> 1000 </AMT><TAX> 130.43 </TAX><TAXR> 0.15 </TAXR></ITEM></ITEMS>";
            string currenciesSAmple = "<CurrenciesReceived><Currency><Name> ZWL </Name><Amount> 1000 </Amount><Rate> 1 </Rate></Currency></CurrenciesReceived>";*/
            var jar = revmalib.TransactM(invoice.Currency, invoice.CustomerEmail, invoice.InvoiceNumber, invoice.CustomerName, invoice.CustomerVATNumber, invoice.CustomerAddress, invoice.CustomerTelephoneNumber, invoice.CustomerTIN, invoice.InvoiceAmount, invoice.InvoiceTaxAmount, invoice.InvoiceFlag, invoice.Cashier, invoice.InvoiceComment, invoice.ItemsXML, invoice.CurrenciesXML);

           // MessageBox.Show("customer VAT: "+invoice.CustomerVATNumber);

            //MessageBox.Show(JsonConvert.SerializeObject(handleResponse.ResponseHandler(jar), Newtonsoft.Json.Formatting.Indented));

            //MessageBox.Show(j);

            printInvoice = invoice;

            //rootinv = handleResponse.ResponseHandler(j);
            rootinv = (RootObject) JsonConvert.DeserializeObject<RootObject>(jar);
            //MessageBox.Show(rootinv.Receipt.CreditDebitNote.);

            if (rootinv.Code.Equals("1"))
            {               
                return true;
            }
            else
            {
                MessageBox.Show(handleResponse.ResponseHandler(jar).Message);

                return false;


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

        private void zReportToolStripMenuItem_Click(object sender, EventArgs e)
        {
            string license = revmalib.GetLicense();
            MessageBox.Show(license);
        }

        private void exitToolStripMenuItem_Click(object sender, EventArgs e)
        {




            string j = revmalib.ZReport();
            //MessageBox.Show(j);

            zReport = (ZReportStructure)JsonConvert.DeserializeObject<ZReportStructure>(j);


            //MessageBox.Show(JsonConvert.SerializeObject(zReport, Newtonsoft.Json.Formatting.Indented));


            List<VatTotal> ZVatList = new List<VatTotal>();


            if (zReport.Code == "1" & zReport.Message.Contains("Closed"))
            /*if (zReport.Code == "1" & zReport.Message.Contains("Success"))*/
            {
                foreach (var item in zReport.Data.ZReports)
                {
                    //MessageBox.Show("Zvafaya");


                    //MessageBox.Show(JsonConvert.SerializeObject(item, Newtonsoft.Json.Formatting.Indented));

                    LocalReport localReport = reportViewer1.LocalReport;
                    reportViewer1.LocalReport.ReportPath = "Zreport.rdlc";

                    reportViewer1.LocalReport.DataSources.Clear();

                    //MessageBox.Show(JsonConvert.SerializeObject(j, Newtonsoft.Json.Formatting.Indented));

                    try
                    {
                        foreach (var vt in item.VatTotals)
                        {
                            //MessageBox.Show(Convert.ToDecimal(vt.VATRATE).ToString("0.00"));

                            ZVatList.Add(new VatTotal()
                            {
                                VATRATE = $"{Convert.ToDecimal(vt.VATRATE).ToString("0.00")}",
                                TAXAMOUNT = $"{item.Currency}{(Convert.ToDecimal(vt.TAXAMOUNT) / 100).ToString("0.00")}",
                                NETTAMOUNT = $"{item.Currency}{(Convert.ToDecimal(vt.NETTAMOUNT) / 100).ToString("0.00")}",

                            });

                        }
                    }
                    catch (Exception)
                    {
                        MessageBox.Show("Failed to load Vat totals");
                    }




                    //ReportDataSource reportDataSource = new ReportDataSource("DataSet1", item.VatTotals);
                    ReportDataSource reportDataSource = new ReportDataSource("DataSet1", ZVatList);

                    ReportParameter[] reportParameters = new ReportParameter[7];

                    reportParameters[0] = new ReportParameter("CompanyName", CardDetails.Data.CompanyName);
                    reportParameters[1] = new ReportParameter("TIN", CardDetails.Data.TIN);
                    reportParameters[2] = new ReportParameter("VAT", CardDetails.Data.VAT);
                    reportParameters[3] = new ReportParameter("RegNum", CardDetails.Data.RegistrationNumber);
                    reportParameters[4] = new ReportParameter("DeviceSerial", CardDetails.Data.SerialNumber);
                    reportParameters[5] = new ReportParameter("ReportDate", item.Date);
                    reportParameters[6] = new ReportParameter("Currency", item.Currency);


                    reportViewer1.LocalReport.SetParameters(reportParameters);
                    reportViewer1.LocalReport.DataSources.Add(reportDataSource);
                    /*               PaperSize paperSize = new PaperSize("receipt", 80, 297);
                                   PageSettings pageSettings = new PageSettings();
                                   pageSettings.PaperSize = paperSize;
                                   reportViewer1.SetPageSettings(pageSettings);*/


                    // MessageBox.Show(reportViewer1.LocalReport.GetDefaultPageSettings().PaperSize.ToString()); 

                    reportViewer1.RefreshReport();
                    reportViewer1.LocalReport.Print();
                    //printInvoice.Clear();

                    //MessageBox.Show("Printed");



                }

            }
            else if (zReport.Code == "1" & zReport.Message.Contains("Opened"))
            {
                MessageBox.Show("Fiscal Day Opened. Press OK to continue");
            }

            else
            {
                MessageBox.Show("Failed to run Z Report");
            }

            //MessageBox.Show(j);
        }

        private void exitToolStripMenuItem1_Click(object sender, EventArgs e)
        {
            Application.Exit();
        }

        private void checkLicenseToolStripMenuItem_Click(object sender, EventArgs e)
        {
            SetLicense setLicense = new SetLicense();
            if (setLicense.ShowDialog(this) == DialogResult.OK)
            {
                MessageBox.Show(revmalib.SetLicense(setLicense.txtLicense.Text));

            }
            setLicense.Dispose();


        }

        private void setLicenseToolStripMenuItem_Click(object sender, EventArgs e)
        {
            btnInstall_Click();
        }

        private void retrainInterfaceToolStripMenuItem_Click(object sender, EventArgs e)
        {
            addToConfig("Trained", "0");


            if (MessageBox.Show("Close Interface and restart application to train again?", "Confirmation", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button1) == DialogResult.Yes)
            {
                Application.Exit();
            }

        }

        private void tableLayoutPanel1_Paint(object sender, PaintEventArgs e)
        {

        }
    }
}

