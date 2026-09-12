using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace Revmax_Interface_Promun
{
    public class QueuedInvoice
    {
        public string Id { get; set; }
        public string PayloadJson { get; set; }
        public DateTime QueuedAt { get; set; }
        public int RetryCount { get; set; }
        public string LastError { get; set; }
    }

    public class OfflineQueue
    {
        private static readonly string QueueFile = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "offline_queue.json");

        private List<QueuedInvoice> _queue = new List<QueuedInvoice>();

        public int Count { get { return _queue.Count; } }

        public OfflineQueue()
        {
            Load();
        }

        public void Enqueue(object payload)
        {
            Enqueue(Guid.NewGuid().ToString(), payload);
        }

        public void Enqueue(string id, object payload)
        {
            _queue.Add(new QueuedInvoice
            {
                Id = string.IsNullOrEmpty(id) ? Guid.NewGuid().ToString() : id,
                PayloadJson = JsonConvert.SerializeObject(payload),
                QueuedAt = DateTime.Now,
                RetryCount = 0,
                LastError = ""
            });
            Save();
        }

        public List<QueuedInvoice> GetAll()
        {
            return new List<QueuedInvoice>(_queue);
        }

        public void Remove(string id)
        {
            _queue.RemoveAll(q => q.Id == id);
            Save();
        }

        public void UpdateRetry(string id, string error)
        {
            var item = _queue.Find(q => q.Id == id);
            if (item != null)
            {
                item.RetryCount++;
                item.LastError = error;
                Save();
            }
        }

        private void Load()
        {
            try
            {
                if (File.Exists(QueueFile))
                {
                    string json = File.ReadAllText(QueueFile);
                    _queue = JsonConvert.DeserializeObject<List<QueuedInvoice>>(json)
                             ?? new List<QueuedInvoice>();
                }
            }
            catch
            {
                _queue = new List<QueuedInvoice>();
            }
        }

        private void Save()
        {
            try
            {
                File.WriteAllText(QueueFile, JsonConvert.SerializeObject(_queue, Formatting.Indented));
            }
            catch { }
        }
    }
}
