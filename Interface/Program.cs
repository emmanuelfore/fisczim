using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace FiscalStack
{
    internal static class Program
    {
        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (ConfigurationManager.AppSettings.Get("Trained") == "0")
            {
                Application.Run(new FiscalStackInterfaceWizard());


            }
            else
            {
                // FiscalStack: launch the main form visibly in a normal window
                FiscalStackInterfaceWizard form = new FiscalStackInterfaceWizard();
                form.WindowState = FormWindowState.Normal;
                form.ShowInTaskbar = true;
                Application.Run(form);
            }

        }
    }
}
