using System;
using System.Configuration;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    public static class ReceiptPrinter
    {
        public static void PrintReceipt(object receiptData, CardDetails cardDetails = null)
        {
            try
            {
                string templateName = ConfigurationManager.AppSettings.Get("ReceiptTemplate") ?? "Receipt80";
                string accentColor = ConfigurationManager.AppSettings.Get("AccentColor") ?? "#3355FF";
                string targetPrinter = ConfigurationManager.AppSettings.Get("TargetPrinter");

                if (templateName.Contains("Receipt48") || templateName.Contains("Receipt80"))
                {
                    // Use native GDI+ thermal vector engine for crisp zero-margin roll paper printing
                    NativeThermalPrinter.Print(receiptData, templateName, accentColor, cardDetails);
                }
                else
                {
                    // Use HTML engine for full A4 corporate invoices
                    string html = TemplateEngine.GenerateHtml(receiptData, templateName, accentColor, cardDetails);

                    WebBrowser wb = new WebBrowser();
                    wb.ScriptErrorsSuppressed = true;
                    wb.DocumentCompleted += (s, e) =>
                    {
                        try
                        {
                            wb.Print();
                        }
                        catch { }
                    };
                    wb.DocumentText = html;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Printing error: " + ex.Message, "Print Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
