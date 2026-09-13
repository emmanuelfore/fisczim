using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;

namespace FiscalStackPOS
{
    /// <summary>Persistent product catalog (products.json) + CSV import/export.</summary>
    public static class ProductStore
    {
        public static List<Product> Load()
        {
            try
            {
                if (File.Exists(AppPaths.ProductsFile))
                {
                    var list = JsonConvert.DeserializeObject<List<Product>>(File.ReadAllText(AppPaths.ProductsFile));
                    if (list != null && list.Count > 0) return list;
                }
            }
            catch { }
            var fresh = SampleCatalog();
            Save(fresh);
            return fresh;
        }

        public static void Save(List<Product> products)
        {
            try { IniFile.AtomicWrite(AppPaths.ProductsFile, JsonConvert.SerializeObject(products, Formatting.Indented)); }
            catch { }
        }

        public static List<string> Categories(List<Product> products)
        {
            List<string> cats = new List<string>();
            foreach (var p in products)
            {
                string c = (p.Category ?? "").Trim();
                if (c.Length > 0 && !cats.Contains(c, StringComparer.OrdinalIgnoreCase)) cats.Add(c);
            }
            cats.Sort();
            return cats;
        }

        public static List<Product> SampleCatalog()
        {
            var list = new List<Product>
            {
                P("Still Water 500ml", "Beverages", "1001", "001001", 0.80m, 0.155m),
                P("Fizzy Drink 300ml", "Beverages", "1002", "001002", 1.00m, 0.155m),
                P("Fresh Bread Loaf", "Bakery", "2001", "002001", 1.50m, 0.155m),
                P("Sugar 1kg", "Groceries", "3001", "003001", 1.80m, 0.155m),
                P("Cooking Oil 2L", "Groceries", "3002", "003002", 7.50m, 0.155m),
                P("Maize Meal 5kg", "Groceries", "3003", "003003", 6.90m, 0.155m),
                P("Rice 2kg", "Groceries", "3004", "003004", 4.20m, 0.155m),
                P("Powdered Milk 500g", "Groceries", "3005", "003005", 5.10m, 0.155m),
                P("Toothpaste 75ml", "Health", "4001", "004001", 2.30m, 0.155m),
                P("Soap Bar", "Health", "4002", "004002", 1.10m, 0.155m)
            };
            return list;
        }

        private static Product P(string name, string cat, string code, string barcode, decimal price, decimal tax)
        {
            return new Product { Name = name, Category = cat, Code = code, Barcode = barcode, Price = price, TaxRate = tax };
        }

        /// <summary>
        /// Imports products into <paramref name="target"/>. Header row is auto-detected when
        /// the first column is named; otherwise fixed order is
        /// Name,Category,Code,Barcode,HsCode,Price,TaxRate.
        /// </summary>
        public static string ImportCsv(string path, List<Product> target)
        {
            if (!File.Exists(path)) return "File not found: " + path;
            string[] lines = File.ReadAllLines(path);
            if (lines.Length == 0) return "File is empty.";
            char sep = DetectSeparator(lines[0]);
            int added = 0, skipped = 0;
            var existingNames = new HashSet<string>(target.Select(p => (p.Name ?? "").Trim().ToLowerInvariant()));
            var headerMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            int start = 0;
            string[] first = SplitRow(lines[0], sep);
            if (first.Length > 0 && IsHeader(first[0]))
            {
                for (int i = 0; i < first.Length; i++) headerMap[first[i].Trim()] = i;
                start = 1;
            }

            for (int li = start; li < lines.Length; li++)
            {
                string l = lines[li];
                if (string.IsNullOrWhiteSpace(l)) continue;
                string[] c = SplitRow(l, sep);
                if (c.Length == 0 || string.IsNullOrWhiteSpace(c[0])) { skipped++; continue; }
                string name = Cell(headerMap, c, "name", 0);
                if (name.Length == 0) { skipped++; continue; }
                if (existingNames.Contains(name.ToLowerInvariant())) { skipped++; continue; }

                Product p = new Product { Name = name };
                p.Category = Cell(headerMap, c, "category", 1);
                p.Code = CellAny(headerMap, c, 2, "code", "sku", "itemcode");
                p.Barcode = CellAny(headerMap, c, 3, "barcode", "ean");
                p.HsCode = CellAny(headerMap, c, 4, "hs", "hscode", "hs-code", "tariff");
                decimal price;
                var priceRaw = CellAny(headerMap, c, 5, "price", "sellingprice", "amount");
                p.Price = decimal.TryParse(priceRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out price) && price > 0 ? price : 0m;
                decimal tax;
                var taxRaw = CellAny(headerMap, c, 6, "tax", "vat", "taxrate", "rate");
                p.TaxRate = decimal.TryParse(taxRaw, NumberStyles.Any, CultureInfo.InvariantCulture, out tax) ? tax : 0m;
                target.Add(p);
                existingNames.Add(p.Name.ToLowerInvariant());
                added++;
            }
            Save(target);
            return "Imported " + added + " product(s)" + (skipped > 0 ? ", skipped " + skipped + " row(s)" : "") + ".";
        }

        public static string ExportCsv(List<Product> products, string path)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("Name,Category,Code,Barcode,HsCode,Price,TaxRate");
            foreach (var p in products)
            {
                sb.Append(Csv(p.Name)).Append(',')
                  .Append(Csv(p.Category)).Append(',')
                  .Append(Csv(p.Code)).Append(',')
                  .Append(Csv(p.Barcode)).Append(',')
                  .Append(Csv(p.HsCode)).Append(',')
                  .Append(p.Price.ToString("0.00", CultureInfo.InvariantCulture)).Append(',')
                  .Append(p.TaxRate.ToString("0.###", CultureInfo.InvariantCulture)).AppendLine();
            }
            File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
            return path;
        }

        private static char DetectSeparator(string line)
        {
            int t = line.Split(',').Length, s = line.Split('\t').Length, sem = line.Split(';').Length;
            if (t > s && t >= sem) return ',';
            if (s > sem) return '\t';
            return ';';
        }

        private static bool IsHeader(string cell)
        {
            var v = (cell ?? "").Trim().ToLowerInvariant();
            return v == "name" || v == "product" || v == "item" || v == "productname" || v.Contains("name");
        }

        private static string Cell(Dictionary<string, int> map, string[] c, string key, int fallback)
        {
            int i;
            if (map.TryGetValue(key, out i) && i < c.Length) return c[i].Trim();
            if (fallback < c.Length) return c[fallback].Trim();
            return "";
        }

        private static string CellAny(Dictionary<string, int> map, string[] c, int fallback, params string[] keys)
        {
            foreach (var k in keys)
            {
                int i;
                if (map.TryGetValue(k, out i) && i < c.Length && c[i].Trim().Length > 0) return c[i].Trim();
            }
            if (fallback < c.Length) return c[fallback].Trim();
            return "";
        }

        private static string[] SplitRow(string line, char sep)
        {
            var parts = line.Split(sep);
            var outList = new List<string>();
            foreach (var p in parts)
            {
                string t = p.Trim().Trim('"').Trim('\'').Trim();
                outList.Add(t);
            }
            return outList.ToArray();
        }

        private static string Csv(string v)
        {
            if (v == null) return "";
            if (v.Contains(",") || v.Contains("\"") || v.Contains("\n")) return "\"" + v.Replace("\"", "\"\"") + "\"";
            return v;
        }
    }
}