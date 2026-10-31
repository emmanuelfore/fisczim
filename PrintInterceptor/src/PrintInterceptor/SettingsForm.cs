using System.Drawing;
using System.Windows.Forms;
using PrintInterceptor.Core.Configuration;
using PrintInterceptor.Core.Diagnostics;
using PrintInterceptor.Core.Fiscalisation;
using PrintInterceptor.Core.State;

namespace PrintInterceptor;

public sealed class SettingsForm : Form
{
    private readonly InterceptorConfig _config;
    private readonly ILog _log;
    private readonly OfflineReceiptService _offline;

    private readonly TextBox _apiEndpoint;
    private readonly TextBox _apiKey;
    private readonly CheckBox _printingEnabled;
    private readonly ComboBox _format;
    private readonly TextBox _printerName;
    private readonly TextBox _a4PrinterName;
    private readonly NumericUpDown _paperWidth;
    private readonly CheckBox _offlineEnabled;
    private readonly Button _refresh;
    private readonly Label _status;

    public SettingsForm(InterceptorConfig config, ILog log, OfflineReceiptService offline)
    {
        _config = config;
        _log = log;
        _offline = offline;

        Text = "PrintInterceptor settings";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = true;
        TopMost = true;
        ClientSize = new Size(720, 600);

        _apiEndpoint = new TextBox { Text = config.ApiEndpoint, Dock = DockStyle.Fill };
        _apiKey = new TextBox { Text = config.ApiKey, Dock = DockStyle.Fill, UseSystemPasswordChar = true };
        _printingEnabled = new CheckBox
        {
            Text = "Print the fiscal receipt automatically",
            Checked = config.Printing.Enabled,
            AutoSize = true
        };

        _format = new ComboBox
        {
            Dock = DockStyle.Left,
            Width = 230,
            DropDownStyle = ComboBoxStyle.DropDownList
        };
        _format.Items.AddRange(new object[]
        {
            "Thermal receipt (58/80 mm)",
            "A4 invoice",
            "Auto (A4 for PDF print jobs)"
        });
        _format.SelectedIndex = config.Printing.Format.Trim().ToLowerInvariant() switch
        {
            "a4" => 1,
            "auto" => 2,
            _ => 0
        };

        _printerName = new TextBox { Text = config.Printing.PrinterName, Dock = DockStyle.Fill };
        _a4PrinterName = new TextBox { Text = config.Printing.A4PrinterName, Dock = DockStyle.Fill };
        _paperWidth = new NumericUpDown
        {
            Minimum = 40,
            Maximum = 120,
            Value = Math.Clamp(config.Printing.PaperWidthMm, 40, 120),
            Dock = DockStyle.Left,
            Width = 90
        };

        _offlineEnabled = new CheckBox
        {
            Text = "Sign receipts offline when the API is unreachable",
            Checked = config.Offline.Enabled,
            AutoSize = true
        };

        _refresh = new Button { Text = "Refresh from FiscalStack", AutoSize = true };
        _refresh.Click += RefreshProvisioning;

        _status = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.FromArgb(248, 250, 252),
            ForeColor = Color.FromArgb(51, 65, 85),
            Padding = new Padding(6),
            Text = "Not provisioned yet. Enable offline signing and press Refresh."
        };

        var statusHost = new Panel { Dock = DockStyle.Fill, Height = 96 };
        statusHost.Controls.Add(_status);

        _offlineEnabled.CheckedChanged += (_, _) => _refresh.Enabled = _offlineEnabled.Checked;

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            Padding = new Padding(14, 14, 14, 4)
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddRow(table, "API endpoint", _apiEndpoint);
        AddRow(table, "API key", _apiKey);
        AddRow(table, "", Separator("Printing"));
        AddRow(table, "", _printingEnabled);
        AddRow(table, "Output format", _format);
        AddRow(table, "Receipt printer (thermal)", _printerName);
        AddRow(table, "A4 invoice printer", _a4PrinterName);
        AddRow(table, "Paper width (mm)", _paperWidth);
        AddRow(table, "", Separator("Offline fiscalisation"));
        AddRow(table, "", _offlineEnabled);
        AddRow(table, "", _refresh);
        AddRow(table, "Provisioned state", statusHost);

