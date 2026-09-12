using System;
using System.Configuration;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    public static class NativeThermalPrinter
    {
        public static void Print(dynamic data, string templateName, string accentColorHex, CardDetails device)
        {
            try
            {
                string targetPrinter = ConfigurationManager.AppSettings.Get("TargetPrinter");
                Color accent = ColorTranslator.FromHtml(string.IsNullOrEmpty(accentColorHex) ? "#3355FF" : accentColorHex);

                bool is48mm = templateName.Contains("48");
                int paperWidth = is48mm ? 180 : 280; // 48mm vs 80mm in pixels at standard 100dpi

                PrintDocument pd = new PrintDocument();
                if (!string.IsNullOrEmpty(targetPrinter))
                {
                    pd.PrinterSettings.PrinterName = targetPrinter;
                }

                pd.DefaultPageSettings.PaperSize = new PaperSize("ReceiptRoll", paperWidth, 800);
                pd.DefaultPageSettings.Margins = new Margins(5, 5, 5, 5);

                pd.PrintPage += (s, e) =>
                {
                    Graphics g = e.Graphics;
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

                    Font fontCompany = new Font("Segoe UI", is48mm ? 9F : 11F, FontStyle.Bold);
                    Font fontBold = new Font("Segoe UI", is48mm ? 8F : 9F, FontStyle.Bold);
                    Font fontRegular = new Font("Segoe UI", is48mm ? 7.5F : 8.5F, FontStyle.Regular);
                    Font fontSmall = new Font("Segoe UI", is48mm ? 7F : 7.5F, FontStyle.Regular);

                    Brush brushBlack = Brushes.Black;
                    Brush brushAccent = new SolidBrush(accent);
                    Pen penAccent = new Pen(accent, 2);
                    Pen penDash = new Pen(Color.LightGray, 1) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };

                    int y = 5;
                    int width = paperWidth - 10;

                    // 1. Company Header
                    string company = device != null && device.Data != null ? (device.Data.CompanyName ?? "FISCALSTORE") : "FISCALSTORE";
                    g.DrawString(company.ToUpper(), fontCompany, brushAccent, new RectangleF(5, y, width, 22), new StringFormat { Alignment = StringAlignment.Center });
                    y += 22;

                    string tinVat = "TIN: " + (device != null && device.Data != null ? device.Data.TIN : "1002938") + " | VAT: " + (device != null && device.Data != null ? device.Data.VAT : "1002938");
                    g.DrawString(tinVat, fontSmall, Brushes.DimGray, new RectangleF(5, y, width, 16), new StringFormat { Alignment = StringAlignment.Center });
                    y += 18;

                    // Accent Line
                    g.DrawLine(penAccent, 5, y, width + 5, y);
                    y += 6;

                    // 2. Receipt Meta
                    string invNo = data != null && data.receipt != null ? (string)data.receipt.invoiceNo : "INV-10024";
                    string date = data != null && data.receipt != null ? (string)data.receipt.receiptDate : DateTime.Now.ToString("dd/MM/yyyy HH:mm");

                    g.DrawString("Inv #: " + invNo, fontBold, brushBlack, 5, y);
                    y += 16;
                    g.DrawString("Date: " + date, fontRegular, Brushes.DimGray, 5, y);
                    y += 18;

                    g.DrawLine(penDash, 5, y, width + 5, y);
                    y += 6;

                    // 3. Items Table Header
                    g.DrawString("ITEM", fontBold, brushAccent, 5, y);
                    g.DrawString("QTY", fontBold, brushAccent, width - 85, y);
                    g.DrawString("AMOUNT", fontBold, brushAccent, width - 40, y);
                    y += 18;

                    // Items rows
                    g.DrawString("Standard Item 1", fontRegular, brushBlack, 5, y);
                    g.DrawString("1", fontRegular, brushBlack, width - 80, y);
                    g.DrawString("100.00", fontRegular, brushBlack, width - 40, y);
                    y += 16;

                    g.DrawString("Standard Item 2", fontRegular, brushBlack, 5, y);
                    g.DrawString("2", fontRegular, brushBlack, width - 80, y);
                    g.DrawString("50.00", fontRegular, brushBlack, width - 40, y);
                    y += 20;

                    g.DrawLine(penDash, 5, y, width + 5, y);
                    y += 8;

                    // 4. Totals Box
                    string total = data != null && data.receipt != null ? Convert.ToString(data.receipt.receiptTotal) : "150.00";
                    g.FillRectangle(new SolidBrush(Color.FromArgb(20, accent)), 5, y, width, 28);
                    g.DrawRectangle(penAccent, 5, y, width, 28);
                    g.DrawString("TOTAL DUE:", fontBold, brushAccent, 10, y + 6);
                    g.DrawString("$" + total, fontCompany, brushAccent, width - 75, y + 4);
                    y += 36;

                    // 5. Verification Footer
                    string fiscalCode = data != null ? (string)data.fiscalCode : "VERIFIED-ZIMRA-88492";
                    g.DrawString("ZIMRA Verification Code:", fontSmall, Brushes.Gray, new RectangleF(5, y, width, 14), new StringFormat { Alignment = StringAlignment.Center });
                    y += 14;
                    g.DrawString(fiscalCode, fontBold, brushBlack, new RectangleF(5, y, width, 16), new StringFormat { Alignment = StringAlignment.Center });
                    y += 22;

                    g.DrawString("Thank you for your business!", fontSmall, Brushes.DimGray, new RectangleF(5, y, width, 14), new StringFormat { Alignment = StringAlignment.Center });
                };

                pd.Print();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Native thermal print error: " + ex.Message, "Print Failure", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
