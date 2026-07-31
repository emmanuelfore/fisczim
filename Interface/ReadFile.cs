using System;
using System.Collections.Generic;
using System.Configuration;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;


namespace Revmax_Interface_Promun
{
    internal class ReadFile
    {
        private static readonly string[] CurrencySymbols = { "$", "US", "Z$", "ZWL", "Z", "T", "*" };
        private static readonly string[] Separators = { ",", "-" };
        
        private static string[] SplitLine(string line)
        {
            if (string.IsNullOrWhiteSpace(line)) return Array.Empty<string>();
            line = line.Trim();
            return Regex.Split(line, @"\s+");
        }

        private static string CleanNumeric(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "0";
            string cleaned = value.Trim();
            
            // Remove currency symbols
            foreach (var symbol in CurrencySymbols)
            {
                cleaned = cleaned.Replace(symbol, "");
            }
            
            // Remove separators
            foreach (var sep in Separators)
            {
                cleaned = cleaned.Replace(sep, "");
            }
            
            return cleaned;
        }

        private static bool TryParseDecimal(string s, out decimal result)
        {
            if (string.IsNullOrWhiteSpace(s))
            {
                result = 0;
                return false;
            }
            return decimal.TryParse(CleanNumeric(s), NumberStyles.Any, CultureInfo.InvariantCulture, out result);
        }

        private class ColumnStrategy
        {
            public bool FromRight;
            public int QtyIdx, PriceIdx, AmountIdx;
            public int Score;
            public string Label;
            public double Confidence;
            
            public ColumnStrategy()
            {
                Confidence = 0.0;
            }
        }

        private static ColumnStrategy DetectBestStrategy(string[] dataLines)
        {
            if (dataLines == null || dataLines.Length == 0)
            {
                return null;
            }

            var candidates = new List<ColumnStrategy>();
            int totalLines = dataLines.Length;

            for (int right = 0; right <= 1; right++)
            {
                for (int qi = 0; qi < 3; qi++)
                for (int pi = 0; pi < 3; pi++)
                for (int ai = 0; ai < 3; ai++)
                {
                    if (qi == pi || qi == ai || pi == ai) continue;
                    
                    var strat = new ColumnStrategy
                    {
                        FromRight = right == 1,
                        QtyIdx = qi, PriceIdx = pi, AmountIdx = ai,
                        Label = $"{(right == 1 ? "R" : "L")}[q{qi}p{pi}a{ai}]"
                    };
                    
                    int valid = 0;
                    int totalAttempts = 0;
                    decimal totalError = 0;

                    foreach (var line in dataLines)
                    {
                        var parts = SplitLine(line);
                        int len = parts.Length;
                        if (len < 4) continue;

                        decimal q = 0, p = 0, a = 0;
                        bool ok = true;
                        
                        if (right == 1)
                        {
                            ok &= TryParseDecimal(parts[len - 1 - qi], out q);
                            ok &= TryParseDecimal(parts[len - 1 - pi], out p);
                            ok &= TryParseDecimal(parts[len - 1 - ai], out a);
                        }
                        else
                        {
                            if (qi >= len || pi >= len || ai >= len) continue;
                            ok &= TryParseDecimal(parts[qi], out q);
                            ok &= TryParseDecimal(parts[pi], out p);
                            ok &= TryParseDecimal(parts[ai], out a);
                        }
                        
                        if (!ok || q == 0) continue;
                        
                        totalAttempts++;
                        decimal expected = Math.Round(q * p, 2);
                        decimal error = Math.Abs(expected - a);
                        
                        // More lenient validation with confidence scoring
                        if (error <= 0.05m || (a != 0 && error / Math.Max(a, expected) <= 0.02m))
                        {
                            valid++;
                            totalError += error;
                        }
                    }
                    
                    if (totalAttempts > 0)
                    {
                        strat.Score = valid;
                        strat.Confidence = valid > 0 ? (double)valid / totalAttempts : 0;
                        
                        // Bonus for low average error
                        if (valid > 0)
                        {
                            double avgError = (double)(totalError / valid);
                            strat.Confidence *= (1.0 - Math.Min(avgError / 10.0, 0.5));
                        }
                        
                        if (valid > 0) candidates.Add(strat);
                    }
                }
            }

            // Return best strategy by confidence, then by score
            return candidates.OrderByDescending(c => c.Confidence).ThenByDescending(c => c.Score).FirstOrDefault();
        }

