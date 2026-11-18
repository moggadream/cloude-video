# 나레이션 목소리(무료 한국어 음성) 설치
# 규칙: 모든 프로그램은 D:\ProgramFiles 에 설치한다
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
$OutputEncoding = New-Object Text.UTF8Encoding $false
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$PF = 'D:\ProgramFiles'
$PYVER = '3.12.10'
$PYDIR = Join-Path $PF 'Python312'

function Fail($msg) {
  Write-Host ""
  Write-Host "[오류] $msg" -ForegroundColor Red
  Write-Host "이 화면을 캡처해서 알려 주세요."
  exit 1
}

Write-Host ""
Write-Host "=== 나레이션 목소리(무료 한국어 음성) 설치 ===" -ForegroundColor Cyan
Write-Host "설치 위치: $PF"
Write-Host ""
if (-not (Test-Path $PF)) { New-Item -ItemType Directory -Path $PF | Out-Null }

# 1) D:\ProgramFiles 안에 이미 있는 Python 찾기 (새 버전 우선)
$py = Get-ChildItem -Path $PF -Directory -Filter 'Python*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName 'python.exe' } |
  Where-Object { Test-Path $_ } | Select-Object -First 1

if ($py) {
  Write-Host "[1/3] 이미 있는 Python 사용: $py"
} else {
  Write-Host "[1/3] Python $PYVER 을 $PYDIR 에 설치합니다... (몇 분 걸려요)"
  $inst = Join-Path $PF "python-$PYVER-amd64.exe"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "https://www.python.org/ftp/python/$PYVER/python-$PYVER-amd64.exe" -OutFile $inst
  } catch { Fail "Python 설치 파일을 받지 못했어요. 인터넷 연결을 확인해 주세요. ($($_.Exception.Message))" }
  # 조용히 설치: 이 사용자만, 지정 폴더, PATH는 건드리지 않음
  Start-Process -Wait -FilePath $inst -ArgumentList '/quiet', 'InstallAllUsers=0', "TargetDir=`"$PYDIR`"", 'PrependPath=0', 'Include_launcher=0', 'Include_test=0', 'Shortcuts=0'
  $py = Join-Path $PYDIR 'python.exe'
  if (-not (Test-Path $py)) { Fail "Python 설치에 실패했어요. $inst 를 더블클릭해서 직접 설치해 주세요 (설치 위치: $PYDIR)." }
  Remove-Item $inst -ErrorAction SilentlyContinue
  Write-Host "    설치 완료: $py"
}

# 2) 목소리 프로그램(edge-tts) 설치
Write-Host "[2/3] 목소리 프로그램 설치 중..."
$ErrorActionPreference = 'Continue'
& $py -m pip install -q --upgrade pip 2>$null | Out-Null
& $py -m pip install -q -r (Join-Path $root 'scripts\py\requirements.txt')
& $py -c "import edge_tts" 2>$null
if ($LASTEXITCODE -ne 0) { Fail "목소리 프로그램 설치에 실패했어요." }
$ErrorActionPreference = 'Stop'

# 3) 앱이 이 Python을 쓰도록 .env 에 기록
Write-Host "[3/3] 앱 설정(.env)에 Python 위치 기록..."
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root '.env.example') $envFile }
$t = [IO.File]::ReadAllText($envFile, [Text.Encoding]::UTF8)
if ($t -match '(?m)^PYTHON=.*$') {
  $t = [regex]::Replace($t, '(?m)^PYTHON=.*$', { param($m) "PYTHON=$py" })
} else {
  $t = $t.TrimEnd() + "`r`nPYTHON=$py`r`n"
}
[IO.File]::WriteAllText($envFile, $t, (New-Object Text.UTF8Encoding $false))
Write-Host "    PYTHON=$py"

# 시험 삼아 한 문장 만들어 재생
$test = Join-Path $env:TEMP 'cloude-video-voice-test.mp3'
Remove-Item $test -ErrorAction SilentlyContinue
$ErrorActionPreference = 'Continue'
'코스트코 이번 주 할인, 정리해 봤어요.' | & $py (Join-Path $root 'scripts\py\tts_edge.py') 'ko-KR-SunHiNeural' '+8%' $test
if (Test-Path $test) {
  Write-Host ""
  Write-Host "완료! 시험 음성을 재생합니다." -ForegroundColor Green
  Start-Process $test
} else {
  Write-Host "[안내] 설치는 됐지만 시험 음성을 만들지 못했어요. 위 메시지를 캡처해서 알려 주세요." -ForegroundColor Yellow
}
