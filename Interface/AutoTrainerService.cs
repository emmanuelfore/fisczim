using System;
using System.IO;
using System.Linq;

namespace Revmax_Interface_Promun
{
    public class AutoTrainerResult
    {
        public string ProductStartLine { get; set; }
        public string ProductEndLine { get; set; }
        public string InvoiceNumberKeyword { get; set; }
        public string TotalAmountKeyword { get; set; }
        public string VatAmountKeyword { get; set; }
        public string TaxSymbol { get; set; }
        public int ColumnQuantityIndex { get; set; }
        public int ColumnPriceIndex { get; set; }
        public int ColumnAmountIndex { get; set; }
        public int ItemDotCounter { get; set; }
    }

    public class AutoTrainerService
    {
        public AutoTrainerResult AnalyzeReceipt(string filepath)
        {
            var result = new AutoTrainerResult();
            if (!File.Exists(filepath)) return result;

            string[] lines = File.ReadAllLines(filepath);

            // Defaults
            result.ColumnQuantityIndex = 1;
            result.ColumnPriceIndex = 2;
            result.ColumnAmountIndex = 3;
            result.TaxSymbol = "";

            bool foundStart = false;

            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i];
                string upperLine = line.ToUpper();

                // 1. Detect Invoice Number Keyword
                if (string.IsNullOrEmpty(result.InvoiceNumberKeyword) && 
                   (upperLine.Contains("INVOICE") || upperLine.Contains("RECEIPT") || upperLine.Contains("TAX INV")))
                {
                    // Find the string right before the number
                    string[] parts = upperLine.Split(new[] { ' ', ':' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int p = 0; p < parts.Length - 1; p++)
                    {
                        if (parts[p].Contains("INV") || parts[p].Contains("REC"))
                        {
                            result.InvoiceNumberKeyword = parts[p];
                            break;
                        }
                    }
                    if (string.IsNullOrEmpty(result.InvoiceNumberKeyword)) result.InvoiceNumberKeyword = "INVOICE";
                }

                // 2. Detect Product Start Line
                if (!foundStart)
                {
                    // Look for dotted lines or headers like Qty, Price, Amount
                    if (line.Contains("....") || (upperLine.Contains("QTY") && upperLine.Contains("AMOUNT")))
                    {
                        // The items usually start the line *after* the header
                        // or if it contains dots, this IS the item line
                        if (line.Contains("...."))
                        {
                            result.ProductStartLine = GetDistinctSubstring(line, 10);
                            result.ItemDotCounter = line.Count(c => c == '.');
                            if (result.ItemDotCounter > 3) result.ItemDotCounter = 3;
                            foundStart = true;
                            
                            // Guess columns from this item line
                            GuessColumnsFromLine(line, result);
                        }
                        else if (i + 1 < lines.Length)
                        {
                            // Header found, next line is start
                            result.ProductStartLine = GetDistinctSubstring(lines[i + 1], 10);
                            foundStart = true;
                        }
                    }
                }

                // 3. Detect Product End Line
                if (foundStart && string.IsNullOrEmpty(result.ProductEndLine))
                {
                    if (line.Contains("----") || line.Contains("====") || upperLine.Contains("TOTAL") || upperLine.Contains("SUBTOTAL"))
                    {
                        result.ProductEndLine = GetDistinctSubstring(line, 10);
                    }
                }

                // 4. Detect VAT Keyword
                if (string.IsNullOrEmpty(result.VatAmountKeyword) && (upperLine.Contains("VAT") || upperLine.Contains("TAX AMOUNT")))
                {
                    string[] parts = upperLine.Split(new[] { ' ', ':' }, StringSplitOptions.RemoveEmptyEntries);
                    result.VatAmountKeyword = parts.FirstOrDefault(p => p.Contains("VAT") || p.Contains("TAX")) ?? "VAT";
                }

                // 5. Detect Total Amount Keyword
                if (string.IsNullOrEmpty(result.TotalAmountKeyword) && (upperLine.Contains("TOTAL") && !upperLine.Contains("SUB")))
                {
                    string[] parts = upperLine.Split(new[] { ' ', ':' }, StringSplitOptions.RemoveEmptyEntries);
                    result.TotalAmountKeyword = parts.FirstOrDefault(p => p.Contains("TOTAL")) ?? "TOTAL";
                }
            }

            // Fallbacks
            if (string.IsNullOrEmpty(result.InvoiceNumberKeyword)) result.InvoiceNumberKeyword = "Invoice";
            if (string.IsNullOrEmpty(result.TotalAmountKeyword)) result.TotalAmountKeyword = "Total";
            if (string.IsNullOrEmpty(result.VatAmountKeyword)) result.VatAmountKeyword = "VAT";

            return result;
        }

        private void GuessColumnsFromLine(string line, AutoTrainerResult result)
        {
            // Split by space or dots
            string[] parts = line.Split(new[] { ' ', '.' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 4)
            {
                // Usually: Code, Desc, Qty, Price, Amount (from right to left)
                result.ColumnAmountIndex = parts.Length - 1; // Last is amount
                result.ColumnPriceIndex = parts.Length - 2;  // Second to last is price
                result.ColumnQuantityIndex = parts.Length - 3; // Third to last is qty
                
                // Detect Tax symbol on amount (e.g. 15.00A)
                string amt = parts[parts.Length - 1];
                if (amt.Length > 0 && char.IsLetter(amt[amt.Length - 1]))
                {
                    result.TaxSymbol = amt[amt.Length - 1].ToString();
                }
            }
        }

        private string GetDistinctSubstring(string line, int length)
        {
            if (string.IsNullOrWhiteSpace(line)) return "";
            string trimmed = line.Trim();
            if (trimmed.Length <= length) return trimmed;
            return trimmed.Substring(0, length);
        }
    }
}
