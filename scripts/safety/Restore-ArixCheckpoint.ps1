[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Checkpoint,
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$backupRoot = Join-Path $repoRoot ".arix-backups"
$restoreRoot = Join-Path $repoRoot ".arix-restores"
$checkpointPath = (Resolve-Path -LiteralPath $Checkpoint).Path

if (-not $checkpointPath.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Kontrol noktasi .arix-backups disinda: $checkpointPath"
}

$manifestPath = Join-Path $checkpointPath "manifest.json"
$archivePath = Join-Path $checkpointPath "source.tar.gz"
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $archivePath)) {
  throw "Kontrol noktasi eksik veya tamamlanmamis."
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $manifest.archiveSha256) {
  throw "Arsiv butunluk denetimi basarisiz. Beklenen: $($manifest.archiveSha256), bulunan: $actualHash"
}

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $Destination = Join-Path $restoreRoot "$((Split-Path $checkpointPath -Leaf))-$stamp"
}
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
if (-not $destinationPath.StartsWith($restoreRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Geri yukleme hedefi .arix-restores disinda olamaz: $destinationPath"
}
if (Test-Path -LiteralPath $destinationPath) {
  throw "Geri yukleme hedefi zaten var: $destinationPath"
}

New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
& tar -xzf $archivePath -C $destinationPath
if ($LASTEXITCODE -ne 0) { throw "Kontrol noktasi ayri klasore acilamadi." }

Write-Output "RESTORE_PATH=$destinationPath"
Write-Output "SOURCE_HEAD=$($manifest.head)"
Write-Output "DESIGN_APPROVED=$($manifest.designApproved)"
