using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json;

namespace FiscalStackPOS
{
    public class PosUser
    {
        public string Id = Guid.NewGuid().ToString("N");
        public string Username = "";
        public string FullName = "";
        public string Salt = "";
        public string Hash = "";          // PBKDF2(password, salt)
        public int AccessLevel = 1;       // 1 cashier, 2 supervisor, 3 admin
        public bool IsEnabled = true;
        public DateTime CreatedUtc = DateTime.UtcNow;
    }

    /// <summary>Local users with PBKDF2-hashed passwords (users.json).</summary>
    public static class UserStore
    {
        public static string UsersFile { get { return Path.Combine(AppPaths.DataDir, "users.json"); } }

        public static List<PosUser> Load()
        {
            try
            {
                if (File.Exists(UsersFile))
                {
                    var list = JsonConvert.DeserializeObject<List<PosUser>>(File.ReadAllText(UsersFile));
                    if (list != null && list.Count > 0) return list;
                }
            }
            catch { }
            return new List<PosUser>();
        }

        public static void Save(List<PosUser> users)
        {
            try { IniFile.AtomicWrite(UsersFile, JsonConvert.SerializeObject(users, Formatting.Indented)); }
            catch { }
        }

        public static PosUser Find(List<PosUser> users, string username)
        {
            return users.FirstOrDefault(u => string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>The first-created admin is treated as the protected owner account.</summary>
        public static string CurrentAdminId(List<PosUser> users)
        {
            PosUser admin = users.Where(x => x.AccessLevel >= 3).OrderBy(x => x.CreatedUtc).FirstOrDefault();
            return admin != null ? admin.Id : "";
        }

        public static bool Validate(List<PosUser> users, string username, string password, out PosUser user)
        {
            user = Find(users, username);
            if (user == null || !user.IsEnabled) return false;
            if (string.IsNullOrEmpty(user.Salt) || string.IsNullOrEmpty(user.Hash)) return string.IsNullOrEmpty(password);
            byte[] salt = Convert.FromBase64String(user.Salt);
            byte[] expected = Convert.FromBase64String(user.Hash);
            return Hash(password, salt, 10000).SequenceEqual(expected);
        }

        public static PosUser Create(string username, string fullName, string password, int accessLevel)
        {
            byte[] salt = new byte[16];
            using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(salt);
            return new PosUser
            {
                Username = username,
                FullName = fullName,
                Salt = Convert.ToBase64String(salt),
                Hash = Convert.ToBase64String(Hash(password, salt, 10000)),
                AccessLevel = accessLevel
            };
        }

        private static byte[] Hash(string password, byte[] salt, int iterations)
        {
            using (var pbkdf2 = new Rfc2898DeriveBytes(password, salt, iterations))
                return pbkdf2.GetBytes(32);
        }
    }
}