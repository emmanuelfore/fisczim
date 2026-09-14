using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace FiscalStackPOS.Views
{
    public partial class PosView : UserControl
    {
        private readonly ObservableCollection<CartLineVm> cart = new ObservableCollection<CartLineVm>();
        private readonly List<ProductVm> tiles = new List<ProductVm>();
        private string selectedCategory = "All";

        public PosView()
        {
            InitializeComponent();
            CartList.ItemsSource = cart;
            cart.CollectionChanged += (s, e) => UpdateAll();
            tiles.AddRange(AllTiles());
            TileList.ItemsSource = tiles;
            BuildCategories();
        }

        private void BuildCategories()
        {
            var cats = new List<string> { "All" };
            foreach (var p in AppServices.Products)
                if (!string.IsNullOrEmpty(p.Category) &&
                    !cats.Contains(p.Category, StringComparer.OrdinalIgnoreCase))
                    cats.Add(p.Category);
            CatHost.Children.Clear();
            for (int i = 0; i < cats.Count; i++)
            {
                string cat = cats[i];
                var rb = new RadioButton
                {
                    Style = FindResource("PillButton") as Style,
                    Content = cat,
                    Tag = cat,
                    Margin = new Thickness(0, 0, 8, 0),
                    IsChecked = i == 0
                };
                int idx = i;
                rb.Checked += (s, e) =>
                {
                    var c = (s as RadioButton);
                    if (c == null || !Equals(c.Tag, selectedCategory)) { selectedCategory = c.Tag.ToString(); ApplyFilter(); }
                };
                CatHost.Children.Add(rb);
            }
        }

        private void OnKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == System.Windows.Input.Key.F10) { e.Handled = true; Pay(); }
            else if (e.Key == System.Windows.Input.Key.F9) { e.Handled = true; OnHold(sender, new RoutedEventArgs()); }
        }

        public void OnActivated()
        {
            ApplyFilter();
            LblInvoice.Text = InvoiceNumbers.Next(AppServices.State);
        }

        // ------------------------------------------------------------------ catalog

        private IEnumerable<ProductVm> AllTiles()
        {
            string sym = AppServices.CurrencySymbol;
            bool vatIncl = AppServices.State.Settings.PricesIncludeVat;
            return AppServices.Products.Select(p => new ProductVm(p, sym, vatIncl));
        }

        private void ApplyFilter()
        {
            string q = TxtSearch.Text.Trim().ToLowerInvariant();
            var filtered = AllTiles().Where(t =>
                (selectedCategory == "All" || string.Equals(t.Category, selectedCategory, StringComparison.OrdinalIgnoreCase)) &&
                (q.Length == 0 ||
                 t.Product.Name.ToLowerInvariant().Contains(q) ||
                 (t.Product.Barcode != null && t.Product.Barcode.ToLowerInvariant().Contains(q)) ||
                 (t.Product.Code != null && t.Product.Code.ToLowerInvariant().Contains(q)) ||
                 (t.Product.Category != null && t.Product.Category.ToLowerInvariant().Contains(q))));
            tiles.Clear();
            tiles.AddRange(filtered);
        }

        private void OnSearchChanged(object sender, TextChangedEventArgs e) { if (tiles != null) ApplyFilter(); }

        private void OnSearchKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.Enter) return;
            e.Handled = true;
            string q = TxtSearch.Text.Trim();
            if (q.Length == 0) return;
            var exact = AppServices.Products.FirstOrDefault(p =>
                string.Equals(p.Barcode, q, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(p.Code, q, StringComparison.OrdinalIgnoreCase));
            if (exact != null) { AddProduct(exact); TxtSearch.Clear(); return; }
            var one = tiles.Where(t =>
                t.Product.Name.ToLowerInvariant().Contains(q.ToLowerInvariant())).Take(1).ToList();
            if (one.Count == 1) { AddProduct(one[0].Product); }
        }

        private void OnTileClick(object sender, RoutedEventArgs e)
        {
            var btn = e.Source as Button;
            ProductVm p;
            if (btn != null && (p = btn.DataContext as ProductVm) != null) AddProduct(p.Product);
        }

        private void AddProduct(Product p)
        {
            if (p.Price <= 0) return;
            decimal qty = Parse(TxtQty.Text);
            if (qty <= 0) qty = 1m;
            var line = cart.FirstOrDefault(c =>
                c.Item.Name == p.Name && c.Item.Price == p.Price && c.Item.TaxRate == p.TaxRate);
            if (line != null) line.Quantity += qty;
            else
            {
                var it = new PosItem { Name = p.Name, Code = p.Code, HsCode = p.HsCode, Quantity = qty, Price = p.Price, TaxRate = p.TaxRate };
                cart.Add(new CartLineVm(it, AppServices.CurrencySymbol));
            }
        }

        // ------------------------------------------------------------------ cart ops

        private void OnPlus(object sender, RoutedEventArgs e)
        {
            var line = (sender as FrameworkElement).DataContext as CartLineVm;
            if (line != null) line.Quantity += 1m;
        }

        private void OnMinus(object sender, RoutedEventArgs e)
        {
            var line = (sender as FrameworkElement).DataContext as CartLineVm;
            if (line == null) return;
            line.Quantity -= 1m;
            if (line.Quantity <= 0) cart.Remove(line);
        }

        private void OnVoidLine(object sender, RoutedEventArgs e)
        {
            var line = (sender as FrameworkElement).DataContext as CartLineVm;
            if (line == null) return;
            var reason = Dialogs.ReasonDialog.Pick(Window.GetWindow(this));
            if (reason == null) return;
            cart.Remove(line);
            AppServices.NotifyStatus();
        }

        private void OnClearCart(object sender, RoutedEventArgs e)
        {
            if (cart.Count > 0 &&
                MessageBox.Show(Window.GetWindow(this), AppServices.T("pos.clearQ"), AppServices.T("pos.clearCart"),
                    MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            cart.Clear();
        }

        private void OnHold(object sender, RoutedEventArgs e)
        {
            if (cart.Count == 0) return;
            HoldsStore.Add(new HoldEntry { Name = "Hold", Items = cart.Select(c => c.Item).ToList() });
            cart.Clear();
        }

        private void OnResume(object sender, RoutedEventArgs e)
        {
            var holds = HoldsStore.Load();
            if (holds.Count == 0) { MessageBox.Show(Window.GetWindow(this), AppServices.T("hold.empty"), AppServices.T("hold.resume"), MessageBoxButton.OK, MessageBoxImage.Information); return; }
            var picker = new Dialogs.HoldPickerDialog(holds);
            if (picker.ShowDialog() != true || picker.Selected == null) return;
            cart.Clear();
            foreach (var it in picker.Selected.Items)
                cart.Add(new CartLineVm(it, AppServices.CurrencySymbol));
            HoldsStore.Remove(picker.Selected.Id);
        }

        private void OnFreeItem(object sender, RoutedEventArgs e)
        {
            var dlg = new Dialogs.ItemDialog();
            if (dlg.ShowDialog() != true) return;
            cart.Add(new CartLineVm(new PosItem
            {
                Name = dlg.ItemName,
                Quantity = dlg.Qty,
                Price = dlg.Price,
                TaxRate = dlg.TaxRate,
                HsCode = dlg.HsCode
            }, AppServices.CurrencySymbol));
        }

        private void OnPay(object sender, RoutedEventArgs e)
        {
            Pay();
        }

        private void Pay()
        {
            if (cart.Count == 0) return;
            if (!AppServices.State.TillOpen && AppServices.State.CurrentAccessLevel < 3)
            {
                MessageBox.Show(Window.GetWindow(this), AppServices.T("pos.tillClosedPay"),
                    AppServices.T("pos.tillClosedTitle"), MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            var sale = new PosSale
            {
                InvoiceNumber = InvoiceNumbers.Next(AppServices.State),
                Currency = string.IsNullOrEmpty(AppServices.State.Settings.InvoiceCurrency) ? "USD" : AppServices.State.Settings.InvoiceCurrency,
                Created = DateTime.Now,
                PaymentMethod = "CASH"
            };
            foreach (var c in cart) sale.Items.Add(c.Item);

            var dlg = new Dialogs.CheckoutDialog(sale);
            var result = dlg.ShowDialog();
            if (result == true)
            {
                cart.Clear();
                LblInvoice.Text = InvoiceNumbers.Next(AppServices.State);
                AppServices.NotifyStatus();
            }
        }

        // ------------------------------------------------------------------ totals

        private void UpdateAll()
        {
            decimal sub = 0, vat = 0;
            foreach (var c in cart)
            {
                sub += c.Item.Amount;
                vat += c.Item.Tax;
            }
            string sym = AppServices.CurrencySymbol + " ";
            LblSubtotal.Text = sym + sub.ToString("0.00");
            LblVat.Text = sym + vat.ToString("0.00");
            LblTotal.Text = sym + sub.ToString("0.00");
            LblEmpty.Visibility = cart.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        private static decimal Parse(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0m;
            decimal d;
            return decimal.TryParse(s.Replace(",", "."), System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out d) ? d : 0m;
        }
    }
}