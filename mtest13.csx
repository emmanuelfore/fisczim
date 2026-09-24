// mtest13.csx - Test registration with CN-only CSR matching RevMax working code
#r "C:\Program Files\FiscalStackPOS\FiscalStack.dll"
#r "C:\Users\TIMIRE\Downloads\Fiscalstack code\packages\Newtonsoft.Json.13.0.3\lib\net45\Newtonsoft.Json.dll"

using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Newtonsoft.Json.Linq;

string serverUrl = "https://fdmsapitest.zimra.co.zw";
string deviceId = "38529";
string serial = "HOYOTEST";
string activationKey = "18452281";
string certFolder = @"C:\FiscalStack certificates\38529";

// Step 1: Generate CSR with DLL's CreateCsr (now CN-only)
Console.WriteLine("=== Step 1: Generate CSR (CN-only, matching RevMax) ===");
var csrBundle = FiscalStack.CertificateUtility.CreateCsr(serial, deviceId);
Console.WriteLine("Subject: " + csrBundle.Subject);
Console.WriteLine("CSR PEM (first 300 chars):");
Console.WriteLine(csrBundle.CsrPem.Substring(0, Math.Min(300, csrBundle.CsrPem.Length)));

// Save the private key for later use
if (!Directory.Exists(certFolder))
    Directory.CreateDirectory(certFolder);
File.WriteAllText(Path.Combine(certFolder, "key_new.pem"), csrBundle.PrivateKeyPem);
Console.WriteLine("Private key saved to: " + Path.Combine(certFolder, "key_new.pem"));

// Step 2: Register with ZIMRA
Console.WriteLine("\n=== Step 2: Register with ZIMRA (DeviceModelName=Virtual Server) ===");
string url = serverUrl + "/Public/v1/" + deviceId + "/RegisterDevice";
Console.WriteLine("URL: " + url);

var body = new JObject
{
    ["activationKey"] = activationKey,
    ["certificateRequest"] = csrBundle.CsrPem
};

using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(90) })
{
    var req = new HttpRequestMessage(HttpMethod.Post, url);
    req.Content = new StringContent(body.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json");
    req.Headers.Add("DeviceModelName", "Virtual Server");
    req.Headers.Add("DeviceModelVersion", "v1");
    req.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));

    HttpResponseMessage httpResp = await client.SendAsync(req);
    string respJson = await httpResp.Content.ReadAsStringAsync();
    Console.WriteLine("HTTP " + (int)httpResp.StatusCode + " " + httpResp.StatusCode);
    
    if (!httpResp.IsSuccessStatusCode)
    {
        Console.WriteLine("ERROR: " + respJson.Substring(0, Math.Min(500, respJson.Length)));
        return;
    }
    
    var resp = JObject.Parse(respJson);
    string certPem = resp["certificate"] != null ? resp["certificate"].ToString().Trim() : "";
    string thumbprint = resp["thumbprint"] != null ? resp["thumbprint"].ToString() : "";
    string subject = resp["subject"] != null ? resp["subject"].ToString() : "";
    
    Console.WriteLine("Thumbprint: " + thumbprint);
    Console.WriteLine("Subject: " + subject);
    Console.WriteLine("Certificate length: " + certPem.Length);
    
    if (string.IsNullOrEmpty(certPem) || !certPem.Contains("BEGIN CERTIFICATE"))
    {
        Console.WriteLine("ERROR: No certificate in response");
        Console.WriteLine("Full response: " + respJson);
        return;
    }
    
    // Save certificate
    File.WriteAllText(Path.Combine(certFolder, "certificate_new.crt"), certPem);
    Console.WriteLine("Certificate saved to: " + Path.Combine(certFolder, "certificate_new.crt"));
    
    // Step 3: Build PFX matching RevMax approach
    Console.WriteLine("\n=== Step 3: Build PFX (matching RevMax approach) ===");
    
    // Read certificate
    string certBase64 = certPem
        .Replace("-----BEGIN CERTIFICATE-----", "")
        .Replace("-----END CERTIFICATE-----", "")
        .Replace("\n", "").Replace("\r", "").Trim();
    byte[] certBytes = Convert.FromBase64String(certBase64);
    var x509Cert = new X509Certificate2(certBytes);
    Console.WriteLine("Cert Subject: " + x509Cert.Subject);
    Console.WriteLine("Cert Issuer: " + x509Cert.Issuer);
    Console.WriteLine("Cert Thumbprint: " + x509Cert.Thumbprint);
    
    // Read private key from PEM
    var bcKey = ReadPrivateKeyFromPem(csrBundle.PrivateKeyPem);
    var rsaPrivateKey = ConvertToRSA(bcKey);
    var certWithKey = x509Cert.CopyWithPrivateKey(rsaPrivateKey);
    
    // Export as PFX with RevMax password
    string pfxPath = Path.Combine(certFolder, "certificate_new.pfx");
    string pfxPassword = "@x1551n01t@";
    File.WriteAllBytes(pfxPath, certWithKey.Export(X509ContentType.Pfx, pfxPassword));
    Console.WriteLine("PFX saved to: " + pfxPath + " (password: " + pfxPassword + ")");
    
    // Also save with FiscalStack password
    string pfxPathFS = Path.Combine(certFolder, "certificate.pfx");
    string pfxPasswordFS = "FiscalStackDevice";
    File.WriteAllBytes(pfxPathFS, certWithKey.Export(X509ContentType.Pfx, pfxPasswordFS));
    Console.WriteLine("PFX saved to: " + pfxPathFS + " (password: " + pfxPasswordFS + ")");
    
    // Step 4: Test GetStatus with the new cert
    Console.WriteLine("\n=== Step 4: Test GetStatus ===");
    await TestGetStatus(client, deviceId, serverUrl, pfxPath, pfxPassword);
}

