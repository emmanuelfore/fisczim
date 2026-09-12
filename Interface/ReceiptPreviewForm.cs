using System;
using System.Configuration;
using System.Windows.Forms;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public partial class ReceiptPreviewForm : Form
    {
        private RootObject _receipt;
        private CardDetails _device;
        private WebBrowser _wb;

        public ReceiptPreviewForm(RootObject receipt, CardDetails device)
        {
            InitializeComponent();
            _receipt = receipt;
            _device = device;
            AppBranding.ApplyIcon(this);

            SetupWebBrowser();
            PopulateReceipt();
        }

        private void SetupWebBrowser()
        {
            _wb = new WebBrowser();
            _wb.Dock = DockStyle.Fill;
            _wb.ScriptErrorsSuppressed = true;
            panelReceipt.Controls.Clear();
            panelReceipt.Controls.Add(_wb);
        }

        private void PopulateReceipt()
        {
            try
            {
                string templateName = ConfigurationManager.AppSettings.Get("ReceiptTemplate") ?? "Receipt80";
                string accentColor = ConfigurationManager.AppSettings.Get("AccentColor") ?? "#3355FF";

                string html = TemplateEngine.GenerateHtml(_receipt, templateName, accentColor, _device);
                _wb.DocumentText = html;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not render template: " + ex.Message);
            }
        }

        private void btnPrint_Click(object sender, EventArgs e)
        {
            try
            {
                if (_wb != null)
                {
                    _wb.Print();
                }
                else
                {
                    ReceiptPrinter.PrintReceipt(_receipt, _device);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Print failed: " + ex.Message);
            }
        }

        private void btnClose_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        public static void ShowFromJson(string fiscalizeResponseJson, CardDetails device)
        {
            try
            {
                RootObject root = JsonConvert.DeserializeObject<RootObject>(fiscalizeResponseJson);
                ReceiptPreviewForm form = new ReceiptPreviewForm(root, device);
                form.Show();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not open receipt preview: " + ex.Message);
            }
        }
    }
}
