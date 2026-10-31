using PrintInterceptor.Core.Diagnostics;
using PrintInterceptor.Core.Fiscalisation;
using PrintInterceptor.Core.State;
using Xunit;

namespace PrintInterceptor.Core.Tests;

public sealed class JobLedgerTests : IDisposable
{
    private readonly string _directory =
        Path.Combine(Path.GetTempPath(), "printinterceptor-tests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, recursive: true);
            }
        }
        catch
        {
            // Best effort cleanup.
        }
    }

    [Fact]
    public void ReprintIsTrackedAndSurvivesReload()
    {
        var ledger = new JobLedger(_directory, NullLog.Instance);
        ledger.Claim("hash-b", "INV-2", "20261029", null, 5m, "USD");
        ledger.MarkFiscalised("hash-b", new FiscalizeResponse
        {
            Success = true,
            Receipt = new FiscalReceipt { InvoiceNo = "INV-2" }
        });

        ledger.MarkReprinted("hash-b", "Test printer");
        ledger.MarkReprinted("hash-b", "Test printer");

        var reloaded = new JobLedger(_directory, NullLog.Instance);
        var entry = reloaded.Get("hash-b");

        Assert.NotNull(entry);
        Assert.Equal(2, entry!.ReprintCount);
        Assert.Equal("Reprinted", entry.PrintStatus);
        Assert.Single(reloaded.All());
    }

    [Fact]
    public void ClaimIsExclusiveAndSurvivesReload()
    {
        var ledger = new JobLedger(_directory, NullLog.Instance);

        Assert.True(ledger.Claim("hash-a", "INV-1", "20261029", null, 10m, "USD"));
        Assert.False(ledger.Claim("hash-a", "INV-1", "20261029", null, 10m, "USD"));

        ledger.MarkFiscalised("hash-a", new FiscalizeResponse
        {
            Success = true,
            FiscalCode = "ABC123",
            ReceiptNumber = 77,
            Receipt = new FiscalReceipt
            {
                InvoiceNo = "INV-1",
                ReceiptCounter = 3,
                ReceiptGlobalNo = 77,
                FiscalDayNo = 5
            }
        });

        var reloaded = new JobLedger(_directory, NullLog.Instance);
        var entry = reloaded.FindBlockingByHash("hash-a");

        Assert.NotNull(entry);
        Assert.Equal(LedgerStatus.Fiscalised, entry!.Status);
        Assert.Equal("ABC123", entry.FiscalCode);
        Assert.Equal(77, entry.ReceiptNumber);
        Assert.False(reloaded.Claim("hash-a", "INV-1", "20261029", null, 10m, "USD"));
    }

    [Fact]
    public void SameInvoiceSameDayIsBlockedButNextDayIsAllowed()
    {
        var ledger = new JobLedger(_directory, NullLog.Instance);

        Assert.True(ledger.Claim("hash-1", "INV-5", "20261029", null, 10m, "USD"));
        Assert.False(ledger.Claim("hash-2", "INV-5", "20261029", null, 11m, "USD"));
        Assert.True(ledger.Claim("hash-3", "INV-5", "20261030", null, 12m, "USD"));
    }

    [Fact]
    public void NeedsReviewDoesNotBlockARetry()
    {
        var ledger = new JobLedger(_directory, NullLog.Instance);

        ledger.RecordNeedsReview("hash-r", null, "20261029", "No line items", null);
        Assert.True(ledger.Claim("hash-r", null, "20261029", null, 5m, "USD"));
    }

    [Fact]
    public void AmbiguousFailureBlocksRetry()
    {
        var ledger = new JobLedger(_directory, NullLog.Instance);

        Assert.True(ledger.Claim("hash-x", "INV-9", "20261029", null, 5m, "USD"));
        ledger.MarkFailure("hash-x", LedgerStatus.AmbiguousFailure, "timeout");

        Assert.NotNull(ledger.FindBlockingByHash("hash-x"));
        Assert.False(ledger.Claim("hash-x", "INV-9", "20261029", null, 5m, "USD"));
    }

    [Fact]
    public void CorruptLedgerRefusesToStart()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(Path.Combine(_directory, "ledger.json"), "{ not json");

        Assert.Throws<InvalidOperationException>(() => new JobLedger(_directory, NullLog.Instance));
    }
}
