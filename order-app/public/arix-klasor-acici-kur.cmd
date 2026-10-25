@echo off
setlocal
set "INSTALLER=%TEMP%\arix-klasor-acici-kur.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://order.arix.az/arix-klasor-acici.ps1' -OutFile '%INSTALLER%'; & '%INSTALLER%'"
if errorlevel 1 (
  echo AriX Klasor Acici kurulamadi.
  pause
  exit /b 1
)
echo AriX Klasor Acici kuruldu. Bu pencereyi kapatabilirsiniz.
timeout /t 3 /nobreak >nul

