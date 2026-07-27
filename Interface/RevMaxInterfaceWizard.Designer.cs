namespace Revmax_Interface_Promun
{
    partial class Wizard
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.panelHeader = new System.Windows.Forms.Panel();
            this.lblLogo = new System.Windows.Forms.Label();
            this.lblSubtitle = new System.Windows.Forms.Label();
            this.tabControl = new System.Windows.Forms.TabControl();
            this.tabApi = new System.Windows.Forms.TabPage();
            this.tabFolders = new System.Windows.Forms.TabPage();
            this.tabReceipt = new System.Windows.Forms.TabPage();
            this.tabTemplates = new System.Windows.Forms.TabPage();
            this.tabCurrencies = new System.Windows.Forms.TabPage();
            this.tabScheduler = new System.Windows.Forms.TabPage();

            // ── API Tab ──
            this.lblApiKeyLabel = new System.Windows.Forms.Label();
            this.txtApiKey = new System.Windows.Forms.TextBox();
            this.lblEndpointLabel = new System.Windows.Forms.Label();
            this.txtEndpoint = new System.Windows.Forms.TextBox();
            this.btnSaveApi = new System.Windows.Forms.Button();
            this.btnTestConnection = new System.Windows.Forms.Button();
            this.lblApiStatus = new System.Windows.Forms.Label();

            // ── Folders Tab ──
            this.lblSourceLabel = new System.Windows.Forms.Label();
            this.txtSourcePath = new System.Windows.Forms.TextBox();
            this.btnBrowseSource = new System.Windows.Forms.Button();
            this.lblTargetLabel = new System.Windows.Forms.Label();
            this.txtTargetPath = new System.Windows.Forms.TextBox();
            this.btnBrowseTarget = new System.Windows.Forms.Button();
            this.lblLogoFileLabel = new System.Windows.Forms.Label();
            this.txtLogoPath = new System.Windows.Forms.TextBox();
            this.btnBrowseLogo = new System.Windows.Forms.Button();
            this.btnSaveFolders = new System.Windows.Forms.Button();

            // ── Receipt Parsing Tab ──
            this.lblTaxSymLabel = new System.Windows.Forms.Label();
            this.txtTaxSymbol = new System.Windows.Forms.TextBox();
            this.lblNonTaxSymLabel = new System.Windows.Forms.Label();
            this.txtNonTaxSymbol = new System.Windows.Forms.TextBox();
            this.lblStartLineLabel = new System.Windows.Forms.Label();
            this.txtStartLine = new System.Windows.Forms.TextBox();
            this.lblEndLineLabel = new System.Windows.Forms.Label();
            this.txtEndLine = new System.Windows.Forms.TextBox();
            this.lblInvoiceAmtLabel = new System.Windows.Forms.Label();
            this.txtAmount = new System.Windows.Forms.TextBox();
            this.lblVatAmtLabel = new System.Windows.Forms.Label();
            this.txtVat = new System.Windows.Forms.TextBox();
            this.lblInvoiceNoLabel = new System.Windows.Forms.Label();
            this.txtInvoiceNo = new System.Windows.Forms.TextBox();
            this.lblColAmtLabel = new System.Windows.Forms.Label();
            this.cbAmount = new System.Windows.Forms.ComboBox();
            this.lblColPriceLabel = new System.Windows.Forms.Label();
            this.cbPrice = new System.Windows.Forms.ComboBox();
            this.lblColQtyLabel = new System.Windows.Forms.Label();
            this.cbQuantity = new System.Windows.Forms.ComboBox();
            this.lblVatFlagLabel = new System.Windows.Forms.Label();
            this.cbVatFlag = new System.Windows.Forms.ComboBox();
            this.lblDotsLabel = new System.Windows.Forms.Label();
            this.cbDots = new System.Windows.Forms.ComboBox();
            this.lblLinesLabel = new System.Windows.Forms.Label();
            this.cbLines = new System.Windows.Forms.ComboBox();
            this.btnSaveReceipt = new System.Windows.Forms.Button();

        // ── Templates Tab ──
            this.lblTemplateLabel = new System.Windows.Forms.Label();
            this.cbTemplate = new System.Windows.Forms.ComboBox();
            this.lblPrinterLabel = new System.Windows.Forms.Label();
            this.cbPrinter = new System.Windows.Forms.ComboBox();
            this.lblColorLabel = new System.Windows.Forms.Label();
            this.txtAccentColor = new System.Windows.Forms.TextBox();
            this.btnSaveTemplates = new System.Windows.Forms.Button();
            
            // ── Currencies Tab ──
            this.panelCurrency = new System.Windows.Forms.Panel();
            this.btnAdd = new System.Windows.Forms.Button();
            this.btnReset = new System.Windows.Forms.Button();
            this.btnSaveCurrencies = new System.Windows.Forms.Button();
            this.lblCurrencyHelp = new System.Windows.Forms.Label();

            // ── Scheduler Tab ──
            this.lblSchedulerLabel = new System.Windows.Forms.Label();
            this.txtAutoCloseTime = new System.Windows.Forms.TextBox();
            this.lblSchedulerHelp = new System.Windows.Forms.Label();
            this.btnSaveScheduler = new System.Windows.Forms.Button();
            this.chkEnableScheduler = new System.Windows.Forms.CheckBox();

            // ── Bottom bar ──
            this.panelBottom = new System.Windows.Forms.Panel();
            this.btnSaveAll = new System.Windows.Forms.Button();
            this.btnClose = new System.Windows.Forms.Button();
            this.lblStatus = new System.Windows.Forms.Label();

            this.panelHeader.SuspendLayout();
            this.tabControl.SuspendLayout();
            this.SuspendLayout();

            // ════════════════════════════════════════════════════════════════
            // Header Panel
            // ════════════════════════════════════════════════════════════════
            this.panelHeader.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.panelHeader.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelHeader.Height = 70;
            this.panelHeader.Controls.Add(this.lblLogo);
            this.panelHeader.Controls.Add(this.lblSubtitle);

            this.lblLogo.AutoSize = true;
            this.lblLogo.Font = new System.Drawing.Font("Segoe UI", 15F, System.Drawing.FontStyle.Bold);
            this.lblLogo.ForeColor = System.Drawing.Color.White;
            this.lblLogo.Location = new System.Drawing.Point(20, 10);
            this.lblLogo.Text = "⚙  FiscalStack — Settings";

            this.lblSubtitle.AutoSize = true;
            this.lblSubtitle.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblSubtitle.ForeColor = System.Drawing.Color.FromArgb(200, 220, 255);
            this.lblSubtitle.Location = new System.Drawing.Point(22, 42);
            this.lblSubtitle.Text = "Configure all aspects of the FiscalStack integration";

            // ════════════════════════════════════════════════════════════════
            // Tab Control
            // ════════════════════════════════════════════════════════════════
            this.tabControl.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tabControl.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.tabControl.Controls.Add(this.tabApi);
            this.tabControl.Controls.Add(this.tabFolders);
            this.tabControl.Controls.Add(this.tabReceipt);
            this.tabControl.Controls.Add(this.tabTemplates);
            this.tabControl.Controls.Add(this.tabCurrencies);
            this.tabControl.Controls.Add(this.tabScheduler);

            // ── Tab styles ──────────────────────────────────────────────────
            System.Drawing.Font tabFont = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular);

            this.tabApi.Text = "🔑  API & Auth";
            this.tabApi.UseVisualStyleBackColor = true;
            this.tabFolders.Text = "📁  Folders";
            this.tabFolders.UseVisualStyleBackColor = true;
            this.tabReceipt.Text = "🧾  Receipt Parsing";
            this.tabReceipt.UseVisualStyleBackColor = true;
            this.tabTemplates.Text = "🎨  Receipt/Invoice Templates";
            this.tabTemplates.UseVisualStyleBackColor = true;
            this.tabCurrencies.Text = "💱  Currencies";
            this.tabCurrencies.UseVisualStyleBackColor = true;
            this.tabScheduler.Text = "⏰  Scheduler";
            this.tabScheduler.UseVisualStyleBackColor = true;

            // ════════════════════════════════════════════════════════════════
            // TAB 1 — API & Auth
            // ════════════════════════════════════════════════════════════════
            int tx = 24; int ty = 20; int tw = 460; int th = 28;

            MakeLabel(this.tabApi, this.lblApiKeyLabel, "FiscalStack API Key:", tx, ty); ty += 24;
            StyleTextBox(this.txtApiKey, tx, ty, tw, th, true);
            this.tabApi.Controls.Add(this.txtApiKey); ty += 40;

            MakeLabel(this.tabApi, this.lblEndpointLabel, "API Endpoint URL:", tx, ty); ty += 24;
            StyleTextBox(this.txtEndpoint, tx, ty, tw, th, false);
            this.tabApi.Controls.Add(this.txtEndpoint); ty += 40;

            StyleButton(this.btnSaveApi, "💾  Save API Settings", tx, ty, 200, 36, false);
            this.tabApi.Controls.Add(this.btnSaveApi);
            this.btnSaveApi.Click += new System.EventHandler(this.btnSaveApi_Click);

            StyleButton(this.btnTestConnection, "🔌  Test Connection", tx + 210, ty, 160, 36, true);
            this.tabApi.Controls.Add(this.btnTestConnection);
            this.btnTestConnection.Click += new System.EventHandler(this.btnTestConnection_Click);
            ty += 50;

            this.lblApiStatus.AutoSize = false;
            this.lblApiStatus.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblApiStatus.ForeColor = System.Drawing.Color.Gray;
            this.lblApiStatus.Location = new System.Drawing.Point(tx, ty);
            this.lblApiStatus.Size = new System.Drawing.Size(tw, 22);
            this.lblApiStatus.Text = "";
            this.tabApi.Controls.Add(this.lblApiStatus);

            // ════════════════════════════════════════════════════════════════
            // TAB 2 — Folders
            // ════════════════════════════════════════════════════════════════
            ty = 20;
            MakeLabel(this.tabFolders, this.lblSourceLabel, "POS Receipt Source Folder:", tx, ty); ty += 24;
            StyleTextBox(this.txtSourcePath, tx, ty, 360, th, false);
            this.tabFolders.Controls.Add(this.txtSourcePath);
            StyleButton(this.btnBrowseSource, "Browse", tx + 368, ty, 90, th, false);
            this.tabFolders.Controls.Add(this.btnBrowseSource);
            this.btnBrowseSource.Click += new System.EventHandler(this.button1_Click);
            ty += 40;

            MakeLabel(this.tabFolders, this.lblTargetLabel, "Output Target Folder:", tx, ty); ty += 24;
            StyleTextBox(this.txtTargetPath, tx, ty, 360, th, false);
            this.tabFolders.Controls.Add(this.txtTargetPath);
            StyleButton(this.btnBrowseTarget, "Browse", tx + 368, ty, 90, th, false);
            this.tabFolders.Controls.Add(this.btnBrowseTarget);
            this.btnBrowseTarget.Click += new System.EventHandler(this.button2_Click);
            ty += 40;

            MakeLabel(this.tabFolders, this.lblLogoFileLabel, "Company Logo File (PNG):", tx, ty); ty += 24;
            StyleTextBox(this.txtLogoPath, tx, ty, 360, th, false);
            this.tabFolders.Controls.Add(this.txtLogoPath);
            StyleButton(this.btnBrowseLogo, "Browse", tx + 368, ty, 90, th, false);
            this.tabFolders.Controls.Add(this.btnBrowseLogo);
            this.btnBrowseLogo.Click += new System.EventHandler(this.btnBrowseLogo_Click);
            ty += 46;

            StyleButton(this.btnSaveFolders, "💾  Save Folder Settings", tx, ty, 220, 36, false);
            this.tabFolders.Controls.Add(this.btnSaveFolders);
            this.btnSaveFolders.Click += new System.EventHandler(this.btnSaveFolders_Click);

            // ════════════════════════════════════════════════════════════════
            // TAB 3 — Receipt Parsing (2-column grid)
            // ════════════════════════════════════════════════════════════════
            ty = 16; int col1 = tx; int col2 = 260; int fw = 180;

            this.tabReceipt.AutoScroll = true;

            // Auto-Train Button
            this.btnAutoTrain = new System.Windows.Forms.Button();
            StyleButton(this.btnAutoTrain, "🪄  Auto-Train from Sample Receipt", col1, ty, 300, 36, false);
            this.btnAutoTrain.BackColor = System.Drawing.Color.FromArgb(40, 167, 69); // Green accent
            this.tabReceipt.Controls.Add(this.btnAutoTrain);
            this.btnAutoTrain.Click += new System.EventHandler(this.btnAutoTrain_Click);
            ty += 50;

            MakeLabel(this.tabReceipt, this.lblTaxSymLabel, "Tax Symbol:", col1, ty);
            StyleTextBox(this.txtTaxSymbol, col1, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtTaxSymbol);
            this.txtTaxSymbol.TextChanged += new System.EventHandler(this.txtTaxSymbol_TextChanged);

            MakeLabel(this.tabReceipt, this.lblNonTaxSymLabel, "Non-Tax Symbol:", col2, ty);
            StyleTextBox(this.txtNonTaxSymbol, col2, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtNonTaxSymbol);
            this.txtNonTaxSymbol.TextChanged += new System.EventHandler(this.txtNonTaxSymbol_TextChanged);
            ty += 60;

            MakeLabel(this.tabReceipt, this.lblStartLineLabel, "Product Start Line:", col1, ty);
            StyleTextBox(this.txtStartLine, col1, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtStartLine);
            this.txtStartLine.TextChanged += new System.EventHandler(this.txtStartLine_TextChanged);

            MakeLabel(this.tabReceipt, this.lblEndLineLabel, "Product End Line:", col2, ty);
            StyleTextBox(this.txtEndLine, col2, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtEndLine);
            this.txtEndLine.TextChanged += new System.EventHandler(this.txtEndLine_TextChanged);
            ty += 60;

            MakeLabel(this.tabReceipt, this.lblInvoiceNoLabel, "Invoice Number Keyword:", col1, ty);
            StyleTextBox(this.txtInvoiceNo, col1, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtInvoiceNo);
            this.txtInvoiceNo.TextChanged += new System.EventHandler(this.txtInvoiceNo_TextChanged);

            MakeLabel(this.tabReceipt, this.lblInvoiceAmtLabel, "Invoice Amount Keyword:", col2, ty);
            StyleTextBox(this.txtAmount, col2, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtAmount);
            this.txtAmount.TextChanged += new System.EventHandler(this.txtAmount_TextChanged);
            ty += 60;

            MakeLabel(this.tabReceipt, this.lblVatAmtLabel, "VAT Amount Keyword:", col1, ty);
            StyleTextBox(this.txtVat, col1, ty + 20, fw, th, false); this.tabReceipt.Controls.Add(this.txtVat);
            this.txtVat.TextChanged += new System.EventHandler(this.txtVat_TextChanged);

            MakeLabel(this.tabReceipt, this.lblVatFlagLabel, "VAT Flag Column:", col2, ty);
            StyleCombo(this.cbVatFlag, col2, ty + 20, fw, th); this.tabReceipt.Controls.Add(this.cbVatFlag);
            this.cbVatFlag.Items.AddRange(new object[] { "1", "2", "3", "4", "5" });
            this.cbVatFlag.SelectedIndexChanged += new System.EventHandler(this.cbVatFlag_SelectedIndexChanged);
            ty += 60;

            MakeLabel(this.tabReceipt, this.lblColAmtLabel, "Amount Column Index:", col1, ty);
            StyleCombo(this.cbAmount, col1, ty + 20, fw, th); this.tabReceipt.Controls.Add(this.cbAmount);
            this.cbAmount.Items.AddRange(new object[] { "0", "1", "2", "3", "4", "5" });
            this.cbAmount.SelectedIndexChanged += new System.EventHandler(this.cbAmount_SelectedIndexChanged);

            MakeLabel(this.tabReceipt, this.lblColPriceLabel, "Price Column Index:", col2, ty);
            StyleCombo(this.cbPrice, col2, ty + 20, fw, th); this.tabReceipt.Controls.Add(this.cbPrice);
            this.cbPrice.Items.AddRange(new object[] { "0", "1", "2", "3", "4", "5" });
            this.cbPrice.SelectedIndexChanged += new System.EventHandler(this.cbPrice_SelectedIndexChanged);
            ty += 60;

            MakeLabel(this.tabReceipt, this.lblColQtyLabel, "Quantity Column Index:", col1, ty);
            StyleCombo(this.cbQuantity, col1, ty + 20, fw, th); this.tabReceipt.Controls.Add(this.cbQuantity);
            this.cbQuantity.Items.AddRange(new object[] { "0", "1", "2", "3", "4", "5" });
            this.cbQuantity.SelectedIndexChanged += new System.EventHandler(this.cbQuantity_SelectedIndexChanged);

            MakeLabel(this.tabReceipt, this.lblDotsLabel, "Item Dot Counter:", col2, ty);
            StyleCombo(this.cbDots, col2, ty + 20, fw, th); this.tabReceipt.Controls.Add(this.cbDots);
            this.cbDots.Items.AddRange(new object[] { "0", "1", "2", "3" });
            this.cbDots.SelectedIndexChanged += new System.EventHandler(this.cbDots_SelectedIndexChanged);
            ty += 60;

            MakeLabel(this.tabReceipt, this.lblLinesLabel, "Multi-Line Product:", col1, ty);
            StyleCombo(this.cbLines, col1, ty + 20, fw, th); this.tabReceipt.Controls.Add(this.cbLines);
            this.cbLines.Items.AddRange(new object[] { "No", "Yes" });
            this.cbLines.SelectedIndexChanged += new System.EventHandler(this.comboBox2_SelectedIndexChanged);
            ty += 50;

            StyleButton(this.btnSaveReceipt, "💾  Save Parsing Settings", col1, ty, 230, 36, false);
            this.tabReceipt.Controls.Add(this.btnSaveReceipt);
            this.btnSaveReceipt.Click += new System.EventHandler(this.btnSaveReceipt_Click);

            // ════════════════════════════════════════════════════════════════
            // TAB X — Templates & Color Customizer
            // ════════════════════════════════════════════════════════════════
            ty = 16;
            MakeLabel(this.tabTemplates, this.lblTemplateLabel, "Select Visual Template:", tx, ty); ty += 22;
            StyleCombo(this.cbTemplate, tx, ty, 230, th);
            this.cbTemplate.Items.AddRange(new object[] { "Receipt48 (48mm Thermal)", "Receipt80 (80mm Thermal)", "InvoiceA4 (Standard A4)" });
            this.tabTemplates.Controls.Add(this.cbTemplate);
            this.cbTemplate.SelectedIndexChanged += new System.EventHandler(this.UpdateTemplatePreview);
            ty += 36;

            MakeLabel(this.tabTemplates, this.lblPrinterLabel, "Select Target Printer:", tx, ty); ty += 22;
            StyleCombo(this.cbPrinter, tx, ty, 230, th);
            this.tabTemplates.Controls.Add(this.cbPrinter);
            ty += 36;

            MakeLabel(this.tabTemplates, this.lblColorLabel, "Primary Accent Color (Hex):", tx, ty); ty += 22;
            StyleTextBox(this.txtAccentColor, tx, ty, 130, th, false);
            this.txtAccentColor.Text = "#3355FF";
            this.tabTemplates.Controls.Add(this.txtAccentColor);
            this.txtAccentColor.TextChanged += new System.EventHandler(this.UpdateTemplatePreview);

            // Color Presets
            this.btnColorBlue = new System.Windows.Forms.Button();
            StyleButton(this.btnColorBlue, "Blue", tx + 140, ty, 42, th, false);
            this.btnColorBlue.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.btnColorBlue.Click += (s, e) => { this.txtAccentColor.Text = "#3355FF"; };
            this.tabTemplates.Controls.Add(this.btnColorBlue);

            this.btnColorGreen = new System.Windows.Forms.Button();
            StyleButton(this.btnColorGreen, "Green", tx + 186, ty, 46, th, false);
            this.btnColorGreen.BackColor = System.Drawing.Color.FromArgb(40, 167, 69);
            this.btnColorGreen.Click += (s, e) => { this.txtAccentColor.Text = "#28A745"; };
            this.tabTemplates.Controls.Add(this.btnColorGreen);
            ty += 46;

            StyleButton(this.btnSaveTemplates, "💾  Save Template Config", tx, ty, 230, 36, false);
            this.tabTemplates.Controls.Add(this.btnSaveTemplates);
            this.btnSaveTemplates.Click += new System.EventHandler(this.btnSaveTemplates_Click);

            // WebBrowser Preview Panel (Right Side)
            this.webBrowserPreview = new System.Windows.Forms.WebBrowser();
            this.webBrowserPreview.Location = new System.Drawing.Point(275, 16);
            this.webBrowserPreview.Size = new System.Drawing.Size(315, 330);
            this.webBrowserPreview.ScriptErrorsSuppressed = true;
            this.tabTemplates.Controls.Add(this.webBrowserPreview);

            // ════════════════════════════════════════════════════════════════
            // TAB 4 — Currencies
            // ════════════════════════════════════════════════════════════════
            ty = 16;
            this.lblCurrencyHelp.AutoSize = true;
            this.lblCurrencyHelp.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblCurrencyHelp.ForeColor = System.Drawing.Color.DimGray;
            this.lblCurrencyHelp.Location = new System.Drawing.Point(tx, ty);
            this.lblCurrencyHelp.Text = "Add each currency name and its receipt keyword (e.g. USD → AMOUNT USD)";
            this.tabCurrencies.Controls.Add(this.lblCurrencyHelp);
            ty += 26;

            StyleButton(this.btnAdd, "➕  Add Currency", tx, ty, 155, 30, false);
            this.tabCurrencies.Controls.Add(this.btnAdd);
            this.btnAdd.Click += new System.EventHandler(this.btnAdd_Click);

            StyleButton(this.btnReset, "🗑  Clear All", tx + 164, ty, 130, 30, true);
            this.tabCurrencies.Controls.Add(this.btnReset);
            this.btnReset.Click += new System.EventHandler(this.btnReset_Click);

            StyleButton(this.btnSaveCurrencies, "💾  Save Currency Config", tx + 304, ty, 185, 30, false);
            this.tabCurrencies.Controls.Add(this.btnSaveCurrencies);
            this.btnSaveCurrencies.Click += new System.EventHandler(this.btnFinish_Click);
            ty += 44;

            this.panelCurrency.AutoScroll = true;
            this.panelCurrency.BackColor = System.Drawing.Color.FromArgb(245, 247, 255);
            this.panelCurrency.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.panelCurrency.Location = new System.Drawing.Point(tx, ty);
            this.panelCurrency.Name = "panelCurrency";
            this.panelCurrency.Size = new System.Drawing.Size(490, 220);
            this.tabCurrencies.Controls.Add(this.panelCurrency);

            // ════════════════════════════════════════════════════════════════
            // TAB 5 — Scheduler
            // ════════════════════════════════════════════════════════════════
            ty = 20;
            this.chkEnableScheduler.AutoSize = true;
            this.chkEnableScheduler.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.chkEnableScheduler.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.chkEnableScheduler.Location = new System.Drawing.Point(tx, ty);
            this.chkEnableScheduler.Text = "Enable Automatic End-of-Day Z-Report";
            this.tabScheduler.Controls.Add(this.chkEnableScheduler);
            this.chkEnableScheduler.CheckedChanged += new System.EventHandler(this.chkEnableScheduler_CheckedChanged);
            ty += 40;

            MakeLabel(this.tabScheduler, this.lblSchedulerLabel, "Auto Close Time (24h format, e.g. 23:30):", tx, ty); ty += 24;
            StyleTextBox(this.txtAutoCloseTime, tx, ty, 140, th, false);
            this.tabScheduler.Controls.Add(this.txtAutoCloseTime); ty += 44;

            this.lblSchedulerHelp.AutoSize = false;
            this.lblSchedulerHelp.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblSchedulerHelp.ForeColor = System.Drawing.Color.DimGray;
            this.lblSchedulerHelp.Location = new System.Drawing.Point(tx, ty);
            this.lblSchedulerHelp.Size = new System.Drawing.Size(460, 60);
            this.lblSchedulerHelp.Text = "The Z-Report will fire automatically each day at the specified time.\n" +
                "The application must be running in the system tray for this to work.\n" +
                "A balloon notification will confirm when the day has been closed.";
            this.tabScheduler.Controls.Add(this.lblSchedulerHelp);
            ty += 70;

            StyleButton(this.btnSaveScheduler, "💾  Save Scheduler", tx, ty, 200, 36, false);
            this.tabScheduler.Controls.Add(this.btnSaveScheduler);
            this.btnSaveScheduler.Click += new System.EventHandler(this.btnSaveScheduler_Click);

            // ════════════════════════════════════════════════════════════════
            // Bottom bar
            // ════════════════════════════════════════════════════════════════
            this.panelBottom.BackColor = System.Drawing.Color.FromArgb(245, 247, 255);
            this.panelBottom.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.panelBottom.Height = 52;
            this.panelBottom.Controls.Add(this.btnSaveAll);
            this.panelBottom.Controls.Add(this.btnClose);
            this.panelBottom.Controls.Add(this.lblStatus);

            StyleButton(this.btnSaveAll, "✔  Save All & Close", 20, 10, 180, 34, false);
            this.panelBottom.Controls.Add(this.btnSaveAll);
            this.btnSaveAll.Click += new System.EventHandler(this.btnSaveAll_Click);

            StyleButton(this.btnClose, "✕  Cancel", 210, 10, 110, 34, true);
            this.panelBottom.Controls.Add(this.btnClose);
            this.btnClose.Click += new System.EventHandler(this.btnCloseWizard_Click);

            this.lblStatus.AutoSize = false;
            this.lblStatus.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblStatus.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.lblStatus.Location = new System.Drawing.Point(330, 18);
            this.lblStatus.Size = new System.Drawing.Size(270, 20);
            this.lblStatus.Text = "";
            this.panelBottom.Controls.Add(this.lblStatus);

            // ════════════════════════════════════════════════════════════════
            // Form
            // ════════════════════════════════════════════════════════════════
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.White;
            this.ClientSize = new System.Drawing.Size(620, 530);
            this.Controls.Add(this.tabControl);
            this.Controls.Add(this.panelBottom);
            this.Controls.Add(this.panelHeader);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.Name = "Wizard";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "FiscalStack — Settings & Setup";
            this.Load += new System.EventHandler(this.Wizard_Load);
            this.panelHeader.ResumeLayout(false);
            this.panelHeader.PerformLayout();
            this.tabControl.ResumeLayout(false);
            this.ResumeLayout(false);
        }

        // ── Helper methods ──────────────────────────────────────────────────
        private void MakeLabel(System.Windows.Forms.Control parent, System.Windows.Forms.Label lbl, string text, int x, int y)
        {
            lbl.AutoSize = true;
            lbl.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            lbl.ForeColor = System.Drawing.Color.FromArgb(60, 60, 80);
            lbl.Location = new System.Drawing.Point(x, y);
            lbl.Text = text;
            parent.Controls.Add(lbl);
        }

        private void StyleTextBox(System.Windows.Forms.TextBox txt, int x, int y, int w, int h, bool isPassword)
        {
            txt.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            txt.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            txt.Location = new System.Drawing.Point(x, y);
            txt.Size = new System.Drawing.Size(w, h);
            if (isPassword) txt.PasswordChar = '●';
        }

        private void StyleCombo(System.Windows.Forms.ComboBox cb, int x, int y, int w, int h)
        {
            cb.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cb.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            cb.Font = new System.Drawing.Font("Segoe UI", 9.5F);
            cb.Location = new System.Drawing.Point(x, y);
            cb.Size = new System.Drawing.Size(w, h);
        }

        private void StyleButton(System.Windows.Forms.Button btn, string text, int x, int y, int w, int h, bool isSecondary)
        {
            btn.BackColor = isSecondary
                ? System.Drawing.Color.FromArgb(220, 225, 240)
                : System.Drawing.Color.FromArgb(51, 85, 255);
            btn.FlatAppearance.BorderSize = 0;
            btn.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            btn.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Regular);
            btn.ForeColor = isSecondary ? System.Drawing.Color.FromArgb(50, 50, 80) : System.Drawing.Color.White;
            btn.Location = new System.Drawing.Point(x, y);
            btn.Size = new System.Drawing.Size(w, h);
            btn.Text = text;
            btn.UseVisualStyleBackColor = false;
            btn.Cursor = System.Windows.Forms.Cursors.Hand;
        }

        // ── Controls ─────────────────────────────────────────────────────────
        private System.Windows.Forms.Panel panelHeader;
        private System.Windows.Forms.Label lblLogo;
        private System.Windows.Forms.Label lblSubtitle;
        private System.Windows.Forms.TabControl tabControl;
        private System.Windows.Forms.TabPage tabApi;
        private System.Windows.Forms.TabPage tabFolders;
        private System.Windows.Forms.TabPage tabReceipt;
        private System.Windows.Forms.TabPage tabTemplates;
        private System.Windows.Forms.TabPage tabCurrencies;
        private System.Windows.Forms.TabPage tabScheduler;
        private System.Windows.Forms.Panel panelBottom;
        private System.Windows.Forms.Button btnSaveAll;
        private System.Windows.Forms.Button btnClose;
        private System.Windows.Forms.Label lblStatus;

        private System.Windows.Forms.Label lblApiKeyLabel;
        private System.Windows.Forms.TextBox txtApiKey;
        private System.Windows.Forms.Label lblEndpointLabel;
        private System.Windows.Forms.TextBox txtEndpoint;
        private System.Windows.Forms.Button btnSaveApi;
        private System.Windows.Forms.Button btnTestConnection;
        private System.Windows.Forms.Label lblApiStatus;

        private System.Windows.Forms.Label lblSourceLabel;
        private System.Windows.Forms.TextBox txtSourcePath;
        private System.Windows.Forms.Button btnBrowseSource;
        private System.Windows.Forms.Label lblTargetLabel;
        private System.Windows.Forms.TextBox txtTargetPath;
        private System.Windows.Forms.Button btnBrowseTarget;
        private System.Windows.Forms.Label lblLogoFileLabel;
        private System.Windows.Forms.TextBox txtLogoPath;
        private System.Windows.Forms.Button btnBrowseLogo;
        private System.Windows.Forms.Button btnSaveFolders;
        
        private System.Windows.Forms.Button btnAutoTrain;

        private System.Windows.Forms.Label lblTaxSymLabel;
        private System.Windows.Forms.TextBox txtTaxSymbol;
        private System.Windows.Forms.Label lblNonTaxSymLabel;
        private System.Windows.Forms.TextBox txtNonTaxSymbol;
        private System.Windows.Forms.Label lblStartLineLabel;
        private System.Windows.Forms.TextBox txtStartLine;
        private System.Windows.Forms.Label lblEndLineLabel;
        private System.Windows.Forms.TextBox txtEndLine;
        private System.Windows.Forms.Label lblInvoiceAmtLabel;
        private System.Windows.Forms.TextBox txtAmount;
        private System.Windows.Forms.Label lblVatAmtLabel;
        private System.Windows.Forms.TextBox txtVat;
        private System.Windows.Forms.Label lblInvoiceNoLabel;
        private System.Windows.Forms.TextBox txtInvoiceNo;
        private System.Windows.Forms.Label lblColAmtLabel;
        private System.Windows.Forms.ComboBox cbAmount;
        private System.Windows.Forms.Label lblColPriceLabel;
        private System.Windows.Forms.ComboBox cbPrice;
        private System.Windows.Forms.Label lblColQtyLabel;
        private System.Windows.Forms.ComboBox cbQuantity;
        private System.Windows.Forms.Label lblVatFlagLabel;
        private System.Windows.Forms.ComboBox cbVatFlag;
        private System.Windows.Forms.Label lblDotsLabel;
        private System.Windows.Forms.ComboBox cbDots;
        private System.Windows.Forms.Label lblLinesLabel;
        private System.Windows.Forms.ComboBox cbLines;
        private System.Windows.Forms.Button btnSaveReceipt;

        private System.Windows.Forms.Label lblTemplateLabel;
        private System.Windows.Forms.ComboBox cbTemplate;
        private System.Windows.Forms.Label lblPrinterLabel;
        private System.Windows.Forms.ComboBox cbPrinter;
        private System.Windows.Forms.Label lblColorLabel;
        private System.Windows.Forms.TextBox txtAccentColor;
        private System.Windows.Forms.Button btnColorBlue;
        private System.Windows.Forms.Button btnColorGreen;
        private System.Windows.Forms.Button btnSaveTemplates;
        private System.Windows.Forms.WebBrowser webBrowserPreview;

        private System.Windows.Forms.Label lblCurrencyHelp;
        private System.Windows.Forms.Panel panelCurrency;
        private System.Windows.Forms.Button btnAdd;
        private System.Windows.Forms.Button btnReset;
        private System.Windows.Forms.Button btnSaveCurrencies;

        private System.Windows.Forms.Label lblSchedulerLabel;
        private System.Windows.Forms.TextBox txtAutoCloseTime;
        private System.Windows.Forms.Label lblSchedulerHelp;
        private System.Windows.Forms.Button btnSaveScheduler;
        private System.Windows.Forms.CheckBox chkEnableScheduler;

        // Legacy labels needed by original code
        private System.Windows.Forms.Label lblSourceFolder;
        private System.Windows.Forms.Label lblTargetFolder;
    }
}
