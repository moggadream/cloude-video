# 스토리보드·실제 자료 시험 작업 일지

> 사용량 한도로 멈췄다가 다시 시작할 때 **이 파일부터 읽고** 체크 안 된 첫 단계부터 이어서 한다.
> 요청 (2026-11-19): 텔레그램은 빼고, 인터넷에서 시험용 사진·영상을 모아 목표를 이룰 때까지 계속 만들기.
> - 글: 인기 글을 참고해 쓰는 법 지침을 계속 고친다.
> - 영상: 대본과 구도가 핵심. **스토리보드를 먼저** 만들어 인기 영상의 스토리보드와 대조하고, 비슷하게 만들 수 있을 때 영상을 만든다.
> - 카테고리(컨셉)마다 구도·스토리보드가 다르니 각각 지침을 만들고, 직접 영상을 만들어 다시 비교한다.

## 단계
- [x] 1. 인기 쇼츠 구조 조사 (컨셉 8개, 기본 브라우저로 영상 12등분 화면을 모아 분석) → `docs/research/storyboards.md`
- [x] 2. 컨셉별 스토리보드·구도 기준 `src/guides/storyboards.js` (비트 순서, 구도, 컷 길이, 이름표, 점수 매기기)
- [x] 3. 제작 과정: 분석에 구도(framing) 추가 → `makeStoryboard()` (75점 미만이면 고칠 점 주고 한 번 더) → 쇼츠·릴스·틱톡 대본이 스토리보드를 따름 (extra_shots = 빠른 컷, label = 이름표)
  - 렌더러: 화면 꽉 채우기(가로 사진은 옆으로 훑기, 가격표·간판은 전체), 한 나레이션 동안 여러 컷, 이름표 자막
  - 비교 도구: `node scripts/storyboard-sheet.js <작업ID>` → 만든 영상 12등분 화면 모음 + 컷 통계
  - 시험: `CONCEPT=mart SAMPLE_DIR=... node scripts/test-pipeline.js` (AI 없이는 `AI_MODE=off`)
- [x] 4. 시험 사진·영상 모으기: Pexels(무료·상업 이용 가능) 컨셉별 11~12개 → `tests/media/manifest.json`, 받기 `node scripts/fetch-test-media.js` (파일은 git 제외, 출처는 SOURCES.md). 위키미디어 공용은 한국 장소 영상이 거의 없어서 Pexels 로.
  - 컨셉 하나 시험: `SAMPLE_DIR=tests/media/<c> CONCEPT=<c> PLACE=... MEMO="$(cat tests/media/<c>/memo.txt)" node scripts/test-pipeline.js` → `node scripts/storyboard-sheet.js <작업ID>`
- [ ] 5. 컨셉별 실제 제작 → 스토리보드 일치도·장면 구도 비교 → 지침 고치기 (반복)
- [ ] 6. 기록 정리 (`docs/learning-log.md`), 커밋·push

## 진행 기록
