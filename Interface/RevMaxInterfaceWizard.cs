using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Configuration;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    public partial class Wizard : Form
    {
        public Wizard()
        {
            InitializeComponent();
        }

        public void addToConfig(string key, string value)
        {
            Configuration config = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
            config.AppSettings.Settings.Remove(key);
            config.AppSettings.Settings.Add(key, value);
            config.Save(ConfigurationSaveMode.Modified);
            ConfigurationManager.RefreshSection("appSettings");
        }
        private void button1_Click(object sender, EventArgs e)
        {
            using (var fbd = new FolderBrowserDialog())
            {
                DialogResult result = fbd.ShowDialog();

                if (result == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    addToConfig("SourceFolder", fbd.SelectedPath.ToString());
                    lblSourceFolder.Text = fbd.SelectedPath.ToString();
                    lblSourceFolder.Visible = true;
                    lblSourceFolder.Enabled = true;
                }
            }
        }

        private void button2_Click(object sender, EventArgs e)
        {
            using (var fbd = new FolderBrowserDialog())
            {
                DialogResult result = fbd.ShowDialog();

                if (result == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    addToConfig("TargetFolder", fbd.SelectedPath.ToString());
                    lblTargetFolder.Text = fbd.SelectedPath.ToString();
                    lblTargetFolder.Visible = true;
                    lblTargetFolder.Enabled = true;
                }
            }
        }

        private void txtTaxSymbol_TextChanged(object sender, EventArgs e)
        {
            addToConfig("TaxSymbol", txtTaxSymbol.Text);

        }

        private void txtNonTaxSymbol_TextChanged(object sender, EventArgs e)
        {
            addToConfig("NonTaxSymbol", txtNonTaxSymbol.Text);
        }

        private void txtStartLine_TextChanged(object sender, EventArgs e)
        {
            addToConfig("ProductStartLine", txtStartLine.Text);
        }

        private void txtEndLine_TextChanged(object sender, EventArgs e)
        {
            addToConfig("ProductEndLine", txtEndLine.Text);
        }

        private void txtVat_TextChanged(object sender, EventArgs e)
        {
            addToConfig("InvoiceTaxAmount", txtVat.Text.ToString());
        }

        private void txtAmount_TextChanged(object sender, EventArgs e)
        {
            addToConfig("InvoiceAmount", txtAmount.Text.ToString());

        }

        private void txtInvoiceNo_TextChanged(object sender, EventArgs e)
        {
            addToConfig("InvoiceNumber", txtInvoiceNo.Text.ToString());
        }

        private void cbAmount_SelectedIndexChanged(object sender, EventArgs e)
        {
            addToConfig("ColumnAmountIndex", cbAmount.SelectedIndex.ToString());
        }

        private void cbPrice_SelectedIndexChanged(object sender, EventArgs e)
        {
            addToConfig("ColumnPriceIndex", cbPrice.SelectedIndex.ToString());
        }

        private void cbQuantity_SelectedIndexChanged(object sender, EventArgs e)
        {
            addToConfig("ColumnQuantityIndex", cbQuantity.SelectedIndex.ToString());
        }

        private void btnLogo_Click(object sender, EventArgs e)
        {
            OpenFileDialog openFileDialog1 = new OpenFileDialog();

            openFileDialog1.InitialDirectory = "C:\\";
            openFileDialog1.Filter = "PNG files (*.png)|*.png|All files (*.*)|*.*";
            openFileDialog1.FilterIndex = 2;
            openFileDialog1.RestoreDirectory = true;

            if (openFileDialog1.ShowDialog() == DialogResult.OK)
            {
                var path = openFileDialog1.FileName;
                addToConfig("LogoFile", path.ToString());
                lblLogo.Text = path.ToString();
                lblLogo.Visible = true;
                lblLogo.Enabled = true;

            }
        }

        private void cbDots_SelectedIndexChanged(object sender, EventArgs e)
        {
            addToConfig("ItemDotCounter", cbDots.SelectedIndex.ToString());
        }

        private void comboBox2_SelectedIndexChanged(object sender, EventArgs e)
        {
            addToConfig("MultiLineProduct", cbLines.SelectedIndex.ToString());

        }

        private void advancedWizard1_Finish(object sender, EventArgs e)
        {
            if (MessageBox.Show("Complete RevMax Interface Setup ?", "Confirmation", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button1) == DialogResult.Yes)
            {
                this.Close();
            }
             addToConfig("Trained", "1");
        }

        private void advancedWizard1_Cancel(object sender, EventArgs e)
        {
            if (MessageBox.Show("Do you wish to cancel this setup ?", "Confirmation", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button1) == DialogResult.Yes)
            {
                Application.Exit();
            }
        }

        private void btnAdd_Click(object sender, EventArgs e)
        {
            //Create the dynamic TextBox.
            TextBox textbox = new TextBox();
            int count = panelCurrency.Controls.OfType<TextBox>().ToList().Count / 2;
            textbox.Location = new System.Drawing.Point(10, 25 * count);
            textbox.Size = new System.Drawing.Size(90, 20);
            textbox.Name = "txt_" + (count + 1);
            textbox.Text = "Currency Name";
            textbox.GotFocus += RemoveText;
            panelCurrency.Controls.Add(textbox);


            TextBox textbox1 = new TextBox();
            textbox1.Location = new System.Drawing.Point(105, 25 * count);
            textbox1.Size = new System.Drawing.Size(90, 20);
            textbox1.Name = "txt_" + (count + 1) + "a";
            textbox1.Text = "Keyword";
            textbox1.GotFocus += RemoveText;
            panelCurrency.Controls.Add(textbox1);

            //Create the dynamic Button to remove the TextBox.
            Button button = new Button();
            button.Location = new System.Drawing.Point(180, 25 * count);
            button.Size = new System.Drawing.Size(60, 20);
            button.Name = "btnDelete_" + (count + 1);
            button.Text = "Delete";
            button.Click += new System.EventHandler(this.btnDelete_Click);
           // panelCurrency.Controls.Add(button);
        }

        private void RemoveText(object sender, EventArgs e)
        {
            TextBox textbox = (sender as TextBox);
            if (textbox.Text == "Currency Name")
            {
                textbox.Text = "";
            }
            else if (textbox.Text == "Keyword")
            {
                textbox.Text = "";
            }
        }

        private void btnDelete_Click(object sender, EventArgs e)
        {
            //Reference the Button which was clicked.
            Button button = (sender as Button);

            //Determine the Index of the Button.
            int index = int.Parse(button.Name.Split('_')[1]);

            //Find the TextBox using Index and remove it.
            panelCurrency.Controls.Remove(panelCurrency.Controls.Find("txt_" + index, true)[0]);
            panelCurrency.Controls.Remove(panelCurrency.Controls.Find("txt_" + index + "a", true)[0]);


            //Remove the Button.
            panelCurrency.Controls.Remove(button);

            //Rearranging the Location controls.
            foreach (Button btn in panelCurrency.Controls.OfType<Button>())
            {
                int controlIndex = int.Parse(btn.Name.Split('_')[1]);
                if (controlIndex > index)
                {
                    TextBox txt = (TextBox)panelCurrency.Controls.Find("txt_" + controlIndex, true)[0];
                    TextBox txt1 = (TextBox)panelCurrency.Controls.Find("txt_" + controlIndex + "a", true)[0];
                    btn.Top = btn.Top - 25;
                    txt.Top = txt.Top - 25;
                    txt1.Top = txt1.Top - 25;
                }
            }
        }

        private void Wizard_Load(object sender, EventArgs e)
        {

        }

        private void advancedWizardPage1_Paint(object sender, PaintEventArgs e)
        {

        }

        private void btnFinish_Click(object sender, EventArgs e)
        {
            StringBuilder currencies = new StringBuilder();
            currencies.Append("<CurrencyTags>");
            int count = panelCurrency.Controls.OfType<TextBox>().ToList().Count / 2;
            /*            MessageBox.Show(count.ToString());
            */
            for (int i = 0; i < count; i++)
            {
                currencies.Append("<currency>");
                currencies.Append($"<keyword>{((TextBox)panelCurrency.Controls["txt_" + (i + 1) + "a".ToString()]).Text}</keyword>");
                currencies.Append($"<Name>{((TextBox)panelCurrency.Controls["txt_" + (i + 1).ToString()]).Text}</Name>");
                currencies.Append("</currency>");
                

/*                MessageBox.Show($"{((TextBox)panelCurrency.Controls["txt_" + (i + 1).ToString()]).Text} {((TextBox)panelCurrency.Controls["txt_" + (i + 1) + "a".ToString()]).Text}");
*/            }

            currencies.Append("</CurrencyTags>");
            //MessageBox.Show(currencies.ToString());
            try
            {
                File.WriteAllText(AppDomain.CurrentDomain.BaseDirectory.ToString() + "CurConf.interface", currencies.ToString());

            }
            catch (Exception)
            {

                MessageBox.Show("Failed to write Currency file");
            }


        }

        private void btnReset_Click(object sender, EventArgs e)
        {

            foreach (var item in panelCurrency.Controls.OfType<TextBox>().ToList())
            {
                panelCurrency.Controls.Remove(item);
            }
        }

        private void cbVatFlag_SelectedIndexChanged(object sender, EventArgs e)
        {
            addToConfig("VatFlag", cbVatFlag.SelectedIndex.ToString());

        }

      
    }
}
