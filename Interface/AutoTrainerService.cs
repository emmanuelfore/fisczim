using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

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
        private static string[] SplitLine(string line)
        {
            if (string.IsNullOrWhiteSpace(line)) return Array.Empty<string>();
            return Regex.Split(line.Trim(), @"\s+");
        }

        private static string CleanNumeric(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "0";
            string cleaned = Regex.Replace(value, "[^0-9.\\-]", "");
            if (cleaned.Count(c => c == '.') > 1)
                cleaned = cleaned.Substring(0, cleaned.LastIndexOf('.'));
            return string.IsNullOrEmpty(cleaned) ? "0" : cleaned;
        }

        private static bool TryParseDecimal(string value, out decimal result)
        {
            return decimal.TryParse(CleanNumeric(value),
                NumberStyles.Any, CultureInfo.InvariantCulture, out result);
        }

        private static bool IsCurrencyPrefix(string token, out string cleaned)
        {
            cleaned = Regex.Replace(token, "^[A-Z\\$]+", "").Trim();
            return cleaned != token;
        }

        public AutoTrainerResult AnalyzeReceipt(string filepath)
        {
            var result = new AutoTrainerResult();
            if (!File.Exists(filepath)) return result;

            string[] lines = File.ReadAllLines(filepath);

            result.ColumnQuantityIndex = -1;
            result.ColumnPriceIndex = -1;
            result.ColumnAmountIndex = -1;
            result.TaxSymbol = "";

            // ── Step 1: Classify each line ──
            var lineClasses = new List<(int index, string text, string cls, string[] tokens)>();
            for (int i = 0; i < lines.Length; i++)
            {
                string raw = lines[i];
                string trimmed = raw.Trim();
                string upper = trimmed.ToUpper();
                string[] tokens = SplitLine(raw);

                string cls = "other";
                if (string.IsNullOrWhiteSpace(trimmed))
                    cls = "blank";
                else if (upper.Contains("INVOICE") || upper.Contains("RECEIPT") ||
                         Regex.IsMatch(upper, @"\b(TAX\s+)?(FISCAL\s+)?(INVOICE|RECEIPT)\b"))
                    cls = "header";
                else if (upper.Contains("TOTAL") && !upper.Contains("SUB") && tokens.Length <= 4)
                    cls = "total";
                else if (upper.Contains("SUBTOTAL"))
                    cls = "subtotal";
                else if (upper.Contains("VAT") || upper.Contains("TAX AMOUNT") ||
                         Regex.IsMatch(upper, @"\bTAX\b"))
                    cls = "vat";
                else if (upper.Contains("DESCRIPTION") || upper.Contains("ITEM") ||
                         Regex.IsMatch(upper, @"\b(QTY|QUANTITY|PRICE|AMOUNT|VALUE)\b"))
                    cls = "header-row";
                else if (trimmed.All(c => c == '-' || c == '.' || c == '=' || c == '_'))
                    cls = "separator";
                else if (IsLikelyItemLine(tokens, trimmed))
                    cls = "item";
                else if (tokens.Length >= 2 && HasInvoiceNumber(trimmed))
                    cls = "header";

                lineClasses.Add((i, trimmed, cls, tokens));
            }

            var items = lineClasses.Where(lc => lc.cls == "item").ToList();
            var headers = lineClasses.Where(lc => lc.cls == "header-row").ToList();
            var headerLines = lineClasses.Where(lc => lc.cls == "header").ToList();

            // ── Step 2: Detect invoice number ──
            var headerLine = headerLines.FirstOrDefault();
            if (headerLine != default)
            {
                result.InvoiceNumberKeyword = "INVOICE";
                foreach (var t in headerLine.tokens)
                {
                    string upper = t.ToUpper();
                    if (upper.Contains("INV") || upper.Contains("REC"))
                    {
                        result.InvoiceNumberKeyword = upper.TrimEnd(':');
                        break;
                    }
                }
            }
            if (string.IsNullOrEmpty(result.InvoiceNumberKeyword))
                result.InvoiceNumberKeyword = "Invoice";

            // Extract invoice number from header line
            if (headerLine != default)
            {
                string invNum = headerLine.tokens
                    .LastOrDefault(t => t.Length >= 4 && t.Any(char.IsLetter) && t.Any(char.IsDigit));
                if (!string.IsNullOrEmpty(invNum))
                    result.InvoiceNumberKeyword = result.InvoiceNumberKeyword;
            }

            // ── Step 3: Detect product start line from first item ──
            if (items.Count > 0)
            {
                var firstItem = items.First();
                result.ProductStartLine = GetDistinctivePattern(firstItem.text);
            }
            else
            {
                // Fallback: use line after header row
                if (headers.Count > 0)
                {
                    int headerIdx = headers.First().index;
                    for (int i = headerIdx + 1; i < lines.Length; i++)
                    {
                        if (!string.IsNullOrWhiteSpace(lines[i]) &&
                            lineClasses.FirstOrDefault(lc => lc.index == i).cls != "separator")
                        {
                            result.ProductStartLine = GetDistinctivePattern(lines[i].Trim());
                            break;
                        }
                    }
                }
            }

            // ── Step 4: Detect product end line ──
            if (items.Count > 0)
            {
                int lastItemIdx = items.Last().index;
                // Look for the first non-item, non-blank line after the last item
                for (int i = lastItemIdx + 1; i < lines.Length; i++)
                {
                    string trimmed = lines[i].Trim();
                    if (string.IsNullOrWhiteSpace(trimmed)) continue;
                    var cls = lineClasses.FirstOrDefault(lc => lc.index == i).cls;
                    if (cls == "total" || cls == "subtotal" || cls == "vat" || cls == "separator")
                    {
                        result.ProductEndLine = trimmed.Length > 12 ? trimmed.Substring(0, 12) : trimmed;
                        break;
                    }
                }
            }

            // ── Step 5: Detect header row column labels ──
            string headerRowText = "";
            int headerRowIndex = -1;
            if (headers.Count > 0)
            {
                headerRowText = headers.First().text.ToUpper();
                headerRowIndex = headers.First().index;
            }

            bool hasPriceColumn = headerRowText.Contains("PRICE") || headerRowText.Contains("UNIT");
            bool hasQtyColumn = headerRowText.Contains("QTY") || headerRowText.Contains("QUANTITY");
            bool hasAmountColumn = headerRowText.Contains("AMOUNT") || headerRowText.Contains("VALUE") ||
                                   headerRowText.Contains("TOTAL");

            // ── Step 6: Train on items to determine column indices ──
            if (items.Count > 0)
            {
                TrainColumnIndicesFromItems(items.Select(i => i.tokens).ToList(), lines, items, result);
            }

            // ── Step 7: Detect VAT keyword ──
            foreach (var lc in lineClasses)
            {
                if (lc.cls == "vat" && string.IsNullOrEmpty(result.VatAmountKeyword))
                {
                    var t = lc.tokens.FirstOrDefault(tk => tk.ToUpper().Contains("VAT") || tk.ToUpper().Contains("TAX"));
                    result.VatAmountKeyword = t ?? "VAT";
                }
            }
            if (string.IsNullOrEmpty(result.VatAmountKeyword))
            {
                // Look for "VAT Number" lines
                var vatLine = lineClasses.FirstOrDefault(lc =>
                    lc.text.ToUpper().Contains("VAT NUMBER"));
                if (vatLine != default)
                    result.VatAmountKeyword = "VAT Number";
                else
                    result.VatAmountKeyword = "VAT";
            }

            // ── Step 8: Detect total keyword ──
            var totalLine = lineClasses.FirstOrDefault(lc => lc.cls == "total");
            if (totalLine != default)
            {
                var t = totalLine.tokens.FirstOrDefault(tk => tk.ToUpper().Contains("TOTAL"));
                result.TotalAmountKeyword = t ?? "Total";
            }
            if (string.IsNullOrEmpty(result.TotalAmountKeyword))
                result.TotalAmountKeyword = "Total";

            // ── Step 9: Detect TaxSymbol from amount tokens ──
            foreach (var item in items)
            {
                if (result.ColumnAmountIndex >= 0 && result.ColumnAmountIndex < item.tokens.Length)
                {
                    string amtToken = item.tokens[item.tokens.Length - 1 - result.ColumnAmountIndex];
                    string letters = Regex.Replace(amtToken, "[0-9.\\-\\s]", "");
                    if (letters.Length == 1)
                    {
                        result.TaxSymbol = letters;
                        break;
                    }
                }
            }
            if (string.IsNullOrEmpty(result.TaxSymbol))
                result.TaxSymbol = "";

            // ── Step 10: Dot counter from separator lines ──
            var sepLine = lineClasses.FirstOrDefault(lc => lc.cls == "separator");
            if (sepLine != default)
            {
                int dots = sepLine.text.Count(c => c == '.');
                result.ItemDotCounter = Math.Min(dots, 3);
            }

            // Fallbacks
            if (result.ColumnQuantityIndex < 0) result.ColumnQuantityIndex = 1;
            if (result.ColumnPriceIndex < 0) result.ColumnPriceIndex = 2;
            if (result.ColumnAmountIndex < 0) result.ColumnAmountIndex = 3;

            return result;
        }

        private bool IsLikelyItemLine(string[] tokens, string trimmed)
        {
            if (tokens.Length < 2) return false;

            // Count numeric tokens (including currency-prefixed like USD1.04)
            int numericCount = 0;
            foreach (var t in tokens)
            {
                string cleaned = CleanNumeric(t);
                if (decimal.TryParse(cleaned, NumberStyles.Any, CultureInfo.InvariantCulture, out _))
                    numericCount++;
            }

            // Need at least 2 numeric values (qty + price/amount)
            if (numericCount < 2) return false;

            // Must have text content (a product name)
            bool hasText = tokens.Any(t =>
            {
                string upper = t.ToUpper();
                return !decimal.TryParse(CleanNumeric(t), out _) &&
                       !IsCurrencyPrefix(t, out _) &&
                       t.Length >= 2 &&
                       !upper.Contains("INVOICE") && !upper.Contains("TOTAL") &&
                       !upper.Contains("VAT") && !upper.Contains("TAX") &&
                       !upper.Contains("DATE") && !upper.Contains("TEL") &&
                       !upper.Contains("CELL") && !upper.Contains("PHONE") &&
                       !upper.Contains("EMAIL") && !upper.Contains("ADDRESS") &&
                       !upper.Contains("NUMBER") && !upper.Contains("FISCAL") &&
                       !Regex.IsMatch(upper, @"^(USD|ZWG|ZWL|Z\\$|\\$)$");
            });

            return hasText;
        }

        private bool HasInvoiceNumber(string trimmed)
        {
            var parts = SplitLine(trimmed);
            return parts.Any(p => p.Length >= 4 && p.Any(char.IsLetter) && p.Any(char.IsDigit));
        }

        private void TrainColumnIndicesFromItems(List<string[]> allItemTokens, string[] rawLines,
            List<(int index, string text, string cls, string[] tokens)> items, AutoTrainerResult result)
        {
            // Strategy: try to find the best column layout using qty * price ≈ amount validation
            int maxTokens = allItemTokens.Max(t => t.Length);
            if (maxTokens < 3) return;

            // We'll try various "from-right" index combinations and pick the best
            int bestScore = -1;
            int bestQtyIdx = -1, bestPriceIdx = -1, bestAmtIdx = -1;

            // Try all combinations of qty, price, amount indices from the right
            // For 2 columns (qty, amount): qty=2, amount=1
            // For 3 columns (qty, price, amount): qty=3, price=2, amount=1
            var strategies = new[]
            {
                new { Qty = 3, Price = 2, Amt = 1 },  // standard: desc, qty, price, amt
                new { Qty = 2, Price = 3, Amt = 1 },  // swapped qty/price
                new { Qty = 2, Price = -1, Amt = 1 },  // 2 columns: desc, qty, amt (no price)
                new { Qty = 3, Price = 4, Amt = 1 },  // extra token before qty
                new { Qty = 2, Price = 1, Amt = 3 },  // amt before price
            };

            foreach (var strat in strategies)
            {
                int score = 0;
                int validLines = 0;

                if (strat.Price < 0)
                {
                    // 2-column format (no price): validate qty * derived_price ≈ amount
                    foreach (var tokens in allItemTokens)
                    {
                        if (tokens.Length < strat.Qty + 1 || tokens.Length < strat.Amt + 1) continue;
                        string qtyToken = tokens[tokens.Length - strat.Qty];
                        string amtToken = tokens[tokens.Length - strat.Amt];
                        if (!TryParseDecimal(qtyToken, out decimal qty)) continue;
                        if (!TryParseDecimal(amtToken, out decimal amt)) continue;
                        if (qty > 0 && amt > 0)
                        {
                            decimal derivedPrice = amt / qty;
                            if (Math.Abs(derivedPrice * qty - amt) / amt < 0.02m)
                                score += 10;
                            validLines++;
                        }
                    }
                }
                else
                {
                    // 3-column format
                    foreach (var tokens in allItemTokens)
                    {
                        if (tokens.Length < Math.Max(strat.Qty, Math.Max(strat.Price, strat.Amt)) + 1) continue;
                        string qtyToken = tokens[tokens.Length - strat.Qty];
                        string priceToken = tokens[tokens.Length - strat.Price];
                        string amtToken = tokens[tokens.Length - strat.Amt];
                        if (!TryParseDecimal(qtyToken, out decimal qty)) continue;
                        if (!TryParseDecimal(priceToken, out decimal price)) continue;
                        if (!TryParseDecimal(amtToken, out decimal amt)) continue;
                        if (qty > 0 && price > 0 && amt > 0)
                        {
                            decimal expected = qty * price;
                            if (Math.Abs(expected - amt) / Math.Max(amt, 0.01m) < 0.05m)
                                score += 10;
                            validLines++;
                        }
                    }
                }

                if (validLines > 0)
                {
                    int avgScore = score * 100 / validLines;
                    if (avgScore > bestScore)
                    {
                        bestScore = avgScore;
                        bestQtyIdx = strat.Qty;
                        bestPriceIdx = strat.Price;
                        bestAmtIdx = strat.Amt;
                    }
                }
            }

            // If no strategy scored, use the right-indexed heuristic
            if (bestScore <= 0)
            {
                // Try right-indexed heuristic: find numeric tokens from the right
                foreach (var tokens in allItemTokens)
                {
                    int numericFromRight = 0;
                    for (int i = tokens.Length - 1; i >= 0; i--)
                    {
                        if (TryParseDecimal(tokens[i], out _)) numericFromRight++;
                        else break;
                    }
                    if (numericFromRight >= 2)
                    {
                        // Last token is amount, second-to-last is qty (no price)
                        bestQtyIdx = 2;
                        bestPriceIdx = -1;  // No price column
                        bestAmtIdx = 1;
                        break;
                    }
                }
            }

            if (bestQtyIdx > 0)
            {
                result.ColumnQuantityIndex = bestQtyIdx;
                result.ColumnAmountIndex = bestAmtIdx;
                result.ColumnPriceIndex = bestPriceIdx > 0 ? bestPriceIdx : 2;

                // Detect tax symbol from last letter of amount token
                foreach (var tokens in allItemTokens)
                {
                    if (bestAmtIdx <= tokens.Length)
                    {
                        string amtToken = tokens[tokens.Length - bestAmtIdx];
                        string letters = Regex.Replace(amtToken, "[0-9.\\-\\s]", "");
                        if (letters.Length == 1 && char.IsLetter(letters[0]))
                        {
                            result.TaxSymbol = letters;
                            break;
                        }
                    }
                }
            }
            else
            {
                result.ColumnQuantityIndex = 2;
                result.ColumnPriceIndex = 3;
                result.ColumnAmountIndex = 1;
            }
        }

        private string GetDistinctivePattern(string line)
        {
            if (string.IsNullOrWhiteSpace(line)) return "";
            string trimmed = line.Trim();
            var words = SplitLine(trimmed);
            if (words.Length == 0) return "";

            string pattern = words[0];
            if (pattern.Length < 3 && words.Length > 1)
                pattern = words[0] + " " + words[1];
            if (pattern.Length > 20)
                pattern = pattern.Substring(0, 20);
            return pattern;
        }
    }
}
