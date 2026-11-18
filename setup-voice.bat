@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title 나레이션 목소리 설치
cd /d "%~dp0"

rem ── 프로그램 설치 위치 (사용자 규칙: 모든 프로그램은 D:\ProgramFiles 에) ──
set "PF=D:\ProgramFiles"
set "PYVER=3.12.10"
set "PYDIR=%PF%\Python312"
set "PYEXE="

echo.
echo === 나레이션 목소리(무료 한국어 음성) 설치 ===
echo 설치 위치: %PF%
echo.
if not exist "%PF%" mkdir "%PF%"

rem 1) D:\ProgramFiles 안에 이미 있는 Python 찾기
for /d %%D in ("%PF%\Python*") do (
  if exist "%%D\python.exe" if not defined PYEXE set "PYEXE=%%D\python.exe"
)
if defined PYEXE (
  echo [1/3] 이미 있는 Python 사용: !PYEXE!
) else (
  echo [1/3] Python %PYVER% 을 %PYDIR% 에 설치합니다...
  set "INST=%PF%\python-%PYVER%-amd64.exe"
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/%PYVER%/python-%PYVER%-amd64.exe' -OutFile '!INST!'"
  if not exist "!INST!" (
    echo [오류] Python 설치 파일을 받지 못했어요. 인터넷 연결을 확인해 주세요.
    pause & exit /b 1
  )
  rem 조용히 설치: 이 사용자만, 지정 폴더, PATH는 건드리지 않음
  "!INST!" /quiet InstallAllUsers=0 TargetDir="%PYDIR%" PrependPath=0 Include_launcher=0 Include_test=0 Shortcuts=0
  if not exist "%PYDIR%\python.exe" (
    echo [오류] Python 설치에 실패했어요. "!INST!" 을 더블클릭해서 직접 설치해 주세요 ^(설치 위치: %PYDIR%^).
    pause & exit /b 1
  )
  del "!INST!" >nul 2>nul
  set "PYEXE=%PYDIR%\python.exe"
  echo     설치 완료: !PYEXE!
)

rem 2) 목소리 프로그램(edge-tts) 설치
echo [2/3] 목소리 프로그램 설치 중...
"!PYEXE!" -m pip install -q --upgrade pip >nul 2>nul
"!PYEXE!" -m pip install -q -r scripts\py\requirements.txt
"!PYEXE!" -c "import edge_tts" >nul 2>nul
if errorlevel 1 (
  echo [오류] 목소리 프로그램 설치에 실패했어요. 위 메시지를 알려주세요.
  pause & exit /b 1
)

rem 3) 앱이 이 Python을 쓰도록 .env 에 기록
echo [3/3] 앱 설정에 Python 위치 기록...
if not exist ".env" copy ".env.example" ".env" >nul
powershell -NoProfile -Command "$p='.env'; $py='!PYEXE!'; $t=Get-Content $p -Raw -Encoding UTF8; if ($t -match '(?m)^PYTHON=.*$') { $t=$t -replace '(?m)^PYTHON=.*$', ('PYTHON='+$py) } else { $t=$t.TrimEnd()+[Environment]::NewLine+'PYTHON='+$py+[Environment]::NewLine }; [IO.File]::WriteAllText((Resolve-Path $p), $t, (New-Object Text.UTF8Encoding $false))"

rem 시험 삼아 한 문장 만들기
echo 코스트코 이번 주 할인, 정리해 봤어요.| "!PYEXE!" scripts\py\tts_edge.py ko-KR-SunHiNeural +8%% "%TEMP%\cloude-video-voice-test.mp3"
if exist "%TEMP%\cloude-video-voice-test.mp3" (
  echo.
  echo 완료! 시험 음성을 재생합니다.
  start "" "%TEMP%\cloude-video-voice-test.mp3"
) else (
  echo [안내] 설치는 됐지만 시험 음성을 만들지 못했어요. 인터넷 연결을 확인해 주세요.
)
echo.
pause
