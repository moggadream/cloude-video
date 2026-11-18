@echo off
rem Start the app - the real script is scripts\win\start.ps1 (PowerShell handles Korean text safely)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win\start.ps1"
echo.
pause
