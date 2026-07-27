using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public class HistoryRecord
    {
        public string InvoiceId { get; set; }
        public DateTime Timestamp { get; set; }
        public bool Success { get; set; }
        public string ErrorMessage { get; set; }
        public string TotalAmount { get; set; }
        public string RawJson { get; set; }
    }

    public static class HistoryManager
    {
        private static readonly string _dbPath;
        private static List<HistoryRecord> _cache;

        static HistoryManager()
        {
            _dbPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "history.json");
            Load();
        }

        private static void Load()
        {
            try
            {
                if (File.Exists(_dbPath))
                {
                    string json = File.ReadAllText(_dbPath);
                    _cache = JsonConvert.DeserializeObject<List<HistoryRecord>>(json) ?? new List<HistoryRecord>();
                }
                else
                {
                    _cache = new List<HistoryRecord>();
                }
            }
            catch
            {
                _cache = new List<HistoryRecord>();
            }
        }

        public static void Save()
        {
            try
            {
                string json = JsonConvert.SerializeObject(_cache, Formatting.Indented);
                File.WriteAllText(_dbPath, json);
            }
            catch { }
        }

        public static void AddRecord(string invoiceId, bool success, string errorMessage = "", string totalAmount = "", string rawJson = "")
        {
            var record = new HistoryRecord
            {
                InvoiceId = invoiceId,
                Timestamp = DateTime.Now,
                Success = success,
                ErrorMessage = errorMessage,
                TotalAmount = totalAmount,
                RawJson = rawJson
            };
            
            // Keep last 1000 records
            if (_cache.Count > 1000) _cache.RemoveAt(0);
            
            _cache.Add(record);
            Save();
        }

        public static List<HistoryRecord> GetRecent(int count = 50)
        {
            return _cache.OrderByDescending(r => r.Timestamp).Take(count).ToList();
        }

        public static int GetTotalProcessedToday()
        {
            return _cache.Count(r => r.Timestamp.Date == DateTime.Now.Date);
        }

        public static double GetSuccessRateToday()
        {
            var today = _cache.Where(r => r.Timestamp.Date == DateTime.Now.Date).ToList();
            if (today.Count == 0) return 100.0;
            return (double)today.Count(r => r.Success) / today.Count * 100.0;
        }

        public static List<HistoryRecord> GetFailedToday()
        {
            return _cache.Where(r => r.Timestamp.Date == DateTime.Now.Date && !r.Success).ToList();
        }
    }
}
