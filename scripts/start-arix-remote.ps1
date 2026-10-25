$ErrorActionPreference = "Stop"

$WatchdogMutex = New-Object System.Threading.Mutex($false, "Global\AriXRemoteWatchdog")
if (-not $WatchdogMutex.WaitOne(0, $false)) {
    exit 0
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodePath = "C:\Program Files\nodejs\node.exe"
$NpmPath = "C:\Program Files\nodejs\npm.cmd"
$CloudflaredPath = Join-Path $env:LOCALAPPDATA "AriX\bin\cloudflared.exe"
$TunnelTokenFile = Join-Path $env:LOCALAPPDATA "AriX\cloudflared\tunnel-token"

function Test-PortListening {
    param([int]$Port)

    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-ApiIfNeeded {
    if (-not (Test-PortListening -Port 8787)) {
        Start-Process `
            -FilePath $NodePath `
            -ArgumentList "server/index.js" `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ProjectRoot ".remote-api.log") `
            -RedirectStandardError (Join-Path $ProjectRoot ".remote-api-error.log")
    }
}

function Start-PanelIfNeeded {
    if (-not (Test-PortListening -Port 5173)) {
        Start-Process `
            -FilePath $NpmPath `
            -ArgumentList "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173" `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ProjectRoot ".remote-vite.log") `
            -RedirectStandardError (Join-Path $ProjectRoot ".remote-vite-error.log")
    }
}

function Start-OrdersIfNeeded {
    if (-not (Test-PortListening -Port 5174)) {
        Start-Process `
            -FilePath $NpmPath `
            -ArgumentList "run", "dev:orders", "--", "--host", "0.0.0.0", "--port", "5174" `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ProjectRoot ".remote-orders.log") `
            -RedirectStandardError (Join-Path $ProjectRoot ".remote-orders-error.log")
    }
}

function Start-MarketingIfNeeded {
    if (-not (Test-PortListening -Port 5175)) {
        Start-Process `
            -FilePath $NpmPath `
            -ArgumentList "run", "dev:marketing", "--", "--host", "0.0.0.0", "--port", "5175" `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ProjectRoot ".remote-marketing.log") `
            -RedirectStandardError (Join-Path $ProjectRoot ".remote-marketing-error.log")
    }
}

function Start-TunnelIfNeeded {
    if ((Test-Path $CloudflaredPath) -and (Test-Path $TunnelTokenFile) -and
        -not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
        $TunnelLogDir = Split-Path -Parent $TunnelTokenFile
        Start-Process `
            -FilePath $CloudflaredPath `
            -ArgumentList "tunnel", "run", "--token-file", $TunnelTokenFile `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $TunnelLogDir "tunnel.log") `
            -RedirectStandardError (Join-Path $TunnelLogDir "tunnel-error.log")
    }
}

try {
    while ($true) {
        try { Start-ApiIfNeeded } catch { $_ | Out-File (Join-Path $ProjectRoot ".watchdog-error.log") -Append }
        try { Start-PanelIfNeeded } catch { $_ | Out-File (Join-Path $ProjectRoot ".watchdog-error.log") -Append }
        try { Start-OrdersIfNeeded } catch { $_ | Out-File (Join-Path $ProjectRoot ".watchdog-error.log") -Append }
        try { Start-MarketingIfNeeded } catch { $_ | Out-File (Join-Path $ProjectRoot ".watchdog-error.log") -Append }
        try { Start-TunnelIfNeeded } catch { $_ | Out-File (Join-Path $ProjectRoot ".watchdog-error.log") -Append }
        Start-Sleep -Seconds 15
    }
}
finally {
    $WatchdogMutex.ReleaseMutex()
    $WatchdogMutex.Dispose()
}
