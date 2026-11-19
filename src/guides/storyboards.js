// 컨셉별 세로 숏폼(쇼츠·릴스·틱톡) 스토리보드 기준.
// 인기 쇼츠를 컷 단위로 분석한 결과(docs/research/storyboards.md)를 정리한 것.
// 대본을 쓰기 전에 AI가 이 틀로 스토리보드를 짜고, scoreStoryboard()로 기준과 비교한다.

/** 장면 구도 (자료 분석 때 장면마다 하나 고른다) */
export const FRAMINGS = {
  wide: '넓게 (공간·매장·풍경 전체)',
  medium: '중간 (테이블·진열대 한 칸·사람 상반신)',
  close: '가까이 (음식·상품·소품이 화면을 채움)',
  top: '위에서 내려다봄 (90도, 그릇·테이블)',
  hands: '손·도구가 움직이는 동작 (뜨기·자르기·집기·만들기)',
  sizzle: '시즐 (김·불·지글지글·늘어남·붓기, 움직임 있는 음식)',
  person: '사람·반응 (먹는 모습, 표정, 서 있는 사람)',
  sign: '간판·입구·포스터·상징물',
  price: '가격표·메뉴판·요금 안내 (글자가 읽힘)',
  pov: '걷는 시점 (길·골목·통로를 따라 이동)',
};
export const FRAMING_IDS = Object.keys(FRAMINGS);
const CLOSE = new Set(['close', 'top', 'hands', 'sizzle', 'price']);
const WIDE = new Set(['wide', 'pov']);

/**
 * form: 형식 / cutSec: 한 컷 길이 범위(초) / totalSec: 전체 길이 범위(초)
 * mix: minClose = 가까운 컷(close·top·hands·sizzle·price) 최소 비율, maxWide/minWide = 넓은 컷(wide·pov) 비율
 * label: 번호 이름표 자막(화면 위쪽 "1. 이름")을 쓰는지
 * beats: 순서대로. need=false 는 자료가 있으면 넣는 비트. multi=true 는 여러 컷을 빠르게 이어 붙이는 비트
 */
