namespace Revmax_Interface_Promun
{
    partial class ReceiptPreviewForm
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.panelReceipt = new System.Windows.Forms.Panel();
            this.lblCompany = new System.Windows.Forms.Label();
            this.lblAddress = new System.Windows.Forms.Label();
            this.lblTIN = new System.Windows.Forms.Label();
            this.lblVAT = new System.Windows.Forms.Label();
            this.lblDivider1 = new System.Windows.Forms.Label();
            this.lblInvoiceTitle = new System.Windows.Forms.Label();
            this.lblInvoiceNo = new System.Windows.Forms.Label();
            this.lblDate = new System.Windows.Forms.Label();
            this.lblCashier = new System.Windows.Forms.Label();
            this.lblDivider2 = new System.Windows.Forms.Label();
            this.txtItems = new System.Windows.Forms.RichTextBox();
            this.lblDivider3 = new System.Windows.Forms.Label();
            this.lblTotal = new System.Windows.Forms.Label();
            this.lblTax = new System.Windows.Forms.Label();
            this.lblDivider4 = new System.Windows.Forms.Label();
            this.lblVerification = new System.Windows.Forms.Label();
            this.lblFiscalDay = new System.Windows.Forms.Label();
            this.picQR = new System.Windows.Forms.PictureBox();
            this.lblQRLabel = new System.Windows.Forms.Label();
            this.lblDivider5 = new System.Windows.Forms.Label();
            this.lblThankYou = new System.Windows.Forms.Label();
            this.btnPrint = new System.Windows.Forms.Button();
            this.btnClose = new System.Windows.Forms.Button();
            this.panelReceipt.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.picQR)).BeginInit();
            this.SuspendLayout();

            // panelReceipt - white receipt background
            this.panelReceipt.AutoScroll = true;
            this.panelReceipt.BackColor = System.Drawing.Color.White;
            this.panelReceipt.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.panelReceipt.Location = new System.Drawing.Point(20, 15);
            this.panelReceipt.Name = "panelReceipt";
            this.panelReceipt.Size = new System.Drawing.Size(340, 560);
            this.panelReceipt.TabIndex = 0;
            this.panelReceipt.Controls.Add(this.lblCompany);
            this.panelReceipt.Controls.Add(this.lblAddress);
            this.panelReceipt.Controls.Add(this.lblTIN);
            this.panelReceipt.Controls.Add(this.lblVAT);
            this.panelReceipt.Controls.Add(this.lblDivider1);
            this.panelReceipt.Controls.Add(this.lblInvoiceTitle);
            this.panelReceipt.Controls.Add(this.lblInvoiceNo);
            this.panelReceipt.Controls.Add(this.lblDate);
            this.panelReceipt.Controls.Add(this.lblCashier);
            this.panelReceipt.Controls.Add(this.lblDivider2);
            this.panelReceipt.Controls.Add(this.txtItems);
            this.panelReceipt.Controls.Add(this.lblDivider3);
            this.panelReceipt.Controls.Add(this.lblTotal);
            this.panelReceipt.Controls.Add(this.lblTax);
            this.panelReceipt.Controls.Add(this.lblDivider4);
            this.panelReceipt.Controls.Add(this.lblVerification);
            this.panelReceipt.Controls.Add(this.lblFiscalDay);
            this.panelReceipt.Controls.Add(this.picQR);
            this.panelReceipt.Controls.Add(this.lblQRLabel);
            this.panelReceipt.Controls.Add(this.lblDivider5);
            this.panelReceipt.Controls.Add(this.lblThankYou);

            var mono = new System.Drawing.Font("Courier New", 8F);
            var monoBold = new System.Drawing.Font("Courier New", 9F, System.Drawing.FontStyle.Bold);
            int y = 10;
            int w = 318;

            // Company name
            this.lblCompany.AutoSize = false;
            this.lblCompany.Font = monoBold;
            this.lblCompany.ForeColor = System.Drawing.Color.Black;
            this.lblCompany.Location = new System.Drawing.Point(5, y);
            this.lblCompany.Name = "lblCompany";
            this.lblCompany.Size = new System.Drawing.Size(w, 20);
            this.lblCompany.Text = "COMPANY NAME";
            this.lblCompany.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            y += 20;

            this.lblAddress.AutoSize = false;
            this.lblAddress.Font = mono;
            this.lblAddress.ForeColor = System.Drawing.Color.Black;
            this.lblAddress.Location = new System.Drawing.Point(5, y);
            this.lblAddress.Name = "lblAddress";
            this.lblAddress.Size = new System.Drawing.Size(w, 16);
            this.lblAddress.Text = "Address";
            this.lblAddress.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            y += 16;

            this.lblTIN.AutoSize = false;
            this.lblTIN.Font = mono;
            this.lblTIN.ForeColor = System.Drawing.Color.Black;
            this.lblTIN.Location = new System.Drawing.Point(5, y);
            this.lblTIN.Name = "lblTIN";
            this.lblTIN.Size = new System.Drawing.Size(w, 16);
            this.lblTIN.Text = "TIN: ";
            this.lblTIN.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            y += 16;

            this.lblVAT.AutoSize = false;
            this.lblVAT.Font = mono;
            this.lblVAT.ForeColor = System.Drawing.Color.Black;
            this.lblVAT.Location = new System.Drawing.Point(5, y);
            this.lblVAT.Name = "lblVAT";
            this.lblVAT.Size = new System.Drawing.Size(w, 16);
            this.lblVAT.Text = "VAT REG: ";
            this.lblVAT.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            y += 20;

            this.lblDivider1.AutoSize = false;
            this.lblDivider1.Font = mono;
            this.lblDivider1.ForeColor = System.Drawing.Color.Black;
            this.lblDivider1.Location = new System.Drawing.Point(5, y);
            this.lblDivider1.Name = "lblDivider1";
            this.lblDivider1.Size = new System.Drawing.Size(w, 14);
            this.lblDivider1.Text = new string('-', 44);
            y += 14;

            this.lblInvoiceTitle.AutoSize = false;
            this.lblInvoiceTitle.Font = monoBold;
            this.lblInvoiceTitle.ForeColor = System.Drawing.Color.Black;
            this.lblInvoiceTitle.Location = new System.Drawing.Point(5, y);
            this.lblInvoiceTitle.Name = "lblInvoiceTitle";
            this.lblInvoiceTitle.Size = new System.Drawing.Size(w, 18);
            this.lblInvoiceTitle.Text = "*** FISCAL INVOICE ***";
            this.lblInvoiceTitle.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            y += 18;

            this.lblInvoiceNo.AutoSize = false;
            this.lblInvoiceNo.Font = mono;
            this.lblInvoiceNo.ForeColor = System.Drawing.Color.Black;
            this.lblInvoiceNo.Location = new System.Drawing.Point(5, y);
            this.lblInvoiceNo.Name = "lblInvoiceNo";
            this.lblInvoiceNo.Size = new System.Drawing.Size(w, 16);
            this.lblInvoiceNo.Text = "Invoice #: ";
            y += 16;

            this.lblDate.AutoSize = false;
            this.lblDate.Font = mono;
            this.lblDate.ForeColor = System.Drawing.Color.Black;
            this.lblDate.Location = new System.Drawing.Point(5, y);
            this.lblDate.Name = "lblDate";
            this.lblDate.Size = new System.Drawing.Size(w, 16);
            this.lblDate.Text = "Date: ";
            y += 16;

            this.lblCashier.AutoSize = false;
            this.lblCashier.Font = mono;
            this.lblCashier.ForeColor = System.Drawing.Color.Black;
            this.lblCashier.Location = new System.Drawing.Point(5, y);
            this.lblCashier.Name = "lblCashier";
            this.lblCashier.Size = new System.Drawing.Size(w, 16);
            this.lblCashier.Text = "Cashier: ";
            y += 20;

            this.lblDivider2.AutoSize = false;
            this.lblDivider2.Font = mono;
            this.lblDivider2.ForeColor = System.Drawing.Color.Black;
            this.lblDivider2.Location = new System.Drawing.Point(5, y);
            this.lblDivider2.Name = "lblDivider2";
            this.lblDivider2.Size = new System.Drawing.Size(w, 14);
            this.lblDivider2.Text = new string('-', 44);
            y += 14;

            this.txtItems.BackColor = System.Drawing.Color.White;
            this.txtItems.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.txtItems.Font = mono;
            this.txtItems.ForeColor = System.Drawing.Color.Black;
            this.txtItems.Location = new System.Drawing.Point(5, y);
            this.txtItems.Name = "txtItems";
            this.txtItems.ReadOnly = true;
            this.txtItems.ScrollBars = System.Windows.Forms.RichTextBoxScrollBars.None;
            this.txtItems.Size = new System.Drawing.Size(w, 60);
            this.txtItems.TabIndex = 0;
            this.txtItems.Text = "";
            y += 65;

            this.lblDivider3.AutoSize = false;
            this.lblDivider3.Font = mono;
            this.lblDivider3.ForeColor = System.Drawing.Color.Black;
            this.lblDivider3.Location = new System.Drawing.Point(5, y);
            this.lblDivider3.Name = "lblDivider3";
            this.lblDivider3.Size = new System.Drawing.Size(w, 14);
            this.lblDivider3.Text = new string('-', 44);
            y += 14;

            this.lblTotal.AutoSize = false;
            this.lblTotal.Font = monoBold;
            this.lblTotal.ForeColor = System.Drawing.Color.Black;
            this.lblTotal.Location = new System.Drawing.Point(5, y);
            this.lblTotal.Name = "lblTotal";
            this.lblTotal.Size = new System.Drawing.Size(w, 18);
            this.lblTotal.Text = "TOTAL:";
            y += 18;

            this.lblTax.AutoSize = false;
            this.lblTax.Font = mono;
            this.lblTax.ForeColor = System.Drawing.Color.Black;
            this.lblTax.Location = new System.Drawing.Point(5, y);
            this.lblTax.Name = "lblTax";
            this.lblTax.Size = new System.Drawing.Size(w, 16);
            this.lblTax.Text = "VAT (15%):";
            y += 20;

            this.lblDivider4.AutoSize = false;
            this.lblDivider4.Font = mono;
            this.lblDivider4.ForeColor = System.Drawing.Color.Black;
            this.lblDivider4.Location = new System.Drawing.Point(5, y);
            this.lblDivider4.Name = "lblDivider4";
            this.lblDivider4.Size = new System.Drawing.Size(w, 14);
            this.lblDivider4.Text = new string('=', 44);
            y += 14;

            this.lblVerification.AutoSize = false;
            this.lblVerification.Font = mono;
            this.lblVerification.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.lblVerification.Location = new System.Drawing.Point(5, y);
            this.lblVerification.Name = "lblVerification";
            this.lblVerification.Size = new System.Drawing.Size(w, 16);
            this.lblVerification.Text = "Verification: ";
            y += 16;

            this.lblFiscalDay.AutoSize = false;
            this.lblFiscalDay.Font = mono;
            this.lblFiscalDay.ForeColor = System.Drawing.Color.Black;
            this.lblFiscalDay.Location = new System.Drawing.Point(5, y);
            this.lblFiscalDay.Name = "lblFiscalDay";
            this.lblFiscalDay.Size = new System.Drawing.Size(w, 16);
            this.lblFiscalDay.Text = "Fiscal Day: ";
            y += 24;

            this.picQR.BackColor = System.Drawing.Color.White;
            this.picQR.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.picQR.Location = new System.Drawing.Point(109, y);
            this.picQR.Name = "picQR";
            this.picQR.Size = new System.Drawing.Size(110, 110);
            this.picQR.SizeMode = System.Windows.Forms.PictureBoxSizeMode.StretchImage;
            this.picQR.TabStop = false;
            y += 114;

            this.lblQRLabel.AutoSize = false;
            this.lblQRLabel.Font = mono;
            this.lblQRLabel.ForeColor = System.Drawing.Color.Gray;
            this.lblQRLabel.Location = new System.Drawing.Point(5, y);
            this.lblQRLabel.Name = "lblQRLabel";
            this.lblQRLabel.Size = new System.Drawing.Size(w, 14);
            this.lblQRLabel.Text = "Scan to verify with ZIMRA";
            this.lblQRLabel.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            y += 18;

            this.lblDivider5.AutoSize = false;
            this.lblDivider5.Font = mono;
            this.lblDivider5.ForeColor = System.Drawing.Color.Black;
            this.lblDivider5.Location = new System.Drawing.Point(5, y);
            this.lblDivider5.Name = "lblDivider5";
            this.lblDivider5.Size = new System.Drawing.Size(w, 14);
            this.lblDivider5.Text = new string('-', 44);
            y += 14;

            this.lblThankYou.AutoSize = false;
            this.lblThankYou.Font = monoBold;
            this.lblThankYou.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.lblThankYou.Location = new System.Drawing.Point(5, y);
            this.lblThankYou.Name = "lblThankYou";
            this.lblThankYou.Size = new System.Drawing.Size(w, 18);
            this.lblThankYou.Text = "*** THANK YOU — FISCALSTACK ***";
            this.lblThankYou.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;

            // Buttons
            this.btnPrint.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.btnPrint.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnPrint.ForeColor = System.Drawing.Color.White;
            this.btnPrint.Location = new System.Drawing.Point(20, 590);
            this.btnPrint.Name = "btnPrint";
            this.btnPrint.Size = new System.Drawing.Size(160, 36);
            this.btnPrint.TabIndex = 1;
            this.btnPrint.Text = "Print Receipt";
            this.btnPrint.UseVisualStyleBackColor = false;
            this.btnPrint.Click += new System.EventHandler(this.btnPrint_Click);

            this.btnClose.BackColor = System.Drawing.Color.FromArgb(80, 80, 80);
            this.btnClose.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnClose.ForeColor = System.Drawing.Color.White;
            this.btnClose.Location = new System.Drawing.Point(200, 590);
            this.btnClose.Name = "btnClose";
            this.btnClose.Size = new System.Drawing.Size(160, 36);
            this.btnClose.TabIndex = 2;
            this.btnClose.Text = "Close";
            this.btnClose.UseVisualStyleBackColor = false;
            this.btnClose.Click += new System.EventHandler(this.btnClose_Click);

            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = System.Drawing.Color.FromArgb(235, 238, 255);
            this.ClientSize = new System.Drawing.Size(380, 640);
            this.Controls.Add(this.panelReceipt);
            this.Controls.Add(this.btnPrint);
            this.Controls.Add(this.btnClose);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.Name = "ReceiptPreviewForm";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "FiscalStack — Receipt Preview";
            this.panelReceipt.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.picQR)).EndInit();
            this.ResumeLayout(false);
        }

        private System.Windows.Forms.Panel panelReceipt;
        private System.Windows.Forms.Label lblCompany;
        private System.Windows.Forms.Label lblAddress;
        private System.Windows.Forms.Label lblTIN;
        private System.Windows.Forms.Label lblVAT;
        private System.Windows.Forms.Label lblDivider1;
        private System.Windows.Forms.Label lblInvoiceTitle;
        private System.Windows.Forms.Label lblInvoiceNo;
        private System.Windows.Forms.Label lblDate;
        private System.Windows.Forms.Label lblCashier;
        private System.Windows.Forms.Label lblDivider2;
        private System.Windows.Forms.RichTextBox txtItems;
        private System.Windows.Forms.Label lblDivider3;
        private System.Windows.Forms.Label lblTotal;
        private System.Windows.Forms.Label lblTax;
        private System.Windows.Forms.Label lblDivider4;
        private System.Windows.Forms.Label lblVerification;
        private System.Windows.Forms.Label lblFiscalDay;
        private System.Windows.Forms.PictureBox picQR;
        private System.Windows.Forms.Label lblQRLabel;
        private System.Windows.Forms.Label lblDivider5;
        private System.Windows.Forms.Label lblThankYou;
        private System.Windows.Forms.Button btnPrint;
        private System.Windows.Forms.Button btnClose;
    }
}
