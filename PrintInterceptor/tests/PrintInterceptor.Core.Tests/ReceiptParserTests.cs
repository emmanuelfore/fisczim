using PrintInterceptor.Core.Configuration;
using PrintInterceptor.Core.Parsing;
using Xunit;

namespace PrintInterceptor.Core.Tests;

public class ReceiptParserTests
{
    private static ParseConfig Config() => new()
    {
        ProductStartLine = "Order No.",
        ProductEndLine = "Items count",
        InvoiceNumber = "Order No.",
        CustomerName = "Buyer Name",
        CustomerTIN = "Buyer TIN",
        CustomerVATNumber = "Buyer VAT",
        Currency = "USD",
        PaymentMethod = "CASH",
        VatFlag = "1",
        VatRate = 0.15
    };

    private const string Sample = """
        Store Demo
        USD Cash Sale
        Order No.: INV-1001
        Buyer Name: Acme Ltd
        Buyer TIN: 1234567890
        Buyer VAT: 123456789
        Date: 29/10/2026 10:15
        --------------------------------
        Bread Loaf 1.00 2.50 2.50
        Fresh Milk 2.00 1.25 2.50
        --------------------------------
        Items count: 2
        Total: 5.00
        Payment: CASH
        """;

    [Fact]
    public void ParsesItemsTotalsAndMetadata()
    {
        var result = new ReceiptParser(Config()).Parse(Sample);

        Assert.Equal(ParseStatus.Parsed, result.Status);
        var receipt = Assert.IsType<ParsedReceipt>(result.Receipt);

        Assert.Equal("INV-1001", receipt.InvoiceNumber);
        Assert.Equal(2, receipt.Items.Count);
        Assert.Equal("Bread Loaf", receipt.Items[0].Name);
        Assert.Equal(1m, receipt.Items[0].Quantity);
        Assert.Equal(2.50m, receipt.Items[0].UnitPrice);
        Assert.Equal(2.50m, receipt.Items[0].Amount);
        Assert.Equal(5.00m, receipt.Total);
        Assert.Equal(0.66m, receipt.TaxTotal);
        Assert.Equal("USD", receipt.Currency);
        Assert.Equal("CASH", receipt.PaymentMethod);
        Assert.Equal("Acme Ltd", receipt.Buyer.Name);
        Assert.Equal("1234567890", receipt.Buyer.Tin);
        Assert.Equal(new DateTime(2026, 10, 29, 10, 15, 0), receipt.Date!.Value.DateTime);
    }

    [Fact]
    public void ParsesTwoLineFiscalRegisterItems()
    {
        const string text = """
            Store Demo
            FS No.00000259
            21/07/2025 11:46
            34400 x 2.400
            BIRTHDAY-DICORAN *82,560.00
            100 x 3
            PEPSI 300.00
            TOTAL *82,860.00
            """;

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.Parsed, result.Status);
        var receipt = Assert.IsType<ParsedReceipt>(result.Receipt);
        Assert.Equal(2, receipt.Items.Count);
        Assert.Equal("BIRTHDAY-DICORAN", receipt.Items[0].Name);
        Assert.Equal(2.4m, receipt.Items[0].Quantity);
        Assert.Equal(34400m, receipt.Items[0].UnitPrice);
        Assert.Equal(82560m, receipt.Items[0].Amount);
        Assert.Equal("PEPSI", receipt.Items[1].Name);
        Assert.Equal(3m, receipt.Items[1].Quantity);
        Assert.Equal(300m, receipt.Items[1].Amount);
        Assert.Equal(82860m, receipt.Total);
    }

    [Fact]
    public void TwoLineItemsThatDoNotBalanceAreHeldForReview()
    {
        const string text = """
            Store Demo
            34400 x 2.400
            BIRTHDAY-DICORAN *80,000.00
            TOTAL *80,000.00
            """;

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.NeedsReview, result.Status);
        Assert.Contains(result.Warnings, w => w.Contains("Two-line"));
    }

    [Fact]
    public void NonZimraBuyerIdentifierLengthsAreNotFlagged()
    {
        const string text = """
            Store Demo
            Order No.: INV-3003
            Buyer Name: Thabo Stores
            Buyer TIN: 12345678901
            Buyer VAT: 12345678
            --------------------------------
            Bread Loaf 1.00 2.50 2.50
            --------------------------------
            Items count: 1
            Total: 2.50
            Payment: CASH
            """;

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.Parsed, result.Status);
        Assert.DoesNotContain(result.Warnings, w => w.Contains("TIN") || w.Contains("VAT number"));
        Assert.Equal("12345678901", result.Receipt!.Buyer.Tin);
        Assert.Equal("12345678", result.Receipt.Buyer.VatNumber);
    }

    [Fact]
    public void ZeroItemsIsHeldForReview()
    {
        const string text = """
            Store Demo
            Order No.: INV-2002
            Items count: 0
            Total: 0.00
            """;

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.NeedsReview, result.Status);
        Assert.Contains("No line items", result.Reason);
    }

    [Fact]
    public void PrintedTotalMismatchIsHeldForReview()
    {
        var text = Sample.Replace("Total: 5.00", "Total: 4.00");

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.NeedsReview, result.Status);
        Assert.Contains("does not match the printed total", result.Reason);
    }

    [Fact]
    public void CreditNoteWithoutReferenceIsHeldForReview()
    {
        const string text = """
            Store Demo
            CREDIT NOTE
            Order No.: CR-100
            --------------------------------
            Bread Loaf 1.00 2.50 2.50
            --------------------------------
            Items count: 1
            Total: 2.50
            """;

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.NeedsReview, result.Status);
        Assert.Contains("no original invoice", result.Reason);
    }

    [Fact]
    public void CreditNoteWithReferenceIsParsed()
    {
        const string text = """
            Store Demo
            CREDIT NOTE
            Order No.: CR-100
            Original Invoice: INV-99
            Reason: Damaged goods
            --------------------------------
            Bread Loaf 1.00 2.50 2.50
            --------------------------------
            Items count: 1
            Total: 2.50
            """;

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.Parsed, result.Status);
        var receipt = Assert.IsType<ParsedReceipt>(result.Receipt);
        Assert.Equal("CreditNote", receipt.TransactionType);
        Assert.Equal("INV-99", receipt.RelatedInvoiceNumber);
        Assert.Equal("Damaged goods", receipt.CreditNoteReason);
    }

    [Fact]
    public void MissingInvoiceNumberStillParsesWithWarning()
    {
        var text = Sample
            .Replace("Order No.: INV-1001", "Store Ref 42")
            .Replace("Items count: 2", "Items count: 2");

        var result = new ReceiptParser(Config()).Parse(text);

        Assert.Equal(ParseStatus.Parsed, result.Status);
        Assert.Null(result.Receipt!.InvoiceNumber);
        Assert.Contains(result.Warnings, warning => warning.Contains("Invoice number not found"));
    }
}
