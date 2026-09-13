using System.Windows;
using System.Windows.Media.Imaging;

namespace FiscalStackPOS.Dialogs
{
    public partial class PrintPreviewDialog : Window
    {
        private readonly System.Drawing.Bitmap bitmap;

        public PrintPreviewDialog(System.Drawing.Bitmap bmp, string title)
        {
            InitializeComponent();
            bitmap = bmp;
            LblTitle.Text = title;
            PreviewImg.Source = ToSource(bmp);
        }

        private void OnPrint(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
        }

        private static BitmapSource ToSource(System.Drawing.Bitmap bmp)
        {
            var ms = new System.IO.MemoryStream();
            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            ms.Position = 0;
            var bi = new BitmapImage();
            bi.BeginInit();
            bi.CacheOption = BitmapCacheOption.OnLoad;
            bi.StreamSource = ms;
            bi.EndInit();
            bi.Freeze();
            return bi;
        }
    }
}