        var note = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(440, 0),
            ForeColor = Color.DimGray,
            Text = "Offline signing is provisioned from FiscalStack with the API key: the ZIMRA device " +
                   "ID, RSA private key, tax buckets, QR base URL and receipt counters come from " +
                   "/api/zimra/offline-state and are cached for restarts. Save applies printing changes " +
                   "immediately; restart PrintInterceptor after changing the endpoint, API key, or " +
                   "offline signing."
        };
        table.Controls.Add(new Label(), 0, table.RowCount);
        table.Controls.Add(note, 1, table.RowCount);
        table.RowCount++;

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(10)
        };
        var save = new Button { Text = "Save", Width = 100, DialogResult = DialogResult.None };
        var cancel = new Button { Text = "Cancel", Width = 100, DialogResult = DialogResult.Cancel };
        save.Click += (_, _) => SaveSettings();
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);

        var content = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        content.Controls.Add(table);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        root.Controls.Add(content, 0, 0);
        root.Controls.Add(buttons, 0, 1);

        AcceptButton = save;
        CancelButton = cancel;
        Controls.Add(root);

        _refresh.Enabled = _offlineEnabled.Checked;
        UpdateStatusText();
    }

    private void UpdateStatusText()
    {
        var state = _offline.RemoteState;
        if (state is null)
        {
            _status.Text = _config.Offline.Enabled
                ? "No device state loaded yet. Press Refresh from FiscalStack."
                : "Offline signing is disabled.";
            return;
        }

        var taxes = string.Join(", ", new[]
        {
            DescribeTax("STANDARD", state.Taxes?.Standard),
            DescribeTax("ZERO_RATED", state.Taxes?.ZeroRated),
            DescribeTax("EXEMPT", state.Taxes?.Exempt)
        }.Where(value => value is not null));

        _status.Text =
            $"Device: {_offline.EffectiveDeviceId}   Serial: {OrDash(state.DeviceSerialNo)}{Environment.NewLine}" +
            $"Fiscal day: {state.CurrentFiscalDayNo} ({(state.FiscalDayOpen ? "open" : "closed")})   " +
            $"Counter: {state.DailyReceiptCount}   Global no: {state.LastReceiptGlobalNo}{Environment.NewLine}" +
            $"Key: {_offline.KeySourceText}" +
            (_offline.ProvisionedAt is { } at ? $"   Updated: {at:yyyy-MM-dd HH:mm}" : "") +
            $"{Environment.NewLine}Taxes: {(taxes.Length > 0 ? taxes : "not returned")}";
    }

    private static string? DescribeTax(string type, OfflineStateTax? tax) =>
        tax is null
            ? null
            : $"{type}={tax.TaxCode}/{tax.TaxId}" +
              (tax.TaxPercent > 0 ? $"@{tax.TaxPercent:0.##}%" : "");

    private static string OrDash(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value!;

    private async void RefreshProvisioning(object? sender, EventArgs e)
    {
        if (!_config.Offline.Enabled && !_offlineEnabled.Checked)
        {
            MessageBox.Show("Enable offline signing first, then refresh.", "PrintInterceptor",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var endpoint = _apiEndpoint.Text.Trim();
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            MessageBox.Show("The API endpoint must be an absolute http(s) URL.", "PrintInterceptor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _refresh.Enabled = false;
        _status.Text = "Contacting FiscalStack…";

        try
        {
            // The service reads this from the shared config, so mirror the form
            // before asking it to provision.
            _config.Offline.Enabled = _offlineEnabled.Checked;

            var probeConfig = new InterceptorConfig
            {
                ApiEndpoint = endpoint.EndsWith('/') ? endpoint : endpoint + "/",
                ApiKey = _apiKey.Text.Trim(),
                ApiTimeoutSeconds = _config.ApiTimeoutSeconds
            };

            using var client = new FiscalStackClient(probeConfig, _log);
            var refreshed = await _offline.RefreshStateAsync(client, CancellationToken.None);
            if (!refreshed)
            {
                _status.Text = "FiscalStack did not return usable ZIMRA state. Check the API key and " +
                               "endpoint. Details are in the log.";
                return;
            }

            UpdateStatusText();
        }
        catch (Exception ex)
        {
            _log.Error("Could not provision offline fiscalisation from FiscalStack", ex);
            _status.Text = $"Provisioning failed: {ex.Message}";
        }
        finally
        {
            _refresh.Enabled = _offlineEnabled.Checked;
        }
    }

    private static Label Separator(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        Margin = new Padding(3, 12, 3, 3)
    };

    private static void AddRow(TableLayoutPanel table, string label, Control control)
    {
        var row = table.RowCount++;
        if (label.Length > 0)
        {
            table.Controls.Add(new Label
            {
                Text = label,
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleLeft,
                Anchor = AnchorStyles.Left
            }, 0, row);
        }
        else
        {
            table.Controls.Add(new Label(), 0, row);
        }

        table.Controls.Add(control, 1, row);
    }

    private void SaveSettings()
    {
        var endpoint = _apiEndpoint.Text.Trim();
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            MessageBox.Show("The API endpoint must be an absolute http(s) URL.", "PrintInterceptor",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _config.ApiEndpoint = endpoint.EndsWith('/') ? endpoint : endpoint + "/";
        _config.ApiKey = _apiKey.Text.Trim();
        _config.Printing.Enabled = _printingEnabled.Checked;
        _config.Printing.Format = _format.SelectedIndex switch
        {
            1 => "a4",
            2 => "auto",
            _ => "thermal"
        };
        _config.Printing.PrinterName = _printerName.Text.Trim();
        _config.Printing.A4PrinterName = _a4PrinterName.Text.Trim();
        _config.Printing.PaperWidthMm = (int)_paperWidth.Value;
        _config.Offline.Enabled = _offlineEnabled.Checked;

        try
        {
            _config.Save();
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            _log.Error("Could not save PrintInterceptor settings", ex);
            MessageBox.Show(ex.Message, "Could not save settings", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
