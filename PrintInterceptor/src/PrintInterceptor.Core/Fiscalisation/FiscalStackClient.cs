using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using PrintInterceptor.Core.Configuration;
using PrintInterceptor.Core.Diagnostics;
using PrintInterceptor.Core.State;

namespace PrintInterceptor.Core.Fiscalisation;

public enum FiscalizeOutcomeStatus
{
    Success,
    Rejected,
    Ambiguous
}

public sealed record FiscalizeOutcome(
    FiscalizeOutcomeStatus Status,
    FiscalizeResponse? Response,
    string? Error,
    int? HttpStatus);

public sealed class FiscalStackClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    private readonly HttpClient _http;
    private readonly HttpClient _probeHttp;
    private readonly HttpClient _fileHttp;
    private readonly HttpClient _actionHttp;
    private readonly InterceptorConfig _config;
    private readonly ILog _log;
    private readonly object _probeGate = new();
    private DateTimeOffset _probeAt = DateTimeOffset.MinValue;
    private bool _probeResult;

    public FiscalStackClient(InterceptorConfig config, ILog log)
    {
        _config = config;
        _log = log;
        _http = new HttpClient
        {
            BaseAddress = new Uri(config.ApiEndpoint),
            Timeout = TimeSpan.FromSeconds(config.ApiTimeoutSeconds)
        };
        _probeHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        _fileHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(config.ApiTimeoutSeconds) };
        // Closing a fiscal day waits for ZIMRA to confirm asynchronously, which
        // can take most of a minute; a 30 s timeout would report a false failure.
        _actionHttp = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(Math.Max(config.ApiTimeoutSeconds, 150))
        };

        if (!string.IsNullOrWhiteSpace(config.ApiKey))
        {
            _http.DefaultRequestHeaders.Add("X-API-Key", config.ApiKey);
            _actionHttp.DefaultRequestHeaders.Add("X-API-Key", config.ApiKey);
        }

        _actionHttp.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    /// <summary>
    /// Cheap reachability check. Any HTTP response (including 404/401) means the
    /// API host is reachable; only transport failures count as offline. Results
    /// are cached for a few seconds because the pipeline probes once per job.
    /// </summary>
    public async Task<bool> IsReachableAsync(CancellationToken cancellationToken)
    {
        lock (_probeGate)
        {
            if (DateTimeOffset.UtcNow - _probeAt < TimeSpan.FromSeconds(5))
            {
                return _probeResult;
            }
        }

        var reachable = false;
        try
        {
            using var response = await _probeHttp.GetAsync(
                new Uri(_config.ApiEndpoint), HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            reachable = true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            reachable = false;
        }

        lock (_probeGate)
        {
            _probeAt = DateTimeOffset.UtcNow;
            _probeResult = reachable;
        }

        return reachable;
    }

    public async Task<OfflineState?> GetOfflineStateAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _http.GetAsync(
                OfflineStateUri(_config.ApiEndpoint), cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _log.Warn($"Offline state request failed with HTTP {(int)response.StatusCode}.");
                return null;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<OfflineState>(body, JsonOptions);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Warn($"Could not read the offline fiscal state: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Reads the tenant identity used on printed receipts. Requires only the
    /// API key; the route resolves the company server-side.
    /// </summary>
    public async Task<CompanyProfile?> GetCompanyProfileAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _http.GetAsync("company", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _log.Warn($"Company profile request failed with HTTP {(int)response.StatusCode}.");
                return null;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<CompanyProfile>(body, JsonOptions);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Warn($"Could not read the company profile: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Downloads a company logo for local printing. Only raster formats GDI can
    /// render are accepted; anything else is ignored and the local logo wins.
    /// </summary>
    public async Task<byte[]?> DownloadImageAsync(string url, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return null;
        }

        try
        {
            using var response = await _fileHttp.GetAsync(uri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _log.Warn($"Logo download failed with HTTP {(int)response.StatusCode}.");
                return null;
            }

            var mediaType = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!mediaType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            {
                _log.Warn($"Logo URL returned '{mediaType}', not an image; keeping the local logo.");
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            const int maxBytes = 4 * 1024 * 1024;
            if (bytes.Length == 0 || bytes.Length > maxBytes)
            {
                _log.Warn($"Logo download returned {bytes.Length} bytes; keeping the local logo.");
                return null;
            }

            return bytes;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Warn($"Could not download the company logo: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Live device state — fiscal day number/status, counters and any close
    /// error. The server resolves ZIMRA vs LEKUKA from the API key.
    /// </summary>
    public async Task<DeviceStatusResult> GetDeviceStatusAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _http.GetAsync(
                RootEndpoint("/api/zimra/device-status"), cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return new DeviceStatusResult(false, DescribeError(body, (int)response.StatusCode), null);
            }

            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (string.Equals(Scalar(root, "Code"), "0", StringComparison.Ordinal))
            {
                return new DeviceStatusResult(false,
                    Scalar(root, "Message") ?? "The server rejected the device status request.", null);
            }

            var data = DataOf(root);
            var status = new FiscalDeviceStatus
            {
                DeviceId = Scalar(root, "DeviceID", "deviceId") ?? "",
                SerialNumber = Scalar(root, "DeviceSerialNumber", "serialNumber") ?? "",
                FiscalDayStatus = Scalar(data, "fiscalDayStatus") ?? "",
                FiscalDayNo = ToInt(Scalar(root, "FiscalDay"))
                              ?? ToInt(Scalar(data, "lastFiscalDayNo", "fiscalDayNo")),
                LastReceiptGlobalNo = ToLong(Scalar(data, "lastReceiptGlobalNo", "receiptGlobalNo")),
                FiscalDayClosingErrorCode = Blank(Scalar(data, "fiscalDayClosingErrorCode")),
                FiscalDayOpenedAt = ToDate(Scalar(data, "fiscalDayOpenedAt", "fiscalDayOpened")),
                OperationId = Blank(Scalar(data, "operationID", "operationId"))
            };

            return new DeviceStatusResult(true, null, status);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Warn($"Could not read the fiscal device status: {ex.Message}");
            return new DeviceStatusResult(false, ex.Message, null);
        }
    }

    /// <summary>The registered device card: TIN, VAT, company, serial and logo.</summary>
    public async Task<DeviceCardResult> GetDeviceDetailsAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _http.GetAsync(
                RootEndpoint("/api/zimra/device-details"), cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return new DeviceCardResult(false, DescribeError(body, (int)response.StatusCode), null);
            }

            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (string.Equals(Scalar(root, "Code"), "0", StringComparison.Ordinal))
            {
                return new DeviceCardResult(false,
                    Scalar(root, "Message") ?? "The server rejected the card-details request.", null);
            }

            var data = DataOf(root);
            var card = new FiscalCardDetails
            {
                Tin = Scalar(data, "TIN", "tin") ?? "",
                Bpn = Scalar(data, "BPN", "bpn") ?? "",
                Vat = Scalar(data, "VAT", "vat", "vatNumber") ?? "",
                CompanyName = Scalar(data, "COMPANYNAME", "companyName", "name") ?? "",
                Address = Scalar(data, "ADDRESS", "address") ?? "",
                RegistrationNumber = Scalar(data, "REGISTRATIONNUMBER", "registrationNumber", "deviceId") ?? "",
                SerialNumber = Scalar(data, "SERIALNUMBER", "serialNumber", "deviceSerialNumber") ?? "",
                LogoUrl = Scalar(data, "LOGOURL", "logoUrl") ?? ""
            };

            return new DeviceCardResult(true, null, card);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Warn($"Could not read the fiscal device card: {ex.Message}");
            return new DeviceCardResult(false, ex.Message, null);
        }
    }

    public async Task<FiscalDayActionResult> OpenFiscalDayAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _actionHttp.PostAsync(
                RootEndpoint("/api/zimra/day/open"), JsonContent.Create(new { }), cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return new FiscalDayActionResult(false, false,
                    DescribeError(body, (int)response.StatusCode), ErrorCode(body), null);
            }

            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var dayNo = ToInt(Scalar(root, "fiscalDayNo", "FiscalDay", "lastFiscalDayNo"))
                        ?? ToInt(Scalar(DataOf(root), "fiscalDayNo", "lastFiscalDayNo"));
            var message = Scalar(root, "message", "Message")
                          ?? (dayNo is null ? "Fiscal day opened." : $"Fiscal day {dayNo} opened.");
            return new FiscalDayActionResult(true, false, message, null, dayNo);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Error("Could not open the fiscal day", ex);
            return new FiscalDayActionResult(false, false, ex.Message, null, null);
        }
    }

    /// <summary>
    /// Submits a day close. ZIMRA confirms closure asynchronously, so a 202
    /// response means the close was accepted but is not confirmed yet.
    /// </summary>
    public async Task<FiscalDayActionResult> CloseFiscalDayAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _actionHttp.PostAsync(
                RootEndpoint("/api/zimra/day/close"), JsonContent.Create(new { }), cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if ((int)response.StatusCode == 202)
            {
                return new FiscalDayActionResult(false, true,
                    DescribeError(body, 202), ErrorCode(body), null);
            }

            if (!response.IsSuccessStatusCode)
            {
                return new FiscalDayActionResult(false, false,
                    DescribeError(body, (int)response.StatusCode), ErrorCode(body), null);
            }

            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var dayNo = ToInt(Scalar(root, "fiscalDayNo", "FiscalDay"))
                        ?? ToInt(Scalar(DataOf(root), "fiscalDayNo"));
            var message = Scalar(root, "message", "Message")
                          ?? (dayNo is null ? "Fiscal day closed." : $"Fiscal day {dayNo} closed.");
            return new FiscalDayActionResult(true, false, message, null, dayNo);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _log.Error("Could not close the fiscal day", ex);
            return new FiscalDayActionResult(false, false, ex.Message, null, null);
        }
    }

    private Uri RootEndpoint(string path) => new(new Uri(_config.ApiEndpoint), path);

    private static JsonElement DataOf(JsonElement root)
    {
        foreach (var property in root.EnumerateObject())
        {
            if (string.Equals(property.Name, "Data", StringComparison.OrdinalIgnoreCase) &&
                property.Value.ValueKind == JsonValueKind.Object)
            {
                return property.Value;
            }
        }

        return root;
    }

    private static string? Scalar(JsonElement element, params string[] names)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var property in element.EnumerateObject())
        {
            if (property.Value.ValueKind is not (JsonValueKind.String or JsonValueKind.Number))
            {
                continue;
            }

            foreach (var name in names)
            {
                if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    return property.Value.ValueKind == JsonValueKind.String
                        ? property.Value.GetString()
                        : property.Value.ToString();
                }
            }
        }

        return null;
    }

    private static int? ToInt(string? value) => int.TryParse(value, out var parsed) ? parsed : null;

    private static long? ToLong(string? value) => long.TryParse(value, out var parsed) ? parsed : null;

    private static DateTimeOffset? ToDate(string? value) =>
        DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private static string? ErrorCode(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            return Scalar(document.RootElement,
                "fiscalDayClosingErrorCode", "zimraErrorCode", "errorCode");
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string DescribeError(string body, int status)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var message = Scalar(root, "message", "Message", "lastError", "error", "detail");
            var code = Scalar(root, "fiscalDayClosingErrorCode", "zimraErrorCode", "errorCode");
            if (!string.IsNullOrWhiteSpace(message))
            {
                return code is null ? message : $"{message} ({code})";
            }
        }
        catch (JsonException)
        {
            // Not JSON; fall through to the raw body.
        }

        if (string.IsNullOrWhiteSpace(body))
        {
            return $"HTTP {status}";
        }

        return body.Length <= 500 ? body : body[..500];
    }

    /// <summary>
    /// The API key identifies the tenant, so provisioning never takes a company
    /// id. The /api/zimra alias resolves the key's company server-side;
    /// /api/companies/0/... would fall back to the first tenant with a device.
    /// </summary>
    public static Uri OfflineStateUri(string apiEndpoint)
    {
        var root = new Uri(new Uri(apiEndpoint), "/");
        return new Uri(root, "api/zimra/offline-state");
    }

    public async Task<FiscalizeOutcome> FiscaliseAsync(FiscalizeRequest request, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _http.PostAsJsonAsync("fiscalize", request, JsonOptions, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var message = ExtractMessage(body) ?? $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}";

                if ((int)response.StatusCode >= 500)
                {
                    _log.Warn($"Fiscalisation server error ({(int)response.StatusCode}): {message}");
                    return new FiscalizeOutcome(FiscalizeOutcomeStatus.Ambiguous, null, message,
                        (int)response.StatusCode);
                }

                _log.Warn($"Fiscalisation rejected ({(int)response.StatusCode}): {message}");
                return new FiscalizeOutcome(FiscalizeOutcomeStatus.Rejected, null, message,
                    (int)response.StatusCode);
            }

            FiscalizeResponse? parsed;
            try
            {
                parsed = JsonSerializer.Deserialize<FiscalizeResponse>(body, JsonOptions);
            }
            catch (JsonException ex)
            {
                _log.Error("Fiscalisation returned an unreadable success body; outcome is ambiguous", ex);
                return new FiscalizeOutcome(FiscalizeOutcomeStatus.Ambiguous, null,
                    "The server accepted the request but its response could not be read.", 200);
            }

            if (parsed is null)
            {
                return new FiscalizeOutcome(FiscalizeOutcomeStatus.Ambiguous, null,
                    "The server returned an empty response.", 200);
            }

            if (parsed.Success)
            {
                return new FiscalizeOutcome(FiscalizeOutcomeStatus.Success, parsed, null,
                    (int)response.StatusCode);
            }

            var rejection = parsed.Error ?? parsed.Message ?? "The server declined the receipt.";
            _log.Warn($"Fiscalisation declined: {rejection}");
            return new FiscalizeOutcome(FiscalizeOutcomeStatus.Rejected, parsed, rejection,
                (int)response.StatusCode);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (TaskCanceledException ex)
        {
            _log.Error("Fiscalisation request timed out; the receipt may or may not exist", ex);
            return new FiscalizeOutcome(FiscalizeOutcomeStatus.Ambiguous, null,
                $"The request timed out after {_config.ApiTimeoutSeconds}s.", null);
        }
        catch (HttpRequestException ex)
        {
            _log.Error("Fiscalisation request failed; the receipt may or may not exist", ex);
            return new FiscalizeOutcome(FiscalizeOutcomeStatus.Ambiguous, null, ex.Message, null);
        }
        catch (Exception ex)
        {
            _log.Error("Unexpected fiscalisation error", ex);
            return new FiscalizeOutcome(FiscalizeOutcomeStatus.Ambiguous, null, ex.Message, null);
        }
    }

    public void Dispose()
    {
        _http.Dispose();
        _probeHttp.Dispose();
        _fileHttp.Dispose();
        _actionHttp.Dispose();
    }

    private static string? ExtractMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            foreach (var property in new[] { "message", "error", "detail" })
            {
                if (root.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String)
                {
                    return value.GetString();
                }
            }
        }
        catch (JsonException)
        {
            // Not JSON; return an excerpt of the raw body.
        }

        return body.Length <= 500 ? body : body[..500];
    }
}
