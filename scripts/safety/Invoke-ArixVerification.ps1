[CmdletBinding()]
param(
  [ValidateSet("All", "Daily", "Order", "Panel", "Server")]
  [string]$Scope = "All",
  [ValidateSet("Staged", "Working")]
  [string]$CheckMode = "Staged",
  [switch]$SkipScopeCheck
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$reportRoot = Join-Path $repoRoot ".arix-backups\reports"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $reportRoot "$stamp-$($Scope.ToLowerInvariant())-verification.json"
$npm = if ($IsWindows -or $env:OS -eq "Windows_NT") { "npm.cmd" } else { "npm" }
$steps = [System.Collections.Generic.List[object]]::new()
$startedAt = Get-Date
$success = $false

New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null

function Invoke-VerificationStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $stepStarted = Get-Date
  Write-Host "==> $Name"
  & $npm @Arguments
  $exitCode = $LASTEXITCODE
  $steps.Add([ordered]@{
    name = $Name
    command = "$npm $($Arguments -join ' ')"
    startedAt = $stepStarted.ToString("o")
    durationSeconds = [math]::Round(((Get-Date) - $stepStarted).TotalSeconds, 2)
    exitCode = $exitCode
  })
  if ($exitCode -ne 0) { throw "$Name basarisiz oldu (exit $exitCode)." }
}

Push-Location $repoRoot
try {
  if (-not $SkipScopeCheck) {
    & (Join-Path $PSScriptRoot "Test-ArixScope.ps1") -Scope $Scope -Mode $CheckMode
  }

  if ($Scope -in @("Daily", "All")) { Invoke-VerificationStep "Daily production build" @("run", "build:daily") }
  if ($Scope -in @("Order", "All")) { Invoke-VerificationStep "Order production build" @("run", "build:orders") }
  if ($Scope -in @("Panel", "All")) { Invoke-VerificationStep "Panel production build" @("run", "build") }
  if ($Scope -in @("Server", "All")) { Invoke-VerificationStep "Server tests" @("run", "test:server") }
  $success = $true
}
finally {
  $report = [ordered]@{
    schemaVersion = 1
    scope = $Scope
    checkMode = $CheckMode
    startedAt = $startedAt.ToString("o")
    finishedAt = (Get-Date).ToString("o")
    success = $success
    steps = $steps
  }
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Pop-Location
  Write-Output "VERIFICATION_REPORT=$reportPath"
}
