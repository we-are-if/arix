@echo off
setlocal
set "INSTALLER=%TEMP%\arix-arsiv-senkron.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://order.arix.az/arix-arsiv-senkron.ps1' -OutFile '%INSTALLER%'"
echo Kurulum anahtari yonetici tarafindan girilmelidir.
set /p "TOKEN=Senkronizasyon anahtari: "
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%" -Install -InstallToken "%TOKEN%"
pause
