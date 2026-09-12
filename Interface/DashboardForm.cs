using System;
using System.Linq;
using System.Windows.Forms;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public partial class DashboardForm : Form
    {
        private OfflineQueue _offlineQueue;
        private FiscalStackClient _client;
        private CardDetails _cardDetails;

        public DashboardForm(OfflineQueue queue, FiscalStackClient client, CardDetails details)
        {
            _offlineQueue = queue;
            _client = client;
            _cardDetails = details;
            
            InitializeComponent();
            AppBranding.ApplyIcon(this);
            LoadData();
        }

        private void LoadData()
        {
            var meta = DeviceCacheManager.Current;

            // Load Stats
            lblStat1Value.Text = HistoryManager.GetTotalProcessedToday().ToString();
            lblStat2Value.Text = Math.Round(HistoryManager.GetSuccessRateToday(), 1) + "%";
            
            var offlineCount = _offlineQueue.Count;
            var failedCount = HistoryManager.GetFailedToday().Count;
            lblStat3Value.Text = failedCount + " / " + offlineCount;
            
            lblStat4Value.Text = !string.IsNullOrEmpty(meta.FiscalDay) ? meta.FiscalDay : "1";

            // Load History Grid
            var history = HistoryManager.GetRecent(50);
            gridHistory.DataSource = history.Select(h => new 
            {
                Time = h.Timestamp.ToString("HH:mm:ss"),
                Invoice = h.InvoiceId,
                Status = h.Success ? "Success" : "Failed",
                Amount = h.TotalAmount,
                Details = h.ErrorMessage
            }).ToList();

            // Load Pending Sync Queue Grid
            var pending = _offlineQueue.GetAll();
            gridQueue.DataSource = pending.Select(q => new
            {
                Invoice = q.Id,
                QueuedAt = q.QueuedAt.ToString("g"),
                Retries = q.RetryCount,
                Status = "Pending Network",
                LastError = q.LastError
            }).ToList();

            // Load Validation Failed Invoices Grid
            var failed = HistoryManager.GetFailedToday();
            gridFailed.DataSource = failed.Select(f => new
            {
                Invoice = f.InvoiceId,
                Time = f.Timestamp.ToString("HH:mm:ss"),
                Amount = f.TotalAmount,
                ErrorReason = f.ErrorMessage
            }).ToList();

            // Add context menu to history grid for printing
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Renderer = new CustomMenuRenderer();
            var printItem = new ToolStripMenuItem("View / Reprint Receipt");
            printItem.Click += PrintItem_Click;
            menu.Items.Add(printItem);
            gridHistory.ContextMenuStrip = menu;
        }

        private void PrintItem_Click(object sender, EventArgs e)
        {
            if (gridHistory.SelectedRows.Count == 0) return;
            var row = gridHistory.SelectedRows[0];
            string invoiceId = row.Cells["Invoice"].Value.ToString();

            // Find full record
            var record = HistoryManager.GetRecent(100).FirstOrDefault(r => r.InvoiceId == invoiceId);
            if (record != null && record.Success && !string.IsNullOrEmpty(record.RawJson))
            {
                ReceiptPreviewForm.ShowFromJson(record.RawJson, _cardDetails);
            }
            else
            {
                MessageBox.Show("No valid receipt data found for this record.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
