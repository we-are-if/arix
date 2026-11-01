[CmdletBinding()]
param(
  [ValidateSet("All", "Daily", "Order", "Panel", "Server")]
  [string]$Scope = "All",
  [string]$Label = "manual",
  [ValidateRange(1, 200)]
  [int]$Keep = 30
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$backupRoot = Join-Path $repoRoot ".arix-backups"
$safeLabel = ($Label -replace "[^a-zA-Z0-9._-]", "-").Trim("-")
if ([string]::IsNullOrWhiteSpace($safeLabel)) { $safeLabel = "manual" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$checkpointName = "$stamp-$($Scope.ToLowerInvariant())-$safeLabel"
$checkpointPath = Join-Path $backupRoot $checkpointName

New-Item -ItemType Directory -Path $checkpointPath -Force | Out-Null

Push-Location $repoRoot
try {
  $head = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Git HEAD okunamadi." }
  $branch = (& git branch --show-current).Trim()
  $status = @(& git status --short)
  $trackedDiff = @(& git diff --binary)
  $stagedDiff = @(& git diff --cached --binary)
  $untracked = @(& git -c core.quotePath=false ls-files --others --exclude-standard)

  Set-Content -LiteralPath (Join-Path $checkpointPath "git-status.txt") -Value $status -Encoding utf8
  Set-Content -LiteralPath (Join-Path $checkpointPath "working-tree.patch") -Value $trackedDiff -Encoding utf8
  Set-Content -LiteralPath (Join-Path $checkpointPath "staged.patch") -Value $stagedDiff -Encoding utf8
  Set-Content -LiteralPath (Join-Path $checkpointPath "untracked-files.txt") -Value $untracked -Encoding utf8

  $candidates = @(& git -c core.quotePath=false ls-files --cached --others --exclude-standard)
  $files = $candidates | Where-Object {
    $path = $_.Replace("\", "/")
    $path -and
      $path -notmatch "(^|/)node_modules/" -and
      $path -notmatch "(^|/)dist/" -and
      $path -notmatch "(^|/)dist-[^/]+/" -and
      $path -notmatch "^\.git/" -and
      $path -notmatch "^\.arix-backups/" -and
      $path -notmatch "^\.arix-restores/" -and
      $path -notmatch "^tmp/" -and
      $path -notmatch "^output/" -and
      $path -notmatch "(^|/)\.env($|\.)" -and
      $path -notmatch "-dist\.tgz$" -and
      $path -notmatch "\.(zip|7z|tar|tgz|gz)$" -and
      $path -notmatch "^server/data/(backups|order-uploads|stock-imports)/"
  } | Sort-Object -Unique

  if (-not $files -or $files.Count -eq 0) { throw "Arsivlenecek kaynak dosyasi bulunamadi." }

  $fileList = Join-Path $checkpointPath "source-files.txt"
  Set-Content -LiteralPath $fileList -Value $files -Encoding utf8
  $archive = Join-Path $checkpointPath "source.tar.gz"
  & tar -czf $archive -T $fileList
  if ($LASTEXITCODE -ne 0) { throw "Kaynak arsivi olusturulamadi." }

  $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToString("o")
    scope = $Scope
    label = $Label
    repository = $repoRoot
    branch = $branch
    head = $head
    dirty = $status.Count -gt 0
    sourceFileCount = $files.Count
    archive = "source.tar.gz"
    archiveSha256 = $archiveHash
    designApproved = $false
    note = "Recovery checkpoint only. Visual designs require explicit user approval."
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $checkpointPath "manifest.json") -Encoding utf8

  $checkpoints = Get-ChildItem -LiteralPath $backupRoot -Directory |
    Where-Object { $_.Name -match "^\d{8}-\d{6}-" } |
    Sort-Object Name -Descending
  foreach ($oldCheckpoint in ($checkpoints | Select-Object -Skip $Keep)) {
    $resolvedOld = $oldCheckpoint.FullName
    if (-not $resolvedOld.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Guvenli olmayan eski kontrol noktasi yolu: $resolvedOld"
    }
    Remove-Item -LiteralPath $resolvedOld -Recurse -Force
  }

  Write-Output "CHECKPOINT_PATH=$checkpointPath"
  Write-Output "ARCHIVE_SHA256=$archiveHash"
}
catch {
  if ($checkpointPath.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $checkpointPath)) {
    Remove-Item -LiteralPath $checkpointPath -Recurse -Force
  }
  throw
}
finally {
  Pop-Location
}
