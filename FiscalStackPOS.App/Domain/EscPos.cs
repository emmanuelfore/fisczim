using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace FiscalStackPOS
{
    /// <summary>
    /// Encodes the receipt line model into an ESC/POS byte stream: real
    /// centering (ESC a), bold (ESC E), small font for 48-column paper
    /// (GS !), a native QR code (GS ( k), feed and partial cut.
    /// </summary>
    public static class EscPos
    {
        private static readonly Encoding TextEncoding;

        static EscPos()
        {
            try { TextEncoding = Encoding.GetEncoding(1252); }
            catch { TextEncoding = Encoding.ASCII; }
        }

        private const byte LF = 0x0A;

        public static byte[] Encode(List<RLine> lines, int charMode, string qrUrl)
        {
            var ms = new MemoryStream();
            W(ms, 0x1B, 0x40);                                  // ESC @ initialize
            W(ms, 0x1D, 0x21, (byte)(charMode <= 48 ? 0x01 : 0x00)); // GS ! font B for 48 cols

            foreach (RLine line in lines)
            {
                switch (line.Kind)
                {
                    case RKind.Sep:
                        Align(ms, RAlign.Center);
                        Txt(ms, new string('-', charMode));
                        break;

                    case RKind.Feed:
                        W(ms, 0x1B, 0x64, (byte)Math.Max(1, line.Feed)); // ESC d n
                        break;

                    case RKind.Qr:
                        if (!string.IsNullOrEmpty(qrUrl))
                        {
                            Align(ms, RAlign.Center);
                            QR(ms, qrUrl);
                            W(ms, LF);
                        }
                        break;

                    default:
                        string text = line.Text ?? "";
                        Align(ms, line.Align);
                        if (line.Align == RAlign.LeftRight)
                        {
                            int tab = text.IndexOf('\t');
                            string left = tab >= 0 ? text.Substring(0, tab) : text;
                            string right = tab >= 0 ? text.Substring(tab + 1) : "";
                            int fill = charMode - left.Length - right.Length;
                            if (fill < 1) { Left(ms, left); Txt(ms, right); }
                            else Txt(ms, left + new string(' ', fill) + right);
                        }
                        else
                        {
                            Txt(ms, text);
                        }
                        break;
                }
            }

            W(ms, 0x1D, 0x21, 0x00);                            // reset font
            W(ms, 0x1B, 0x64, 0x03);                            // feed 3 lines
            W(ms, 0x1D, 0x56, 0x42, 0x01);                      // GS V B 1 partial cut
            return ms.ToArray();
        }

        private static void TextLine(MemoryStream ms, string text, bool bold)
        {
            if (bold) W(ms, 0x1B, 0x45, 0x01);
            Txt(ms, text);
            if (bold) W(ms, 0x1B, 0x45, 0x00);
        }

        private static void Left(MemoryStream ms, string text) { Align(ms, RAlign.Left); TextLine(ms, text, false); }

        private static void Txt(MemoryStream ms, string text)
        {
            byte[] bytes = TextEncoding.GetBytes(Sanitize(text ?? ""));
            ms.Write(bytes, 0, bytes.Length);
            W(ms, LF);
        }

        private static string Sanitize(string s)
        {
            var sb = new StringBuilder(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '\t') c = ' ';
                if (c < 0x20 && c != ' ') continue;
                sb.Append(c);
            }
            return sb.ToString();
        }

        private static void Align(MemoryStream ms, RAlign align)
        {
            byte code = 0;
            if (align == RAlign.Center) code = 1;
            else if (align == RAlign.Right || align == RAlign.LeftRight) code = 2;
            W(ms, 0x1B, 0x61, code); // ESC a n
        }

        /// <summary>EPSON/Xprinter compatible QR code (GS ( k).</summary>
        private static void QR(MemoryStream ms, string data)
        {
            byte[] d = TextEncoding.GetBytes(data);
            int count = d.Length + 3;
            W(ms, 0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
            W(ms, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);       // module size 6
            W(ms, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);       // EC level M
            W(ms, 0x1D, 0x28, 0x6B, (byte)(count & 0xFF), (byte)((count >> 8) & 0xFF), 0x31, 0x50, 0x30); // store header
            ms.Write(d, 0, d.Length);
            W(ms, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);       // print
        }

        private static void W(MemoryStream ms, params byte[] b) { ms.Write(b, 0, b.Length); }
    }
}