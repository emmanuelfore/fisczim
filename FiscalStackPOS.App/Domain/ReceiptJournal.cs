using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace FiscalStackPOS
{
    /// <summary>
    /// Durable offline receipt journal. Every fiscalised sale is recorded here
    /// (receipts.json) so the queue survives restarts; entries are marked
    /// Submitted once their fiscal day's signed FDMS payload has been archived.
    /// </summary>
    public class ReceiptJournal
    {
        private readonly object gate = new object();
        private List<JournalEntry> entries = new List<JournalEntry>();

        public static ReceiptJournal Load()
        {
            var j = new ReceiptJournal();
            try
            {
                if (File.Exists(AppPaths.Journal))
                    j.entries = JsonConvert.DeserializeObject<List<JournalEntry>>(File.ReadAllText(AppPaths.Journal)) ?? new List<JournalEntry>();
            }
            catch { }
            return j;
        }

        private void Persist()
        {
            try { IniFile.AtomicWrite(AppPaths.Journal, JsonConvert.SerializeObject(entries, Formatting.Indented)); }
            catch { }
        }

        public void Add(JournalEntry e)
        {
            lock (gate) { entries.Add(e); Persist(); }
        }

        public void Update(string id, Action<JournalEntry> mutate)
        {
            lock (gate)
            {
                var e = entries.FirstOrDefault(x => x.Id == id);
                if (e == null) return;
                mutate(e);
                Persist();
            }
        }

        public void MarkSubmittedForDay(string fiscalDayNo)
        {
            lock (gate)
            {
                bool changed = false;
                foreach (var e in entries)
                {
                    if (e.FiscalDayNo == fiscalDayNo && !e.Submitted) { e.Submitted = true; changed = true; }
                }
                if (changed) Persist();
            }
        }

        public List<JournalEntry> TodaysEntries(DateTime? day = null)
        {
            DateTime d = (day ?? DateTime.Now).Date;
            lock (gate)
            {
                return entries.Where(e => e.Created.Date == d).OrderByDescending(e => e.Created).ToList();
            }
        }

        public List<JournalEntry> Unsubmitted()
        {
            lock (gate) { return entries.Where(e => !e.Submitted).ToList(); }
        }

        public List<JournalEntry> All()
        {
            lock (gate) { return entries.OrderByDescending(e => e.Created).ToList(); }
        }
    }
}