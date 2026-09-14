using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;

namespace FiscalStackPOS
{
    /// <summary>
    /// WYSIWYG preview for the ESC/POS receipt. Renders the same RLine model
    /// the printer uses, but positioned with proper GDI alignment instead of
    /// monospace space-padding, so the screen preview matches the paper.
    /// </summary>
    public static class ReceiptPreview
    {
        private const float MM = 25.4f;

        public static Bitmap Render(List<RLine> lines, string qrUrl, int charMode, string logoFile = "")
        {
            int dpi = 203;
            int w = (int)(80f * dpi / MM);
            float fs = charMode <= 44 ? 9f : 8f;
            Font mono = new Font("Consolas", fs, FontStyle.Regular, GraphicsUnit.Point);
            Font bold = new Font("Consolas", fs, FontStyle.Bold, GraphicsUnit.Point);
            int qrSide = (int)(30f * dpi / MM);

            using (Bitmap measure = new Bitmap(1, 1))
            using (Graphics gm = Graphics.FromImage(measure))
            {
                gm.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                float lineH = mono.GetHeight(gm) + 2f;

                int qrCount = 0;
                foreach (RLine l in lines) if (l.Kind == RKind.Qr) qrCount++;
                int h = 4;
                foreach (RLine l in lines)
                {
                    if (l.Kind == RKind.Feed) h += (int)Math.Ceiling(lineH * l.Feed);
                    else if (l.Kind == RKind.Qr) h += (int)Math.Ceiling(qrSide + lineH);
                    else h += (int)Math.Ceiling(lineH);
                }
                int bottomPad = qrCount > 0 ? 4 : 0;
                h += bottomPad + 10;

                var bmp = new Bitmap(w, h);
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
                                float maxW = w * 0.75f;
                                float maxH = 14f * dpi / MM;
                                float scale = Math.Min(maxW / logo.Width, maxH / logo.Height);
                                if (scale > 1) scale = 1f;
                                float lw = logo.Width * scale, lh = logo.Height * scale;
                                g.DrawImage(logo, (w - lw) / 2f, y, lw, lh);
                                y += lh + 6f;
                            }
                        }
                        catch { }
                    }

                    foreach (RLine l in lines)
                    {
                        switch (l.Kind)
                        {
                            case RKind.Sep:
                                DrawCentered(g, new string('-', charMode), mono, w, ref y);
                                break;
                            case RKind.Feed:
                                y += lineH * l.Feed;
                                break;
                            case RKind.Qr:
                                if (!string.IsNullOrEmpty(qrUrl))
                                {
                                    try
                                    {
                                        using (var gen = new QRCoder.QRCodeGenerator())
                                        using (var qd = gen.CreateQrCode(qrUrl, QRCoder.QRCodeGenerator.ECCLevel.M))
                                        using (var code = new QRCoder.QRCode(qd))
                                        using (Bitmap qr = code.GetGraphic((int)Math.Ceiling(qrSide / 25f), Color.Black, Color.White, true))
                                        {
                                            g.DrawImage(qr, (w - qrSide) / 2f, y, qrSide, qrSide);
                                            y += qrSide + 6f;
                                        }
                                    }
                                    catch (Exception ex) { y += DrawCentered(g, "QR error: " + ex.Message, mono, w, ref y) - y; }
                                }
                                break;
                            default:
                                Font f = l.Bold ? bold : mono;
                                string text = l.Text ?? "";
                                if (l.Align == RAlign.LeftRight)
                                {
                                    int tab = text.IndexOf('\t');
                                    string left = tab >= 0 ? text.Substring(0, tab) : text;
                                    string right = tab >= 0 ? text.Substring(tab + 1) : "";
                                    float lw = g.MeasureString(left, f).Width;
                                    float rw = g.MeasureString(right, f).Width;
                                    g.DrawString(left, f, Brushes.Black, 6, y);
                                    g.DrawString(right, f, Brushes.Black, w - 6 - rw, y);
                                    float maxH = g.MeasureString(text.Replace('\t', ' '), f).Height;
                                    y += maxH + 1f;
                                }
                                else if (l.Align == RAlign.Center)
                                {
                                    y += DrawCentered(g, text, f, w, ref y) - y;
                                }
                                else if (l.Align == RAlign.Right)
                                {
                                    float rw = g.MeasureString(text, f).Width;
                                    g.DrawString(text, f, Brushes.Black, w - 6 - rw, y);
                                    y += g.MeasureString(text, f).Height + 1f;
                                }
                                else
                                {
                                    g.DrawString(text, f, Brushes.Black, 6, y);
                                    y += g.MeasureString(text, f).Height + 1f;
                                }
                                break;
                        }
                    }
                }
                return bmp;
            }
        }

        private static float DrawCentered(Graphics g, string text, Font f, int w, ref float y)
        {
            float tw = g.MeasureString(text, f).Width;
            g.DrawString(text, f, Brushes.Black, (w - tw) / 2f, y);
            float hh = g.MeasureString(text, f).Height + 1f;
            y += hh;
            return y;
        }
    }
}