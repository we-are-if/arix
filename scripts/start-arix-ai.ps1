$ErrorActionPreference = 'Stop'
$mutex = New-Object System.Threading.Mutex($false, 'Local\AriXAiBridge')
if (-not $mutex.WaitOne(0, $false)) { exit 0 }
$project = Split-Path -Parent $PSScriptRoot
$ollama = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\Ollama\ollama.exe'
$key = Join-Path $env:USERPROFILE '.ssh\arix_production'
$ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$bridge = $null
try {
    while ($true) {
        try {
            $ready = $false
            try {
                # A system proxy must never intercept the local health check.
                $null = & "$env:WINDIR\System32\curl.exe" --noproxy '*' --fail --silent --max-time 3 'http://127.0.0.1:11434/api/tags'
                $ready = $LASTEXITCODE -eq 0
            } catch {}
            if (-not $ready -and -not (Get-Process ollama -ErrorAction SilentlyContinue)) {
                Start-Process $ollama -ArgumentList 'serve' -WindowStyle Hidden
            }
            if ($ready -and ($null -eq $bridge -or $bridge.HasExited)) {
                $bridge = Start-Process $ssh -WindowStyle Hidden -PassThru -ArgumentList @(
                    '-i', ('"' + $key + '"'), '-o', 'BatchMode=yes',
                    '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
                    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
                    '-o', 'ExitOnForwardFailure=yes', '-N',
                    '-R', '127.0.0.1:11435:127.0.0.1:11434', 'root@2.31.126.121'
                ) -RedirectStandardError (Join-Path $project '.ai-bridge-ssh.log')
            }
        } catch {
            ('{0:o} {1}' -f (Get-Date), $_.Exception.Message) | Out-File (Join-Path $project '.ai-bridge-error.log') -Append
        }
        Start-Sleep -Seconds 10
    }
} finally {
    if ($null -ne $bridge -and -not $bridge.HasExited) { $bridge.Kill() }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