        private static int[] DetectProductBoundaries(string[] lines)
        {
            if (lines == null || lines.Length == 0)
            {
                return new[] { 0, 0 };
            }

            int start = 0, end = lines.Length;
            bool foundData = false;
            
            // Keywords that indicate start of product data
            var startKeywords = new[] { "----", "====", "Qty", "Price", "Amount", "Item", "Description" };
            // Keywords that indicate end of product data
            var endKeywords = new[] { "Total", "Subtotal", "VAT", "Tax", "Balance", "Change", "Tendered" };

            for (int i = 0; i < lines.Length; i++)
            {
                string l = lines[i].Trim();

                if (!foundData)
                {
                    // Check for start indicators
                    foreach (var keyword in startKeywords)
                    {
                        if (l.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            start = i + 1;
                            foundData = true;
                            break;
                        }
                    }
                    if (foundData) continue;
                }
                else
                {
                    // Check for end indicators
                    if (string.IsNullOrEmpty(l))
                    {
                        // Empty line might indicate end, but check if we have any data first
                        if (i > start + 1) // At least one data line
                        {
                            end = i;
                            break;
                        }
                    }
                    else
                    {
                        foreach (var keyword in endKeywords)
                        {
                            if (l.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                end = i;
                                break;
                            }
                        }
                        if (end != lines.Length) break;
                    }
                }
            }

            // Ensure boundaries are valid
            if (start >= end) start = 0;
            if (end > lines.Length) end = lines.Length;

            return new[] { start, end };
        }

        public bool CountDots(int numberOfDots, string line)
        {
            bool dots;
            int counter = 0;
            foreach (char c in line)
            {
                if (c == '.')
                    counter = counter + 1;
            }
            if (counter >= numberOfDots)
                dots = true;
            else
                dots = false;
            return dots;
        }

