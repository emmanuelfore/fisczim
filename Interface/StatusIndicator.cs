using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    public enum ConnectionStatus
    {
        Unknown,
        Online,
        Offline,
        Error
    }

    public static class StatusIndicator
    {
        private static Icon _baseIcon = null;

        private static Icon GetBaseIcon()
        {
            if (_baseIcon == null)
            {
                try
                {
                    _baseIcon = AppBranding.CreateIcon() ?? SystemIcons.Application;
                }
                catch { _baseIcon = SystemIcons.Application; }
            }
            return _baseIcon;
        }

        public static Icon CreateStatusIcon(ConnectionStatus status)
        {
            Icon baseIco = GetBaseIcon();
            Bitmap bmp = baseIco.ToBitmap();

            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;

                Color dotColor;
                switch (status)
                {
                    case ConnectionStatus.Online: dotColor = Color.FromArgb(50, 210, 90); break;
                    case ConnectionStatus.Offline: dotColor = Color.FromArgb(255, 185, 0); break;
                    case ConnectionStatus.Error: dotColor = Color.FromArgb(220, 50, 50); break;
                    default: dotColor = Color.Silver; break;
                }

                int dotSize = 8;
                int x = bmp.Width - dotSize - 1;
                int y = bmp.Height - dotSize - 1;

                // White border
                using (SolidBrush borderBrush = new SolidBrush(Color.White))
                {
                    g.FillEllipse(borderBrush, x - 1, y - 1, dotSize + 2, dotSize + 2);
                }

                // Colored dot
                using (SolidBrush mainBrush = new SolidBrush(dotColor))
                {
                    g.FillEllipse(mainBrush, x, y, dotSize, dotSize);
                }
            }

            IntPtr hIcon = bmp.GetHicon();
            return Icon.FromHandle(hIcon);
        }

        public static string GetTooltip(ConnectionStatus status, int queueCount)
        {
            var meta = DeviceCacheManager.Current;
            string company = !string.IsNullOrEmpty(meta.CompanyName) ? meta.CompanyName : "FiscalStack";
            string devId = !string.IsNullOrEmpty(meta.DeviceId) ? meta.DeviceId : "N/A";
            string day = !string.IsNullOrEmpty(meta.FiscalDay) ? meta.FiscalDay : "1";

            string statusStr = status == ConnectionStatus.Online ? "Online" : (status == ConnectionStatus.Offline ? "Offline (" + queueCount + ")" : "Config Error");

            string tooltip = string.Format("{0} [{1}]\nDev: {2} | Day: {3}", company, statusStr, devId, day);
            if (tooltip.Length > 63)
            {
                tooltip = tooltip.Substring(0, 60) + "...";
            }
            return tooltip;
        }

        public static void Apply(NotifyIcon trayIcon, ConnectionStatus status, int queueCount = 0)
        {
            try
            {
                trayIcon.Icon = CreateStatusIcon(status);
                trayIcon.Text = GetTooltip(status, queueCount);
            }
            catch { }
        }
    }
}
