using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace FiscalStackPOS
{
    /// <summary>App-wide services shared by all views (device, journal, state, queue).</summary>
    public static class AppServices
    {
        public static PosState State;
        public static FiscalStackDevice Device;
        public static ReceiptJournal Journal;
        public static SubmissionService Submitter;
        public static List<Product> Products = new List<Product>();
        public static List<PosUser> Users = new List<PosUser>();
        public static CardInfo Card = new CardInfo();
        public static PosUser CurrentUser;

        public static bool Online;
        public static int QueueCount;

        public static DispatcherTimer Timer;
        public static event Action StatusChanged;

        public static string CurrencySymbol { get { return State == null ? "USD" : State.Settings.CurrencySymbol; } }

        // ---- localization ----
        public static string T(string key)
        {
            if (Application.Current == null) return key;
            try
            {
                object v = Application.Current.TryFindResource(key);
                if (v is string) return (string)v;
            }
            catch { }
            return key;
        }

        public static void SetLanguage(string lang)
        {
            if (Application.Current == null) return;
            var roots = Application.Current.Resources.MergedDictionaries;
            for (int i = roots.Count - 1; i >= 0; i--)
            {
                var md = roots[i];
                if (md.Source != null && md.Source.OriginalString.IndexOf("i18n/zh", StringComparison.OrdinalIgnoreCase) >= 0)
                    roots.RemoveAt(i);
            }
            if (lang == "zh-CN")
            {
                var zh = new ResourceDictionary { Source = new Uri("/FiscalStackPOS;component/i18n/zh.xaml", UriKind.Relative) };
                roots.Add(zh);
            }
        }

        public static string CurrentLanguage { get { return State == null ? "en" : State.Language; } }

        public static void NotifyStatus()
        {
            if (StatusChanged != null) StatusChanged();
        }

        public static void StartTimers()
        {
            Timer = new DispatcherTimer();
            Timer.Interval = TimeSpan.FromSeconds(Math.Max(5, State.Settings.OnlineCheckIntervalSec));
            Timer.Tick += (s, e) =>
            {
                try
                {
                    bool on = Submitter.IsOnline();
                    if (on != Online)
                    {
                        Online = on;
                        NotifyStatus();
                    }
                    if (on && State.Settings.SubmitWhenOnline && !string.IsNullOrEmpty(State.CurrentFiscalDayNo) && State.CurrentFiscalDayNo != "0")
                    {
                        var outcome = Submitter.SubmitPending(State.CurrentFiscalDayNo, State.CurrentFiscalDate);
                        QueueCount = Journal.Unsubmitted().Count;
                        NotifyStatus();
                    }
                }
                catch { }
            };
            Timer.Start();
        }

        public static void StopTimers()
        {
            if (Timer != null) { try { Timer.Stop(); } catch { } Timer = null; }
        }

        public static void EnsureFiscalDayOpen()
        {
            try
            {
                string st = Device.GetStatus();
                if (Device.IsFiscalDayClosed(st))
                {
                    Device.OpenDay();
                }
                TrackFiscalDay();
            }
            catch { }
        }

        public static void TrackFiscalDay()
        {
            try
            {
                string st = Device.GetStatus();
                State.CurrentFiscalDayNo = Device.GetLastFiscalDayNo(st);
                if (string.IsNullOrEmpty(State.CurrentFiscalDate))
                    State.CurrentFiscalDate = DateTime.Now.ToString("yyyy-MM-dd");
                PosStateStore.Save(State);
            }
            catch { }
        }

        public static string DayLabel
        {
            get
            {
                if (State == null || string.IsNullOrEmpty(State.CurrentFiscalDayNo)) return T("hdr.day") + " -";
                return T("hdr.day") + " " + State.CurrentFiscalDayNo + "  \u00b7  " + (string.IsNullOrEmpty(State.CurrentFiscalDate) ? "" : State.CurrentFiscalDate);
            }
        }

        public static string TillLabel
        {
            get
            {
                if (State == null) return T("hdr.tillClosed");
                return State.TillOpen ? T("hdr.tillOpen") + "  \u00b7  " + State.StartingCash.ToString("0.00") : T("hdr.tillClosed");
            }
        }

        public static string UserLabel
        {
            get
            {
                if (CurrentUser == null) return "";
                string n = string.IsNullOrEmpty(CurrentUser.FullName) ? CurrentUser.Username : CurrentUser.FullName;
                return n + "  \u00b7  " + LevelName(CurrentUser.AccessLevel);
            }
        }

        public static string Initials
        {
            get
            {
                if (CurrentUser == null) return "?";
                string n = string.IsNullOrEmpty(CurrentUser.FullName) ? CurrentUser.Username : CurrentUser.FullName;
                if (n.Length == 0) return "?";
                if (n.IndexOf(' ') > 0) return n.Substring(0, 1) + n.Substring(n.IndexOf(' ') + 1, 1);
                return n.Substring(0, 1);
            }
        }

        public static string LevelName(int level)
        {
            if (level >= 3) return T("lvl.admin");
            if (level == 2) return T("lvl.supervisor");
            return T("lvl.cashier");
        }
    }
}