        private List<item> SmartParseItems(string[] lines, int startLine, int endLine, ColumnStrategy strategy, StringBuilder xmlBuilder, ref decimal tempAmount, ref decimal tempTx, string resolvedVatFlag, ref string taxable, ref string VAT, ref string tax)
        {
            var items = new List<item>();
            
            if (lines == null || strategy == null)
            {
                return items;
            }

            string taxSymbol = ConfigurationManager.AppSettings.Get("TaxSymbol") ?? "";
            string nonTaxSymbol = ConfigurationManager.AppSettings.Get("NonTaxSymbol") ?? "";
            string vatA = ConfigurationManager.AppSettings.Get("VatA") ?? "0.15";
            string vatE = ConfigurationManager.AppSettings.Get("VatE") ?? "0.00";

            for (int i = startLine; i < endLine && i < lines.Length; i++)
            {
                string line = lines[i].Trim();
                if (string.IsNullOrEmpty(line)) continue;

                try
                {
                    string[] parts = SplitLine(line);
                    if (parts.Length < 4) continue;

                    decimal q = 0, p = 0, a = 0;
                    bool ok = true;
                    
                    if (strategy.FromRight)
                    {
                        int len = parts.Length;
                        int qtyIndex = len - 1 - strategy.QtyIdx;
                        int priceIndex = len - 1 - strategy.PriceIdx;
                        int amountIndex = len - 1 - strategy.AmountIdx;
                        
                        if (qtyIndex >= 0 && priceIndex >= 0 && amountIndex >= 0)
                        {
                            ok &= TryParseDecimal(parts[qtyIndex], out q);
                            ok &= TryParseDecimal(parts[priceIndex], out p);
                            ok &= TryParseDecimal(parts[amountIndex], out a);
                        }
                        else
                        {
                            ok = false;
                        }
                    }
                    else
                    {
                        if (strategy.QtyIdx >= parts.Length || strategy.PriceIdx >= parts.Length || strategy.AmountIdx >= parts.Length) 
                        {
                            continue;
                        }
                        ok &= TryParseDecimal(parts[strategy.QtyIdx], out q);
                        ok &= TryParseDecimal(parts[strategy.PriceIdx], out p);
                        ok &= TryParseDecimal(parts[strategy.AmountIdx], out a);
                    }
                    
                    if (!ok || q == 0) continue;

                    tempAmount += a;
                    string quantity = Convert.ToString(q, CultureInfo.InvariantCulture);
                    string price = Convert.ToString(p, CultureInfo.InvariantCulture);
                    string amount = Convert.ToString(a, CultureInfo.InvariantCulture);

                    // Extract product code and name
                    string code = ".";
                    string product = "Unknown Item";
                    
                    if (strategy.FromRight)
                    {
                        int maxOffset = new[] { strategy.QtyIdx, strategy.PriceIdx, strategy.AmountIdx }.Max();
                        if (parts.Length > maxOffset)
                        {
                            var nameParts = parts.Take(parts.Length - maxOffset - 1).ToList();
                            if (nameParts.Count > 0)
                            {
                                code = CleanNumeric(nameParts[0]);
                                product = string.Join(" ", nameParts.Skip(code != "." ? 1 : 0)).Trim();
                            }
                        }
                    }
                    else
                    {
                        int codeEnd = Math.Min(strategy.QtyIdx, Math.Min(strategy.PriceIdx, strategy.AmountIdx));
                        if (parts.Length > 0)
                        {
                            code = CleanNumeric(parts[0]);
                            if (codeEnd > 0)
                            {
                                product = string.Join(" ", parts.Skip(code != "." ? 1 : 0).Take(Math.Max(0, codeEnd - (code != "." ? 1 : 0)))).Trim();
                            }
                        }
                    }
                    
                    if (string.IsNullOrWhiteSpace(product)) product = "Unknown Item";

                    // Determine tax status
                    if (string.IsNullOrEmpty(taxSymbol) && string.IsNullOrEmpty(nonTaxSymbol))
                    {
                        VAT = vatA;
                        tax = VAT;
                        taxable = resolvedVatFlag == "1" ? "Incl" : "Excl";
                    }
                    else
                    {
                        if (!string.IsNullOrEmpty(nonTaxSymbol) && product.IndexOf(nonTaxSymbol, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            VAT = vatE;
                            tax = VAT;
                            taxable = "Exem";
                        }
                        else
                        {
                            VAT = vatA;
                            tax = VAT;
                            taxable = resolvedVatFlag == "1" ? "Incl" : "Excl";
                        }
                    }

                    // Calculate tax amount
                    string tx;
                    decimal taxRate;
                    if (decimal.TryParse(tax, NumberStyles.Any, CultureInfo.InvariantCulture, out taxRate))
                    {
                        if (resolvedVatFlag == "1")
                        {
                            tx = Convert.ToString(Math.Round(a - a / (1 + taxRate), 2), CultureInfo.InvariantCulture);
                            tempTx += Convert.ToDecimal(tx, CultureInfo.InvariantCulture);
                        }
                        else
                        {
                            tx = Convert.ToString(Math.Round(a * taxRate, 2), CultureInfo.InvariantCulture);
                        }
                    }
                    else
                    {
                        tx = "0";
                    }

                    items.Add(new item
                    {
                        HH = (items.Count + 1).ToString(),
                        ITEMCODE = code,
                        ITEMNAME1 = product,
                        ITEMNAME2 = product,
                        Quantity = quantity,
                        Price = price,
                        Amount = amount,
                        Tax = tx,
                        Taxable = taxable,
                        TaxR = VAT
                    });

                    if (xmlBuilder != null)
                    {
                        xmlBuilder.Append("<ITEM>");
                        xmlBuilder.Append("<HH>" + items.Count + "</HH>");
                        xmlBuilder.Append("<ITEMCODE>" + System.Security.SecurityElement.Escape(code) + "</ITEMCODE>");
                        xmlBuilder.Append("<ITEMNAME1>" + System.Security.SecurityElement.Escape(product) + "</ITEMNAME1>");
                        xmlBuilder.Append("<ITEMNAME2>" + System.Security.SecurityElement.Escape(product) + "</ITEMNAME2>");
                        xmlBuilder.Append("<QTY>" + quantity + "</QTY>");
                        xmlBuilder.Append("<PRICE>" + price + "</PRICE>");
                        xmlBuilder.Append("<AMT>" + amount + "</AMT>");
                        xmlBuilder.Append("<TAX>" + tx + "</TAX>");
                        xmlBuilder.Append("<TAXR>" + VAT + "</TAXR>");
                        xmlBuilder.Append("</ITEM>");
                    }
                }
                catch (Exception ex)
                {
                    // Log parsing error but continue with other lines
                    System.Diagnostics.Debug.WriteLine($"Error parsing line {i}: {ex.Message}");
                }
            }

            return items;
        }

        private string ExtractFieldByKeyword(string[] lines, string keyword, string splitBy = ":", int tokenFromEnd = 0)
        {
            foreach (var l in lines)
            {
                if (l.Contains(keyword))
                {
                    var parts = l.Split(new[] { splitBy }, StringSplitOptions.None);
                    if (parts.Length > 1)
                    {
                        string val = parts[parts.Length - 1].Trim();
                        if (!string.IsNullOrEmpty(val)) return val;
                    }
                }
            }
            return "";
        }

        private string ExtractNumberAfterKeyword(string[] lines, string keyword)
        {
            foreach (var l in lines)
            {
                if (l.Contains(keyword))
                {
                    var match = Regex.Match(l, @"[\d,]+\.?\d*");
                    if (match.Success) return match.Value.Replace(",", "");
                }
            }
            return "";
        }

        public Invoice ReadInvoice(string filepath, string vatFlag, List<ReadCurrencies> CurrenciesList)
        {
            string resolvedVatFlag = vatFlag ?? ConfigurationManager.AppSettings.Get("VatFlag") ?? ConfigurationManager.AppSettings.Get("Vatflag") ?? "1";

            string[] allLines = File.ReadAllLines(filepath);
            if (allLines.Length == 0) return new Invoice();

            string branchName = "";
            string customerBpn = "";
            string customerName = "";
            string customerTelephoneNumber = "";
            string customerVATNumber = "";
            string customerTIN = "";
            string customerEmail = "";
            string customerAddress = "";
            string invoiceComment = "";
            string invoiceFlag = "01";
            string reason = "";
            string email = "";
            string phone = "";
            string change = "";
            string cashier = "";
            string tendered = "";
            decimal temptx = 0;
            decimal tempamount = 0;
            string InvoiceNumber = "";
            string invoiceamount = "";
            string invoicetaxamount = "";
            string currentCurrency = "";

            // ── Auto-detect product boundaries ──
            int productstartline = 0;
            int productendline = allLines.Length;

            string cfgStart = ConfigurationManager.AppSettings.Get("ProductStartLine");
            string cfgEnd = ConfigurationManager.AppSettings.Get("ProductEndLine");
            if (!string.IsNullOrEmpty(cfgStart) || !string.IsNullOrEmpty(cfgEnd))
            {
                for (int i = 0; i < allLines.Length; i++)
                {
                    if (!string.IsNullOrEmpty(cfgStart) && allLines[i].Contains(cfgStart))
                        productstartline = i + 1;
                    if (!string.IsNullOrEmpty(cfgEnd) && allLines[i].Contains(cfgEnd))
                        productendline = i + 1;
                }
            }
            else
            {
                var boundaries = DetectProductBoundaries(allLines);
                productstartline = boundaries[0];
                productendline = boundaries[1];
            }

            // ── Extract candidate data lines for strategy detection ──
            var dataLines = new List<string>();
            for (int i = productstartline; i < productendline && i < allLines.Length; i++)
            {
                string l = allLines[i].Trim();
                if (!string.IsNullOrEmpty(l) && !l.Contains("---") && !l.Contains("==="))
                    dataLines.Add(l);
            }

            // ── Auto-detect best column strategy ──
            ColumnStrategy strategy = null;
            if (dataLines.Count > 0)
            {
                strategy = DetectBestStrategy(dataLines.ToArray());
            }

            // ── Parse items using smart or fallback strategy ──
            List<item> items;
            StringBuilder myItemsXMLStringBuilder = new StringBuilder();
            myItemsXMLStringBuilder.Append("<ITEMS>");
            string taxable = "";
            string tax = "";
            string VAT = "";

            if (strategy != null && strategy.Score > 0)
            {
                items = SmartParseItems(allLines, productstartline, productendline, strategy, myItemsXMLStringBuilder, ref tempamount, ref temptx, resolvedVatFlag, ref taxable, ref VAT, ref tax);
            }
            else
            {
                // ── Fallback: parse using right-indexed heuristic ──
                items = new List<item>();
                string code = "";
                string product = "";
                int i = 0;

                foreach (string line in allLines)
                {
                    try
                    {
                        string[] parts = SplitLine(line);
                        if (parts.Length < 4) continue;

                        decimal q, p, a;
                        if (!TryParseDecimal(parts[parts.Length - 3], out q)) continue;
                        if (!TryParseDecimal(parts[parts.Length - 2], out p)) continue;
                        if (!TryParseDecimal(parts[parts.Length - 1], out a)) continue;
                        if (q == 0) continue;

                        i++;
                        tempamount += a;
                        code = parts.Length > 3 ? parts[0] : ".";
                        product = string.Join(" ", parts.Take(parts.Length - 3)).Trim();
                        string quantity = Convert.ToString(q, CultureInfo.InvariantCulture);
                        string price = Convert.ToString(p, CultureInfo.InvariantCulture);
                        string amount = Convert.ToString(a, CultureInfo.InvariantCulture);

                        VAT = ConfigurationManager.AppSettings.Get("VatA");
                        tax = VAT;
                        taxable = resolvedVatFlag == "1" ? "Incl" : "Excl";

                        string tx;
                        if (resolvedVatFlag == "1")
                        {
                            tx = Convert.ToString(Math.Round(a - a / (1 + Convert.ToDecimal(tax, CultureInfo.InvariantCulture)), 2));
                            temptx += Convert.ToDecimal(tx, CultureInfo.InvariantCulture);
                        }
                        else
                        {
                            tx = Convert.ToString(Math.Round(a * Convert.ToDecimal(tax, CultureInfo.InvariantCulture), 2));
                        }

                        items.Add(new item
                        {
                            HH = i.ToString(),
                            ITEMCODE = code,
                            ITEMNAME1 = product,
                            ITEMNAME2 = product,
                            Quantity = quantity,
                            Price = price,
                            Amount = amount,
                            Tax = tx,
                            Taxable = taxable,
                            TaxR = VAT
                        });

                        myItemsXMLStringBuilder.Append("<ITEM>");
                        myItemsXMLStringBuilder.Append("<HH>" + i + "</HH>");
                        myItemsXMLStringBuilder.Append("<ITEMCODE>" + code + "</ITEMCODE>");
                        myItemsXMLStringBuilder.Append("<ITEMNAME1>" + product + "</ITEMNAME1>");
                        myItemsXMLStringBuilder.Append("<ITEMNAME2>" + product + "</ITEMNAME2>");
                        myItemsXMLStringBuilder.Append("<QTY>" + quantity + "</QTY>");
                        myItemsXMLStringBuilder.Append("<PRICE>" + price + "</PRICE>");
                        myItemsXMLStringBuilder.Append("<AMT>" + amount + "</AMT>");
                        myItemsXMLStringBuilder.Append("<TAX>" + tx + "</TAX>");
                        myItemsXMLStringBuilder.Append("<TAXR>" + VAT + "</TAXR>");
                        myItemsXMLStringBuilder.Append("</ITEM>");
                    }
                    catch { }
                }

                invoicetaxamount = temptx.ToString();
                invoiceamount = tempamount.ToString();
            }
            myItemsXMLStringBuilder.Append("</ITEMS>");

            // ── Smart metadata extraction (works for both paths) ──
            if (string.IsNullOrEmpty(InvoiceNumber))
            {
                foreach (var kw in new[] { ConfigurationManager.AppSettings.Get("InvoiceNumber"), "Invoice", "Order", "Receipt", "INV" })
                {
                    if (!string.IsNullOrEmpty(kw)) { InvoiceNumber = ExtractFieldByKeyword(allLines, kw, " ", 0); break; }
                }
                InvoiceNumber = Regex.Replace(InvoiceNumber, "[^a-zA-Z0-9]", "");
                if (InvoiceNumber.Contains("CR")) invoiceFlag = "02";
            }

            if (string.IsNullOrEmpty(customerName))
            {
                foreach (var kw in new[] { ConfigurationManager.AppSettings.Get("CustomerName"), "Buyer", "Customer", "Client" })
                {
                    if (!string.IsNullOrEmpty(kw)) { customerName = ExtractFieldByKeyword(allLines, kw, ":"); break; }
                }
            }

            if (string.IsNullOrEmpty(customerAddress)) customerAddress = ExtractFieldByKeyword(allLines, ConfigurationManager.AppSettings.Get("CustomerAddress") ?? "Address", ":");
            if (string.IsNullOrEmpty(customerEmail)) customerEmail = ExtractFieldByKeyword(allLines, ConfigurationManager.AppSettings.Get("CustomerEmail") ?? "Email", ":");
            if (string.IsNullOrEmpty(customerTIN)) customerTIN = ExtractFieldByKeyword(allLines, ConfigurationManager.AppSettings.Get("CustomerTIN") ?? "TIN", ":");
            if (string.IsNullOrEmpty(customerVATNumber)) customerVATNumber = ExtractFieldByKeyword(allLines, ConfigurationManager.AppSettings.Get("CustomerVATNumber") ?? "VAT", ":");
            if (string.IsNullOrEmpty(customerTelephoneNumber)) customerTelephoneNumber = ExtractFieldByKeyword(allLines, ConfigurationManager.AppSettings.Get("CustomerTelephoneNumber") ?? "Phone", ":");
            if (string.IsNullOrEmpty(reason)) reason = ExtractFieldByKeyword(allLines, ConfigurationManager.AppSettings.Get("Reason") ?? "Reason", ":");
            if (string.IsNullOrEmpty(change)) change = ExtractNumberAfterKeyword(allLines, ConfigurationManager.AppSettings.Get("Change") ?? "Change");
            if (string.IsNullOrEmpty(tendered)) tendered = ExtractNumberAfterKeyword(allLines, ConfigurationManager.AppSettings.Get("Tendered") ?? "Tendered");

            // ── Currency detection ──
            foreach (var l in allLines)
            {
                foreach (var c in CurrenciesList)
                {
                    if (l.Contains(c.Keyword)) { currentCurrency = c.Name; break; }
                }
                if (!string.IsNullOrEmpty(currentCurrency)) break;
            }

            // ── Build invoice ──
            if (string.IsNullOrEmpty(invoiceamount)) invoiceamount = tempamount.ToString();
            if (string.IsNullOrEmpty(invoicetaxamount)) invoicetaxamount = temptx.ToString();

            StringBuilder myCurrenciesXMLStringBuilder = new StringBuilder();
            myCurrenciesXMLStringBuilder.Append("<CurrenciesReceived>");
            myCurrenciesXMLStringBuilder.Append("<Currency>");
            myCurrenciesXMLStringBuilder.Append("<Name>" + currentCurrency + "</Name>");
            myCurrenciesXMLStringBuilder.Append("<Amount>" + invoiceamount + "</Amount>");
            myCurrenciesXMLStringBuilder.Append("<Rate>" + "1" + "</Rate>");
            myCurrenciesXMLStringBuilder.Append("</Currency>");
            myCurrenciesXMLStringBuilder.Append("</CurrenciesReceived>");

            Invoice invoice = new Invoice();
            invoice.InvoiceNumber = InvoiceNumber;
            invoice.InvoiceTaxAmount = invoicetaxamount;
            invoice.InvoiceAmount = invoiceamount;
            invoice.Tendered = tendered;
            invoice.Phone = phone;
            invoice.Email = email;
            invoice.Change = change;
            invoice.Reason = reason;
            invoice.Cashier = cashier;
            invoice.CustomerName = customerName;
            invoice.CustomerVATNumber = customerVATNumber;
            invoice.CustomerEmail = customerEmail;
            invoice.CustomerTIN = customerTIN;
            invoice.CustomerAddress = customerAddress;
            invoice.BranchName = branchName;
            invoice.Currency = currentCurrency;
            invoice.ItemsXML = myItemsXMLStringBuilder.ToString();
            invoice.CurrenciesXML = myCurrenciesXMLStringBuilder.ToString();
            invoice.CustomerBPN = customerBpn;
            invoice.CustomerTelephoneNumber = customerTelephoneNumber;
            invoice.InvoiceComment = invoiceComment;
            invoice.InvoiceFlag = invoiceFlag;
            invoice.items = items;

            return invoice;
        }




    }
}
