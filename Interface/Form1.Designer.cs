namespace Revmax_Interface_Promun
{
    partial class RevMaxInterfaceWizard
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(RevMaxInterfaceWizard));

            // Tray context menu
            this.contextMenuStrip1 = new System.Windows.Forms.ContextMenuStrip(this.components);
            this.contextMenuStrip1.Renderer = new CustomMenuRenderer();
            this.dashboardToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.retrainInterfaceToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.operationsToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.openTestToolToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.getDeviceDetailsToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.exitToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.viewLastReceiptToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStripSeparator1 = new System.Windows.Forms.ToolStripSeparator();
            this.exitToolStripMenuItem1 = new System.Windows.Forms.ToolStripMenuItem();

            // Tray & Timer
            this.notifyIcon1 = new System.Windows.Forms.NotifyIcon(this.components);
            this.timer1 = new System.Windows.Forms.Timer(this.components);
            this.printDocument1 = new System.Drawing.Printing.PrintDocument();

            // Main tab control (matches test tool structure)
            this.tabControl = new System.Windows.Forms.TabControl();
            this.tabReceipt = new System.Windows.Forms.TabPage();
            this.tabStatus = new System.Windows.Forms.TabPage();

            // Receipt tab contents
            this.reportViewer1 = new Microsoft.Reporting.WinForms.ReportViewer();

            // Status tab contents
            this.pnlStatusInfo = new System.Windows.Forms.Panel();
            this.lblStatusDot = new System.Windows.Forms.Label();
            this.lblStatusDevice = new System.Windows.Forms.Label();
            this.lblStatusCompany = new System.Windows.Forms.Label();
            this.lblStatusFiscalDay = new System.Windows.Forms.Label();
            this.lblStatusApiKey = new System.Windows.Forms.Label();
            this.lblStatusEndpoint = new System.Windows.Forms.Label();
            this.btnOpenDashboard = new System.Windows.Forms.Button();
            this.btnOpenSettings = new System.Windows.Forms.Button();
            this.btnOpenTestTool = new System.Windows.Forms.Button();
            this.btnCloseFiscalDay = new System.Windows.Forms.Button();

            // Status dot panel & log
            this.pnlDot = new System.Windows.Forms.Panel();
            this.lblLogHeader = new System.Windows.Forms.Label();
            this.txtLog = new System.Windows.Forms.RichTextBox();

            this.contextMenuStrip1.SuspendLayout();
            this.tabControl.SuspendLayout();
            this.tabReceipt.SuspendLayout();
            this.tabStatus.SuspendLayout();
            this.pnlStatusInfo.SuspendLayout();
            this.SuspendLayout();

            // ── contextMenuStrip1 ────────────────────────────────────────────
            this.contextMenuStrip1.ImageScalingSize = new System.Drawing.Size(20, 20);
            this.contextMenuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.dashboardToolStripMenuItem,
                this.retrainInterfaceToolStripMenuItem,
                this.operationsToolStripMenuItem,
                this.viewLastReceiptToolStripMenuItem,
                this.toolStripSeparator1,
                this.exitToolStripMenuItem1 });
            this.contextMenuStrip1.Name = "contextMenuStrip1";
            this.contextMenuStrip1.Size = new System.Drawing.Size(220, 176);

            this.dashboardToolStripMenuItem.Name = "dashboardToolStripMenuItem";
            this.dashboardToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.dashboardToolStripMenuItem.Text = "Dashboard / History";
            this.dashboardToolStripMenuItem.Font = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.dashboardToolStripMenuItem.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.dashboardToolStripMenuItem.Click += new System.EventHandler(this.dashboardToolStripMenuItem_Click);

            this.retrainInterfaceToolStripMenuItem.Name = "retrainInterfaceToolStripMenuItem";
            this.retrainInterfaceToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.retrainInterfaceToolStripMenuItem.Text = "Settings / Setup";
            this.retrainInterfaceToolStripMenuItem.Click += new System.EventHandler(this.retrainInterfaceToolStripMenuItem_Click);

            this.operationsToolStripMenuItem.Name = "operationsToolStripMenuItem";
            this.operationsToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.operationsToolStripMenuItem.Text = "Operations";
            this.operationsToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
                this.openTestToolToolStripMenuItem,
                this.getDeviceDetailsToolStripMenuItem,
                this.exitToolStripMenuItem });

            this.openTestToolToolStripMenuItem.Name = "openTestToolToolStripMenuItem";
            this.openTestToolToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.openTestToolToolStripMenuItem.Text = "Test Tool";
            this.openTestToolToolStripMenuItem.Click += new System.EventHandler(this.openTestToolToolStripMenuItem_Click);

            this.getDeviceDetailsToolStripMenuItem.Name = "getDeviceDetailsToolStripMenuItem";
            this.getDeviceDetailsToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.getDeviceDetailsToolStripMenuItem.Text = "Device Details";
            this.getDeviceDetailsToolStripMenuItem.Click += new System.EventHandler(this.getDeviceDetailsToolStripMenuItem_Click);

            this.exitToolStripMenuItem.Name = "exitToolStripMenuItem";
            this.exitToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.exitToolStripMenuItem.Text = "Close Fiscal Day";
            this.exitToolStripMenuItem.Click += new System.EventHandler(this.exitToolStripMenuItem_Click);

            this.viewLastReceiptToolStripMenuItem.Name = "viewLastReceiptToolStripMenuItem";
            this.viewLastReceiptToolStripMenuItem.Size = new System.Drawing.Size(219, 24);
            this.viewLastReceiptToolStripMenuItem.Text = "View Last Receipt";
            this.viewLastReceiptToolStripMenuItem.Click += new System.EventHandler(this.viewLastReceiptToolStripMenuItem_Click);

            this.toolStripSeparator1.Name = "toolStripSeparator1";
            this.toolStripSeparator1.Size = new System.Drawing.Size(216, 6);

            this.exitToolStripMenuItem1.Name = "exitToolStripMenuItem1";
            this.exitToolStripMenuItem1.Size = new System.Drawing.Size(219, 24);
            this.exitToolStripMenuItem1.Text = "Exit";
            this.exitToolStripMenuItem1.Click += new System.EventHandler(this.exitToolStripMenuItem1_Click);

            // ── notifyIcon1 ──────────────────────────────────────────────────
            this.notifyIcon1.ContextMenuStrip = this.contextMenuStrip1;
            this.notifyIcon1.Icon = ((System.Drawing.Icon)(resources.GetObject("notifyIcon1.Icon")));
            this.notifyIcon1.Text = "FiscalStack Interface";
            this.notifyIcon1.Visible = true;
            this.notifyIcon1.MouseDoubleClick += new System.Windows.Forms.MouseEventHandler(this.notifyIcon1_MouseDoubleClick);

            // ── timer1 ───────────────────────────────────────────────────────
            this.timer1.Enabled = true;
            this.timer1.Interval = 4000;
            this.timer1.Tick += new System.EventHandler(this.timer1_Tick);

            // ── printDocument1 ───────────────────────────────────────────────
            this.printDocument1.PrintPage += new System.Drawing.Printing.PrintPageEventHandler(this.printDocument1_PrintPage);

            // ── tabControl ───────────────────────────────────────────────────
            this.tabControl.Controls.Add(this.tabReceipt);
            this.tabControl.Controls.Add(this.tabStatus);
            this.tabControl.Anchor = ((System.Windows.Forms.AnchorStyles)(
                System.Windows.Forms.AnchorStyles.Top |
                System.Windows.Forms.AnchorStyles.Left |
                System.Windows.Forms.AnchorStyles.Right));
            this.tabControl.Location = new System.Drawing.Point(12, 12);
            this.tabControl.Name = "tabControl";
            this.tabControl.SelectedIndex = 0;
            this.tabControl.Size = new System.Drawing.Size(760, 320);
            this.tabControl.TabIndex = 0;
            this.tabControl.Font = new System.Drawing.Font("Segoe UI", 9F);

            // ── tabReceipt ───────────────────────────────────────────────────
            this.tabReceipt.Controls.Add(this.reportViewer1);
            this.tabReceipt.Location = new System.Drawing.Point(4, 23);
            this.tabReceipt.Name = "tabReceipt";
            this.tabReceipt.Padding = new System.Windows.Forms.Padding(3);
            this.tabReceipt.Size = new System.Drawing.Size(752, 293);
            this.tabReceipt.TabIndex = 0;
            this.tabReceipt.Text = "Receipt / Invoice Preview";
            this.tabReceipt.UseVisualStyleBackColor = true;

            // ── reportViewer1 ────────────────────────────────────────────────
            this.reportViewer1.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.reportViewer1.Cursor = System.Windows.Forms.Cursors.Default;
            this.reportViewer1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.reportViewer1.DocumentMapWidth = 0;
            this.reportViewer1.IsDocumentMapWidthFixed = true;
            this.reportViewer1.LocalReport.EnableExternalImages = true;
            this.reportViewer1.LocalReport.ReportEmbeddedResource = "Revmax_Interface_Promun.Report1.rdlc";
            this.reportViewer1.Location = new System.Drawing.Point(3, 3);
            this.reportViewer1.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.reportViewer1.Name = "reportViewer1";
            this.reportViewer1.ServerReport.BearerToken = null;
            this.reportViewer1.Size = new System.Drawing.Size(746, 287);
            this.reportViewer1.TabIndex = 1;
            this.reportViewer1.Load += new System.EventHandler(this.reportViewer1_Load);

            // ── tabStatus ────────────────────────────────────────────────────
            this.tabStatus.Controls.Add(this.pnlStatusInfo);
            this.tabStatus.Controls.Add(this.pnlDot);
            this.tabStatus.Location = new System.Drawing.Point(4, 23);
            this.tabStatus.Name = "tabStatus";
            this.tabStatus.Padding = new System.Windows.Forms.Padding(8);
            this.tabStatus.Size = new System.Drawing.Size(752, 293);
            this.tabStatus.TabIndex = 1;
            this.tabStatus.Text = "Connection Status";
            this.tabStatus.UseVisualStyleBackColor = true;

            // ── pnlDot (visual status indicator) ───────────────────────────────
            this.pnlDot.Location = new System.Drawing.Point(16, 16);
            this.pnlDot.Name = "pnlDot";
            this.pnlDot.Size = new System.Drawing.Size(200, 40);
            this.pnlDot.TabIndex = 10;
            // Add status label inside
            this.lblStatusDot.AutoSize = true;
            this.lblStatusDot.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.lblStatusDot.ForeColor = System.Drawing.Color.Gray;
            this.lblStatusDot.Location = new System.Drawing.Point(0, 8);
            this.lblStatusDot.Name = "lblStatusDot";
            this.lblStatusDot.Text = "⏸ Checking...";
            this.pnlDot.Controls.Add(this.lblStatusDot);

            // ── pnlStatusInfo (info labels + action buttons) ─────────────────
            this.pnlStatusInfo.Controls.Add(this.lblStatusCompany);
            this.pnlStatusInfo.Controls.Add(this.lblStatusDevice);
            this.pnlStatusInfo.Controls.Add(this.lblStatusFiscalDay);
            this.pnlStatusInfo.Controls.Add(this.lblStatusApiKey);
            this.pnlStatusInfo.Controls.Add(this.lblStatusEndpoint);
            this.pnlStatusInfo.Controls.Add(this.btnOpenDashboard);
            this.pnlStatusInfo.Controls.Add(this.btnOpenSettings);
            this.pnlStatusInfo.Controls.Add(this.btnOpenTestTool);
            this.pnlStatusInfo.Controls.Add(this.btnCloseFiscalDay);
            this.pnlStatusInfo.Location = new System.Drawing.Point(8, 60);
            this.pnlStatusInfo.Name = "pnlStatusInfo";
            this.pnlStatusInfo.Size = new System.Drawing.Size(730, 220);
            this.pnlStatusInfo.TabIndex = 11;

            // ── Status labels ────────────────────────────────────────────────
            this.lblStatusCompany.AutoSize = true;
            this.lblStatusCompany.Font = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.lblStatusCompany.ForeColor = System.Drawing.Color.FromArgb(30, 30, 30);
            this.lblStatusCompany.Location = new System.Drawing.Point(0, 0);
            this.lblStatusCompany.Name = "lblStatusCompany";
            this.lblStatusCompany.Size = new System.Drawing.Size(200, 18);
            this.lblStatusCompany.Text = "Company: —";

            this.lblStatusDevice.AutoSize = true;
            this.lblStatusDevice.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblStatusDevice.ForeColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.lblStatusDevice.Location = new System.Drawing.Point(0, 26);
            this.lblStatusDevice.Name = "lblStatusDevice";
            this.lblStatusDevice.Size = new System.Drawing.Size(200, 16);
            this.lblStatusDevice.Text = "Device ID: —";

            this.lblStatusFiscalDay.AutoSize = true;
            this.lblStatusFiscalDay.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblStatusFiscalDay.ForeColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.lblStatusFiscalDay.Location = new System.Drawing.Point(0, 50);
            this.lblStatusFiscalDay.Name = "lblStatusFiscalDay";
            this.lblStatusFiscalDay.Size = new System.Drawing.Size(200, 16);
            this.lblStatusFiscalDay.Text = "Fiscal Day: —";

            this.lblStatusApiKey.AutoSize = true;
            this.lblStatusApiKey.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblStatusApiKey.ForeColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.lblStatusApiKey.Location = new System.Drawing.Point(0, 74);
            this.lblStatusApiKey.Name = "lblStatusApiKey";
            this.lblStatusApiKey.Size = new System.Drawing.Size(200, 16);
            this.lblStatusApiKey.Text = "API Key: —";

            this.lblStatusEndpoint.AutoSize = true;
            this.lblStatusEndpoint.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblStatusEndpoint.ForeColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.lblStatusEndpoint.Location = new System.Drawing.Point(0, 98);
            this.lblStatusEndpoint.Name = "lblStatusEndpoint";
            this.lblStatusEndpoint.Size = new System.Drawing.Size(200, 16);
            this.lblStatusEndpoint.Text = "Endpoint: —";

            // ── Action buttons (test-tool style: flat, blue) ─────────────────
            this.btnOpenDashboard.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.btnOpenDashboard.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnOpenDashboard.FlatAppearance.BorderSize = 0;
            this.btnOpenDashboard.ForeColor = System.Drawing.Color.White;
            this.btnOpenDashboard.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.btnOpenDashboard.Location = new System.Drawing.Point(0, 140);
            this.btnOpenDashboard.Name = "btnOpenDashboard";
            this.btnOpenDashboard.Size = new System.Drawing.Size(160, 35);
            this.btnOpenDashboard.TabIndex = 0;
            this.btnOpenDashboard.Text = "Dashboard / History";
            this.btnOpenDashboard.UseVisualStyleBackColor = false;
            this.btnOpenDashboard.Click += new System.EventHandler(this.dashboardToolStripMenuItem_Click);

            this.btnOpenSettings.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.btnOpenSettings.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnOpenSettings.FlatAppearance.BorderSize = 0;
            this.btnOpenSettings.ForeColor = System.Drawing.Color.White;
            this.btnOpenSettings.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.btnOpenSettings.Location = new System.Drawing.Point(170, 140);
            this.btnOpenSettings.Name = "btnOpenSettings";
            this.btnOpenSettings.Size = new System.Drawing.Size(160, 35);
            this.btnOpenSettings.TabIndex = 1;
            this.btnOpenSettings.Text = "Settings / Setup";
            this.btnOpenSettings.UseVisualStyleBackColor = false;
            this.btnOpenSettings.Click += new System.EventHandler(this.retrainInterfaceToolStripMenuItem_Click);

            this.btnOpenTestTool.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.btnOpenTestTool.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnOpenTestTool.FlatAppearance.BorderSize = 0;
            this.btnOpenTestTool.ForeColor = System.Drawing.Color.White;
            this.btnOpenTestTool.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.btnOpenTestTool.Location = new System.Drawing.Point(340, 140);
            this.btnOpenTestTool.Name = "btnOpenTestTool";
            this.btnOpenTestTool.Size = new System.Drawing.Size(160, 35);
            this.btnOpenTestTool.TabIndex = 2;
            this.btnOpenTestTool.Text = "API Test Tool";
            this.btnOpenTestTool.UseVisualStyleBackColor = false;
            this.btnOpenTestTool.Click += new System.EventHandler(this.openTestToolToolStripMenuItem_Click);

            this.btnCloseFiscalDay.BackColor = System.Drawing.Color.FromArgb(192, 0, 0);
            this.btnCloseFiscalDay.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnCloseFiscalDay.FlatAppearance.BorderSize = 0;
            this.btnCloseFiscalDay.ForeColor = System.Drawing.Color.White;
            this.btnCloseFiscalDay.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.btnCloseFiscalDay.Location = new System.Drawing.Point(510, 140);
            this.btnCloseFiscalDay.Name = "btnCloseFiscalDay";
            this.btnCloseFiscalDay.Size = new System.Drawing.Size(160, 35);
            this.btnCloseFiscalDay.TabIndex = 3;
            this.btnCloseFiscalDay.Text = "Close Fiscal Day";
            this.btnCloseFiscalDay.UseVisualStyleBackColor = false;
            this.btnCloseFiscalDay.Click += new System.EventHandler(this.exitToolStripMenuItem_Click);

            // ── Log area (test-tool style: black bg, lime text, Consolas) ────
            this.lblLogHeader.AutoSize = true;
            this.lblLogHeader.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.lblLogHeader.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.lblLogHeader.Location = new System.Drawing.Point(12, 340);
            this.lblLogHeader.Name = "lblLogHeader";
            this.lblLogHeader.Size = new System.Drawing.Size(110, 16);
            this.lblLogHeader.TabIndex = 10;
            this.lblLogHeader.Text = "Fiscalization Log:";

            this.txtLog.BackColor = System.Drawing.Color.FromArgb(15, 15, 25);
            this.txtLog.Font = new System.Drawing.Font("Consolas", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.txtLog.ForeColor = System.Drawing.Color.Lime;
            this.txtLog.Anchor = ((System.Windows.Forms.AnchorStyles)(
                System.Windows.Forms.AnchorStyles.Top |
                System.Windows.Forms.AnchorStyles.Left |
                System.Windows.Forms.AnchorStyles.Right |
                System.Windows.Forms.AnchorStyles.Bottom));
            this.txtLog.Location = new System.Drawing.Point(12, 360);
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = System.Windows.Forms.RichTextBoxScrollBars.Vertical;
            this.txtLog.Size = new System.Drawing.Size(760, 130);
            this.txtLog.TabIndex = 11;
            this.txtLog.Text = "FiscalStack Interface ready.\n";

            // ── RevMaxInterfaceWizard (main form) ────────────────────────────
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 16F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(784, 506);
            this.Controls.Add(this.tabControl);
            this.Controls.Add(this.lblLogHeader);
            this.Controls.Add(this.txtLog);
            this.MinimumSize = new System.Drawing.Size(800, 550);
            this.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.Name = "RevMaxInterfaceWizard";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "FiscalStack Interface";
            this.Load += new System.EventHandler(this.Form1_Load);

            this.contextMenuStrip1.ResumeLayout(false);
            this.tabControl.ResumeLayout(false);
            this.tabReceipt.ResumeLayout(false);
            this.tabStatus.ResumeLayout(false);
            this.pnlStatusInfo.ResumeLayout(false);
            this.pnlStatusInfo.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.ContextMenuStrip contextMenuStrip1;
        private System.Windows.Forms.ToolStripMenuItem dashboardToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem retrainInterfaceToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem operationsToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem openTestToolToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem getDeviceDetailsToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem exitToolStripMenuItem; // (Close day)
        private System.Windows.Forms.ToolStripMenuItem viewLastReceiptToolStripMenuItem;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator1;
        private System.Windows.Forms.ToolStripMenuItem exitToolStripMenuItem1; // (Exit)
        private System.Windows.Forms.Timer timer1;
        private Microsoft.Reporting.WinForms.ReportViewer reportViewer1;
        private System.Drawing.Printing.PrintDocument printDocument1;
        private System.Windows.Forms.NotifyIcon notifyIcon1;

        // Tab layout
        private System.Windows.Forms.TabControl tabControl;
        private System.Windows.Forms.TabPage tabReceipt;
        private System.Windows.Forms.TabPage tabStatus;

        // Status tab controls
        private System.Windows.Forms.Panel pnlDot;
        private System.Windows.Forms.Label lblStatusDot;
        private System.Windows.Forms.Panel pnlStatusInfo;
        private System.Windows.Forms.Label lblStatusCompany;
        private System.Windows.Forms.Label lblStatusDevice;
        private System.Windows.Forms.Label lblStatusFiscalDay;
        private System.Windows.Forms.Label lblStatusApiKey;
        private System.Windows.Forms.Label lblStatusEndpoint;
        private System.Windows.Forms.Button btnOpenDashboard;
        private System.Windows.Forms.Button btnOpenSettings;
        private System.Windows.Forms.Button btnOpenTestTool;
        private System.Windows.Forms.Button btnCloseFiscalDay;

        // Log area
        private System.Windows.Forms.Label lblLogHeader;
        private System.Windows.Forms.RichTextBox txtLog;
    }
}
