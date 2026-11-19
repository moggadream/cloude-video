# 이 프로젝트에서 작업할 때 지킬 것

## 사용자 환경 (Windows)
- **프로그램을 내려받고 설치하는 위치는 항상 `D:\ProgramFiles`** 이다. 새 프로그램(Python, ffmpeg, 도구 등)은 여기에 설치하고, 이미 여기에 있는지 먼저 확인한다.
- 프로젝트 폴더: `D:\깃허브연동\cloude-video`
- 이미 있는 것: Node.js 24, npm 11, ffmpeg (PATH 등록됨), git
- Claude Code CLI: `D:\ProgramFiles\ClaudeCode` (npm --prefix 설치, 사용자 PATH 등록됨, 로그인 완료). 앱이 대본을 쓸 때 이걸 부른다.
- 나레이션 Python: `D:\ProgramFiles\Python313` (edge-tts 설치됨, `.env` 의 `PYTHON=` 에 기록됨). `setup-voice.bat` 은 D:\ProgramFiles 안의 Python을 먼저 찾고, 없을 때만 Python312를 설치한다.

## 윈도우에서 주의할 것 (실제로 겪은 문제)
- `.bat` 파일에 한글을 넣으면 깨진다 → `.bat` 은 영어만, 실제 작업은 `scripts/win/*.ps1` (UTF-8 BOM) 에 둔다.
- ffmpeg 필터 안에 `D:\...` 절대 경로를 넣으면 `:` `\` 때문에 깨진다 → `cwd` 를 주고 상대 경로를 쓴다.

## 소통
- 사용자에게는 한국어로, 쉬운 말로 설명한다. 사용자는 개발자가 아니다.
- 비밀값(텔레그램 토큰, API 키)은 대화창에 붙여 넣게 하지 말고 `.env` 에 직접 넣게 한다.

## 작업 규칙
- 스킬 문서는 `.claude/skills/`, 컨셉 가이드 원본은 `src/guides/` (스킬은 `node scripts/build-guides.js` 로 생성).
- 품질 평가: `node scripts/eval-scenario.js <시나리오>` → `docs/evals/`, 학습 기록은 `docs/learning-log.md`.
- 고친 내용은 커밋하고 `main` 에 push 한다 (GitHub: moggadream/cloude-video).

## 지금까지 진행 상황 (2026-11-19)
- ✅ PC에서 `npm run sample` → `npm run test:pipeline` 성공: 영상 4종 + 캐러셀·쓰레드·블로그 7분 만에 완성, 목소리 나옴.
- ✅ 나레이션 목소리 4종(선희·인준·현수·비비엔) 선택 기능: 텔레그램 `/voice` (`src/voices.js`). 무료 edge 음성은 개인 시험용이고, 상업 이용은 `.env` 의 `AZURE_SPEECH_KEY` (마이크로소프트 공식, 같은 목소리)로. Azure 연결은 아직 키가 없어 시험 못 함.
- ⬜ 다음 할 일:
  1. `D:\ProgramFiles` 안의 프로그램을 살펴보고 이 앱에 쓸 만한 것(글꼴, 음성, 영상 도구 등)을 추려 연결하기
  2. 텔레그램 봇 연결 (`@BotFather` → 토큰을 `.env` 의 `TELEGRAM_BOT_TOKEN=` → 앱 켜고 `/start` → `TELEGRAM_CHAT_ID=`)
  3. 구글 드라이브 데스크톱 연결 (`DRIVE_DIR=`, `DRIVE_RESULT_URL=`)
  4. 실제 사진·영상으로 첫 제작, 텔레그램 승인·수정 흐름 시험
- 앞으로: 플랫폼 자동 업로드, 영상 속 말소리 인식(faster-whisper)
