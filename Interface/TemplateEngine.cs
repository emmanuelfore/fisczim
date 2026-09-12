using System;
using System.Text;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public static class TemplateEngine
    {
        public static string GenerateHtml(dynamic data, string templateName, string accentColorHex = "#3355FF", CardDetails cardDetails = null)
        {
            if (string.IsNullOrEmpty(accentColorHex)) accentColorHex = "#3355FF";
            if (string.IsNullOrEmpty(templateName)) templateName = "Receipt80";

            if (templateName.Contains("InvoiceA4"))
            {
                return RenderInvoiceA4(data, accentColorHex, cardDetails);
            }
            else if (templateName.Contains("Receipt48"))
            {
                return RenderReceipt48(data, accentColorHex, cardDetails);
            }
            else
            {
                return RenderReceipt80(data, accentColorHex, cardDetails);
            }
        }

        private static string RenderReceipt80(dynamic data, string color, CardDetails details)
        {
            string companyName = details != null && details.Data != null ? details.Data.CompanyName : "FISCALSTACK STORE";
            string tin = details != null && details.Data != null ? details.Data.TIN : "100293847";
            string vat = details != null && details.Data != null ? details.Data.VAT : "100293847";
            string serial = details != null && details.Data != null ? details.Data.SerialNumber : "FS-883920";

            string invNo = data != null && data.receipt != null ? (string)data.receipt.invoiceNo : "INV-10024";
            string date = data != null && data.receipt != null ? (string)data.receipt.receiptDate : DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            string total = data != null && data.receipt != null ? Convert.ToString(data.receipt.receiptTotal) : "150.00";
            string qr = data != null ? (string)data.qrCode : "";
            string fiscalCode = data != null ? (string)data.fiscalCode : "VERIFIED-ZIMRA-88492";

            StringBuilder html = new StringBuilder();
            html.Append("<!DOCTYPE html><html><head><meta charset='utf-8'>");
            html.Append("<style>");
            html.Append("body { font-family: 'Segoe UI', Tahoma, sans-serif; width: 300px; margin: 0 auto; padding: 15px; background: #fff; color: #222; font-size: 13px; }");
            html.Append(".header { text-align: center; border-bottom: 2px solid " + color + "; padding-bottom: 10px; margin-bottom: 10px; }");
            html.Append(".company { font-weight: bold; font-size: 16px; color: " + color + "; text-transform: uppercase; }");
            html.Append(".meta-line { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin: 2px 0; }");
            html.Append(".divider { border-top: 1px dashed #ccc; margin: 8px 0; }");
            html.Append(".items-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }");
            html.Append(".items-table th { text-align: left; border-bottom: 1px solid " + color + "; padding: 4px 0; color: " + color + "; }");
            html.Append(".items-table td { padding: 4px 0; }");
            html.Append(".total-box { background: " + color + "15; border-left: 4px solid " + color + "; padding: 8px; margin-top: 10px; }");
            html.Append(".total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; color: " + color + "; }");
            html.Append(".qr-box { text-align: center; margin-top: 15px; }");
            html.Append(".qr-img { width: 120px; height: 120px; }");
            html.Append(".footer { text-align: center; font-size: 10px; color: #777; margin-top: 10px; }");
            html.Append("</style></head><body>");

            html.Append("<div class='header'>");
            html.Append("<div class='company'>" + companyName + "</div>");
            html.Append("<div style='font-size:11px;color:#666;'>TIN: " + tin + " | VAT: " + vat + "</div>");
            html.Append("<div style='font-size:11px;color:#666;'>DEV: " + serial + "</div>");
            html.Append("</div>");

            html.Append("<div class='meta-line'><span>Invoice No:</span> <strong>" + invNo + "</strong></div>");
            html.Append("<div class='meta-line'><span>Date:</span> <span>" + date + "</span></div>");
            html.Append("<div class='divider'></div>");

            html.Append("<table class='items-table'>");
            html.Append("<tr><th>Item</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Amount</th></tr>");
            html.Append("<tr><td>Standard Item 1</td><td style='text-align:right'>1</td><td style='text-align:right'>100.00</td></tr>");
            html.Append("<tr><td>Standard Item 2</td><td style='text-align:right'>2</td><td style='text-align:right'>50.00</td></tr>");
            html.Append("</table>");

            html.Append("<div class='total-box'>");
            html.Append("<div class='total-row'><span>TOTAL DUE:</span> <span>$" + total + "</span></div>");
            html.Append("</div>");

            if (!string.IsNullOrEmpty(qr))
            {
                html.Append("<div class='qr-box'>");
                html.Append("<img class='qr-img' src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + Uri.EscapeDataString(qr) + "' />");
                html.Append("<div style='font-size:9px;color:#888;margin-top:4px;'>ZIMRA Fiscal Code: " + fiscalCode + "</div>");
                html.Append("</div>");
            }

            html.Append("<div class='footer'>Thank you for your business!<br/>Fiscalized by FiscalStack Engine</div>");
            html.Append("</body></html>");

            return html.ToString();
        }

        private static string RenderReceipt48(dynamic data, string color, CardDetails details)
        {
            string companyName = details != null && details.Data != null ? details.Data.CompanyName : "FISCALSTORE";
            string invNo = data != null && data.receipt != null ? (string)data.receipt.invoiceNo : "INV-4801";
            string total = data != null && data.receipt != null ? Convert.ToString(data.receipt.receiptTotal) : "45.00";

            StringBuilder html = new StringBuilder();
            html.Append("<!DOCTYPE html><html><head><meta charset='utf-8'>");
            html.Append("<style>");
            html.Append("body { font-family: monospace; width: 180px; margin: 0 auto; padding: 5px; font-size: 11px; color: #111; }");
            html.Append(".center { text-align: center; }");
            html.Append(".title { font-weight: bold; color: " + color + "; font-size: 13px; }");
            html.Append(".line { border-bottom: 1px dashed " + color + "; margin: 5px 0; }");
            html.Append(".row { display: flex; justify-content: space-between; }");
            html.Append("</style></head><body>");

            html.Append("<div class='center title'>" + companyName + "</div>");
            html.Append("<div class='center' style='font-size:10px;'>FISCAL RECEIPT</div>");
            html.Append("<div class='line'></div>");
            html.Append("<div class='row'><span>Inv:</span><span>" + invNo + "</span></div>");
            html.Append("<div class='line'></div>");
            html.Append("<div class='row'><span>Item A</span><span>$20.00</span></div>");
            html.Append("<div class='row'><span>Item B</span><span>$25.00</span></div>");
            html.Append("<div class='line'></div>");
            html.Append("<div class='row' style='font-weight:bold;color:" + color + ";'><span>TOTAL:</span><span>$" + total + "</span></div>");
            html.Append("<div class='center' style='margin-top:10px;font-size:9px;'>ZIMRA APPROVED</div>");
            html.Append("</body></html>");

            return html.ToString();
        }

        private static string RenderInvoiceA4(dynamic data, string color, CardDetails details)
        {
            string companyName = details != null && details.Data != null ? details.Data.CompanyName : "CORPORATE ENTERPRISE LTD";
            string tin = details != null && details.Data != null ? details.Data.TIN : "100998877";
            string vat = details != null && details.Data != null ? details.Data.VAT : "100998877";

            string invNo = data != null && data.receipt != null ? (string)data.receipt.invoiceNo : "INV-A4-9901";
            string date = data != null && data.receipt != null ? (string)data.receipt.receiptDate : DateTime.Now.ToString("yyyy-MM-dd");
            string total = data != null && data.receipt != null ? Convert.ToString(data.receipt.receiptTotal) : "1,250.00";
            string qr = data != null ? (string)data.qrCode : "";

            StringBuilder html = new StringBuilder();
            html.Append("<!DOCTYPE html><html><head><meta charset='utf-8'>");
            html.Append("<style>");
            html.Append("body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #333; }");
            html.Append(".header-bar { background: " + color + "; color: #fff; padding: 20px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }");
            html.Append(".company-title { font-size: 22px; font-weight: bold; }");
            html.Append(".inv-title { font-size: 20px; font-weight: 300; text-transform: uppercase; }");
            html.Append(".details-sec { display: flex; justify-content: space-between; margin: 20px 0; }");
            html.Append(".box { background: #f8f9fa; border: 1px solid #e9ecef; padding: 12px; border-radius: 4px; width: 45%; }");
            html.Append(".table { width: 100%; border-collapse: collapse; margin-top: 20px; }");
            html.Append(".table th { background: " + color + "; color: white; padding: 10px; text-align: left; }");
            html.Append(".table td { padding: 10px; border-bottom: 1px solid #eee; }");
            html.Append(".grand-total { margin-top: 20px; text-align: right; font-size: 18px; font-weight: bold; color: " + color + "; }");
            html.Append("</style></head><body>");

            html.Append("<div class='header-bar'>");
            html.Append("<div class='company-title'>" + companyName + "</div>");
            html.Append("<div class='inv-title'>TAX INVOICE</div>");
            html.Append("</div>");

            html.Append("<div class='details-sec'>");
            html.Append("<div class='box'><strong>Billed From:</strong><br/>" + companyName + "<br/>TIN: " + tin + "<br/>VAT: " + vat + "</div>");
            html.Append("<div class='box'><strong>Invoice Details:</strong><br/>Invoice #: " + invNo + "<br/>Date: " + date + "</div>");
            html.Append("</div>");

            html.Append("<table class='table'>");
            html.Append("<tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax Rate</th><th>Total</th></tr>");
            html.Append("<tr><td>Professional Services / Product Sales</td><td>1</td><td>$" + total + "</td><td>15.5%</td><td>$" + total + "</td></tr>");
            html.Append("</table>");

            html.Append("<div class='grand-total'>TOTAL AMOUNT: $" + total + "</div>");
            html.Append("</body></html>");

            return html.ToString();
        }
    }
}
