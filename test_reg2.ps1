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
    activationKey = "18452281"
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
