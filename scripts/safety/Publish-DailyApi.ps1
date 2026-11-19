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
$archiveName = "daily-api-$stamp.tgz"
$archivePath = Join-Path $releaseRoot $archiveName
$remoteArchive = "/tmp/$archiveName"
$remoteDeployScript = "/tmp/daily-api-release-$stamp.sh"

if (-not (Test-Path -LiteralPath $IdentityFile)) {
  throw "SSH identity file not found: $IdentityFile"
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

Push-Location $repoRoot
try {
  & (Join-Path $PSScriptRoot "New-ArixCheckpoint.ps1") -Scope Server -Label "pre-daily-api-production-$stamp"
  & (Join-Path $PSScriptRoot "Invoke-ArixVerification.ps1") -Scope Server -SkipScopeCheck

  & tar -czf $archivePath -C "server" "index.js" "dailyApprovals.js" "dailyAudit.js" "dailySparexpertSeed.js" "dailyInvoices.js"
  if ($LASTEXITCODE -ne 0) { throw "Daily API release archive could not be created." }
  $sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()

  python -c "
import subprocess, sys
for src, dst in [(sys.argv[1], sys.argv[2]), (sys.argv[3], sys.argv[4])]:
    with open(src, 'rb') as f:
        data = f.read()
    subprocess.run(['ssh', '-i', sys.argv[5], '-o', 'BatchMode=yes', sys.argv[6], f'cat > {dst}'], input=data, check=True)
" "$archivePath" "$remoteArchive" "deploy/daily-api-release.sh" "$remoteDeployScript" "$IdentityFile" "$HostName"
  if ($LASTEXITCODE -ne 0) { throw "Daily API release upload failed." }

  $remoteCommand = "bash '$remoteDeployScript' '$remoteArchive' '$sha256'"
  $deployOutput = @(& ssh -o ConnectTimeout=15 -o ServerAliveInterval=5 -i $IdentityFile $HostName $remoteCommand)
  if ($LASTEXITCODE -ne 0) { throw "Daily API remote deployment failed." }

  $manifest = [ordered]@{
    schemaVersion = 1
    deployedAt = (Get-Date).ToString("o")
    host = $HostName
    archive = $archiveName
    sha256 = $sha256
    output = $deployOutput
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $releaseRoot "daily-api-$stamp.json") -Encoding utf8
  $deployOutput
}
finally {
  Pop-Location
}
