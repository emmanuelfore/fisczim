using System.Security.Cryptography;
using System.Text;

namespace PrintInterceptor.Core.Diagnostics;

public static class Hashing
{
    public static string Sha256Hex(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
