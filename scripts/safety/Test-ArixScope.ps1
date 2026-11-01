[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("All", "Daily", "Order", "Panel", "Server")]
  [string]$Scope,
  [ValidateSet("Staged", "Working")]
  [string]$Mode = "Staged"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path

$scopePrefixes = @{
  Daily = @("daily-app/")
  Order = @("order-app/")
  Panel = @("src/", "public/", "index.html", "vite.config.ts", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json")
  Server = @("server/")
  All = @()
}
$sharedPrefixes = @(
  ".gitignore",
  ".gitattributes",
  "scripts/safety/",
  "docs/safety/",
  "deploy/daily-"
)

Push-Location $repoRoot
try {
  if ($Mode -eq "Staged") {
    $changed = @(& git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR)
  }
  else {
    $changed = @(
      & git -c core.quotePath=false diff --name-only --diff-filter=ACMR
      & git -c core.quotePath=false ls-files --others --exclude-standard
    ) | Sort-Object -Unique
  }

  $changed = @($changed | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($changed.Count -eq 0) {
    Write-Output "SCOPE_CHECK=EMPTY"
    return
  }
  if ($Scope -eq "All") {
    Write-Output "SCOPE_CHECK=OK"
    Write-Output "FILES=$($changed.Count)"
    return
  }

  $allowedPrefixes = @($scopePrefixes[$Scope]) + $sharedPrefixes
  $outside = foreach ($file in $changed) {
    $normalized = $file.Replace("\", "/")
    $allowed = $false
    foreach ($prefix in $allowedPrefixes) {
      if ($normalized -eq $prefix -or $normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $allowed = $true
        break
      }
    }
    if (-not $allowed) { $normalized }
  }

  if ($outside) {
    throw "Scope disinda dosyalar bulundu ($Scope / $Mode):`n$($outside -join "`n")"
  }

  Write-Output "SCOPE_CHECK=OK"
  Write-Output "FILES=$($changed.Count)"
}
finally {
  Pop-Location
}
