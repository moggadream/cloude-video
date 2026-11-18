# 앱 켜기: 최신 버전 받기 → 부품 설치 → 앱 실행 → 브라우저 열기
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
$OutputEncoding = New-Object Text.UTF8Encoding $false
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$Host.UI.RawUI.WindowTitle = 'cloude-video'

Write-Host "[1/3] 최신 버전 확인 중..."
git pull --ff-only 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "    (업데이트 확인을 건너뜁니다)" }

Write-Host "[2/3] 부품 확인 중..."
npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) {
  Write-Host "[오류] npm install 실패. 위 메시지를 캡처해서 알려 주세요." -ForegroundColor Red
  exit 1
}

$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile) -or -not (Select-String -Path $envFile -Pattern '^PYTHON=' -Quiet)) {
  Write-Host "    [안내] 목소리가 아직 설치되지 않았어요. setup-voice.bat 을 한 번 실행하면 D:\ProgramFiles 에 설치돼요. (지금은 자막만)" -ForegroundColor Yellow
}

Write-Host "[3/3] 앱을 켭니다. 이 창을 닫으면 앱도 꺼져요." -ForegroundColor Green
Start-Job { Start-Sleep 3; Start-Process 'http://localhost:3000' } | Out-Null
npm start
