using PrintInterceptor.Core.Configuration;
using PrintInterceptor.Core.Diagnostics;
using PrintInterceptor.Core.Printing;
using PrintInterceptor.Core.Storage;
using Xunit;

namespace PrintInterceptor.Core.Tests;

public class PrintSnapshotStoreTests : IDisposable
{
    private readonly string _directory =
        Path.Combine(Path.GetTempPath(), "pi-snapshots-" + Guid.NewGuid().ToString("N"));

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
    public void SavesAndLoadsTheExactPrintModel()
    {
        var store = CreateStore();
        var model = new ReceiptPrintModel
        {
            Format = PrintFormat.A4,
            InvoiceNumber = "INV-1",
            Currency = "USD",
            Total = 12.5m,
            TaxTotal = 2.5m,
            Subtotal = 10m,
            IsOffline = true,
            Items = new[] { new ReceiptPrintLine("Widget", 1m, 12.5m, 10m, 25m, "STANDARD") },
            Taxes = new[] { new ReceiptPrintTax(25m, false, 10m, 2.5m, 12.5m) }
        };

        Assert.True(store.Save("abc123", model));
        Assert.True(store.Exists("abc123"));

        var loaded = store.Load("abc123");

        Assert.NotNull(loaded);
        Assert.Equal(PrintFormat.A4, loaded!.Format);
        Assert.Equal("INV-1", loaded.InvoiceNumber);
        Assert.Equal(12.5m, loaded.Total);
        Assert.True(loaded.IsOffline);
        Assert.Single(loaded.Items);
        Assert.Equal("Widget", loaded.Items[0].Name);
        Assert.Single(loaded.Taxes);
        Assert.Equal(25m, loaded.Taxes[0].Rate);
    }

    [Fact]
    public void MissingOrCorruptSnapshotIsReportedAsUnavailable()
    {
        var store = CreateStore();

        Assert.Null(store.Load("missing"));

        store.Save("broken", new ReceiptPrintModel());
        File.WriteAllText(Path.Combine(store.DirectoryPath, "broken.json"), "{ not json");

        Assert.Null(store.Load("broken"));
    }

    private PrintSnapshotStore CreateStore() =>
        new(
            new InterceptorConfig { Storage = new StorageConfig { DataDirectory = _directory } },
            NullLog.Instance);
}
