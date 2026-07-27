using System;
using System.Drawing;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    public partial class DashboardForm : Form
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
            this.lblTitle = new System.Windows.Forms.Label();
            this.lblSubtitle = new System.Windows.Forms.Label();
            
            this.panelStats = new System.Windows.Forms.TableLayoutPanel();
            this.pnlStat1 = new System.Windows.Forms.Panel();
            this.lblStat1Title = new System.Windows.Forms.Label();
            this.lblStat1Value = new System.Windows.Forms.Label();
            
            this.pnlStat2 = new System.Windows.Forms.Panel();
            this.lblStat2Title = new System.Windows.Forms.Label();
            this.lblStat2Value = new System.Windows.Forms.Label();
            
            this.pnlStat3 = new System.Windows.Forms.Panel();
            this.lblStat3Title = new System.Windows.Forms.Label();
            this.lblStat3Value = new System.Windows.Forms.Label();
            
            this.pnlStat4 = new System.Windows.Forms.Panel();
            this.lblStat4Title = new System.Windows.Forms.Label();
            this.lblStat4Value = new System.Windows.Forms.Label();

            this.tabControl = new System.Windows.Forms.TabControl();
            this.tabHistory = new System.Windows.Forms.TabPage();
            this.gridHistory = new System.Windows.Forms.DataGridView();
            
            this.tabQueue = new System.Windows.Forms.TabPage();
            this.gridQueue = new System.Windows.Forms.DataGridView();
            this.tabFailed = new System.Windows.Forms.TabPage();
            this.gridFailed = new System.Windows.Forms.DataGridView();

            this.btnClose = new System.Windows.Forms.Button();

            this.panelHeader.SuspendLayout();
            this.panelStats.SuspendLayout();
            this.pnlStat1.SuspendLayout();
            this.pnlStat2.SuspendLayout();
            this.pnlStat3.SuspendLayout();
            this.pnlStat4.SuspendLayout();
            this.tabControl.SuspendLayout();
            this.tabHistory.SuspendLayout();
            this.tabQueue.SuspendLayout();
            this.tabFailed.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.gridHistory)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.gridQueue)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.gridFailed)).BeginInit();
            this.SuspendLayout();

            // Header
            this.panelHeader.BackColor = System.Drawing.Color.FromArgb(51, 85, 255);
            this.panelHeader.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelHeader.Height = 70;
            this.panelHeader.Controls.Add(this.lblTitle);
            this.panelHeader.Controls.Add(this.lblSubtitle);

            this.lblTitle.AutoSize = true;
            this.lblTitle.Font = new System.Drawing.Font("Segoe UI", 15F, System.Drawing.FontStyle.Bold);
            this.lblTitle.ForeColor = System.Drawing.Color.White;
            this.lblTitle.Location = new System.Drawing.Point(20, 10);
            this.lblTitle.Text = "📊  FiscalStack Dashboard";

            this.lblSubtitle.AutoSize = true;
            this.lblSubtitle.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.lblSubtitle.ForeColor = System.Drawing.Color.FromArgb(200, 220, 255);
            this.lblSubtitle.Location = new System.Drawing.Point(22, 42);
            this.lblSubtitle.Text = "Real-time metrics and historical logs";

            // Stats Panel
            this.panelStats.ColumnCount = 4;
            this.panelStats.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 25F));
            this.panelStats.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 25F));
            this.panelStats.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 25F));
            this.panelStats.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 25F));
            this.panelStats.Controls.Add(this.pnlStat1, 0, 0);
            this.panelStats.Controls.Add(this.pnlStat2, 1, 0);
            this.panelStats.Controls.Add(this.pnlStat3, 2, 0);
            this.panelStats.Controls.Add(this.pnlStat4, 3, 0);
            this.panelStats.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelStats.Height = 90;
            this.panelStats.Padding = new System.Windows.Forms.Padding(10);
            this.panelStats.BackColor = System.Drawing.Color.FromArgb(245, 247, 255);

            SetupStatPanel(this.pnlStat1, this.lblStat1Title, this.lblStat1Value, "Today's Receipts");
            SetupStatPanel(this.pnlStat2, this.lblStat2Title, this.lblStat2Value, "Success Rate");
            SetupStatPanel(this.pnlStat3, this.lblStat3Title, this.lblStat3Value, "Failed / Queue");
            SetupStatPanel(this.pnlStat4, this.lblStat4Title, this.lblStat4Value, "Fiscal Day #");

            // Tab Control
            this.tabControl.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tabControl.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.tabControl.Controls.Add(this.tabHistory);
            this.tabControl.Controls.Add(this.tabQueue);
            this.tabControl.Controls.Add(this.tabFailed);

            this.tabHistory.Text = "📜  Recent Activity";
            this.tabHistory.Controls.Add(this.gridHistory);
            
            this.tabQueue.Text = "⏳  Pending Sync Queue";
            this.tabQueue.Controls.Add(this.gridQueue);

            this.tabFailed.Text = "❌  Failed Invoices";
            this.tabFailed.Controls.Add(this.gridFailed);

            // Grids
            SetupGrid(this.gridHistory);
            SetupGrid(this.gridQueue);
            SetupGrid(this.gridFailed);

            // Close Button
            this.btnClose.Text = "Close";
            this.btnClose.Dock = System.Windows.Forms.DockStyle.Bottom;
            this.btnClose.Height = 40;
            this.btnClose.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.btnClose.BackColor = System.Drawing.Color.White;
            this.btnClose.Click += (s, e) => this.Close();

            // Form
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(780, 560);
            this.Controls.Add(this.tabControl);
            this.Controls.Add(this.panelStats);
            this.Controls.Add(this.btnClose);
            this.Controls.Add(this.panelHeader);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "FiscalStack Dashboard";

            this.panelHeader.ResumeLayout(false);
            this.panelHeader.PerformLayout();
            this.panelStats.ResumeLayout(false);
            this.pnlStat1.ResumeLayout(false);
            this.pnlStat2.ResumeLayout(false);
            this.pnlStat3.ResumeLayout(false);
            this.pnlStat4.ResumeLayout(false);
            this.tabControl.ResumeLayout(false);
            this.tabHistory.ResumeLayout(false);
            this.tabQueue.ResumeLayout(false);
            this.tabFailed.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.gridHistory)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.gridQueue)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.gridFailed)).EndInit();
            this.ResumeLayout(false);
        }

        private void SetupStatPanel(Panel pnl, Label title, Label val, string text)
        {
            pnl.Dock = System.Windows.Forms.DockStyle.Fill;
            pnl.BackColor = System.Drawing.Color.White;
            pnl.Margin = new System.Windows.Forms.Padding(5);
            pnl.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;

            title.Text = text;
            title.Font = new System.Drawing.Font("Segoe UI", 8F, System.Drawing.FontStyle.Bold);
            title.ForeColor = System.Drawing.Color.Gray;
            title.Location = new System.Drawing.Point(10, 10);
            title.AutoSize = true;

            val.Text = "0";
            val.Font = new System.Drawing.Font("Segoe UI", 18F, System.Drawing.FontStyle.Bold);
            val.ForeColor = System.Drawing.Color.FromArgb(51, 85, 255);
            val.Location = new System.Drawing.Point(8, 28);
            val.AutoSize = true;

            pnl.Controls.Add(title);
            pnl.Controls.Add(val);
        }

        private void SetupGrid(DataGridView grid)
        {
            grid.Dock = System.Windows.Forms.DockStyle.Fill;
            grid.BackgroundColor = System.Drawing.Color.White;
            grid.BorderStyle = System.Windows.Forms.BorderStyle.None;
            grid.AllowUserToAddRows = false;
            grid.AllowUserToDeleteRows = false;
            grid.ReadOnly = true;
            grid.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            grid.AutoSizeColumnsMode = System.Windows.Forms.DataGridViewAutoSizeColumnsMode.Fill;
            grid.RowHeadersVisible = false;
        }

        private System.Windows.Forms.Panel panelHeader;
        private System.Windows.Forms.Label lblTitle;
        private System.Windows.Forms.Label lblSubtitle;
        private System.Windows.Forms.TableLayoutPanel panelStats;
        private System.Windows.Forms.Panel pnlStat1;
        private System.Windows.Forms.Label lblStat1Title;
        public System.Windows.Forms.Label lblStat1Value;
        private System.Windows.Forms.Panel pnlStat2;
        private System.Windows.Forms.Label lblStat2Title;
        public System.Windows.Forms.Label lblStat2Value;
        private System.Windows.Forms.Panel pnlStat3;
        private System.Windows.Forms.Label lblStat3Title;
        public System.Windows.Forms.Label lblStat3Value;
        private System.Windows.Forms.Panel pnlStat4;
        private System.Windows.Forms.Label lblStat4Title;
        public System.Windows.Forms.Label lblStat4Value;
        private System.Windows.Forms.TabControl tabControl;
        private System.Windows.Forms.TabPage tabHistory;
        public System.Windows.Forms.DataGridView gridHistory;
        private System.Windows.Forms.TabPage tabQueue;
        public System.Windows.Forms.DataGridView gridQueue;
        private System.Windows.Forms.TabPage tabFailed;
        public System.Windows.Forms.DataGridView gridFailed;
        private System.Windows.Forms.Button btnClose;
    }
}
