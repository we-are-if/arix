[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadPath,
  [string]$HostName = "root@2.31.126.121",
  [string]$IdentityFile = "$HOME/.ssh/arix_production",
  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmProduction) {
  throw "Production Sheet sync is locked. Run again with -ConfirmProduction after explicit approval."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$payload = (Resolve-Path -LiteralPath $PayloadPath).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$remotePayload = "/tmp/daily-sheet-sync-$stamp.json"
$remoteHelper = "/tmp/apply-daily-sheet-sync-$stamp.mjs"
$remoteScript = "/tmp/daily-sheet-sync-$stamp.sh"

if (-not (Test-Path -LiteralPath $IdentityFile)) {
  throw "SSH identity file not found: $IdentityFile"
}

Push-Location $repoRoot
try {
  & scp -i $IdentityFile $payload "${HostName}:$remotePayload"
  if ($LASTEXITCODE -ne 0) { throw "Sheet sync payload upload failed." }
  & scp -i $IdentityFile "scripts/safety/apply-daily-sheet-sync.mjs" "${HostName}:$remoteHelper"
  if ($LASTEXITCODE -ne 0) { throw "Sheet sync helper upload failed." }
  & scp -i $IdentityFile "deploy/daily-sheet-sync.sh" "${HostName}:$remoteScript"
  if ($LASTEXITCODE -ne 0) { throw "Sheet sync runner upload failed." }

  $output = @(& ssh -i $IdentityFile $HostName "chmod 700 '$remoteScript' && bash '$remoteScript' '$remotePayload' '$remoteHelper'; status=`$?; rm -f -- '$remotePayload' '$remoteHelper' '$remoteScript'; exit `$status")
  if ($LASTEXITCODE -ne 0) { throw "Production Daily Sheet sync failed.`n$($output -join "`n")" }
  $output | ForEach-Object { Write-Host $_ }
} finally {
  Pop-Location
}
