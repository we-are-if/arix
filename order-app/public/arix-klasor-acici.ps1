param([string]$ProtocolUri = "")

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "AriX"
$installedScript = Join-Path $installDirectory "arix-klasor-acici.ps1"
$allowedRoot = "\\ERSAERF\SharedFolder\ErsaShare"

function Open-AriXFolder([string]$Uri) {
  if (-not $Uri.StartsWith("arix-folder:", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Gecersiz AriX klasor baglantisi."
  }

  $encoded = $Uri.Substring("arix-folder:".Length).Replace("-", "+").Replace("_", "/")
  while (($encoded.Length % 4) -ne 0) { $encoded += "=" }
  $path = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))

  $insideAllowedRoot = $path.Equals($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $path.StartsWith("$allowedRoot\", [System.StringComparison]::OrdinalIgnoreCase)
  if (-not $insideAllowedRoot) {
    throw "Klasor izin verilen paylasim alaninin disinda."
  }

  Start-Process -FilePath "explorer.exe" -ArgumentList @($path)
}

if ($ProtocolUri) {
  Open-AriXFolder $ProtocolUri
  exit 0
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force

$protocolKey = "HKCU:\Software\Classes\arix-folder"
New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value "URL:AriX Folder Protocol"
New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$protocolKey\DefaultIcon" -Force | Out-Null
Set-Item -Path "$protocolKey\DefaultIcon" -Value "explorer.exe,0"
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
$powershell = Join-Path $PSHOME "powershell.exe"
$command = '"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" "%1"' -f $powershell, $installedScript
Set-Item -Path "$protocolKey\shell\open\command" -Value $command

Write-Host "AriX Klasor Acici basariyla kuruldu."
