using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace FiscalStackPOS
{
    /// <summary>Persistent saved carts (holds.json).</summary>
    public static class HoldsStore
    {
        public static List<HoldEntry> Load()
        {
            try
            {
                if (File.Exists(AppPaths.HoldsFile))
                {
                    var list = JsonConvert.DeserializeObject<List<HoldEntry>>(File.ReadAllText(AppPaths.HoldsFile));
                    if (list != null) return list;
                }
            }
            catch { }
            return new List<HoldEntry>();
        }

        public static void Save(List<HoldEntry> holds)
        {
            try { IniFile.AtomicWrite(AppPaths.HoldsFile, JsonConvert.SerializeObject(holds, Formatting.Indented)); }
            catch { }
        }

        public static HoldEntry Add(HoldEntry h)
        {
            var all = Load();
            all.Add(h);
            Save(all);
            return h;
        }

        public static void Remove(string id)
        {
            var all = Load();
            all.RemoveAll(x => x.Id == id);
            Save(all);
        }
    }
}