export const STORYBOARDS = {
  restaurant: {
    form: '쇼케이스 (대표 메뉴를 빠른 컷으로)',
    reference: { title: '12000원에 이게 다 무제한이라고?', url: 'https://www.youtube.com/shorts/xZUaA5mmRl0', views: '263만', sec: 13 },
    cutSec: [1, 2.2], totalSec: [15, 35], label: false,
    mix: { minClose: 0.6, maxWide: 0.2 },
    beats: [
      { id: 'hook', role: '첫 컷: 대표 메뉴 시즐(김·불·늘어남) 또는 가격이 보이는 간판 + 큰 제목', framing: ['sizzle', 'close', 'top', 'sign', 'price'], need: true },
      { id: 'hero', role: '대표 메뉴 가까이 (위 90도 → 45도), 가격 표시', framing: ['top', 'close', 'sizzle'], need: true, multi: true },
      { id: 'action', role: '뜨기·자르기·찢기·늘리기 같은 동작', framing: ['hands', 'sizzle'], need: false },
      { id: 'more', role: '다른 메뉴·반찬·셀프바를 1~2초씩 빠르게', framing: ['top', 'close', 'medium'], need: false, multi: true },
      { id: 'space', role: '가게 분위기 한 컷 (넓은 컷은 1개까지)', framing: ['wide', 'sign', 'medium'], need: false },
      { id: 'info', role: '마무리: 위치·웨이팅·주문 팁 한 줄 (메뉴판·간판 컷)', framing: ['price', 'sign', 'wide', 'close'], need: true },
    ],
  },
  cafe: {
    form: '방문 흐름 (외관 → 메뉴 → 공간)',
    reference: { title: '사람들이 잘 모르는 성수동 카페 추천!', url: 'https://www.youtube.com/shorts/AgUDtoqj1Fo', views: '16만', sec: 16 },
    cutSec: [1.3, 2.8], totalSec: [14, 30], label: false,
    mix: { minClose: 0.3, minWide: 0.3 },
    beats: [
      { id: 'hook', role: '첫 컷: 외관이나 가장 예쁜 공간 + 큰 2줄 제목 (동네 + 느낌)', framing: ['wide', 'sign'], need: true },
      { id: 'signature', role: '시그니처 음료·디저트 (진열대 → 테이블 위)', framing: ['close', 'top', 'medium'], need: true, multi: true },
      { id: 'detail', role: '단면·따르기·손에 든 컷', framing: ['hands', 'sizzle', 'close', 'person'], need: false },
      { id: 'space', role: '공간: 창가 자리, 빛, 대칭 구도 2~3컷', framing: ['wide', 'medium'], need: true, multi: true },
      { id: 'info', role: '마무리: 가격·위치·추천 자리 한 줄', framing: ['price', 'sign', 'wide'], need: true },
    ],
  },
  mart: {
    form: '번호 목록 (상품마다 같은 틀)',
    reference: { title: '코스트코 몇년째 꼭 사는 재구매템 베스트10', url: 'https://www.youtube.com/shorts/uhzy_p9hfBQ', views: '174만', sec: 29 },
    cutSec: [2, 3.5], totalSec: [20, 45], label: true,
    mix: { minClose: 0.7, maxWide: 0.15 },
    beats: [
      { id: 'hook', role: '첫 컷: 할인 폭이 가장 큰 상품 + 가격표, 또는 매장 입구 + "이번 주 ○가지" 제목', framing: ['price', 'close', 'sign', 'wide'], need: true },
      { id: 'items', role: '상품을 하나씩: 상품 가까이 + 가격표가 화면 가운데, 위쪽에 "번호. 상품명"', framing: ['price', 'close'], need: true, multi: true, perItem: true },
      { id: 'terms', role: '기간·회원 전용·수량 한정 같은 조건 (안내판 컷)', framing: ['price', 'sign'], need: false },
      { id: 'info', role: '마무리: 지점·기간 한 줄 + 저장 유도', framing: ['sign', 'wide', 'price'], need: true },
    ],
  },
  market: {
    form: '번호 목록 (먹거리마다 만드는 손)',
    reference: { title: '망원시장 맛집 가이드 이걸로 끝낼게요!', url: 'https://www.youtube.com/shorts/iHKGeRvx6cQ', views: '25만', sec: 49 },
    cutSec: [1.5, 3], totalSec: [20, 50], label: true,
    mix: { minClose: 0.6, maxWide: 0.25 },
    beats: [
      { id: 'hook', role: '첫 컷: 시장 입구 간판 + "꼭 먹어야 할 ○가지" 또는 가장 센 시즐', framing: ['sign', 'sizzle', 'hands'], need: true },
      { id: 'items', role: '가게·먹거리 하나씩: 만드는 손·불판 가까이, 위쪽에 "번호. 메뉴" + 가격', framing: ['hands', 'sizzle', 'close', 'top', 'price'], need: true, multi: true, perItem: true },
      { id: 'alley', role: '골목 걷는 시점 한 컷 (분위기)', framing: ['pov', 'wide'], need: false },
      { id: 'info', role: '마무리: 가는 법·현금·쉬는 날 같은 팁 한 줄', framing: ['sign', 'wide', 'price'], need: true },
    ],
  },
  park: {
    form: '풍경 산책 (느린 넓은 컷)',
    reference: { title: '핑크뮬리·호수·단풍 서울 근교 가을 명소', url: 'https://www.youtube.com/shorts/OGCzwJkhFUc', views: '46만', sec: 57 },
    cutSec: [3, 5.5], totalSec: [20, 55], label: false,
    mix: { minClose: 0, minWide: 0.7 },
    beats: [
      { id: 'hook', role: '첫 컷: 가장 예쁜 풍경 (앞 꽃·풀 / 가운데 나무 / 뒤 하늘 3겹) + 계절·장소 제목', framing: ['wide'], need: true },
      { id: 'walk', role: '산책로·가로수길: 길이 화면 안쪽으로 이어지는 구도', framing: ['pov', 'wide'], need: true },
      { id: 'spots', role: '포토스팟 2~3곳 (사람은 작게, 크기 비교)', framing: ['wide', 'medium', 'person'], need: true, multi: true },
      { id: 'facility', role: '입구·안내판·편의시설', framing: ['sign', 'wide', 'price'], need: false },
      { id: 'info', role: '마무리: 코스·소요시간·추천 시간대 한 줄', framing: ['wide', 'sign'], need: true },
    ],
  },
  amusement: {
    form: '꿀팁 목록 (2단 자막)',
    reference: { title: '롯데월드 꿀팁 10가지', url: 'https://www.youtube.com/shorts/svCSYgSVgnI', views: '188만', sec: 59 },
    cutSec: [2.5, 5.5], totalSec: [25, 58], label: true,
    mix: { minClose: 0, maxWide: 0.85 },
    beats: [
      { id: 'hook', role: '첫 컷: 놀이기구가 움직이는 넓은 장면 + "○○ 처음 가면 꼭 알아야 할 것"', framing: ['wide', 'sign', 'pov'], need: true },
      { id: 'price', role: '요금·할인 (요금 안내판 컷)', framing: ['price', 'sign'], need: false },
      { id: 'tips', role: '꿀팁·추천 기구 하나씩: 그 장소 컷 + 위쪽 "번호. 제목" + 아래 설명', framing: ['wide', 'medium', 'pov', 'sign', 'person'], need: true, multi: true, perItem: true },
      { id: 'food', role: '먹거리 + 가격', framing: ['close', 'price', 'top'], need: false },
      { id: 'info', role: '마무리: 도착 시간·공연 시간 같은 팁 한 줄', framing: ['wide', 'sign'], need: true },
    ],
  },
  festival: {
    form: '현장 리뷰 (상징 → 먹거리·체험 → 가격 → 한 줄 평)',
    reference: { title: '화제의 울산 옹기 축제 실제 먹거리 어떨까?', url: 'https://www.youtube.com/shorts/zcQxoEmnIvM', views: '93만', sec: 51 },
    cutSec: [2, 4.5], totalSec: [20, 50], label: false,
    mix: { minClose: 0.35, maxWide: 0.5 },
    beats: [
      { id: 'hook', role: '첫 컷: 축제 상징 장면(전경·조형물·공연) + 축제 이름·기간 제목', framing: ['wide', 'sign'], need: true },
      { id: 'program', role: '대표 프로그램·볼거리', framing: ['wide', 'medium', 'person'], need: false, multi: true },
      { id: 'food', role: '부스 조리 시즐 → 음식 가까이 + 큰 가격', framing: ['sizzle', 'hands', 'close', 'top', 'price'], need: true, multi: true },
      { id: 'crowd', role: '혼잡도·분위기 (메모에 있을 때)', framing: ['wide', 'pov'], need: false },
      { id: 'info', role: '마무리: 기간·장소·교통 한 줄 (포스터 컷)', framing: ['sign', 'price', 'wide'], need: true },
    ],
  },
  popup: {
    form: '방문 흐름 (입구 → 굿즈 → 포토존)',
    reference: { title: '팝업스토어 오픈런 후기', url: 'https://www.youtube.com/shorts/WatDDcvQ6Os', views: '40만', sec: 17 },
    cutSec: [1.3, 3], totalSec: [14, 35], label: false,
    mix: { minClose: 0.3, minWide: 0.2 },
    beats: [
      { id: 'hook', role: '첫 컷: 입구 상징물·대표 포토존 + "○○ 팝업, ○일까지" 제목', framing: ['sign', 'wide'], need: true },
      { id: 'space', role: '공간·굿즈 벽 넓게', framing: ['wide', 'medium', 'pov'], need: true, multi: true },
      { id: 'goods', role: '굿즈 가까이 + 가격', framing: ['close', 'price'], need: false, multi: true },
      { id: 'photo', role: '포토존·체험', framing: ['wide', 'medium', 'person'], need: false },
      { id: 'info', role: '마무리: 기간·예약·입장 방법 한 줄', framing: ['sign', 'price', 'wide'], need: true },
    ],
  },
};
// 컨셉을 모를 때 (기타)
STORYBOARDS.other = {
  form: '방문 흐름', reference: null, cutSec: [1.5, 4], totalSec: [15, 50], label: false,
  mix: { minClose: 0.3, maxWide: 0.6 },
  beats: [
    { id: 'hook', role: '첫 컷: 가장 센 장면 + 큰 제목', framing: FRAMING_IDS, need: true },
    { id: 'main', role: '핵심 볼거리·상품', framing: FRAMING_IDS, need: true, multi: true },
    { id: 'info', role: '마무리 정보 한 줄', framing: ['sign', 'price', 'wide'], need: true },
  ],
};

