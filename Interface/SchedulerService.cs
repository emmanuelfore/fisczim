using System;
using System.Configuration;
using System.Threading;
using System.Windows.Forms;

namespace Revmax_Interface_Promun
{
    /// <summary>
    /// Automated End-of-Day Z-Report Scheduler.
    /// Reads "AutoCloseTime" (HH:mm) from App.config and fires Close Day at that time each day.
    /// </summary>
    public class SchedulerService : IDisposable
    {
        private System.Windows.Forms.Timer _timer;
        private FiscalStackClient _client;
        private bool _firedToday = false;
        private DateTime _lastFiredDate = DateTime.MinValue;
        private Action<string> _logCallback;
        private NotifyIcon _trayIcon;

        public bool IsEnabled { get; private set; }
        public string ScheduledTime { get; private set; }

        public SchedulerService(FiscalStackClient client, NotifyIcon trayIcon, Action<string> logCallback)
        {
            _client = client;
            _trayIcon = trayIcon;
            _logCallback = logCallback;

            ScheduledTime = ConfigurationManager.AppSettings.Get("AutoCloseTime") ?? "";
            IsEnabled = !string.IsNullOrEmpty(ScheduledTime);
        }

        public void Start()
        {
            if (!IsEnabled) return;

            _timer = new System.Windows.Forms.Timer();
            _timer.Interval = 30000; // check every 30 seconds
            _timer.Tick += OnTimerTick;
            _timer.Start();

            Log("Scheduler started — Auto Close Day at: " + ScheduledTime);
        }

        public void Stop()
        {
            if (_timer != null)
            {
                _timer.Stop();
                _timer.Dispose();
                _timer = null;
            }
        }

        public void UpdateSchedule(string time)
        {
            ScheduledTime = time;
            IsEnabled = !string.IsNullOrEmpty(time);

            Configuration config = ConfigurationManager.OpenExeConfiguration(ConfigurationUserLevel.None);
            config.AppSettings.Settings.Remove("AutoCloseTime");
            config.AppSettings.Settings.Add("AutoCloseTime", time);
            config.Save(ConfigurationSaveMode.Modified);
            ConfigurationManager.RefreshSection("appSettings");

            if (IsEnabled && _timer == null) Start();
            else if (!IsEnabled) Stop();

            Log("Scheduler updated — Auto Close Day at: " + (IsEnabled ? time : "Disabled"));
        }

        private async void OnTimerTick(object sender, EventArgs e)
        {
            if (!IsEnabled || string.IsNullOrEmpty(ScheduledTime)) return;

            DateTime now = DateTime.Now;
            string currentTime = now.ToString("HH:mm");

            // Only fire once per day
            if (currentTime == ScheduledTime && now.Date != _lastFiredDate.Date)
            {
                _lastFiredDate = now;
                Log("Auto Close Day triggered at " + currentTime);

                try
                {
                    string result = await _client.CloseDayAsync();
                    Log("Auto Close Day SUCCESS: " + result);

                    if (_trayIcon != null)
                    {
                        _trayIcon.ShowBalloonTip(5000,
                            "FiscalStack — Auto Close Day",
                            "Fiscal day closed successfully at " + currentTime,
                            ToolTipIcon.Info);
                    }
                }
                catch (Exception ex)
                {
                    Log("Auto Close Day FAILED: " + ex.Message);

                    if (_trayIcon != null)
                    {
                        _trayIcon.ShowBalloonTip(8000,
                            "FiscalStack — Close Day Error",
                            "Auto Close Day failed: " + ex.Message,
                            ToolTipIcon.Error);
                    }
                }
            }
        }

        private void Log(string msg)
        {
            if (_logCallback != null) _logCallback(msg);
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
