using System;
using System.Windows;

namespace FiscalStackPOS.Dialogs
{
    public partial class HoldPickerDialog : Window
    {
        public HoldEntry Selected;
        private readonly System.Collections.Generic.List<HoldEntry> holds;

        public HoldPickerDialog(System.Collections.Generic.List<HoldEntry> holds)
        {
            InitializeComponent();
            this.holds = holds;
            ListHolds.DisplayMemberPath = "Label";
            foreach (var h in holds) ListHolds.Items.Add(new HoldWrap(h));
        }

        private class HoldWrap
        {
            public HoldEntry Hold;
            public string Label
            {
                get
                {
                    int n = Hold.Items.Count;
                    decimal amt = 0; foreach (var it in Hold.Items) amt += it.Amount;
                    return Hold.Created.ToString("dd/MM  HH:mm") + "   ·   " + n + " " + AppServices.T("hold.items") + "   ·   " + amt.ToString("0.00");
                }
            }
            public HoldWrap(HoldEntry h) { Hold = h; }
        }

        private void OnResume(object sender, RoutedEventArgs e)
        {
            var wrap = ListHolds.SelectedItem as HoldWrap;
            if (wrap == null) return;
            Selected = wrap.Hold;
            DialogResult = true;
        }
    }
}