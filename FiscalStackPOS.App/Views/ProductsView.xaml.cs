using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace FiscalStackPOS.Views
{
    public partial class ProductsView : UserControl
    {
        private readonly ObservableCollection<ProductRow> rows = new ObservableCollection<ProductRow>();

        public ProductsView()
        {
            InitializeComponent();
            Grid.ItemsSource = rows;
            Localize();
            Refresh();
        }

        public void Localize()
        {
            ColName.Header = AppServices.T("prod.colName");
            ColCode.Header = AppServices.T("prod.colCode");
            ColBarcode.Header = AppServices.T("prod.colBarcode");
            ColCategory.Header = AppServices.T("prod.colCategory");
            ColPrice.Header = AppServices.T("prod.colPrice");
            ColVat.Header = AppServices.T("prod.colVat");
        }

        public void OnActivated() { Refresh(); }

        private void Refresh()
        {
            rows.Clear();
            foreach (var p in AppServices.Products)
                rows.Add(new ProductRow(p, AppServices.CurrencySymbol));
        }

        private void OnSearch(object sender, TextChangedEventArgs e)
        {
            string q = TxtSearch.Text.Trim().ToLowerInvariant();
            rows.Clear();
            foreach (var p in AppServices.Products)
            {
                if (q.Length > 0 &&
                    !(p.Name != null && p.Name.ToLowerInvariant().Contains(q)) &&
                    !(p.Code != null && p.Code.ToLowerInvariant().Contains(q)) &&
                    !(p.Barcode != null && p.Barcode.ToLowerInvariant().Contains(q)) &&
                    !(p.Category != null && p.Category.ToLowerInvariant().Contains(q)))
                    continue;
                rows.Add(new ProductRow(p, AppServices.CurrencySymbol));
            }
        }

        private ProductRow Selected()
        {
            return Grid.SelectedItem as ProductRow;
        }

        private void OnNew(object sender, RoutedEventArgs e)
        {
            var dlg = new Dialogs.ProductDialog(new Product { Name = "", Price = 0m, TaxRate = 0.155m, Category = "General", ImagePath = "" });
            if (dlg.ShowDialog() == true)
            {
                AppServices.Products.Add(dlg.Product);
                ProductStore.Save(AppServices.Products);
                Refresh();
            }
        }

        private void OnEdit(object sender, RoutedEventArgs e)
        {
            var row = Selected();
            if (row == null) return;
            var copy = new Product
            {
                Name = row.Product.Name,
                Code = row.Product.Code,
                Barcode = row.Product.Barcode,
                Category = row.Product.Category,
                HsCode = row.Product.HsCode,
                Price = row.Product.Price,
                TaxRate = row.Product.TaxRate,
                ImagePath = row.Product.ImagePath
            };
            var dlg = new Dialogs.ProductDialog(copy);
            if (dlg.ShowDialog() == true)
            {
                int i = AppServices.Products.IndexOf(row.Product);
                if (i >= 0) AppServices.Products[i] = dlg.Product;
                ProductStore.Save(AppServices.Products);
                Refresh();
            }
        }

        private void OnDelete(object sender, RoutedEventArgs e)
        {
            var row = Selected();
            if (row == null) return;
            if (MessageBox.Show(Window.GetWindow(this), string.Format(AppServices.T("prod.deleteQ"), row.Product.Name),
                AppServices.T("common.delete"), MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            AppServices.Products.Remove(row.Product);
            ProductStore.Save(AppServices.Products);
            Refresh();
        }

        private void OnImport(object sender, RoutedEventArgs e)
        {
            var ofd = new OpenFileDialog { Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*" };
            if (ofd.ShowDialog() != true) return;
            try
            {
                string msg = ProductStore.ImportCsv(ofd.FileName, AppServices.Products);
                ProductStore.Save(AppServices.Products);
                Refresh();
                MessageBox.Show(Window.GetWindow(this), string.Format(AppServices.T("prod.importMsg"), msg, AppServices.Products.Count),
                    AppServices.T("prod.import"), MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex) { MessageBox.Show(Window.GetWindow(this), string.Format(AppServices.T("prod.importFail"), ex.Message), AppServices.T("prod.import"), MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void OnExport(object sender, RoutedEventArgs e)
        {
            var sfd = new SaveFileDialog { Filter = "CSV files (*.csv)|*.csv", FileName = "products.csv" };
            if (sfd.ShowDialog() != true) return;
            try
            {
                string msg = ProductStore.ExportCsv(AppServices.Products, sfd.FileName);
                MessageBox.Show(Window.GetWindow(this), msg, AppServices.T("prod.export"), MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex) { MessageBox.Show(Window.GetWindow(this), string.Format(AppServices.T("prod.exportFail"), ex.Message), AppServices.T("prod.export"), MessageBoxButton.OK, MessageBoxImage.Error); }
        }
    }
}