using System;
using System.Configuration;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public partial class TestToolForm : Form
    {
        private FiscalStackClient _client = new FiscalStackClient();

        public TestToolForm()
        {
            InitializeComponent();
            AppBranding.ApplyIcon(this);
        }

        private void TestToolForm_Load(object sender, EventArgs e)
        {
            string apiKey = ConfigurationManager.AppSettings.Get("ApiKey");
            string endpoint = ConfigurationManager.AppSettings.Get("ApiEndpoint");

            lblApiKey.Text = "API Key: " + (string.IsNullOrWhiteSpace(apiKey) ? "MISSING / NOT CONFIGURED" : apiKey);
            lblEndpoint.Text = "Endpoint: " + (string.IsNullOrWhiteSpace(endpoint) ? "DEFAULT (https://fiscalstack.co.zw/api/v1/)" : endpoint);

            Log("Loaded configuration settings from App.config.");
        }

        private void Log(string message)
        {
            if (txtLog.InvokeRequired)
            {
                txtLog.Invoke(new Action(() => Log(message)));
                return;
            }

            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            txtLog.AppendText("[" + timestamp + "] " + message + "\n");
            txtLog.SelectionStart = txtLog.Text.Length;
            txtLog.ScrollToCaret();
        }

        private async void btnPing_Click(object sender, EventArgs e)
        {
            Log("Testing FiscalStack API connection...");
            try
            {
                string result = await _client.GetDeviceAsync();
                Log("SUCCESS: Connection established.");
                Log("Response:\n" + result);
            }
            catch (Exception ex)
            {
                Log("ERROR: Connection failed - " + ex.Message);
            }
        }

        private async void btnGetDevice_Click(object sender, EventArgs e)
        {
            Log("Fetching device & company details from FiscalStack...");
            try
            {
                string json = await _client.GetDeviceAsync();
                CardDetails details = JsonConvert.DeserializeObject<CardDetails>(json);
                
                Log("SUCCESS: Device Details Retrieved.");
                Log("----------------------------------------");
                Log("Code: " + details.Code);
                Log("Message: " + details.Message);
                Log("Fiscal Day: " + details.FiscalDay);
                if (details.Data != null)
                {
                    Log("Company: " + details.Data.CompanyName);
                    Log("TIN: " + details.Data.TIN);
                    Log("VAT: " + details.Data.VAT);
                    Log("Address: " + details.Data.Address);
                    Log("Serial No: " + details.Data.SerialNumber);
                }
                Log("----------------------------------------");
            }
            catch (Exception ex)
            {
                Log("ERROR: Failed to fetch device details - " + ex.Message);
            }
        }

        private async void btnSubmitInvoice_Click(object sender, EventArgs e)
        {
            string invNo = txtInvoiceNo.Text.Trim();
            string amtStr = txtAmount.Text.Trim();
            decimal amt = 100.00m;
            decimal.TryParse(amtStr, out amt);

            Log("Submitting Fiscal Invoice #" + invNo + " for $" + amt.ToString("F2") + "...");

            var payload = new
            {
                receiptType = "FISCALINVOICE",
                invoiceNumber = invNo,
                totalAmount = amt,
                taxAmount = Math.Round(amt * 0.15m, 2),
                currency = "USD",
                buyerName = "Test Client Ltd",
                buyerTIN = "2001234567",
                items = new[]
                {
                    new
                    {
                        code = "ITEM001",
                        description = "Test Product / Service",
                        quantity = 1,
                        unitPrice = amt,
                        totalPrice = amt,
                        taxRate = 15.0
                    }
                }
            };

            try
            {
                string res = await _client.FiscalizeAsync(payload);
                Log("SUCCESS: Invoice Fiscalized!");
                Log("Response:\n" + res);
            }
            catch (Exception ex)
            {
                Log("ERROR: Fiscalization failed - " + ex.Message);
            }
        }

        private async void btnSubmitCreditNote_Click(object sender, EventArgs e)
        {
            string invNo = txtInvoiceNo.Text.Trim() + "-CN";
            string amtStr = txtAmount.Text.Trim();
            decimal amt = 100.00m;
            decimal.TryParse(amtStr, out amt);

            Log("Submitting Credit Note #" + invNo + " for $" + amt.ToString("F2") + "...");

            var payload = new
            {
                receiptType = "CREDITNOTE",
                invoiceNumber = invNo,
                originalInvoiceNumber = txtInvoiceNo.Text.Trim(),
                totalAmount = amt,
                taxAmount = Math.Round(amt * 0.15m, 2),
                currency = "USD",
                buyerName = "Test Client Ltd",
                reason = "Test Return / Discount",
                items = new[]
                {
                    new
                    {
                        code = "ITEM001",
                        description = "Credit Note Item Adjustment",
                        quantity = 1,
                        unitPrice = amt,
                        totalPrice = amt,
                        taxRate = 15.0
                    }
                }
            };

            try
            {
                string res = await _client.FiscalizeAsync(payload);
                Log("SUCCESS: Credit Note Fiscalized!");
                Log("Response:\n" + res);
            }
            catch (Exception ex)
            {
                Log("ERROR: Credit Note submission failed - " + ex.Message);
            }
        }

        private async void btnSubmitDebitNote_Click(object sender, EventArgs e)
        {
            string invNo = txtInvoiceNo.Text.Trim() + "-DN";
            string amtStr = txtAmount.Text.Trim();
            decimal amt = 50.00m;
            decimal.TryParse(amtStr, out amt);

            Log("Submitting Debit Note #" + invNo + " for $" + amt.ToString("F2") + "...");

            var payload = new
            {
                receiptType = "DEBITNOTE",
                invoiceNumber = invNo,
                originalInvoiceNumber = txtInvoiceNo.Text.Trim(),
                totalAmount = amt,
                taxAmount = Math.Round(amt * 0.15m, 2),
                currency = "USD",
                buyerName = "Test Client Ltd",
                reason = "Additional Price Charge",
                items = new[]
                {
                    new
                    {
                        code = "ITEM002",
                        description = "Debit Note Surcharge",
                        quantity = 1,
                        unitPrice = amt,
                        totalPrice = amt,
                        taxRate = 15.0
                    }
                }
            };

            try
            {
                string res = await _client.FiscalizeAsync(payload);
                Log("SUCCESS: Debit Note Fiscalized!");
                Log("Response:\n" + res);
            }
            catch (Exception ex)
            {
                Log("ERROR: Debit Note submission failed - " + ex.Message);
            }
        }

        private async void btnCloseDay_Click(object sender, EventArgs e)
        {
            if (MessageBox.Show("Are you sure you want to execute Close Day (Z-Report)?", "Confirm Z-Report", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            {
                return;
            }

            Log("Executing Close Day (Z-Report)...");
            try
            {
                string res = await _client.CloseDayAsync();
                Log("SUCCESS: Z-Report Generated / Day Closed.");
                Log("Response:\n" + res);
            }
            catch (Exception ex)
            {
                Log("ERROR: Close Day failed - " + ex.Message);
            }
        }
    }
}
