using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using QRCoder;

namespace FiscalStackPOS
{
    /// <summary>
    /// Thermal (GDI+) slip printer for receipts and Z reports. 80mm roll paper,
    /// 48 or 80 printable chars, includes the fiscal QR code via QRCoder.
    /// </summary>
    public static class ThermalPrinter
    {
        private const float MM = 25.4f;

        public static void Print(PosSale sale, FiscalResult res, CardInfo card, string printerName, string width, bool preview, string logoFile = "")
        {
            Bitmap bmp = Render(sale, res, card, width, logoFile);
            PrintBitmap(bmp, printerName, preview, "FISCAL RECEIPT");
        }

        public static void PrintResult(FiscalResult res, CardInfo card, string printerName, string width, bool preview, string logoFile = "")
        {
            Bitmap bmp = RenderResult(res, card, width, logoFile);
            PrintBitmap(bmp, printerName, preview, "RESULT SLIP");
        }

        public static void PrintZReport(string zReportXml, CardInfo card, string printerName, string width, bool preview, string logoFile = "")
        {
            Bitmap bmp = RenderZReport(zReportXml, card, width, logoFile);
            PrintBitmap(bmp, printerName, preview, "Z REPORT");
        }

        public static void PrintLines(string title, List<string> lines, string printerName, string width, bool preview, string logoFile = "")
        {
            var all = new List<string>();
            all.Add("=========== " + title + " ===========");
            all.Add("");
            all.AddRange(lines);
            Bitmap bmp = Compose(all, new CardInfo(), new FiscalResult(), 80, width, logoFile);
            PrintBitmap(bmp, printerName, preview, title);
        }

        // ------------------------------------------------------------------ rendering

        public static Bitmap Render(PosSale sale, FiscalResult res, CardInfo card, string width, string logoFile = "")
        {
            int wmm = 80;
            var lines = BuildReceiptLines(sale, res, card, width);
            return Compose(lines, card, res, wmm, width, logoFile);
        }

        public static Bitmap RenderResult(FiscalResult res, CardInfo card, string width, string logoFile = "")
        {
            var lines = new List<string>
            {
                "FISCALSTACK POS - RESULT",
                "",
            };
            if (res.Ok)
            {
                lines.Add("Code: 1 (SUCCESS)");
                lines.Add("Invoice: " + res.Message);
            }
            else
            {
                lines.Add("Code: " + (res.Code == "" ? "0" : res.Code));
                lines.Add("Message: " + res.Message);
            }
            return Compose(lines, card, res, 80, width, logoFile);
        }

