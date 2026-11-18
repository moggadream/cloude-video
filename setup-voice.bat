@echo off
rem Install narration voice - the real script is scripts\win\setup-voice.ps1 (PowerShell handles Korean text safely)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win\setup-voice.ps1"
echo.
pause