export const storyboardFor = (concept) => STORYBOARDS[concept] || STORYBOARDS.other;

/** AI 에게 줄 스토리보드 기준 설명 */
export function storyboardGuide(concept) {
  const t = storyboardFor(concept);
  const lines = [
    `- 형식: ${t.form}${t.reference ? ` (기준 영상: "${t.reference.title}", 조회수 ${t.reference.views}, ${t.reference.sec}초)` : ''}`,
    `- 한 컷 길이: ${t.cutSec[0]}~${t.cutSec[1]}초 / 전체: ${t.totalSec[0]}~${t.totalSec[1]}초`,
    `- 구도 비율: 가까운 컷(close·top·hands·sizzle·price) ${Math.round(t.mix.minClose * 100)}% 이상`
      + (t.mix.maxWide !== undefined ? `, 넓은 컷(wide·pov) ${Math.round(t.mix.maxWide * 100)}% 이하` : '')
      + (t.mix.minWide !== undefined ? `, 넓은 컷(wide·pov) ${Math.round(t.mix.minWide * 100)}% 이상` : ''),
    t.label ? '- 번호 이름표: 목록 비트의 컷마다 위쪽에 "1. 이름" (label 칸)' : '- 번호 이름표는 쓰지 않는다 (label 빈칸)',
    '- 비트 순서 (위에서 아래로, need=꼭):',
    ...t.beats.map((b, i) => `  ${i + 1}. ${b.id}${b.need ? ' (꼭)' : ''}${b.multi ? ' [여러 컷 빠르게]' : ''}${b.perItem ? ' [항목마다 반복]' : ''}: ${b.role} / 구도: ${b.framing.join('·')}`),
  ];
  return lines.join('\n');
}