        public static Bitmap RenderZReport(string xml, CardInfo card, string width, string logoFile = "")
        {
            var lines = new List<string>();
            lines.Add("=========== Z REPORT ===========");
            lines.Add("");
            lines.Add("Date: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            try
            {
                var x = System.Xml.Linq.XDocument.Parse(xml);
                var root = x.Element("FiscalDayReport");
                string day = El(root, "FiscalDayNo");
                string device = El(root, "DeviceID");
                lines.Add("Fiscal day: " + day);
                lines.Add("Device: " + device);
                lines.Add("");
                lines.Add("--- Counters ---");
                var balance = root == null ? null : root.Element("fiscalDayCounters");
                if (balance != null)
                {
                    var sales = balance.Elements("balance");
                    foreach (var s in sales)
                    {
                        string cur = El(s, "currency");
                        string tot = El(s, "salesTotal");
                        string vat = El(s, "vatableTax");
                        string nonVat = El(s, "nonVatable");
                        lines.Add(cur + " (base: " + El(s, "vatableTotal") + ")");
                        lines.Add("  Total:    " + tot);
                        lines.Add("  VAT:      " + vat);
                        lines.Add("  Zero/ex:  " + nonVat);
                    }
                }
            }
            catch (Exception ex) { lines.Add("Report parse: " + ex.Message); }

            return Compose(lines, card, new FiscalResult(), 80, width, logoFile);
        }

        private static List<string> BuildReceiptLines(PosSale sale, FiscalResult res, CardInfo card, string width)
        {
            var lines = new List<string>();
            bool cn = sale.InvoiceFlag == "02";
            lines.Add("");
            lines.Add("    " + (cn ? "CREDIT NOTE" : "TAX INVOICE / RECEIPT"));
            lines.Add("------------------------------------------");
            lines.Add("");
            lines.Add("Invoice #   : " + sale.InvoiceNumber);
            if (cn && !string.IsNullOrEmpty(sale.OriginalInvoiceNumber))
                lines.Add("Original    : " + sale.OriginalInvoiceNumber);
            lines.Add("Date        : " + sale.Created.ToString("yyyy-MM-dd HH:mm:ss"));
            if (!string.IsNullOrEmpty(card.CompanyName)) lines.Add("Fiscal dev  : " + card.CompanyName);
            if (!string.IsNullOrEmpty(card.SerialNumber)) lines.Add("Device      : " + card.SerialNumber);
            if (res.FiscalDayNo.Length > 0) lines.Add("Fiscal day  : " + res.FiscalDayNo);
            if (res.ReceiptGlobalNo.Length > 0) lines.Add("Receipt GNo : " + res.ReceiptGlobalNo);
            lines.Add("Currency    : " + sale.Currency);
            lines.Add("Payment     : " + (string.IsNullOrEmpty(sale.PaymentMethod) ? "CASH" : sale.PaymentMethod));
            if (!string.IsNullOrEmpty(sale.CustomerName) || !string.IsNullOrEmpty(sale.CustomerTin))
            {
                lines.Add("");
                if (!string.IsNullOrEmpty(sale.CustomerName)) lines.Add("Buyer       : " + sale.CustomerName);
                if (!string.IsNullOrEmpty(sale.CustomerTin)) lines.Add("Buyer TIN   : " + sale.CustomerTin);
                if (!string.IsNullOrEmpty(sale.CustomerVat)) lines.Add("Buyer VAT   : " + sale.CustomerVat);
                if (!string.IsNullOrEmpty(sale.CustomerAddress)) lines.Add("     " + sale.CustomerAddress);
            }
            lines.Add("");
            lines.Add("ITEM");
            int n = 0;
            foreach (var it in sale.Items)
            {
                n++;
                string itemLine = (n.ToString() + " " + it.Name).Trim();
                lines.Add(itemLine);
                lines.Add("  " + it.Quantity.ToString("0.##") + " x " + it.Price.ToString("0.00") +
                    "  " + it.TaxRate.ToString("0.#%").Replace(" %", "%") + "  = " + it.Amount.ToString("0.00"));
            }
            lines.Add("------------------------------------------");
            lines.Add("Subtotal    : " + sale.Subtotal.ToString("0.00") + " " + sale.Currency);
            lines.Add("VAT         : " + sale.VatTotal.ToString("0.00"));
            lines.Add("TOTAL       : " + sale.Subtotal.ToString("0.00") + " " + sale.Currency);
            if (sale.Tendered > 0)
            {
                lines.Add("Tendered    : " + sale.Tendered.ToString("0.00"));
                lines.Add("Change      : " + sale.Change.ToString("0.00"));
            }
            if (!string.IsNullOrEmpty(sale.InvoiceComment) && !sale.InvoiceComment.StartsWith("Original"))
            {
                lines.Add("");
                lines.Add(sale.InvoiceComment);
            }
            lines.Add("");
            lines.Add("Device signature:" + (res.DeviceHash.Length > 0 ? "" : ""));
            if (res.DeviceHash.Length > 0) lines.Add(res.DeviceHash);
            lines.Add("");
            return lines;
        }

        private static string El(System.Xml.Linq.XElement x, string name)
        {
            if (x == null) return "";
            var e = x.Element(name);
            return e == null ? "" : (e.Value ?? "").Trim();
        }

        private static Bitmap Compose(List<string> lines, CardInfo card, FiscalResult res, int paperWmm, string width, string logoFile = "")
        {
            int dpi = 203;
            int w = Mm(paperWmm, dpi);
            int charMode = width.Contains("48") ? 48 : 80;
            Font mono = new Font("Consolas", charMode == 48 ? 9f : 7.5f, FontStyle.Regular, GraphicsUnit.Point);
            Font bold = new Font("Consolas", charMode == 48 ? 9f : 7.5f, FontStyle.Bold, GraphicsUnit.Point);

            using (Bitmap measure = new Bitmap(1, 1))
            using (Graphics gm = Graphics.FromImage(measure))
            {
                gm.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                float charW = gm.MeasureString("0", mono).Width;
                int maxChars = Math.Max(16, (int)(w / charW));

                int qrSide = Mm(28, dpi);
                float lineH = mono.GetHeight(gm) + 2f;
                int qrLines = (int)Math.Ceiling(qrSide / lineH) + 2;

                float qrArea = 0;
                if (res != null && !string.IsNullOrEmpty(res.QrUrl)) qrArea = qrSide;

                int h = (int)Math.Ceiling((lines.Count + (qrArea > 0 ? qrLines : 0) + 2) * lineH);
                if (h < qrSide + 40) h = qrSide + 40;

                Bitmap bmp = new Bitmap(w, h);
                bmp.SetResolution(dpi, dpi);
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.White);
                    g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                    g.SmoothingMode = SmoothingMode.AntiAlias;

                    float y = 4f;
                    if (!string.IsNullOrEmpty(logoFile) && File.Exists(logoFile))
                    {
                        try
                        {
                            using (Bitmap logo = new Bitmap(logoFile))
                            {
                                float maxW = (float)(w * 0.75);
                                float maxH = (float)Mm(14, dpi);
                                float scale = Math.Min(maxW / (float)logo.Width, maxH / (float)logo.Height);
                                if (scale > 1) scale = 1f;
                                float lw = logo.Width * scale, lh = logo.Height * scale;
                                g.DrawImage(logo, (w - lw) / 2f, y, lw, lh);
                                y += lh + 6f;
                            }
                        }
                        catch { }
                    }
                    if (card != null && !string.IsNullOrEmpty(card.CompanyName))
                    {
                        DrawCentered(g, card.CompanyName, bold, charW, maxChars, w, ref y);
                    }
                    if (card != null && !string.IsNullOrEmpty(card.Address))
                        DrawCentered(g, card.Address, mono, charW, maxChars, w, ref y);
                    if (card != null)
                    {
                        string line2 = "";
                        if (!string.IsNullOrEmpty(card.TIN)) line2 += "TIN " + card.TIN;
                        if (!string.IsNullOrEmpty(card.VAT)) line2 += (line2.Length > 0 ? "  " : "") + "VAT " + card.VAT;
                        if (line2.Length > 0) DrawCentered(g, line2, mono, charW, maxChars, w, ref y);
                    }
                    y += lineH * 0.6f;

                    float textBottomY = y + lines.Count * lineH;
                    foreach (var raw in lines)
                    {
                        DrawWrapped(g, raw, mono, charW, maxChars, w, ref y);
                    }

                    // QR at the bottom (aligned to the left-margin block, text flows around)
                    if (qrArea > 0 && !string.IsNullOrEmpty(res.QrUrl))
                    {
                        try
                        {
                            using (QRCodeGenerator gen = new QRCodeGenerator())
                            using (QRCodeData qd = gen.CreateQrCode(res.QrUrl, QRCodeGenerator.ECCLevel.M))
                            using (QRCode code = new QRCode(qd))
                            using (Bitmap qr = code.GetGraphic((int)Math.Ceiling(qrSide / 25f), Color.Black, Color.White, true))
                            {
                                g.DrawImage(qr, 6, (int)Math.Ceiling(textBottomY) + 4, qrSide, qrSide);
                            }
                            g.DrawString("Scan to verify", mono, Brushes.Black, qrSide + 10, textBottomY + 6);
                        }
                        catch (Exception ex)
                        {
                            g.DrawString("QR error: " + ex.Message, mono, Brushes.Black, 6, textBottomY + 4);
                        }
                    }
                    g.DrawString("------------------------------------------", mono, Brushes.Black, 6, h - lineH * 1);
                    g.DrawString("FiscalStack POS", bold, Brushes.Black, 6, h - lineH * 1.7f);
                }
                return bmp;
            }
        }

