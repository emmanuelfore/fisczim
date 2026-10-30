# Runs the LEKUKA UAT suite on Windows against the configured gateway.
# Prerequisites: Node.js 20+, `npm install` in the repo root, and a .env with DATABASE_URL.
[CmdletBinding()]
param(
  [int]$CompanyId = 126,
  [switch]$DryRun,
  [switch]$NoRenewal,
  [string]$Cases,
  [string]$RunId
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 20+ is required. Install it from https://nodejs.org and reopen the terminal.'
}
$nodeVersion = (& node --version).TrimStart('v')
if ([version]$nodeVersion -lt [version]'20.0.0') {
  throw "Node.js 20+ is required (found $nodeVersion)."
}
if (-not (Test-Path '.env')) {
  throw 'Missing .env in the repo root. It must define DATABASE_URL (and the gateway settings used by the server).'
}
if (-not (Test-Path 'node_modules')) {
  throw 'Dependencies are not installed. Run: npm install'
}

$npxArgs = @('tsx', 'scripts/lekuka-uat.ts', "--company=$CompanyId")
if ($DryRun) { $npxArgs += '--dry-run' }
if ($NoRenewal) { $npxArgs += '--no-renewal' }
if ($Cases) { $npxArgs += "--cases=$Cases" }
if ($RunId) { $npxArgs += "--run-id=$RunId" }

Write-Host "LEKUKA UAT on Windows — company $CompanyId" -ForegroundColor Cyan
& npx @npxArgs
$exitCode = $LASTEXITCODE

$report = Get-ChildItem 'uat-results\lekuka-uat-*.json' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($report) {
  Write-Host "Report: $($report.FullName)" -ForegroundColor Green
}

exit $exitCode
