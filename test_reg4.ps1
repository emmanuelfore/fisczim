$ErrorActionPreference = "Continue"

$bcDll = "C:\Users\TIMIRE\Downloads\REVMAX\AnyCPU\BouncyCastle.Crypto.dll"
Add-Type -Path $bcDll

$certFolder = "C:\FiscalStack certificates\38529"
$serverUrl = "https://fdmsapitest.zimra.co.zw"
$deviceId = "38529"

# Read the cert and key we already saved
$certPem = [System.IO.File]::ReadAllText("$certFolder\certificate.crt")
$keyPem = [System.IO.File]::ReadAllText("$certFolder\key.key")

Write-Host "=== Building PFX (RevMax approach) ==="
$certBytes = [System.Convert]::FromBase64String(
    ($certPem -replace "-----BEGIN CERTIFICATE-----","" -replace "-----END CERTIFICATE-----","" -replace "`n","" -replace "`r","").Trim()
)
$x509Cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certBytes)
Write-Host "Cert Subject: $($x509Cert.Subject)"
Write-Host "Cert Issuer: $($x509Cert.Issuer)"
Write-Host "Cert Thumbprint: $($x509Cert.Thumbprint)"

# Parse private key from PEM using BouncyCastle
$sr = New-Object System.IO.StringReader($keyPem)
$pr = New-Object Org.BouncyCastle.OpenSsl.PemReader($sr)
$keyObj = $pr.ReadObject()
$bcKey = $null
if ($keyObj -is [Org.BouncyCastle.Crypto.AsymmetricCipherKeyPair]) {
    $bcKey = $keyObj.Private
} else {
    $bcKey = $keyObj
}

# Convert to .NET RSA
$rsaParams = [Org.BouncyCastle.Security.DotNetUtilities]::ToRSAParameters($bcKey)
$rsa = [System.Security.Cryptography.RSA]::Create()
$rsa.ImportParameters($rsaParams)

# CopyWithPrivateKey (RevMax approach)
$certWithKey = $x509Cert.CopyWithPrivateKey($rsa)

# Save PFX - RevMax password
$pfxBytes = $certWithKey.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, "@x1551n01t@")
[System.IO.File]::WriteAllBytes("$certFolder\certificate.pfx", $pfxBytes)
Write-Host "PFX saved with RevMax password"

# Also save with FS password
$pfxBytes2 = $certWithKey.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, "FiscalStackDevice")
[System.IO.File]::WriteAllBytes("$certFolder\certificate_fs.pfx", $pfxBytes2)
Write-Host "PFX saved with FS password"

Write-Host "`n=== Testing GetStatus ==="
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.ClientCertificateOptions = [System.Net.Http.ClientCertificateOption]::Manual
$handler.UseDefaultCredentials = $false
$handler.ClientCertificates.Add($certWithKey)

# Add chain certs
foreach ($certFile in @("ca.crt", "server.crt", "intermediate-ca.crt")) {
    $certPath = "$certFolder\$certFile"
    if (Test-Path $certPath) {
        $pem = [System.IO.File]::ReadAllText($certPath)
        $blocks = $pem -split "-----BEGIN CERTIFICATE-----" | Where-Object { $_.Trim() -ne "" }
        foreach ($block in $blocks) {
            try {
                $b64 = ($block -replace "-----END CERTIFICATE-----","" -replace "`n","" -replace "`r","").Trim()
                if ($b64.Length -gt 10) {
                    $chainBytes = [System.Convert]::FromBase64String($b64)
                    $chainCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($chainBytes)
                    $handler.ClientCertificates.Add($chainCert)
                    Write-Host "  Chain: $($chainCert.Subject)"
                }
            } catch { }
        }
    }
}

$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)

# GetStatus
$statusUrl = "$serverUrl/Device/v1/$deviceId/GetStatus"
$req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $statusUrl)
$req.Headers.Add("DeviceModelName", "Virtual Server")
$req.Headers.Add("DeviceModelVersion", "v1")
$req.Headers.Add("Accept", "application/json")

$resp = $client.SendAsync($req).Result
$respBody = $resp.Content.ReadAsStringAsync().Result
Write-Host "GetStatus HTTP $([int]$resp.StatusCode) $($resp.StatusCode)"
Write-Host "Response: $respBody"

Write-Host "`n=== Testing GetConfig ==="
$configUrl = "$serverUrl/Device/v1/$deviceId/GetConfig"
$req2 = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $configUrl)
$req2.Headers.Add("DeviceModelName", "Virtual Server")
$req2.Headers.Add("DeviceModelVersion", "v1")
$req2.Headers.Add("Accept", "application/json")

$resp2 = $client.SendAsync($req2).Result
$respBody2 = $resp2.Content.ReadAsStringAsync().Result
Write-Host "GetConfig HTTP $([int]$resp2.StatusCode) $($resp2.StatusCode)"
Write-Host "Response: $respBody2"
