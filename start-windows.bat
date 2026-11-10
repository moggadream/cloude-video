@echo off
chcp 65001 >nul
title cloude-video
cd /d "%~dp0"

echo [1/3] 최신 버전 확인 중...
git pull --ff-only 2>nul || echo     (업데이트 확인을 건너뜁니다)

echo [2/3] 부품 확인 중...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo [오류] npm install 실패. 위 메시지를 알려주세요.
  pause
  exit /b 1
)

echo [3/3] 앱을 켭니다. 이 창을 닫으면 앱도 꺼져요.
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"
call npm start
pause
