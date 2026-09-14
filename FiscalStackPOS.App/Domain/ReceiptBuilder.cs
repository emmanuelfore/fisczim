using System;
using System.Collections.Generic;
using System.Globalization;

namespace FiscalStackPOS
{
    /// <summary>
    /// Receipt line model. Each line is a small structured primitive
    /// (text/separator/feed/QR) with an alignment and optional bold flag.
    /// This model is what both the ESC/POS encoder and the on-screen preview
    /// render — one source of truth, no string-padding hacks.
    /// </summary>
    public enum RAlign { Left, Center, Right, LeftRight }
    public enum RKind { Text, Sep, Feed, Qr }

    public class RLine
    {
        public RKind Kind = RKind.Text;
        public RAlign Align = RAlign.Left;
        public string Text = "";
        public bool Bold;
        public int Feed = 1;

        public static RLine T(string text, RAlign align, bool bold = false)
        { return new RLine { Kind = RKind.Text, Align = align, Text = text ?? "", Bold = bold }; }
        public static RLine LR(string left, string right, bool bold = false)
        { return new RLine { Kind = RKind.Text, Align = RAlign.LeftRight, Text = (left ?? "") + "\t" + (right ?? ""), Bold = bold }; }
        public static RLine Sep() { return new RLine { Kind = RKind.Sep }; }
        public static RLine Sp(int n = 1) { return new RLine { Kind = RKind.Feed, Feed = n }; }
        public static RLine Qr() { return new RLine { Kind = RKind.Qr }; }
    }

