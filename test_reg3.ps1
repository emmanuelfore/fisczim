$ErrorActionPreference = "Continue"

$bcDll = "C:\Users\TIMIRE\Downloads\REVMAX\AnyCPU\BouncyCastle.Crypto.dll"
$fsDll = "C:\Program Files\FiscalStackPOS\FiscalStack.dll"
Add-Type -Path $bcDll
Add-Type -Path $fsDll

Write-Host "=== Generating CN-only CSR ==="
$csr = [FiscalStack.CertificateUtility]::CreateCsr("HOYOTEST", "38529")
Write-Host "Subject: $($csr.Subject)"

Write-Host "`n=== Registering with ZIMRA ==="
$serverUrl = "https://fdmsapitest.zimra.co.zw"
$deviceId = "38529"
$url = "$serverUrl/Public/v1/$deviceId/RegisterDevice"

$bodyObj = @{
    activationKey = "00519427"
    certificateRequest = $csr.CsrPem
}
$bodyJson = $bodyObj | ConvertTo-Json
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $bodyBytes -ContentType "application/json; charset=utf-8" -Headers @{
        "DeviceModelName" = "Virtual Server"
        "DeviceModelVersion" = "v1"
    }
    Write-Host "SUCCESS"
    Write-Host "Code: $($response.Code)"
    Write-Host "Message: $($response.Message)"
    Write-Host "Thumbprint: $($response.thumbprint)"
    Write-Host "Subject: $($response.subject)"
    Write-Host "Cert length: $($response.certificate.Length)"

    $certPem = $response.certificate
    $certFolder = "C:\FiscalStack certificates\38529"

    Write-Host "`n=== Building PFX (RevMax approach) ==="
    $certBytes = [System.Convert]::FromBase64String(
        ($certPem -replace "-----BEGIN CERTIFICATE-----","" -replace "-----END CERTIFICATE-----","" -replace "`n","" -replace "`r","")
    )
    $x509Cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certBytes)
    Write-Host "Cert Subject: $($x509Cert.Subject)"
    Write-Host "Cert Issuer: $($x509Cert.Issuer)"
    Write-Host "Cert Thumbprint: $($x509Cert.Thumbprint)"

    $sr = New-Object System.IO.StringReader($csr.PrivateKeyPem)
    $pr = New-Object Org.BouncyCastle.OpenSsl.PemReader($sr)
    $keyObj = $pr.ReadObject()
    $bcKey = $null
    if ($keyObj -is [Org.BouncyCastle.Crypto.AsymmetricCipherKeyPair]) {
        $bcKey = $keyObj.Private
    } else {
        $bcKey = $keyObj
    }

    $rsaParams = [Org.BouncyCastle.Security.DotNetUtilities]::ToRSAParameters($bcKey)
    $rsa = [System.Security.Cryptography.RSA]::Create()
    $rsa.ImportParameters($rsaParams)

    $certWithKey = $x509Cert.CopyWithPrivateKey($rsa)

    # Save PFX with RevMax password (matches RevMax working code exactly)
    $pfxBytes = $certWithKey.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, "@x1551n01t@")
    [System.IO.File]::WriteAllBytes("$certFolder\certificate.pfx", $pfxBytes)
    Write-Host "PFX saved: certificate.pfx"

    [System.IO.File]::WriteAllText("$certFolder\certificate.crt", $certPem)
    [System.IO.File]::WriteAllText("$certFolder\key.key", $csr.PrivateKeyPem)
    Write-Host "Cert + key saved"

    Write-Host "`n=== Testing GetStatus ==="
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.ClientCertificateOptions = [System.Net.Http.ClientCertificateOption]::Manual
    $handler.UseDefaultCredentials = $false
    $handler.ClientCertificates.Add($certWithKey)

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

    $statusUrl = "$serverUrl/Device/v1/$deviceId/GetStatus"
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $statusUrl)
    $req.Headers.Add("DeviceModelName", "Virtual Server")
    $req.Headers.Add("DeviceModelVersion", "v1")
    $req.Headers.Add("Accept", "application/json")

    $resp = $client.SendAsync($req).Result
    $respBody = $resp.Content.ReadAsStringAsync().Result
    Write-Host "GetStatus HTTP $([int]$resp.StatusCode) $($resp.StatusCode)"
    Write-Host "Response: $($respBody.Substring(0, [Math]::Min(800, $respBody.Length)))"

    Write-Host "`n=== Testing GetConfig ==="
    $configUrl = "$serverUrl/Device/v1/$deviceId/GetConfig"
    $req2 = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $configUrl)
    $req2.Headers.Add("DeviceModelName", "Virtual Server")
    $req2.Headers.Add("DeviceModelVersion", "v1")
    $req2.Headers.Add("Accept", "application/json")

    $resp2 = $client.SendAsync($req2).Result
    $respBody2 = $resp2.Content.ReadAsStringAsync().Result
    Write-Host "GetConfig HTTP $([int]$resp2.StatusCode) $($resp2.StatusCode)"
    Write-Host "Response: $($respBody2.Substring(0, [Math]::Min(800, $respBody2.Length)))"

} catch {
    $errResp = $_.Exception.Response
    if ($errResp) {
        $stream = $errResp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
        Write-Host "HTTP $([int]$errResp.StatusCode) - $errBody"
    } else {
        Write-Host "Error: $($_.Exception.Message)"
    }
}
