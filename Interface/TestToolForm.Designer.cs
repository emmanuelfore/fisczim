namespace Revmax_Interface_Promun
{
    partial class TestToolForm
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.tabControl = new System.Windows.Forms.TabControl();
            this.tabStatus = new System.Windows.Forms.TabPage();
            this.btnPing = new System.Windows.Forms.Button();
            this.btnGetDevice = new System.Windows.Forms.Button();
            this.lblApiKey = new System.Windows.Forms.Label();
            this.lblEndpoint = new System.Windows.Forms.Label();
            this.tabFiscalize = new System.Windows.Forms.TabPage();
            this.btnSubmitInvoice = new System.Windows.Forms.Button();
            this.btnSubmitCreditNote = new System.Windows.Forms.Button();
            this.btnSubmitDebitNote = new System.Windows.Forms.Button();
            this.txtInvoiceNo = new System.Windows.Forms.TextBox();
            this.lblInvoiceNo = new System.Windows.Forms.Label();
            this.txtAmount = new System.Windows.Forms.TextBox();
            this.lblAmount = new System.Windows.Forms.Label();
            this.tabDay = new System.Windows.Forms.TabPage();
            this.btnCloseDay = new System.Windows.Forms.Button();
            this.txtLog = new System.Windows.Forms.RichTextBox();
            this.lblLogHeader = new System.Windows.Forms.Label();
            this.tabControl.SuspendLayout();
            this.tabStatus.SuspendLayout();
            this.tabFiscalize.SuspendLayout();
            this.tabDay.SuspendLayout();
            this.SuspendLayout();
            // 
            // tabControl
            // 
            this.tabControl.Controls.Add(this.tabStatus);
            this.tabControl.Controls.Add(this.tabFiscalize);
            this.tabControl.Controls.Add(this.tabDay);
            this.tabControl.Location = new System.Drawing.Point(12, 12);
            this.tabControl.Name = "tabControl";
            this.tabControl.SelectedIndex = 0;
            this.tabControl.Size = new System.Drawing.Size(560, 200);
            this.tabControl.TabIndex = 0;
            // 
            // tabStatus
            // 
            this.tabStatus.Controls.Add(this.lblEndpoint);
            this.tabStatus.Controls.Add(this.lblApiKey);
            this.tabStatus.Controls.Add(this.btnGetDevice);
            this.tabStatus.Controls.Add(this.btnPing);
            this.tabStatus.Location = new System.Drawing.Point(4, 22);
            this.tabStatus.Name = "tabStatus";
            this.tabStatus.Padding = new System.Windows.Forms.Padding(3);
            this.tabStatus.Size = new System.Drawing.Size(552, 174);
            this.tabStatus.TabIndex = 0;
            this.tabStatus.Text = "Device & Health";
            this.tabStatus.UseVisualStyleBackColor = true;
            // 
            // btnPing
            // 
            this.btnPing.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(51)))), ((int)(((byte)(85)))), ((int)(((byte)(255)))));
            this.btnPing.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnPing.ForeColor = System.Drawing.Color.White;
            this.btnPing.Location = new System.Drawing.Point(20, 20);
            this.btnPing.Name = "btnPing";
            this.btnPing.Size = new System.Drawing.Size(160, 35);
            this.btnPing.TabIndex = 0;
            this.btnPing.Text = "Check Connection";
            this.btnPing.UseVisualStyleBackColor = false;
            this.btnPing.Click += new System.EventHandler(this.btnPing_Click);
            // 
            // btnGetDevice
            // 
            this.btnGetDevice.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(51)))), ((int)(((byte)(85)))), ((int)(((byte)(255)))));
            this.btnGetDevice.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnGetDevice.ForeColor = System.Drawing.Color.White;
            this.btnGetDevice.Location = new System.Drawing.Point(200, 20);
            this.btnGetDevice.Name = "btnGetDevice";
            this.btnGetDevice.Size = new System.Drawing.Size(160, 35);
            this.btnGetDevice.TabIndex = 1;
            this.btnGetDevice.Text = "Get Device Details";
            this.btnGetDevice.UseVisualStyleBackColor = false;
            this.btnGetDevice.Click += new System.EventHandler(this.btnGetDevice_Click);
            // 
            // lblApiKey
            // 
            this.lblApiKey.AutoSize = true;
            this.lblApiKey.Location = new System.Drawing.Point(20, 75);
            this.lblApiKey.Name = "lblApiKey";
            this.lblApiKey.Size = new System.Drawing.Size(100, 13);
            this.lblApiKey.TabIndex = 2;
            this.lblApiKey.Text = "API Key: Checking...";
            // 
            // lblEndpoint
            // 
            this.lblEndpoint.AutoSize = true;
            this.lblEndpoint.Location = new System.Drawing.Point(20, 105);
            this.lblEndpoint.Name = "lblEndpoint";
            this.lblEndpoint.Size = new System.Drawing.Size(110, 13);
            this.lblEndpoint.TabIndex = 3;
            this.lblEndpoint.Text = "Endpoint: Checking...";
            // 
            // tabFiscalize
            // 
            this.tabFiscalize.Controls.Add(this.lblAmount);
            this.tabFiscalize.Controls.Add(this.txtAmount);
            this.tabFiscalize.Controls.Add(this.lblInvoiceNo);
            this.tabFiscalize.Controls.Add(this.txtInvoiceNo);
            this.tabFiscalize.Controls.Add(this.btnSubmitDebitNote);
            this.tabFiscalize.Controls.Add(this.btnSubmitCreditNote);
            this.tabFiscalize.Controls.Add(this.btnSubmitInvoice);
            this.tabFiscalize.Location = new System.Drawing.Point(4, 22);
            this.tabFiscalize.Name = "tabFiscalize";
            this.tabFiscalize.Padding = new System.Windows.Forms.Padding(3);
            this.tabFiscalize.Size = new System.Drawing.Size(552, 174);
            this.tabFiscalize.TabIndex = 1;
            this.tabFiscalize.Text = "Fiscalize Invoices";
            this.tabFiscalize.UseVisualStyleBackColor = true;
            // 
            // lblInvoiceNo
            // 
            this.lblInvoiceNo.AutoSize = true;
            this.lblInvoiceNo.Location = new System.Drawing.Point(20, 20);
            this.lblInvoiceNo.Name = "lblInvoiceNo";
            this.lblInvoiceNo.Size = new System.Drawing.Size(62, 13);
            this.lblInvoiceNo.Text = "Invoice No:";
            // 
            // txtInvoiceNo
            // 
            this.txtInvoiceNo.Location = new System.Drawing.Point(90, 17);
            this.txtInvoiceNo.Name = "txtInvoiceNo";
            this.txtInvoiceNo.Size = new System.Drawing.Size(120, 20);
            this.txtInvoiceNo.TabIndex = 0;
            this.txtInvoiceNo.Text = "TEST-INV-001";
            // 
            // lblAmount
            // 
            this.lblAmount.AutoSize = true;
            this.lblAmount.Location = new System.Drawing.Point(230, 20);
            this.lblAmount.Name = "lblAmount";
            this.lblAmount.Size = new System.Drawing.Size(46, 13);
            this.lblAmount.Text = "Amount:";
            // 
            // txtAmount
            // 
            this.txtAmount.Location = new System.Drawing.Point(285, 17);
            this.txtAmount.Name = "txtAmount";
            this.txtAmount.Size = new System.Drawing.Size(100, 20);
            this.txtAmount.TabIndex = 1;
            this.txtAmount.Text = "100.00";
            // 
            // btnSubmitInvoice
            // 
            this.btnSubmitInvoice.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(51)))), ((int)(((byte)(85)))), ((int)(((byte)(255)))));
            this.btnSubmitInvoice.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnSubmitInvoice.ForeColor = System.Drawing.Color.White;
            this.btnSubmitInvoice.Location = new System.Drawing.Point(20, 60);
            this.btnSubmitInvoice.Name = "btnSubmitInvoice";
            this.btnSubmitInvoice.Size = new System.Drawing.Size(150, 35);
            this.btnSubmitInvoice.TabIndex = 2;
            this.btnSubmitInvoice.Text = "Submit Fiscal Invoice";
            this.btnSubmitInvoice.UseVisualStyleBackColor = false;
            this.btnSubmitInvoice.Click += new System.EventHandler(this.btnSubmitInvoice_Click);
            // 
            // btnSubmitCreditNote
            // 
            this.btnSubmitCreditNote.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(51)))), ((int)(((byte)(85)))), ((int)(((byte)(255)))));
            this.btnSubmitCreditNote.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnSubmitCreditNote.ForeColor = System.Drawing.Color.White;
            this.btnSubmitCreditNote.Location = new System.Drawing.Point(180, 60);
            this.btnSubmitCreditNote.Name = "btnSubmitCreditNote";
            this.btnSubmitCreditNote.Size = new System.Drawing.Size(150, 35);
            this.btnSubmitCreditNote.TabIndex = 3;
            this.btnSubmitCreditNote.Text = "Submit Credit Note";
            this.btnSubmitCreditNote.UseVisualStyleBackColor = false;
            this.btnSubmitCreditNote.Click += new System.EventHandler(this.btnSubmitCreditNote_Click);
            // 
            // btnSubmitDebitNote
            // 
            this.btnSubmitDebitNote.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(51)))), ((int)(((byte)(85)))), ((int)(((byte)(255)))));
            this.btnSubmitDebitNote.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnSubmitDebitNote.ForeColor = System.Drawing.Color.White;
            this.btnSubmitDebitNote.Location = new System.Drawing.Point(340, 60);
            this.btnSubmitDebitNote.Name = "btnSubmitDebitNote";
            this.btnSubmitDebitNote.Size = new System.Drawing.Size(150, 35);
            this.btnSubmitDebitNote.TabIndex = 4;
            this.btnSubmitDebitNote.Text = "Submit Debit Note";
            this.btnSubmitDebitNote.UseVisualStyleBackColor = false;
            this.btnSubmitDebitNote.Click += new System.EventHandler(this.btnSubmitDebitNote_Click);
            // 
            // tabDay
            // 
            this.tabDay.Controls.Add(this.btnCloseDay);
            this.tabDay.Location = new System.Drawing.Point(4, 22);
            this.tabDay.Name = "tabDay";
            this.tabDay.Padding = new System.Windows.Forms.Padding(3);
            this.tabDay.Size = new System.Drawing.Size(552, 174);
            this.tabDay.TabIndex = 2;
            this.tabDay.Text = "Close Day (Z-Report)";
            this.tabDay.UseVisualStyleBackColor = true;
            // 
            // btnCloseDay
            // 
            this.btnCloseDay.BackColor = System.Drawing.Color.FromArgb(((int)(((byte)(192)))), ((int)(((byte)(0)))), ((int)(((byte)(0)))));
            this.btnCloseDay.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnCloseDay.ForeColor = System.Drawing.Color.White;
            this.btnCloseDay.Location = new System.Drawing.Point(20, 30);
            this.btnCloseDay.Name = "btnCloseDay";
            this.btnCloseDay.Size = new System.Drawing.Size(200, 45);
            this.btnCloseDay.TabIndex = 0;
            this.btnCloseDay.Text = "Execute Close Day (Z-Report)";
            this.btnCloseDay.UseVisualStyleBackColor = false;
            this.btnCloseDay.Click += new System.EventHandler(this.btnCloseDay_Click);
            // 
            // lblLogHeader
            // 
            this.lblLogHeader.AutoSize = true;
            this.lblLogHeader.Location = new System.Drawing.Point(12, 220);
            this.lblLogHeader.Name = "lblLogHeader";
            this.lblLogHeader.Size = new System.Drawing.Size(95, 13);
            this.lblLogHeader.TabIndex = 1;
            this.lblLogHeader.Text = "API Response Log:";
            // 
            // txtLog
            // 
            this.txtLog.BackColor = System.Drawing.Color.Black;
            this.txtLog.Font = new System.Drawing.Font("Consolas", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.txtLog.ForeColor = System.Drawing.Color.Lime;
            this.txtLog.Location = new System.Drawing.Point(12, 240);
            this.txtLog.Name = "txtLog";
            this.txtLog.ReadOnly = true;
            this.txtLog.Size = new System.Drawing.Size(560, 210);
            this.txtLog.TabIndex = 2;
            this.txtLog.Text = "FiscalStack Test Tool Ready.\n";
            // 
            // TestToolForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(584, 461);
            this.Controls.Add(this.txtLog);
            this.Controls.Add(this.lblLogHeader);
            this.Controls.Add(this.tabControl);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.Name = "TestToolForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "FiscalStack API Test Tool";
            this.Load += new System.EventHandler(this.TestToolForm_Load);
            this.tabControl.ResumeLayout(false);
            this.tabStatus.ResumeLayout(false);
            this.tabStatus.PerformLayout();
            this.tabFiscalize.ResumeLayout(false);
            this.tabFiscalize.PerformLayout();
            this.tabDay.ResumeLayout(false);
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.TabControl tabControl;
        private System.Windows.Forms.TabPage tabStatus;
        private System.Windows.Forms.TabPage tabFiscalize;
        private System.Windows.Forms.TabPage tabDay;
        private System.Windows.Forms.Button btnPing;
        private System.Windows.Forms.Button btnGetDevice;
        private System.Windows.Forms.Label lblApiKey;
        private System.Windows.Forms.Label lblEndpoint;
        private System.Windows.Forms.Label lblInvoiceNo;
        private System.Windows.Forms.TextBox txtInvoiceNo;
        private System.Windows.Forms.Label lblAmount;
        private System.Windows.Forms.TextBox txtAmount;
        private System.Windows.Forms.Button btnSubmitInvoice;
        private System.Windows.Forms.Button btnSubmitCreditNote;
        private System.Windows.Forms.Button btnSubmitDebitNote;
        private System.Windows.Forms.Button btnCloseDay;
        private System.Windows.Forms.Label lblLogHeader;
        private System.Windows.Forms.RichTextBox txtLog;
    }
}