    /// <summary>
    /// Builds the receipt line model in the ZIMRA portal print-view order
    /// (company header, FISCAL TAX INVOICE, buyer, identifiers, items,
    /// totals, number of items, tax breakdown, cashier, QR + verification).
    /// </summary>
    public static class ReceiptBuilder
    {
        public static List<RLine> Build(PosSale sale, FiscalResult res, CardInfo card, int charMode)
        {
            bool cn = sale.InvoiceFlag == "02";
            string title = cn ? "CREDIT NOTE" : "FISCAL TAX INVOICE";
            string flag = string.IsNullOrEmpty(sale.InvoiceFlag) ? "01" : sale.InvoiceFlag;

            var L = new List<RLine>();

            // ---- company header (centered) ----
            if (card != null && !string.IsNullOrEmpty(card.CompanyName))
                L.Add(RLine.T(card.CompanyName, RAlign.Center, true));
            if (card != null && !string.IsNullOrEmpty(card.TIN))
                L.Add(RLine.T("TIN: " + card.TIN, RAlign.Center));
            if (card != null && !string.IsNullOrEmpty(card.VAT))
                L.Add(RLine.T("VAT No: " + card.VAT, RAlign.Center));
            if (card != null && !string.IsNullOrEmpty(card.Address))
                L.Add(RLine.T(card.Address, RAlign.Center));
            string email = ThermalPrinter.RuntimeIni("COMPANYEMAIL");
            if (email.Length > 0) L.Add(RLine.T(email, RAlign.Center));
            string phone = ThermalPrinter.RuntimeIni("COMPANYPHONE");
            if (phone.Length > 0) L.Add(RLine.T(phone, RAlign.Center));

            L.Add(RLine.Sep());
            L.Add(RLine.T(title, RAlign.Center, true));
            L.Add(RLine.Sep());

            // ---- buyer block (all centered) ----
            if (sale != null && (!string.IsNullOrEmpty(sale.CustomerName) || !string.IsNullOrEmpty(sale.CustomerTin) ||
                !string.IsNullOrEmpty(sale.CustomerVat) || !string.IsNullOrEmpty(sale.CustomerAddress)))
            {
                L.Add(RLine.T("Buyer", RAlign.Center, true));
                if (!string.IsNullOrEmpty(sale.CustomerName)) L.Add(RLine.T(sale.CustomerName, RAlign.Center));
                if (!string.IsNullOrEmpty(sale.CustomerTin)) L.Add(RLine.T("TIN: " + sale.CustomerTin, RAlign.Center));
                if (!string.IsNullOrEmpty(sale.CustomerVat)) L.Add(RLine.T("VAT No: " + sale.CustomerVat, RAlign.Center));
                if (!string.IsNullOrEmpty(sale.CustomerAddress)) L.Add(RLine.T(sale.CustomerAddress, RAlign.Center));
            }

            // ---- receipt identifiers ----
            L.Add(RLine.Sep());
            L.Add(RLine.LR("Invoice No: " + sale.InvoiceNumber,
                "Fiscal day No: " + (res.FiscalDayNo.Length > 0 ? res.FiscalDayNo : "0")));
            L.Add(RLine.T("Customer reference No: " + sale.InvoiceNumber, RAlign.Left));
            if (card != null && !string.IsNullOrEmpty(card.SerialNumber))
                L.Add(RLine.T("Device Serial No: " + card.SerialNumber, RAlign.Left));
            if (res.SerialNumber.Length > 0)
                L.Add(RLine.T("Device ID: " + res.SerialNumber, RAlign.Left));
            if (cn && !string.IsNullOrEmpty(sale.OriginalInvoiceNumber))
                L.Add(RLine.T("Original Invoice: " + sale.OriginalInvoiceNumber, RAlign.Left));
            L.Add(RLine.T("Date: " + sale.Created.ToString("dd'/'MM'/'yyyy HH:mm", CultureInfo.InvariantCulture), RAlign.Left));
            L.Add(RLine.Sep());

            // ---- items: Description | Amount ----
            L.Add(RLine.LR("Description", "Amount", true));
            L.Add(RLine.Sep());
            foreach (PosItem it in sale.Items)
            {
                string label = it.Name;
                if (it.Quantity != 1m) label += " x " + it.Quantity.ToString("0.##");
                L.Add(RLine.LR(label, it.Amount.ToString("0.00")));
            }
            L.Add(RLine.Sep());

            // ---- totals + payment ----
            L.Add(RLine.LR("Total " + sale.Currency, sale.Subtotal.ToString("0.00"), true));
            L.Add(RLine.LR(sale.Currency + " " + PaymentType(flag), sale.Subtotal.ToString("0.00")));
            L.Add(RLine.Sep());

            // ---- number of items ----
            L.Add(RLine.LR("Number of items", sale.Items.Count.ToString(), true));
            L.Add(RLine.Sep());

            // ---- tax breakdown: Net / VAT / Gross ----
            int rate = sale.NetTotal > 0m ? (int)Math.Round(sale.VatTotal / sale.NetTotal * 100m) : 0;
            L.Add(RLine.LR("Net Amount", sale.NetTotal.ToString("0.00")));
            L.Add(RLine.LR("VAT (" + rate + "%)", sale.VatTotal.ToString("0.00")));
            L.Add(RLine.LR("Gross Amount", sale.Subtotal.ToString("0.00")));
            L.Add(RLine.Sep());

            // ---- cashier (this is the " Dev" position in the ZIMRA print view) ----
            if (!string.IsNullOrEmpty(sale.Cashier)) L.Add(RLine.T(sale.Cashier, RAlign.Left));

            if (!string.IsNullOrEmpty(sale.InvoiceComment) && !sale.InvoiceComment.StartsWith("Original"))
                L.Add(RLine.T(sale.InvoiceComment, RAlign.Left));

            // ---- QR + verification footer ----
            if (res.QrUrl.Length > 0)
            {
                L.Add(RLine.Sp(1));
                L.Add(RLine.Qr());
                string vc = ThermalPrinter.VerificationCode(res.QrUrl);
                if (vc.Length > 0)
                {
                    L.Add(RLine.T("Verification code:", RAlign.Center));
                    L.Add(RLine.T(vc, RAlign.Center, true));
                    L.Add(RLine.T("You can verify this receipt manually at", RAlign.Center));
                    string vu = ThermalPrinter.VerifyUrl().TrimEnd('/');
                    if (vu.Length > 0) L.Add(RLine.T(vu, RAlign.Center));
                }
            }

            return L;
        }

        public static string PaymentType(string flag)
        {
            if (flag == "02") return "Credit";
            if (flag == "03") return "Debit";
            return "Cash";
        }
    }
}