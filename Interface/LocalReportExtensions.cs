using Microsoft.Reporting.WinForms;
using System;
using System.Collections.Generic;
using System.Configuration;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public static class LocalReportExtensions
    {
        public static void Print(this LocalReport report)
        {
            var pageSettings = new PageSettings();
            pageSettings.PaperSize = report.GetDefaultPageSettings().PaperSize;
            pageSettings.Margins = report.GetDefaultPageSettings().Margins;
            Print(report, pageSettings);
        }

        public static void Print(this LocalReport report, PageSettings pageSettings)
        {
            string deviceInfo =
                "<DeviceInfo>" +
                "<OutputFormat>EMF</OutputFormat>" +
                "<PageWidth>" + (pageSettings.PaperSize.Width * 100) + "in</PageWidth>" +
                "<PageHeight>" + (pageSettings.PaperSize.Height * 100) + "in</PageHeight>" +
                "<MarginTop>" + (pageSettings.Margins.Top * 0) + "in</MarginTop>" +
                "<MarginLeft>" + (pageSettings.Margins.Left * 0) + "in</MarginLeft>" +
                "<MarginRight>" + (pageSettings.Margins.Right * 0) + "in</MarginRight>" +
                "<MarginBottom>" + (pageSettings.Margins.Bottom * 0) + "in</MarginBottom>" +
                "</DeviceInfo>";

            Warning[] warnings;
            var streams = new List<Stream>();
            var currentPageIndex = 0;

            report.Render("Image", deviceInfo,
                (name, fileNameExtension, encoding, mimeType, willSeek) =>
                {
                    var stream = new MemoryStream();
                    streams.Add(stream);
                    return stream;
                }, out warnings);

            foreach (Stream stream in streams)
                stream.Position = 0;

            if (streams == null || streams.Count == 0)
                throw new Exception("Error: no stream to print.");

            var printDocument = new PrintDocument();
            printDocument.DefaultPageSettings = pageSettings;
            if (ConfigurationManager.AppSettings.Get("SetPrinter") == "true")
            {
               printDocument.PrinterSettings.PrinterName = ConfigurationManager.AppSettings.Get("PrinterName");
            }
            if (!printDocument.PrinterSettings.IsValid)
                throw new Exception("Error: cannot find the default printer.");
            else
            {
                printDocument.PrintPage += (sender, e) =>
                {
                    Metafile pageImage = new Metafile(streams[currentPageIndex]);
                    Rectangle adjustedRect = new Rectangle(
                        e.PageBounds.Left - (int)e.PageSettings.HardMarginX,
                        e.PageBounds.Top - (int)e.PageSettings.HardMarginY,
                        e.PageBounds.Width,
                        e.PageBounds.Height);
                    e.Graphics.FillRectangle(Brushes.White, adjustedRect);
                    e.Graphics.DrawImage(pageImage, adjustedRect);
                    currentPageIndex++;
                    e.HasMorePages = (currentPageIndex < streams.Count);
                    e.Graphics.DrawRectangle(Pens.White, adjustedRect);
                };
                printDocument.EndPrint += (Sender, e) =>
                {
                    if (streams != null)
                    {
                        foreach (Stream stream in streams)
                            stream.Close();
                        streams = null;
                    }
                };
                printDocument.Print();
            }
        }
    }
}
