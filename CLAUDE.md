# 이 프로젝트에서 작업할 때 지킬 것

## 사용자 환경 (Windows)
- **프로그램을 내려받고 설치하는 위치는 항상 `D:\ProgramFiles`** 이다. 새 프로그램(Python, ffmpeg, 도구 등)은 여기에 설치하고, 이미 여기에 있는지 먼저 확인한다.
- 프로젝트 폴더: `D:\깃허브연동\cloude-video`
- 이미 있는 것: Node.js 24, npm 11, ffmpeg (PATH 등록됨), git
- 나레이션용 Python은 `setup-voice.bat` 이 `D:\ProgramFiles\Python312` 에 설치하고 `.env` 의 `PYTHON=` 에 위치를 적는다.

## 소통
- 사용자에게는 한국어로, 쉬운 말로 설명한다.

## 작업 규칙
- 스킬 문서는 `.claude/skills/`, 컨셉 가이드 원본은 `src/guides/` (스킬은 `node scripts/build-guides.js` 로 생성).
- 품질 평가: `node scripts/eval-scenario.js <시나리오>` → `docs/evals/`, 학습 기록은 `docs/learning-log.md`.
