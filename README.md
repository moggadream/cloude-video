# 🎬 cloude-video — 사진·영상으로 홍보 콘텐츠 자동 제작

폰으로 찍은 사진과 영상을 올리면 AI가 장소를 알아보고 아래 5가지를 한 번에 만들어요.

| 결과물 | 형태 |
|---|---|
| 유튜브 쇼츠 | 세로 1080×1920, 60초 이내, 자막·가격 표시·나레이션·배경음악 |
| 유튜브 롱폼 | 가로 1920×1080, 챕터 포함 |
| 인스타그램 릴스 | 세로 1080×1920, 캡션·해시태그 |
| 쓰레드 글 | 500자 이내 |
| 블로그 글 | 사진이 들어간 긴 후기 (네이버 블로그 스타일) |

장소 종류에 따라 내용이 달라져요.
- **마트·시장**: 상품, 가격표에서 읽은 가격, 가게 소개
- **음식점·카페**: 음식, 메뉴 가격, 가게 안팎 모습
- **공원·행사**: 경치, 행사 품목, 안내판에 적힌 행사 시간

## 사용 흐름

1. 폰 브라우저에서 사진·영상 업로드 (장소 이름, 메모는 선택)
2. 자동 제작 (화면을 닫아도 계속 진행)
3. 완성 알림 (브라우저 푸시 또는 텔레그램)
4. 확인 화면에서 영상을 보고 글을 고치고, 필요하면 장면(자막·나레이션·가격)을 고쳐 다시 만들기
5. 결과물마다 **승인** → 해당 플랫폼에 게시

> **현재 1단계**: 승인 기록까지 됩니다. 유튜브·인스타그램·쓰레드 자동 업로드는 2단계에서 연결해요.
> 지금은 "영상 받기", "복사" 버튼으로 직접 올리면 돼요.
> 네이버 블로그는 글쓰기 공개 API가 없어서 복사해서 붙여넣는 방식이에요.

## 실행하기

필요한 것: **Node.js 20 이상**, **ffmpeg**

```bash
npm install
cp .env.example .env   # 필요한 키를 채우기 (없어도 테스트 모드로 실행됨)
npm start              # http://localhost:3000
```

### 테스트 모드 (API 키 없이)
키가 없어도 전체 흐름을 확인할 수 있어요.
- AI 분석 → 예시 글로 대신 작성
- 나레이션 → 없음 (자막만)
- 배경음악 → 내장 임시 음악

샘플로 서버 없이 한 번 돌려보기:
```bash
npm run sample          # samples/ 에 테스트용 사진·영상 생성
npm run test:pipeline   # 전체 제작 실행 → data/projects/<id>/out/
```

### API 키 (.env)
| 키 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | 사진 분석, 대본, 글 작성 (Claude) |
| `ELEVENLABS_API_KEY` | 한국어 나레이션, AI 배경음악 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | 텔레그램 완성 알림 (선택) |
| `APP_PASSWORD` | 접속 비밀번호 (**인터넷 공개 시 필수**) |

### 알림
- **브라우저 푸시**: 위쪽 "🔔 알림 켜기". `https` 주소에서만 동작해요. 아이폰은 사파리에서 "홈 화면에 추가"한 뒤 그 앱에서 켜야 해요.
- **텔레그램**: `.env`에 봇 토큰과 채팅 ID를 넣으면 같이 보내요. `localhost` 테스트 중에도 동작해요.

## 서버에 올리기 (Docker)

```bash
docker build -t cloude-video .
docker run -d -p 3000:3000 -v cloude-video-data:/data --env-file .env cloude-video
```
앞단에 https(예: Caddy, Cloudflare Tunnel)를 두면 폰 푸시 알림까지 쓸 수 있어요.

## 구조

```
src/
  server.js            웹 서버 (업로드, 확인, 승인 API)
  store.js             작업 저장 (data/projects/<id>/project.json)
  queue.js             제작 작업을 하나씩 순서대로 실행
  notify.js            브라우저 푸시 + 텔레그램 알림
  pipeline/
    index.js           전체 과정: 정리 → AI 계획 → 영상 3종 → 글 → 알림
    media.js           ffmpeg 도우미, 사진 회전 보정, 영상 프레임 추출
    plan.js            Claude 분석·대본·글 (키 없으면 예시)
    audio.js           ElevenLabs 나레이션·음악 (없으면 임시 음악)
    render.js          장면 → 영상 (줌 효과, 흐림 배경, 자막, 가격 표시, 음악 자동 줄이기)
  publish/index.js     승인 시 게시 (2단계에서 업로더 연결)
public/                폰 화면 (업로드, 확인·승인)
assets/fonts/          자막 글꼴 (OFL 라이선스)
```

## 다음 단계
- [ ] 유튜브 자동 업로드 (Google OAuth, YouTube Data API)
- [ ] 인스타그램 릴스 자동 업로드 (Instagram Graph API, 비즈니스 계정)
- [ ] 쓰레드 자동 게시 (Threads API)
- [ ] 영상 원본 소리 일부 살리기 옵션