/**
 * 스토리보드를 기준과 비교해 점수(0~100)와 고칠 점을 낸다.
 * @param {{beats:{beat:string, shots:string[], sec:number}[]}} sb
 * @param {string} concept
 * @param {Map<string,{framing?:string, quality?:string}>} shotInfo  ref → 분석 결과
 */
export function scoreStoryboard(sb, concept, shotInfo) {
  const t = storyboardFor(concept);
  const issues = [];
  const beats = (sb?.beats || []).filter((b) => b && Array.isArray(b.shots) && b.shots.length);
  const parts = {};
  if (!beats.length) return { score: 0, parts: {}, issues: ['비트가 없음'], stats: {} };

  // 1) 비트 순서·필수 비트 (30)
  const order = t.beats.map((b) => b.id);
  const ids = beats.map((b) => b.beat);
  const needIds = t.beats.filter((b) => b.need).map((b) => b.id);
  const missing = needIds.filter((id) => !ids.includes(id));
  let inversions = 0;
  const pos = ids.map((id) => order.indexOf(id)).filter((p) => p >= 0);
  for (let i = 1; i < pos.length; i++) if (pos[i] < pos[i - 1]) inversions++;
  const unknown = ids.filter((id) => !order.includes(id));
  parts.order = Math.max(0, 30 - missing.length * 10 - inversions * 5 - unknown.length * 3);
  if (missing.length) issues.push(`꼭 있어야 할 비트가 빠짐: ${missing.join(', ')}`);
  if (inversions) issues.push(`비트 순서가 기준과 다름 (기준: ${order.join(' → ')})`);
  if (unknown.length) issues.push(`기준에 없는 비트 이름: ${unknown.join(', ')}`);

  // 2) 첫 컷 (15)
  const hookTpl = t.beats[0];
  const firstRef = beats[0].shots[0];
  const first = shotInfo.get(firstRef) || {};
  parts.hook = 0;
  if (beats[0].beat === hookTpl.id) parts.hook += 5;
  if (hookTpl.framing.includes(first.framing)) parts.hook += 7;
  else issues.push(`첫 컷(${firstRef})의 구도가 ${first.framing || '모름'} → 기준은 ${hookTpl.framing.join('·')}`);
  if (first.quality !== 'bad') parts.hook += 3;
  else issues.push(`첫 컷(${firstRef})이 품질 나쁨`);

  // 3) 구도 비율 (20)
  const cuts = beats.flatMap((b) => b.shots);
  const fr = cuts.map((r) => shotInfo.get(r)?.framing).filter(Boolean);
  const n = fr.length || 1;
  const closeR = fr.filter((f) => CLOSE.has(f)).length / n;
  const wideR = fr.filter((f) => WIDE.has(f)).length / n;
  parts.mix = 20;
  if (closeR + 1e-9 < t.mix.minClose) { parts.mix -= Math.min(10, Math.round((t.mix.minClose - closeR) * 30)); issues.push(`가까운 컷 비율 ${Math.round(closeR * 100)}% → 기준 ${Math.round(t.mix.minClose * 100)}% 이상`); }
  if (t.mix.maxWide !== undefined && wideR > t.mix.maxWide + 1e-9) { parts.mix -= Math.min(10, Math.round((wideR - t.mix.maxWide) * 30)); issues.push(`넓은 컷 비율 ${Math.round(wideR * 100)}% → 기준 ${Math.round(t.mix.maxWide * 100)}% 이하`); }
  if (t.mix.minWide !== undefined && wideR + 1e-9 < t.mix.minWide) { parts.mix -= Math.min(10, Math.round((t.mix.minWide - wideR) * 30)); issues.push(`넓은 컷 비율 ${Math.round(wideR * 100)}% → 기준 ${Math.round(t.mix.minWide * 100)}% 이상`); }
  parts.mix = Math.max(0, parts.mix);

  // 4) 컷 길이 (20)
  const total = beats.reduce((a, b) => a + (Number(b.sec) || 0), 0);
  const avgCut = total / (cuts.length || 1);
  const [lo, hi] = t.cutSec;
  parts.pace = 20;
  if (avgCut < lo * 0.75 || avgCut > hi * 1.3) { parts.pace = 6; issues.push(`평균 컷 길이 ${avgCut.toFixed(1)}초 → 기준 ${lo}~${hi}초`); }
  else if (avgCut < lo || avgCut > hi) { parts.pace = 14; issues.push(`평균 컷 길이 ${avgCut.toFixed(1)}초가 기준(${lo}~${hi}초) 경계 밖`); }

  // 5) 전체 길이 (10)
  const [tl, th] = t.totalSec;
  parts.length = total >= tl && total <= th ? 10 : total >= tl * 0.8 && total <= th * 1.15 ? 6 : 2;
  if (parts.length < 10) issues.push(`전체 ${Math.round(total)}초 → 기준 ${tl}~${th}초`);

  // 6) 같은 컷 반복·나쁜 컷 (5)
  const dup = cuts.length - new Set(cuts).size;
  const bad = cuts.filter((r) => shotInfo.get(r)?.quality === 'bad').length;
  const unknownRef = cuts.filter((r) => !shotInfo.has(r)).length;
  parts.clean = Math.max(0, 5 - dup * 2 - bad * 2 - unknownRef * 2);
  if (dup) issues.push(`같은 컷을 ${dup}번 다시 씀`);
  if (bad) issues.push(`품질 나쁜 컷 ${bad}개 사용`);
  if (unknownRef) issues.push(`장면 목록에 없는 ref ${unknownRef}개`);

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return {
    score,
    parts,
    issues,
    stats: { cuts: cuts.length, total: Math.round(total * 10) / 10, avgCut: Math.round(avgCut * 10) / 10, closeRatio: Math.round(closeR * 100), wideRatio: Math.round(wideR * 100) },
  };
}

