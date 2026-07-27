using System;
using System.Collections.Generic;
using System.Configuration;
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
            AppBranding.ApplyIcon(this);

            // These labels are referenced by legacy browse buttons but live in textboxes now
            lblSourceFolder = new System.Windows.Forms.Label { Visible = false };
            lblTargetFolder = new System.Windows.Forms.Label { Visible = false };
            this.Controls.Add(lblSourceFolder);
            this.Controls.Add(lblTargetFolder);

            LoadCurrentSettings();
        }

        // ── Load existing config values into all fields ─────────────────────
        private void LoadCurrentSettings()
        {
            try
            {
                txtApiKey.Text = ConfigurationManager.AppSettings.Get("ApiKey") ?? "";
                txtEndpoint.Text = ConfigurationManager.AppSettings.Get("ApiEndpoint") ?? "https://fiscalstack.co.zw/api/v1/";
                txtSourcePath.Text = ConfigurationManager.AppSettings.Get("SourceFolder") ?? "";
                txtTargetPath.Text = ConfigurationManager.AppSettings.Get("TargetFolder") ?? "";
                txtLogoPath.Text = ConfigurationManager.AppSettings.Get("LogoFile") ?? "";
                txtTaxSymbol.Text = ConfigurationManager.AppSettings.Get("TaxSymbol") ?? "";
                txtNonTaxSymbol.Text = ConfigurationManager.AppSettings.Get("NonTaxSymbol") ?? "";
                txtStartLine.Text = ConfigurationManager.AppSettings.Get("ProductStartLine") ?? "";
                txtEndLine.Text = ConfigurationManager.AppSettings.Get("ProductEndLine") ?? "";
                txtVat.Text = ConfigurationManager.AppSettings.Get("InvoiceTaxAmount") ?? "";
                txtAmount.Text = ConfigurationManager.AppSettings.Get("InvoiceAmount") ?? "";
                txtInvoiceNo.Text = ConfigurationManager.AppSettings.Get("InvoiceNumber") ?? "";

                string autoClose = ConfigurationManager.AppSettings.Get("AutoCloseTime") ?? "";
                txtAutoCloseTime.Text = autoClose;
                chkEnableScheduler.Checked = !string.IsNullOrEmpty(autoClose);

                // Templates
                string tpl = ConfigurationManager.AppSettings.Get("ReceiptTemplate");
                if (string.IsNullOrEmpty(tpl)) cbTemplate.SelectedIndex = 0;
                else cbTemplate.SelectedItem = tpl;
                
                // Printers
                cbPrinter.Items.Clear();
                foreach (string printer in System.Drawing.Printing.PrinterSettings.InstalledPrinters)
                {
                    cbPrinter.Items.Add(printer);
                }
                string savedPrinter = ConfigurationManager.AppSettings.Get("TargetPrinter");
                if (!string.IsNullOrEmpty(savedPrinter) && cbPrinter.Items.Contains(savedPrinter))
                {
                    cbPrinter.SelectedItem = savedPrinter;
                }
                else if (cbPrinter.Items.Count > 0)
                {
                    cbPrinter.SelectedIndex = 0;
                }

                // Accent Color
                string color = ConfigurationManager.AppSettings.Get("AccentColor");
                txtAccentColor.Text = !string.IsNullOrEmpty(color) ? color : "#3355FF";

                TrySelectCombo(cbAmount, ConfigurationManager.AppSettings.Get("ColumnAmountIndex"));
                TrySelectCombo(cbPrice, ConfigurationManager.AppSettings.Get("ColumnPriceIndex"));
                TrySelectCombo(cbQuantity, ConfigurationManager.AppSettings.Get("ColumnQuantityIndex"));
                TrySelectCombo(cbVatFlag, ConfigurationManager.AppSettings.Get("VatFlag"));
                TrySelectCombo(cbDots, ConfigurationManager.AppSettings.Get("ItemDotCounter"));
                TrySelectCombo(cbLines, ConfigurationManager.AppSettings.Get("MultiLineProduct"));
            }
            catch { }
        }

        private void TrySelectCombo(ComboBox cb, string val)
        {
            if (string.IsNullOrEmpty(val)) return;
            int idx;
            if (int.TryParse(val, out idx) && idx < cb.Items.Count) cb.SelectedIndex = idx;
        }

        // ── Config save helper ──────────────────────────────────────────────
        public void addToConfig(string key, string value)
        {
            Configuration config = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
            config.AppSettings.Settings.Remove(key);
            config.AppSettings.Settings.Add(key, value);
            config.Save(ConfigurationSaveMode.Modified);
            ConfigurationManager.RefreshSection("appSettings");
        }

        private void ShowStatus(string msg, bool ok = true)
        {
            lblStatus.Text = msg;
            lblStatus.ForeColor = ok
                ? System.Drawing.Color.FromArgb(30, 170, 80)
                : System.Drawing.Color.FromArgb(200, 50, 50);
        }

        // ══════════════════════════════════════════════════════════════════
        // TAB 1 — API handlers
        // ══════════════════════════════════════════════════════════════════
        private void btnSaveApi_Click(object sender, EventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(txtApiKey.Text))
                addToConfig("ApiKey", txtApiKey.Text.Trim());
            if (!string.IsNullOrWhiteSpace(txtEndpoint.Text))
                addToConfig("ApiEndpoint", txtEndpoint.Text.Trim());
            ShowStatus("✔  API settings saved.");
        }

        private async void btnTestConnection_Click(object sender, EventArgs e)
        {
            lblApiStatus.Text = "Testing connection...";
            lblApiStatus.ForeColor = System.Drawing.Color.DimGray;
            btnTestConnection.Enabled = false;

            try
            {
                // Save first so new values are used
                if (!string.IsNullOrWhiteSpace(txtApiKey.Text)) addToConfig("ApiKey", txtApiKey.Text.Trim());
                if (!string.IsNullOrWhiteSpace(txtEndpoint.Text)) addToConfig("ApiEndpoint", txtEndpoint.Text.Trim());

                FiscalStackClient testClient = new FiscalStackClient();
                string result = await testClient.GetDeviceAsync();
                lblApiStatus.Text = "✔  Connected successfully!";
                lblApiStatus.ForeColor = System.Drawing.Color.FromArgb(30, 170, 80);
            }
            catch (Exception ex)
            {
                lblApiStatus.Text = "✘  " + ex.Message;
                lblApiStatus.ForeColor = System.Drawing.Color.FromArgb(200, 50, 50);
            }
            finally
            {
                btnTestConnection.Enabled = true;
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // TAB 2 — Folder handlers
        // ══════════════════════════════════════════════════════════════════
        private void button1_Click(object sender, EventArgs e)
        {
            using (var fbd = new FolderBrowserDialog())
            {
                if (fbd.ShowDialog() == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    txtSourcePath.Text = fbd.SelectedPath;
                    lblSourceFolder.Text = fbd.SelectedPath;
                    addToConfig("SourceFolder", fbd.SelectedPath);
                }
            }
        }

        private void button2_Click(object sender, EventArgs e)
        {
            using (var fbd = new FolderBrowserDialog())
            {
                if (fbd.ShowDialog() == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    txtTargetPath.Text = fbd.SelectedPath;
                    lblTargetFolder.Text = fbd.SelectedPath;
                    addToConfig("TargetFolder", fbd.SelectedPath);
                }
            }
        }

        private void btnBrowseLogo_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog ofd = new OpenFileDialog())
            {
                ofd.Filter = "PNG files (*.png)|*.png|All files (*.*)|*.*";
                ofd.Title = "Select Company Logo";
                if (ofd.ShowDialog() == DialogResult.OK)
                {
                    txtLogoPath.Text = ofd.FileName;
                    addToConfig("LogoFile", ofd.FileName);
                }
            }
        }

        private void btnSaveFolders_Click(object sender, EventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(txtSourcePath.Text)) addToConfig("SourceFolder", txtSourcePath.Text.Trim());
            if (!string.IsNullOrWhiteSpace(txtTargetPath.Text)) addToConfig("TargetFolder", txtTargetPath.Text.Trim());
            if (!string.IsNullOrWhiteSpace(txtLogoPath.Text)) addToConfig("LogoFile", txtLogoPath.Text.Trim());
            ShowStatus("✔  Folder settings saved.");
        }

        // ══════════════════════════════════════════════════════════════════
        // TAB 3 — Receipt parsing live-save (original behaviour)
        // ══════════════════════════════════════════════════════════════════
        private void txtTaxSymbol_TextChanged(object sender, EventArgs e) { addToConfig("TaxSymbol", txtTaxSymbol.Text); }
        private void txtNonTaxSymbol_TextChanged(object sender, EventArgs e) { addToConfig("NonTaxSymbol", txtNonTaxSymbol.Text); }
        private void txtStartLine_TextChanged(object sender, EventArgs e) { addToConfig("ProductStartLine", txtStartLine.Text); }
        private void txtEndLine_TextChanged(object sender, EventArgs e) { addToConfig("ProductEndLine", txtEndLine.Text); }
        private void txtVat_TextChanged(object sender, EventArgs e) { addToConfig("InvoiceTaxAmount", txtVat.Text); }
        private void txtAmount_TextChanged(object sender, EventArgs e) { addToConfig("InvoiceAmount", txtAmount.Text); }
        private void txtInvoiceNo_TextChanged(object sender, EventArgs e) { addToConfig("InvoiceNumber", txtInvoiceNo.Text); }
        private void cbAmount_SelectedIndexChanged(object sender, EventArgs e) { addToConfig("ColumnAmountIndex", cbAmount.SelectedIndex.ToString()); }
        private void cbPrice_SelectedIndexChanged(object sender, EventArgs e) { addToConfig("ColumnPriceIndex", cbPrice.SelectedIndex.ToString()); }
        private void cbQuantity_SelectedIndexChanged(object sender, EventArgs e) { addToConfig("ColumnQuantityIndex", cbQuantity.SelectedIndex.ToString()); }
        private void cbVatFlag_SelectedIndexChanged(object sender, EventArgs e) { addToConfig("VatFlag", cbVatFlag.SelectedIndex.ToString()); }
        private void cbDots_SelectedIndexChanged(object sender, EventArgs e) { addToConfig("ItemDotCounter", cbDots.SelectedIndex.ToString()); }
        private void comboBox2_SelectedIndexChanged(object sender, EventArgs e) { addToConfig("MultiLineProduct", cbLines.SelectedIndex.ToString()); }

        private void btnAutoTrain_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog ofd = new OpenFileDialog())
            {
                ofd.Filter = "Text Files (*.txt)|*.txt|All Files (*.*)|*.*";
                ofd.Title = "Select a Sample POS Receipt";
                
                if (ofd.ShowDialog() == DialogResult.OK)
                {
                    try
                    {
                        var trainer = new AutoTrainerService();
                        var result = trainer.AnalyzeReceipt(ofd.FileName);
                        
                        // Populate UI
                        txtStartLine.Text = result.ProductStartLine;
                        txtEndLine.Text = result.ProductEndLine;
                        txtInvoiceNo.Text = result.InvoiceNumberKeyword;
                        txtAmount.Text = result.TotalAmountKeyword;
                        txtVat.Text = result.VatAmountKeyword;
                        txtTaxSymbol.Text = result.TaxSymbol;
                        
                        TrySelectCombo(cbQuantity, result.ColumnQuantityIndex.ToString());
                        TrySelectCombo(cbPrice, result.ColumnPriceIndex.ToString());
                        TrySelectCombo(cbAmount, result.ColumnAmountIndex.ToString());
                        TrySelectCombo(cbDots, result.ItemDotCounter.ToString());
                        
                        ShowStatus("✔  Auto-Train complete! Please review the values and Save.", true);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Failed to analyze receipt: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void btnSaveReceipt_Click(object sender, EventArgs e)
        {
            ShowStatus("✔  Receipt parsing settings saved.");
        }

        // ════════════════════════════════════════════════════════════════
        // TAB X — Templates handlers
        // ════════════════════════════════════════════════════════════════
        private void UpdateTemplatePreview(object sender, EventArgs e)
        {
            try
            {
                string template = cbTemplate.SelectedItem != null ? cbTemplate.SelectedItem.ToString() : "Receipt80";
                string color = !string.IsNullOrWhiteSpace(txtAccentColor.Text) ? txtAccentColor.Text.Trim() : "#3355FF";
                
                string html = TemplateEngine.GenerateHtml(null, template, color, null);
                if (webBrowserPreview != null)
                {
                    webBrowserPreview.DocumentText = html;
                }
            }
            catch { }
        }

        private void btnSaveTemplates_Click(object sender, EventArgs e)
        {
            if (cbTemplate.SelectedItem != null) addToConfig("ReceiptTemplate", cbTemplate.SelectedItem.ToString());
            if (cbPrinter.SelectedItem != null) addToConfig("TargetPrinter", cbPrinter.SelectedItem.ToString());
            if (!string.IsNullOrWhiteSpace(txtAccentColor.Text)) addToConfig("AccentColor", txtAccentColor.Text.Trim());
            ShowStatus("✔  Template, Color and Printer settings saved.");
            UpdateTemplatePreview(null, null);
        }

        // ══════════════════════════════════════════════════════════════════
        // TAB 4 — Currency handlers
        // ══════════════════════════════════════════════════════════════════
        private void btnAdd_Click(object sender, EventArgs e)
        {
            int count = panelCurrency.Controls.OfType<TextBox>().ToList().Count / 2;
            int rowY = 10 + count * 32;

            TextBox txtName = new TextBox();
            txtName.Location = new System.Drawing.Point(10, rowY);
            txtName.Size = new System.Drawing.Size(160, 24);
            txtName.Name = "txt_" + (count + 1);
            txtName.Font = new System.Drawing.Font("Segoe UI", 9F);
            txtName.Text = "Currency Name";
            txtName.ForeColor = System.Drawing.Color.Gray;
            txtName.GotFocus += RemoveText;
            panelCurrency.Controls.Add(txtName);

            TextBox txtKeyword = new TextBox();
            txtKeyword.Location = new System.Drawing.Point(180, rowY);
            txtKeyword.Size = new System.Drawing.Size(160, 24);
            txtKeyword.Name = "txt_" + (count + 1) + "a";
            txtKeyword.Font = new System.Drawing.Font("Segoe UI", 9F);
            txtKeyword.Text = "Keyword";
            txtKeyword.ForeColor = System.Drawing.Color.Gray;
            txtKeyword.GotFocus += RemoveText;
            panelCurrency.Controls.Add(txtKeyword);

            Button btnDel = new Button();
            btnDel.Location = new System.Drawing.Point(350, rowY);
            btnDel.Size = new System.Drawing.Size(60, 24);
            btnDel.Name = "btnDelete_" + (count + 1);
            btnDel.Text = "✕";
            btnDel.FlatStyle = FlatStyle.Flat;
            btnDel.BackColor = System.Drawing.Color.FromArgb(220, 225, 240);
            btnDel.ForeColor = System.Drawing.Color.FromArgb(50, 50, 80);
            btnDel.Click += new EventHandler(this.btnDelete_Click);
            panelCurrency.Controls.Add(btnDel);
        }

        private void RemoveText(object sender, EventArgs e)
        {
            TextBox tb = sender as TextBox;
            if (tb == null) return;
            if (tb.Text == "Currency Name" || tb.Text == "Keyword")
            {
                tb.Text = "";
                tb.ForeColor = System.Drawing.Color.Black;
            }
        }

        private void btnDelete_Click(object sender, EventArgs e)
        {
            Button btn = sender as Button;
            if (btn == null) return;
            int index = int.Parse(btn.Name.Split('_')[1]);
            var txtN = panelCurrency.Controls.Find("txt_" + index, true);
            var txtK = panelCurrency.Controls.Find("txt_" + index + "a", true);
            if (txtN.Length > 0) panelCurrency.Controls.Remove(txtN[0]);
            if (txtK.Length > 0) panelCurrency.Controls.Remove(txtK[0]);
            panelCurrency.Controls.Remove(btn);

            foreach (Button b in panelCurrency.Controls.OfType<Button>())
            {
                int ci = int.Parse(b.Name.Split('_')[1]);
                if (ci > index)
                {
                    var tn = panelCurrency.Controls.Find("txt_" + ci, true);
                    var tk = panelCurrency.Controls.Find("txt_" + ci + "a", true);
                    if (tn.Length > 0) tn[0].Top -= 32;
                    if (tk.Length > 0) tk[0].Top -= 32;
                    b.Top -= 32;
                }
            }
        }

        private void btnFinish_Click(object sender, EventArgs e)
        {
            StringBuilder currencies = new StringBuilder();
            currencies.Append("<CurrencyTags>");
            int count = panelCurrency.Controls.OfType<TextBox>().ToList().Count / 2;
            for (int i = 0; i < count; i++)
            {
                var nCtrl = panelCurrency.Controls.Find("txt_" + (i + 1), true);
                var kCtrl = panelCurrency.Controls.Find("txt_" + (i + 1) + "a", true);
                if (nCtrl.Length == 0 || kCtrl.Length == 0) continue;
                currencies.Append("<currency>");
                currencies.Append("<keyword>" + ((TextBox)kCtrl[0]).Text + "</keyword>");
                currencies.Append("<Name>" + ((TextBox)nCtrl[0]).Text + "</Name>");
                currencies.Append("</currency>");
            }
            currencies.Append("</CurrencyTags>");

            try
            {
                File.WriteAllText(AppDomain.CurrentDomain.BaseDirectory + "CurConf.interface", currencies.ToString());
                ShowStatus("✔  Currency config saved.");
            }
            catch
            {
                ShowStatus("✘  Failed to write currency file.", false);
            }
        }

        private void btnReset_Click(object sender, EventArgs e)
        {
            foreach (var ctrl in panelCurrency.Controls.Cast<System.Windows.Forms.Control>().ToList())
                panelCurrency.Controls.Remove(ctrl);
        }

        // ══════════════════════════════════════════════════════════════════
        // TAB 5 — Scheduler handlers
        // ══════════════════════════════════════════════════════════════════
        private void chkEnableScheduler_CheckedChanged(object sender, EventArgs e)
        {
            txtAutoCloseTime.Enabled = chkEnableScheduler.Checked;
            if (!chkEnableScheduler.Checked)
            {
                addToConfig("AutoCloseTime", "");
            }
        }

        private void btnSaveScheduler_Click(object sender, EventArgs e)
        {
            if (chkEnableScheduler.Checked)
            {
                string t = txtAutoCloseTime.Text.Trim();
                TimeSpan ts;
                if (!TimeSpan.TryParseExact(t, "hh\\:mm", null, out ts))
                {
                    MessageBox.Show("Please enter a valid time in HH:mm format (e.g. 23:30)", "Invalid Time",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                addToConfig("AutoCloseTime", t);
                ShowStatus("✔  Scheduler set for " + t + " daily.");
            }
            else
            {
                addToConfig("AutoCloseTime", "");
                ShowStatus("✔  Scheduler disabled.");
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // Bottom bar
        // ══════════════════════════════════════════════════════════════════
        private void btnSaveAll_Click(object sender, EventArgs e)
        {
            // Save API
            if (!string.IsNullOrWhiteSpace(txtApiKey.Text)) addToConfig("ApiKey", txtApiKey.Text.Trim());
            if (!string.IsNullOrWhiteSpace(txtEndpoint.Text)) addToConfig("ApiEndpoint", txtEndpoint.Text.Trim());
            // Save Folders
            if (!string.IsNullOrWhiteSpace(txtSourcePath.Text)) addToConfig("SourceFolder", txtSourcePath.Text.Trim());
            if (!string.IsNullOrWhiteSpace(txtTargetPath.Text)) addToConfig("TargetFolder", txtTargetPath.Text.Trim());
            if (!string.IsNullOrWhiteSpace(txtLogoPath.Text)) addToConfig("LogoFile", txtLogoPath.Text.Trim());
            // Save Scheduler
            if (chkEnableScheduler.Checked && !string.IsNullOrWhiteSpace(txtAutoCloseTime.Text))
                addToConfig("AutoCloseTime", txtAutoCloseTime.Text.Trim());
            addToConfig("Trained", "1");
            ShowStatus("✔  All settings saved successfully.");
            System.Threading.Thread.Sleep(600);
            this.Close();
        }

        private void btnCloseWizard_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        // ══════════════════════════════════════════════════════════════════
        // Legacy wizard events (no-ops now)
        // ══════════════════════════════════════════════════════════════════
        private void advancedWizard1_Finish(object sender, EventArgs e) { }
        private void advancedWizard1_Cancel(object sender, EventArgs e) { }
        private void Wizard_Load(object sender, EventArgs e) { }
        private void advancedWizardPage1_Paint(object sender, System.Windows.Forms.PaintEventArgs e) { }
        private void btnLogo_Click(object sender, EventArgs e) { btnBrowseLogo_Click(sender, e); }
    }
}