Console.WriteLine("\n=== DONE ===");

async Task TestGetStatus(HttpClient baseClient, string devId, string server, string pfxFile, string pfxPwd)
{
    try
    {
        var handler = new HttpClientHandler
        {
            ClientCertificateOptions = ClientCertificateOption.Manual,
            UseDefaultCredentials = false
        };
        
        var cert = new X509Certificate2(pfxFile, pfxPwd, X509KeyStorageFlags.Exportable);
        handler.ClientCertificates.Add(cert);
        
        // Also add chain certs from ca.crt, intermediate-ca.crt, server.crt
        string[] chainFiles = {
            Path.Combine(certFolder, "ca.crt"),
            Path.Combine(certFolder, "server.crt"),
            Path.Combine(certFolder, "intermediate-ca.crt")
        };
        foreach (string f in chainFiles)
        {
            if (File.Exists(f))
            {
                string pem = File.ReadAllText(f);
                string[] blocks = pem.Split(new[] { "-----BEGIN CERTIFICATE-----" }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string block in blocks)
                {
                    try
                    {
                        string fullPem = "-----BEGIN CERTIFICATE-----" + block;
                        string b64 = fullPem.Replace("-----BEGIN CERTIFICATE-----", "").Replace("-----END CERTIFICATE-----", "").Replace("\n", "").Replace("\r", "").Trim();
                        var chainCert = new X509Certificate2(Convert.FromBase64String(b64));
                        handler.ClientCertificates.Add(chainCert);
                    }
                    catch { }
                }
            }
        }
        
        using (var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) })
        {
            string statusUrl = server + "/Device/v1/" + devId + "/GetStatus";
            var req = new HttpRequestMessage(HttpMethod.Get, statusUrl);
            req.Headers.Add("DeviceModelName", "Virtual Server");
            req.Headers.Add("DeviceModelVersion", "v1");
            req.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
            
            var resp = await client.SendAsync(req);
            string body = await resp.Content.ReadAsStringAsync();
            Console.WriteLine("GetStatus HTTP " + (int)resp.StatusCode + " " + resp.StatusCode);
            Console.WriteLine("Response: " + body.Substring(0, Math.Min(500, body.Length)));
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("GetStatus ERROR: " + ex.Message);
    }
}

Org.BouncyCastle.Crypto.Parameters.RsaPrivateCrtKeyParameters ReadPrivateKeyFromPem(string pem)
{
    using (var sr = new StringReader(pem))
    {
        var pr = new Org.BouncyCastle.OpenSsl.PemReader(sr);
        object obj = pr.ReadObject();
        var pair = obj as Org.BouncyCastle.Crypto.AsymmetricCipherKeyPair;
        if (pair != null) return pair.Private as Org.BouncyCastle.Crypto.Parameters.RsaPrivateCrtKeyParameters;
        return obj as Org.BouncyCastle.Crypto.Parameters.RsaPrivateCrtKeyParameters;
    }
}

RSA ConvertToRSA(Org.BouncyCastle.Crypto.Parameters.RsaPrivateCrtKeyParameters bcKey)
{
    var rsaParams = new RSAParameters
    {
        Modulus = bcKey.Modulus.ToByteArrayUnsigned(),
        Exponent = bcKey.PublicExponent.ToByteArrayUnsigned(),
        D = bcKey.Exponent.ToByteArrayUnsigned(),
        P = bcKey.P.ToByteArrayUnsigned(),
        Q = bcKey.Q.ToByteArrayUnsigned(),
        DP = bcKey.DP.ToByteArrayUnsigned(),
        DQ = bcKey.DQ.ToByteArrayUnsigned(),
        InverseQ = bcKey.InverseQ.ToByteArrayUnsigned()
    };
    var rsa = RSA.Create();
    rsa.ImportParameters(rsaParams);
    return rsa;
}
