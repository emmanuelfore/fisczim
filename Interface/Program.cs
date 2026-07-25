using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
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
                Application.Run(new Wizard());


            }
            else
            {

                /*RevMaxInterfaceWizard form = new RevMaxInterfaceWizard();
                form.WindowState = FormWindowState.Normal;
                form.ShowInTaskbar = true;
                Application.Run(form);*/

                RevMaxInterfaceWizard form = new RevMaxInterfaceWizard();
                form.WindowState = FormWindowState.Minimized;
                form.ShowInTaskbar = false;
                Application.Run();

            }

        }
    }
}
