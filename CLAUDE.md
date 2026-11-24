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
- ✅ 영상 속 말소리 인식 (faster-whisper large-v3, `src/pipeline/speech.js` + `scripts/py/stt_whisper.py`): `D:\ProgramFiles\asr\.venv` 의 Python 을 자동으로 씀, GPU로 영상 15초 ≈ 15초. 받아쓴 말은 분석·대본 자료와 블로그 사실 카드(S1, S2…)로 들어감. 끄기: `.env` 의 `STT=off`.
- ✅ 작은 사진 선명하게 (Real-ESRGAN x4plus, `src/pipeline/upscale.js`, `media.js` 의 사진 정리 단계): 짧은 쪽 < 1080px 사진만, 사진당 ~5초. 실제 사진이 플라스틱처럼 매끈해지고 이음새 줄이 생기는 문제가 있어 원본 질감과 섞음(`UPSCALE_MIX=0.55`). 끄기: `UPSCALE=off`.
- ✅ 스토리보드 먼저 (2026-11-20~24): 인기 쇼츠 분석(`docs/research/storyboards.md`) → 컨셉별 기준(`src/guides/storyboards.js`) → 스토리보드 점수·규칙 검사 → 컷별 자막·번호 이름표·화면 꽉 채우기. 시험 자료 `tests/media/` (Pexels), 진행 일지 `docs/storyboard-progress.md` (멈췄다 다시 시작할 때 여기부터).
- ✅ 움직이는 화면 글자: Remotion 4.0.542 (`remotion/`, 개인·3명 이하 무료) + 음량 -14 LUFS. 없거나 실패하면 예전 ASS 자막. 끄기 `OVERLAY=ass`.
- `D:\ProgramFiles` 살펴본 결과, 다음에 연결할 후보: EasyOCR(메뉴판 글자 읽기, 한국어 모델 있음), Qwen3-TTS·CosyVoice(내 PC 목소리, Apache 2.0). fish-speech 는 상업 이용 금지라 제외.
- ⬜ 다음 할 일:
  1. 텔레그램 봇 연결 (`@BotFather` → 토큰을 `.env` 의 `TELEGRAM_BOT_TOKEN=` → 앱 켜고 `/start` → `TELEGRAM_CHAT_ID=`)
  2. 구글 드라이브 데스크톱 연결 (`DRIVE_DIR=`, `DRIVE_RESULT_URL=`)
  3. 실제 사진·영상으로 첫 제작, 텔레그램 승인·수정 흐름 시험 (말소리 인식·사진 선명하게도 실제 자료로 확인)
- 앞으로: 플랫폼 자동 업로드
