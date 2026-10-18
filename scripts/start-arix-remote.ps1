$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodePath = "C:\Program Files\nodejs\node.exe"
$NpmPath = "C:\Program Files\nodejs\npm.cmd"

function Test-PortListening {
    param([int]$Port)

    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

if (-not (Test-PortListening -Port 8787)) {
    Start-Process `
        -FilePath $NodePath `
        -ArgumentList "server/index.js" `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $ProjectRoot ".remote-api.log") `
        -RedirectStandardError (Join-Path $ProjectRoot ".remote-api-error.log")
}

if (-not (Test-PortListening -Port 5173)) {
    Start-Process `
        -FilePath $NpmPath `
        -ArgumentList "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173" `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $ProjectRoot ".remote-vite.log") `
        -RedirectStandardError (Join-Path $ProjectRoot ".remote-vite-error.log")
}