/**
 * AI 없이 만드는 기본 스토리보드 (테스트 모드·AI 실패 때): 비트마다 구도가 맞는 컷을 고른다.
 * @param {{ref:string, framing?:string, quality?:string}[]} shots
 */
export function autoStoryboard(concept, shots) {
  const t = storyboardFor(concept);
  const pool = shots.filter((s) => s.quality !== 'bad');
  const used = new Set();
  const take = (framings, n) => {
    const out = [];
    for (const f of framings) {
      for (const s of pool) {
        if (out.length >= n) break;
        if (!used.has(s.ref) && s.framing === f) { used.add(s.ref); out.push(s.ref); }
      }
    }
    return out;
  };
  const cut = (t.cutSec[0] + t.cutSec[1]) / 2;
  const beats = [];
  for (const b of t.beats) {
    const n = b.multi ? (b.perItem ? 5 : 3) : 1;
    let picked = take(b.framing, n);
    if (!picked.length && b.need) {
      const any = pool.find((s) => !used.has(s.ref));
      if (any) { used.add(any.ref); picked = [any.ref]; }
    }
    if (picked.length) beats.push({ beat: b.id, shots: picked, sec: Math.round(cut * picked.length * 10) / 10, label: '', note: '' });
  }
  return { form: t.form, hook_title: '', beats };
}