        private static void DrawCentered(Graphics g, string text, Font f, float charW, int maxChars, int w, ref float y)
        {
            string t = text.Length > maxChars ? text.Substring(0, maxChars) : text;
            SizeF sz = g.MeasureString(t, f);
            g.DrawString(t, f, Brushes.Black, (w - sz.Width) / 2f, y);
            y += sz.Height + 1f;
        }

        private static void DrawWrapped(Graphics g, string text, Font f, float charW, int maxChars, int w, ref float y)
        {
            if (string.IsNullOrEmpty(text))
            {
                g.DrawString(" ", f, Brushes.Black, 0, y);
                y += g.MeasureString(" ", f).Height + 1f;
                return;
            }
            // keep recognizable structure: if it is short, draw as-is
            int maxLen = Math.Max(8, maxChars);
            if (text.Length <= maxLen) { DrawDraw(g, text, f, 6, ref y); return; }
            // wrap on spaces when possible
            var words = text.Split(' ');
            var sb = new StringBuilder();
            for (int i = 0; i < words.Length; i++)
            {
                string candidate = sb.Length == 0 ? words[i] : sb.ToString() + " " + words[i];
                if (candidate.Length > maxLen && sb.Length > 0)
                {
                    DrawDraw(g, sb.ToString(), f, 6, ref y);
                    sb.Clear();
                    sb.Append(words[i]);
                }
                else sb.Append(i == 0 ? words[i] : " " + words[i]);
            }
            if (sb.Length > 0) DrawDraw(g, sb.ToString(), f, 6, ref y);
        }

