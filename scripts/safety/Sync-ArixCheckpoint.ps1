[CmdletBinding()]
param(
  [string]$Checkpoint,
  [string]$HostName = "root@2.31.126.121",
  [string]$IdentityFile = "$HOME/.ssh/arix_production",
  [string]$RemoteRoot = "/srv/arix/source-checkpoints",
  [switch]$ConfirmRemote
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRemote) {
  throw "Remote checkpoint sync is locked. Run again with -ConfirmRemote after explicit approval."
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$backupRoot = Join-Path $repoRoot ".arix-backups"
$offsiteRoot = Join-Path $backupRoot "offsite"
if ([string]::IsNullOrWhiteSpace($Checkpoint)) {
  $Checkpoint = (Get-ChildItem -LiteralPath $backupRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "manifest.json") } |
    Sort-Object Name -Descending |
    Select-Object -First 1).FullName
}

$checkpointPath = (Resolve-Path -LiteralPath $Checkpoint).Path
if (-not $checkpointPath.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Checkpoint is outside .arix-backups: $checkpointPath"
}

$manifestPath = Join-Path $checkpointPath "manifest.json"
$sourceArchive = Join-Path $checkpointPath "source.tar.gz"
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $sourceArchive)) {
  throw "Checkpoint is incomplete: $checkpointPath"
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$sourceHash = (Get-FileHash -LiteralPath $sourceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne $manifest.archiveSha256) {
  throw "Checkpoint source archive failed its SHA256 check."
}
if (-not (Test-Path -LiteralPath $IdentityFile)) {
  throw "SSH identity file not found: $IdentityFile"
}

New-Item -ItemType Directory -Path $offsiteRoot -Force | Out-Null
$checkpointName = Split-Path $checkpointPath -Leaf
$archiveName = "$checkpointName.tgz"
$packagePath = Join-Path $offsiteRoot $archiveName
& tar -czf $packagePath -C $checkpointPath .
if ($LASTEXITCODE -ne 0) { throw "Checkpoint package could not be created." }
$packageHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
$remoteTemp = "/tmp/$archiveName"
$remoteFile = "$RemoteRoot/$archiveName"

& scp -i $IdentityFile $packagePath "${HostName}:$remoteTemp"
if ($LASTEXITCODE -ne 0) { throw "Checkpoint upload failed." }

$remoteCommand = "install -d -m 700 '$RemoteRoot' && install -m 600 '$remoteTemp' '$remoteFile' && printf '%s  %s\n' '$packageHash' '$archiveName' > '$remoteFile.sha256' && cd '$RemoteRoot' && sha256sum -c '$archiveName.sha256'"
& ssh -i $IdentityFile $HostName $remoteCommand
if ($LASTEXITCODE -ne 0) { throw "Remote checkpoint verification failed." }

Write-Output "REMOTE_CHECKPOINT=$remoteFile"
Write-Output "PACKAGE_SHA256=$packageHash"
