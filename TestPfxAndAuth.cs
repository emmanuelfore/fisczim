using System;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.OpenSsl;
using Org.BouncyCastle.Pkcs;
using Org.BouncyCastle.Security;

class Program
{
    static void Main()
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };

        string certFolder = @"C:\FiscalStack certificates\38529";
        string serverUrl = "https://fdmsapitest.zimra.co.zw";
        string deviceId = "38529";

        Console.WriteLine("=== Register + Build PFX + Test Auth (RevMax Match) ===");

        Console.WriteLine("\n[1] Generating CSR (RevMax: CN only, SHA256WithRSA, 2048)");
        var gen = new RsaKeyPairGenerator();
        gen.Init(new RsaKeyGenerationParameters(Org.BouncyCastle.Math.BigInteger.ValueOf(65537), new SecureRandom(), 2048, 25));
        var keyPair = gen.GenerateKeyPair();

        string cn = "ZIMRA-HOYOTEST-0000038529";
        var csrInfo = new Org.BouncyCastle.Asn1.X509.X509Name("CN=" + cn);
        var csr = new Pkcs10CertificationRequest("SHA256WithRSA", csrInfo, keyPair.Public, null, keyPair.Private);

        byte[] der = csr.GetDerEncoded();
        string csrPem = "-----BEGIN CERTIFICATE REQUEST-----\n"
            + Convert.ToBase64String(der, Base64FormattingOptions.InsertLineBreaks)
            + "\n-----END CERTIFICATE REQUEST-----";

        string privateKeyPem;
        using (var sw = new StringWriter())
        {
            var pw = new PemWriter(sw);
            pw.WriteObject(keyPair.Private);
            pw.Writer.Flush();
            privateKeyPem = sw.ToString();
        }

        Console.WriteLine("  Subject: CN=" + cn);

        Console.WriteLine("\n[2] Registering with ZIMRA");
        string url = serverUrl + "/Public/v1/" + deviceId + "/RegisterDevice";
        string bodyJson = Newtonsoft.Json.JsonConvert.SerializeObject(new { activationKey = "00519427", certificateRequest = csrPem });

        string respJson = HttpPost(url, bodyJson, "Virtual Server", "v1");
        if (respJson == null) { Console.WriteLine("  FAILED"); return; }

        var obj = Newtonsoft.Json.Linq.JObject.Parse(respJson);
        string certPem = obj["certificate"].ToString().Trim();
        Console.WriteLine("  HTTP 200 - Cert received: " + certPem.Length + " chars");

        Console.WriteLine("\n[3] Building PFX (RevMax: CopyWithPrivateKey + Export)");
        string certBase64 = certPem.Replace("-----BEGIN CERTIFICATE-----", "").Replace("-----END CERTIFICATE-----", "").Replace("\n", "").Replace("\r", "").Trim();
        var x509Cert = new X509Certificate2(Convert.FromBase64String(certBase64));
        Console.WriteLine("  Subject: " + x509Cert.Subject);
        Console.WriteLine("  Issuer: " + x509Cert.Issuer);

        var bcKey = ReadBcKey(privateKeyPem);
        var rsaKey = DotNetUtilities.ToRSA(bcKey);
        var certWithKey = x509Cert.CopyWithPrivateKey(rsaKey);

        File.WriteAllBytes(Path.Combine(certFolder, "certificate.pfx"), certWithKey.Export(X509ContentType.Pfx, "FiscalStackDevice"));
        File.WriteAllText(Path.Combine(certFolder, "certificate.crt"), certPem);
        File.WriteAllText(Path.Combine(certFolder, "key.key"), privateKeyPem);
        Console.WriteLine("  PFX + cert + key saved");

        Console.WriteLine("\n[4] Testing GetStatus");
        string statusResp = HttpGet(serverUrl + "/Device/v1/" + deviceId + "/GetStatus", certWithKey, "Virtual Server", "v1");
        Console.WriteLine(statusResp);

        Console.WriteLine("\n[5] Testing GetConfig");
        string configResp = HttpGet(serverUrl + "/Device/v1/" + deviceId + "/GetConfig", certWithKey, "Virtual Server", "v1");
        Console.WriteLine(configResp);

        Console.WriteLine("\n=== DONE ===");
    }

    static string HttpPost(string url, string json, string modelName, string modelVersion)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentType = "application/json; charset=utf-8";
            req.Headers.Add("DeviceModelName", modelName);
            req.Headers.Add("DeviceModelVersion", modelVersion);
            byte[] body = Encoding.UTF8.GetBytes(json);
            req.ContentLength = body.Length;
            using (var stream = req.GetRequestStream()) { stream.Write(body, 0, body.Length); }
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream()))
            {
                Console.WriteLine("  HTTP " + (int)resp.StatusCode);
                return reader.ReadToEnd();
            }
        }
        catch (WebException wex)
        {
            if (wex.Response != null)
            {
                using (var reader = new StreamReader(wex.Response.GetResponseStream()))
                {
                    string err = reader.ReadToEnd();
                    Console.WriteLine("  HTTP " + (int)((HttpWebResponse)wex.Response).StatusCode + " - " + err.Substring(0, Math.Min(500, err.Length)));
                    return null;
                }
            }
            Console.WriteLine("  ERROR: " + wex.Message);
            return null;
        }
    }

    static string HttpGet(string url, X509Certificate2 cert, string modelName, string modelVersion)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "GET";
            req.ClientCertificates.Add(cert);
            req.Headers.Add("DeviceModelName", modelName);
            req.Headers.Add("DeviceModelVersion", modelVersion);
            req.Accept = "application/json";
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream()))
            {
                string body = reader.ReadToEnd();
                return "  HTTP " + (int)resp.StatusCode + "\n  " + body.Substring(0, Math.Min(800, body.Length));
            }
        }
        catch (WebException wex)
        {
            if (wex.Response != null)
            {
                using (var reader = new StreamReader(wex.Response.GetResponseStream()))
                {
                    string body = reader.ReadToEnd();
                    return "  HTTP " + (int)((HttpWebResponse)wex.Response).StatusCode + " - " + body.Substring(0, Math.Min(800, body.Length));
                }
            }
            return "  ERROR: " + wex.Message;
        }
    }

    static RsaPrivateCrtKeyParameters ReadBcKey(string pem)
    {
        using (var sr = new StringReader(pem))
        {
            var pr = new PemReader(sr);
            var obj = pr.ReadObject();
            var pair = obj as AsymmetricCipherKeyPair;
            return (pair != null ? pair.Private : obj) as RsaPrivateCrtKeyParameters;
        }
    }
}
