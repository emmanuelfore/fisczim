using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    internal static class AppBranding
    {
        private const string IconFileName = "fiscalstack.ico";
        private static Icon _icon;

        public static void ApplyIcon(Form form, NotifyIcon notifyIcon = null)
        {
            try
            {
                Icon icon = CreateIcon();
                if (icon == null) return;

                if (form != null) form.Icon = icon;
                if (notifyIcon != null) notifyIcon.Icon = CreateIcon();
            }
            catch
            {
                // Icon loading should never prevent the interface from opening.
            }
        }

        public static Icon CreateIcon()
        {
            Icon icon = GetIcon();
            return icon != null ? (Icon)icon.Clone() : null;
        }

        private static Icon GetIcon()
        {
            if (_icon != null) return _icon;

            string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string[] candidates =
            {
                Path.Combine(baseDirectory, IconFileName),
                Path.Combine(baseDirectory, "Resources", IconFileName),
                Path.Combine(baseDirectory, "..", "..", "Resources", IconFileName)
            };

            foreach (string candidate in candidates)
            {
                string fullPath = Path.GetFullPath(candidate);
                if (File.Exists(fullPath))
                {
                    _icon = new Icon(fullPath);
                    return _icon;
                }
            }

            return SystemIcons.Application;
        }
    }
}
