[CmdletBinding()]
param(
  [string]$HostName = "root@2.31.126.121",
  [string]$IdentityFile = "$HOME/.ssh/arix_production",
  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmProduction) {
  throw "Production publish is locked. Run again with -ConfirmProduction after explicit approval."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$releaseRoot = Join-Path $repoRoot ".arix-backups\releases"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "daily-app-$stamp.tgz"
$archivePath = Join-Path $releaseRoot $archiveName
$remoteArchive = "/tmp/$archiveName"
$remoteDeployScript = "/tmp/daily-release-$stamp.sh"

if (-not (Test-Path -LiteralPath $IdentityFile)) {
  throw "SSH identity file not found: $IdentityFile"
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

Push-Location $repoRoot
try {
  & (Join-Path $PSScriptRoot "New-ArixCheckpoint.ps1") -Scope Daily -Label "pre-production-$stamp"
  & (Join-Path $PSScriptRoot "Invoke-ArixVerification.ps1") -Scope Daily -SkipScopeCheck

  & tar -czf $archivePath -C "daily-app/dist" .
  if ($LASTEXITCODE -ne 0) { throw "Daily release archive could not be created." }
  $sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()

  & scp -i $IdentityFile $archivePath "${HostName}:$remoteArchive"
  if ($LASTEXITCODE -ne 0) { throw "Release upload failed." }
  & scp -i $IdentityFile "deploy/daily-release.sh" "${HostName}:$remoteDeployScript"
  if ($LASTEXITCODE -ne 0) { throw "Deploy script upload failed." }

  $remoteCommand = "bash '$remoteDeployScript' '$remoteArchive' '$sha256'"
  $deployOutput = @(& ssh -i $IdentityFile $HostName $remoteCommand)
  if ($LASTEXITCODE -ne 0) { throw "Remote deployment failed." }

  $manifest = [ordered]@{
    schemaVersion = 1
    deployedAt = (Get-Date).ToString("o")
    host = $HostName
    archive = $archiveName
    sha256 = $sha256
    output = $deployOutput
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $releaseRoot "daily-app-$stamp.json") -Encoding utf8
  $deployOutput
}
finally {
  Pop-Location
}