        private static void DrawDraw(Graphics g, string text, Font f, float x, ref float y)
        {
            g.DrawString(text, f, Brushes.Black, x, y);
            y += g.MeasureString(text, f).Height + 1f;
        }

        private static int Mm(float mm, int dpi) { return (int)Math.Max(1, mm * dpi / MM); }

        // ------------------------------------------------------------------ printing

        public static void PrintBitmap(Bitmap bmp, string printerName, bool preview, string docName)
        {
            using (PrintDocument pd = new PrintDocument())
            {
                pd.DocumentName = docName;
                if (!string.IsNullOrEmpty(printerName) && printerName != "Default")
                {
                    foreach (var p in PrinterSettings.InstalledPrinters)
                    {
                        if (string.Equals(p.ToString(), printerName, StringComparison.OrdinalIgnoreCase))
                        {
                            pd.PrinterSettings.PrinterName = p.ToString();
                            break;
                        }
                    }
                }
                if (!pd.PrinterSettings.IsValid) { throw new Exception("No printer is installed/selected."); }
                pd.DefaultPageSettings.PaperSize = new PaperSize("Thermal", 1240, bmp.Height + 20);
                pd.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

                pd.PrintPage += (s, e) =>
                {
                    e.Graphics.Clear(Color.White);
                    float scale = Math.Min(
                        (e.MarginBounds.Width > 0 ? e.MarginBounds.Width : e.PageBounds.Width) / (float)bmp.Width,
                        (e.MarginBounds.Height > 0 ? e.MarginBounds.Height : e.PageBounds.Height) / (float)bmp.Height);
                    if (scale <= 0 || scale > 10) scale = 1f;
                    e.Graphics.DrawImage(bmp, 0, 0, bmp.Width * scale, bmp.Height * scale);
                    e.HasMorePages = false;
                };

                if (preview)
                {
                    using (PrintPreviewDialog dlg = new PrintPreviewDialog())
                    {
                        dlg.Document = pd;
                        dlg.ShowDialog();
                    }
                }
                else
                {
                    pd.Print();
                }
            }
        }

        public static void ExportPng(PosSale sale, FiscalResult res, CardInfo card, string width, string path)
        {
            using (Bitmap bmp = Render(sale, res, card, width))
            {
                bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
            }
        }
    }
}