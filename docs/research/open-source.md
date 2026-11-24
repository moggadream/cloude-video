# 비슷한 오픈소스 살펴보기 (2026-11-24)

GitHub API·README로 직접 확인했어요 (별 수·마지막 업데이트는 2026-11-24 기준).

| 프로젝트 | 라이선스 | 활동 | 하는 일 | 우리 앱과 맞는 정도 |
|---|---|---|---|---|
| [remotion-dev/skills](https://github.com/remotion-dev/skills) (Remotion 공식 에이전트 스킬) | Remotion 라이선스: **개인·3명 이하 회사는 무료, 상업 이용 무제한**. 그보다 큰 회사는 유료 | ⭐7.9천, 어제 업데이트 | Claude가 React 코드로 영상(자막·제목·애니메이션)을 만들게 하는 스킬 13개 (captions, render, best-practices 등) | **높음**: 자막·제목·가격표를 인기 쇼츠처럼 움직이게. PC에 Remotion 4.0 이미 있음 (`D:\ProgramFiles\Remotion`) |
| [AgriciDaniel/claude-shorts](https://github.com/AgriciDaniel/claude-shorts) | MIT | ⭐498, 2026-07 | 긴 영상 → 쇼츠: faster-whisper 받아쓰기 → Claude가 구간 점수 → Remotion 움직이는 자막(Bold·Bounce·Clean 3종), 첫 3.5초 훅 문구, 진행 막대 | **중간**: 말하는 영상용이라 통째로는 안 맞음. **자막 컴포넌트(MIT)를 가져다 쓸 만함**. 윈도우는 WSL2 필요 |
| [MakeMyClip/editor](https://github.com/MakeMyClip/editor) | MIT | ⭐31, 2026-11 | 말하는 영상 정리: 무음·다시 찍은 말 자르기, 자막, 9:16 재구성, **음량 -14 LUFS 맞추기**, 컷 점검 화면 모음 | **중간**: 음량 맞추기·컷 점검 아이디어. 윈도우 지원(winget ffmpeg) |
| [partyfly/wowclip](https://github.com/partyfly/wowclip) | MIT | ⭐2, 2026-06 | 긴 영상 → 세로 클립: 장면 경계, 얼굴 중심 9:16 자르기, `edl.json` 편집 계획 | **낮음~중간**: 얼굴 중심 자르기 방식 참고. 사용자 적음 |
| [digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) | MIT | ⭐2.7천, 어제 업데이트 | 대본 → 음성(Qwen3-TTS 등) → 음악 → Remotion 렌더. 장면 길이·단어 수 예산 문서 | **중간**: Qwen3-TTS 연결(PC에 이미 있음), 나레이션 길이와 장면 길이 맞추는 법(우리 "컷이 늘어짐" 문제와 같음) |
| MoneyPrinterTurbo | MIT | 매우 유명 | 주제만 주면 무료 영상 자료로 쇼츠 | **낮음**: 남의 자료로 만드는 방식, 직접 찍은 자료가 주인공인 우리와 목적이 다름 |

## 결론: 통째로 바꿀 것은 없고, 가져다 쓸 것 4가지
1. **Remotion으로 화면 글자 바꾸기 (효과 가장 큼)**: 지금은 ffmpeg으로 글자를 얹기만 함. 인기 쇼츠의 톡톡 튀는 제목·가격표·번호 이름표·단어별 강조 자막을 Remotion으로. 컷 이어 붙이기는 지금처럼 ffmpeg, 마지막 글자 층만 Remotion. claude-shorts의 자막 컴포넌트(MIT) 참고, 한국어 글꼴(Black Han Sans·나눔)로.
2. **음량 맞추기**: 쇼츠·릴스·틱톡 기준 -14 LUFS (MakeMyClip). 지금은 안 맞춤 → ffmpeg `loudnorm` 한 줄로 가능.
3. **나레이션 길이 예산**: video-toolkit의 "단어 수 예산 → 장면 길이" 방식. 우리는 대본을 쓴 뒤 검사로 잡는데, 쓰기 전에 장면별 글자 수 예산을 주는 쪽으로.
4. **피사체 중심 자르기**: 가로 영상을 세로로 자를 때 지금은 가운데만 자름. 얼굴(wowclip·claude-shorts)보다는 음식·상품이 주인공이라 "가장 눈에 띄는 곳" 중심 자르기를 따로 만들어야 함 (나중에).
