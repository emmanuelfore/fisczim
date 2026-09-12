using System;
using System.IO;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public class DeviceMetadata
    {
        public string CompanyName { get; set; }
        public string DeviceId { get; set; }
        public string FiscalDay { get; set; }
        public string TIN { get; set; }
        public string VAT { get; set; }
        public string SerialNumber { get; set; }
        public string Address { get; set; }
        public string RegistrationNumber { get; set; }
        public DateTime LastUpdated { get; set; }
        public bool IsOfflineMode { get; set; }
    }

    public static class DeviceCacheManager
    {
        private static readonly string _path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "device_cache.json");
        private static DeviceMetadata _current;

        static DeviceCacheManager()
        {
            Load();
        }

        public static DeviceMetadata Current
        {
            get
            {
                if (_current == null) _current = new DeviceMetadata();
                return _current;
            }
        }

        public static void Load()
        {
            try
            {
                if (File.Exists(_path))
                {
                    string json = File.ReadAllText(_path);
                    _current = JsonConvert.DeserializeObject<DeviceMetadata>(json) ?? new DeviceMetadata();
                }
                else
                {
                    _current = new DeviceMetadata();
                }
            }
            catch
            {
                _current = new DeviceMetadata();
            }
        }

        public static void Save(CardDetails details, bool isOffline = false)
        {
            if (details == null) return;
            if (_current == null) _current = new DeviceMetadata();

            if (details.Data != null)
            {
                _current.CompanyName = details.Data.CompanyName ?? _current.CompanyName;
                _current.TIN = details.Data.TIN ?? _current.TIN;
                _current.VAT = details.Data.VAT ?? _current.VAT;
                _current.SerialNumber = details.Data.SerialNumber ?? _current.SerialNumber;
                _current.Address = details.Data.Address ?? _current.Address;
                _current.RegistrationNumber = details.Data.RegistrationNumber ?? _current.RegistrationNumber;
                // Use SerialNumber as DeviceId if no separate DeviceId field exists
                _current.DeviceId = details.Data.SerialNumber ?? _current.DeviceId ?? "N/A";
            }
            if (!string.IsNullOrEmpty(details.FiscalDay)) _current.FiscalDay = details.FiscalDay;
            _current.LastUpdated = DateTime.Now;
            _current.IsOfflineMode = isOffline;

            try
            {
                string json = JsonConvert.SerializeObject(_current, Formatting.Indented);
                File.WriteAllText(_path, json);
            }
            catch { }
        }

        public static void UpdateFiscalDay(string dayNo)
        {
            if (string.IsNullOrEmpty(dayNo)) return;
            if (_current == null) Load();
            _current.FiscalDay = dayNo;
            _current.LastUpdated = DateTime.Now;
            try
            {
                string json = JsonConvert.SerializeObject(_current, Formatting.Indented);
                File.WriteAllText(_path, json);
            }
            catch { }
        }

        public static void UpdateOfflineMode(bool isOffline)
        {
            if (_current == null) Load();
            _current.IsOfflineMode = isOffline;
            _current.LastUpdated = DateTime.Now;
            try
            {
                string json = JsonConvert.SerializeObject(_current, Formatting.Indented);
                File.WriteAllText(_path, json);
            }
            catch { }
        }

        public static bool HasCachedData()
        {
            Load();
            return _current != null && !string.IsNullOrEmpty(_current.CompanyName);
        }

        public static string GetCacheStatus()
        {
            Load();
            if (_current == null) return "No cache";
            
            TimeSpan age = DateTime.Now - _current.LastUpdated;
            string ageStr = age.TotalMinutes < 60 ? $"{(int)age.TotalMinutes}m ago" : 
                           age.TotalHours < 24 ? $"{(int)age.TotalHours}h ago" : 
                           $"{age.Days}d ago";
            
            return $"Cached ({ageStr}) - {(_current.IsOfflineMode ? "Offline" : "Online")}";
        }
    }
}
