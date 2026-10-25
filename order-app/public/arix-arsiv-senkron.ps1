param(
  [string]$InstallToken = "",
  [string]$ShareRoot = "\\ERSARIF\SharedFolder\ErsaShare",
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "AriX\ArchiveSync"
$installedScript = Join-Path $installDirectory "arix-arsiv-senkron.ps1"
$watcherPath = Join-Path $installDirectory "arix-arsiv-senkron-watch.ps1"
$startupDirectory = [Environment]::GetFolderPath("Startup")
$startupLauncher = Join-Path $startupDirectory "AriX Archive Sync.vbs"
$configPath = Join-Path $installDirectory "config.json"
$statusPath = Join-Path $installDirectory "status.json"
$logPath = Join-Path $installDirectory "sync.log"

function Write-SyncLog([string]$Message) {
  New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  if ((Get-Item -LiteralPath $logPath -ErrorAction SilentlyContinue).Length -gt 2MB) {
    Get-Content -LiteralPath $logPath -Tail 500 | Set-Content -LiteralPath "$logPath.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$logPath.tmp" -Destination $logPath -Force
  }
}

function Save-Status([string]$State, [string]$Message, [int]$Transferred = 0) {
  [ordered]@{
    state = $State
    message = $Message
    transferred = $Transferred
    computer = $env:COMPUTERNAME
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
}

if ($Install) {
  if ([string]::IsNullOrWhiteSpace($InstallToken) -or $InstallToken.Length -lt 32) {
    throw "Kurulum için en az 32 karakterli senkronizasyon anahtarı gerekiyor."
  }
  New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
  Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force
  @"
`$created = `$false
`$mutex = New-Object Threading.Mutex(`$true, "Local\AriXArchiveSyncWatcher", [ref]`$created)
if (-not `$created) { exit 0 }
try {
  while (`$true) {
    & "$installedScript"
    Start-Sleep -Seconds 60
  }
} finally {
  `$mutex.ReleaseMutex()
  `$mutex.Dispose()
}
"@ | Set-Content -LiteralPath $watcherPath -Encoding UTF8
  @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$watcherPath""", 0, False
"@ | Set-Content -LiteralPath $startupLauncher -Encoding ASCII
  [ordered]@{
    apiBase = "https://order.arix.az"
    token = $InstallToken
    shareRoot = $ShareRoot.TrimEnd("\")
  } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
  & schtasks.exe /Delete /TN "AriX Archive Sync" /F 2>$null | Out-Null
  & wscript.exe $startupLauncher
  Write-Host "AriX arşiv senkronizasyonu kuruldu."
  exit 0
}

if (-not (Test-Path -LiteralPath $configPath)) { exit 0 }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$headers = @{ "x-arix-sync-token" = [string]$config.token }
$transferred = 0

try {
  if (-not (Test-Path -LiteralPath ([string]$config.shareRoot))) {
    throw "Paylaşımlı klasöre erişilemiyor: $($config.shareRoot)"
  }
  $pending = Invoke-RestMethod -Uri "$($config.apiBase)/api/archive-sync/pending" -Headers $headers -Method Get -TimeoutSec 30
  foreach ($item in @($pending.data)) {
    $relativePath = [string]$item.relativePath
    if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath -match '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted($relativePath)) {
      Write-SyncLog "Geçersiz göreli yol reddedildi: $relativePath"
      continue
    }
    $section = if ([string]$item.archiveKind -eq "export") { "IHRACAT" } else { "YURT İÇİ" }
    $sectionRoot = Join-Path ([string]$config.shareRoot) $section
    $target = Join-Path $sectionRoot ($relativePath -replace '/', '\')
    $resolvedRoot = [IO.Path]::GetFullPath($sectionRoot).TrimEnd('\') + '\'
    $resolvedTarget = [IO.Path]::GetFullPath($target)
    if (-not $resolvedTarget.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Write-SyncLog "Paylaşım dışındaki hedef reddedildi: $target"
      continue
    }
    $directory = Split-Path -Parent $resolvedTarget
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    if ($item.needsUpload) {
      $legacyPath = [string]$item.windowsPath
      if (-not (Test-Path -LiteralPath $legacyPath)) {
        $legacyPath = $resolvedTarget
      }
      if (-not (Test-Path -LiteralPath $legacyPath)) {
        Write-SyncLog "Eski PDF yerel arşivde bulunamadı: $legacyPath"
        continue
      }
      $pdfBytes = [IO.File]::ReadAllBytes($legacyPath)
      $uploadBody = @{
        archivedAt = $item.archivedAt
        computer = $env:COMPUTERNAME
        pdfBase64 = [Convert]::ToBase64String($pdfBytes)
      } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$($config.apiBase)/api/archive-sync/upload/$($item.orderId)" -Headers $headers -Method Post -ContentType "application/json" -Body $uploadBody -TimeoutSec 180 | Out-Null
      $transferred++
      Write-SyncLog "Eski PDF sunucu arşivine alındı: $legacyPath"
      continue
    }
    $temporary = "$resolvedTarget.$([guid]::NewGuid().ToString('N')).tmp"
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$($config.apiBase)/api/archive-sync/file/$($item.orderId)" -Headers $headers -OutFile $temporary -TimeoutSec 120
      if ((Get-Item -LiteralPath $temporary).Length -lt 100) { throw "İndirilen PDF geçersiz görünüyor." }
      Move-Item -LiteralPath $temporary -Destination $resolvedTarget -Force
      $body = @{ archivedAt = $item.archivedAt; computer = $env:COMPUTERNAME; path = $resolvedTarget } | ConvertTo-Json
      Invoke-RestMethod -Uri "$($config.apiBase)/api/archive-sync/acknowledge/$($item.orderId)" -Headers $headers -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30 | Out-Null
      $transferred++
      Write-SyncLog "Aktarıldı: $resolvedTarget"
    } finally {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
  Save-Status "ok" "Senkronizasyon tamamlandı." $transferred
} catch {
  Write-SyncLog "Hata: $($_.Exception.Message)"
  Save-Status "error" $_.Exception.Message $transferred
  exit 1
}
