using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.Globalization;
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
        private const char BoldText = '\u0002';
        private static string Bold(string s) { return BoldText + s; }

        public static void Print(PosSale sale, FiscalResult res, CardInfo card, string printerName, string width, bool preview, string logoFile = "")
        {
            PrintEscPos(sale, res, card, width, printerName);
        }

        /// <summary>Sends the receipt straight to the ESC/POS printer as raw bytes.</summary>
        public static void PrintEscPos(PosSale sale, FiscalResult res, CardInfo card, string width, string printerName)
        {
            int charMode = width.Contains("48") ? 48 : 42;
            var lines = ReceiptBuilder.Build(sale, res, card, charMode);
            RawPrinter.SendBytes(printerName, EscPos.Encode(lines, charMode, res.QrUrl), "FISCAL RECEIPT");
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
            int charMode = width.Contains("48") ? 48 : 42;
            var lines = ReceiptBuilder.Build(sale, res, card, charMode);
            return ReceiptPreview.Render(lines, res.QrUrl, charMode, logoFile);
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

        private static string Center(string s, int width)
        {
            if (string.IsNullOrEmpty(s)) return "";
            if (s.Length >= width) return s;
            return s.PadLeft(s.Length + (width - s.Length) / 2);
        }

        private static string Row(string left, string right, int width)
        {
            if (left == null) left = "";
            if (right == null) right = "";
            if (right.Length >= width) return left + " " + right;
            string l = Trunc(left, width - right.Length - 1);
            return l.PadRight(width - right.Length) + right;
        }

        private static string Trunc(string s, int len)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Length <= len ? s : s.Substring(0, len);
        }

        /// <summary>
        /// Formats the trailing 16-hex QR datum as a human-readable verification
        /// code (XXXX-XXXX-XXXX-XXXX). For a query-form link the MD5 of the "h"
        /// parameter is used, matching the ZIMRA printout behaviour.
        /// </summary>
        internal static string VerificationCode(string qrText)
        {
            string qrData = "";
            Uri u;
            if (!string.IsNullOrEmpty(qrText) && Uri.TryCreate(qrText, UriKind.Absolute, out u))
            {
                string h = QueryValue(u, "h");
                if (h.Length > 0) qrData = Md5Hex16(h);
            }
            if (qrData.Length != 16 && !string.IsNullOrEmpty(qrText) && qrText.Length >= 16)
                qrData = qrText.Substring(qrText.Length - 16);
            if (qrData.Length != 16) return "";
            string c = qrData.ToUpper();
            return c.Substring(0, 4) + "-" + c.Substring(4, 4) + "-" + c.Substring(8, 4) + "-" + c.Substring(12, 4);
        }

        private static string QueryValue(Uri url, string key)
        {
            if (string.IsNullOrEmpty(url.Query)) return "";
            foreach (string q in url.Query.TrimStart('?').Split('&'))
            {
                string[] kv = q.Split(new char[] { '=' }, 2);
                if (kv.Length == 2 && kv[0] == key) return kv[1];
            }
            return "";
        }

        private static string Md5Hex16(string hex)
        {
            try
            {
                if (string.IsNullOrEmpty(hex) || hex.Length % 2 != 0) return "";
                byte[] bytes = new byte[hex.Length / 2];
                for (int i = 0; i < bytes.Length; i++) bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
                using (System.Security.Cryptography.MD5 md5 = System.Security.Cryptography.MD5.Create())
                    return BitConverter.ToString(md5.ComputeHash(bytes)).Replace("-", "").Substring(0, 16);
            }
            catch { return ""; }
        }

        internal static string RuntimeIni(string key)
        {
            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "FiscalStack", "config.ini");
                if (!File.Exists(path)) return "";
                foreach (string line in File.ReadAllLines(path))
                {
                    string t = line.Trim();
                    if (t.StartsWith(key, StringComparison.OrdinalIgnoreCase) && t.Contains("="))
                        return t.Substring(t.IndexOf('=') + 1).Trim().Trim('"');
                }
            }
            catch { }
            return "";
        }

        internal static string VerifyUrl()
        {
            string b = RuntimeIni("QRURL");
            if (b.Length == 0) b = RuntimeIni("VERIFICATIONSERVER");
            return b.Length > 0 ? b.TrimEnd('/') + "/" : "";
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

                List<string> qrFooter = new List<string>();
                if (qrArea > 0)
                {
                    string vc = VerificationCode(res.QrUrl);
                    if (vc.Length > 0)
                    {
                        qrFooter.Add("Verification code:");
                        qrFooter.Add(Center(vc, charMode));
                        qrFooter.Add("");
                        qrFooter.Add("You can verify this receipt manually at");
                        string vu = VerifyUrl().TrimEnd('/');
                        if (vu.Length > 0) qrFooter.Add(Center(vu, charMode));
                    }
                }

                int h = (int)Math.Ceiling((lines.Count + (qrArea > 0 ? qrLines : 0) + qrFooter.Count + 2) * lineH);
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
                    if (card != null)
                    {
                        if (!string.IsNullOrEmpty(card.TIN)) DrawCentered(g, "TIN: " + card.TIN, mono, charW, maxChars, w, ref y);
                        if (!string.IsNullOrEmpty(card.VAT)) DrawCentered(g, "VAT No: " + card.VAT, mono, charW, maxChars, w, ref y);
                        if (!string.IsNullOrEmpty(card.Address)) DrawCentered(g, card.Address, mono, charW, maxChars, w, ref y);
                    }
                    string email = RuntimeIni("COMPANYEMAIL");
                    if (email.Length > 0) DrawCentered(g, email, mono, charW, maxChars, w, ref y);
                    string phone = RuntimeIni("COMPANYPHONE");
                    if (phone.Length > 0) DrawCentered(g, phone, mono, charW, maxChars, w, ref y);
                    y += lineH * 0.5f;

                    float textBottomY = y + lines.Count * lineH;
                    foreach (var raw in lines)
                    {
                        bool isBold = raw.Length > 0 && raw[0] == BoldText;
                        string text = isBold ? raw.Substring(1) : raw;
                        DrawWrapped(g, text, isBold ? bold : mono, charW, maxChars, w, ref y);
                    }

                    // QR + verification footer at the bottom (centered)
                    if (qrArea > 0 && !string.IsNullOrEmpty(res.QrUrl))
                    {
                        try
                        {
                            using (QRCodeGenerator gen = new QRCodeGenerator())
                            using (QRCodeData qd = gen.CreateQrCode(res.QrUrl, QRCodeGenerator.ECCLevel.M))
                            using (QRCode code = new QRCode(qd))
                            using (Bitmap qr = code.GetGraphic((int)Math.Ceiling(qrSide / 25f), Color.Black, Color.White, true))
                            {
                                float qrY = (int)Math.Ceiling(textBottomY) + 4;
                                g.DrawImage(qr, (w - qrSide) / 2f, qrY, qrSide, qrSide);
                                float fy = qrY + qrSide + 8f;
                                foreach (string f in qrFooter)
                                {
                                    SizeF sz = g.MeasureString(f, mono);
                                    g.DrawString(f, mono, Brushes.Black, (w - sz.Width) / 2f, fy);
                                    fy += sz.Height + 4f;
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            g.DrawString("QR error: " + ex.Message, mono, Brushes.Black, 6, textBottomY + 4);
                        }
                    }
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