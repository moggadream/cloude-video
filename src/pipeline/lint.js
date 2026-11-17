// 규칙 검사 (AI 없이 바로): 길이·개수·금지 표현·근거 없는 가격 등
// 결과: { score: 0~100, issues: [{ level: 'error'|'warn', msg }] }

export const AI_PHRASES = [
  '소개합니다', '소개해 드릴게요', '알아보겠습니다', '알아볼까요', '살펴볼까요', '살펴보겠습니다',
  '다양한', '완벽한', '최고의', '놓치지 마세요', '강력 추천', '강력추천', '필수 코스', '도움이 되셨', '좋은 하루',
  '환상적', '입안 가득', '인생 맛집', '역대급', '힐링 공간', '감성 가득', '여러분 안녕', '오늘은 제가',
  '것으로 보입니다', '할 수 있습니다', '완벽 정리',
];

const LIMITS = {
  shorts: { sec: [15, 50], scenes: [5, 10], tags: 5 },
  reels: { sec: [8, 35], scenes: [3, 8], tags: 5 },
  tiktok: { sec: [12, 50], scenes: [4, 10], tags: 5 },
  longform: { sec: [60, 900], scenes: [6, 80], tags: 5 },
  carousel: { slides: [5, 10], tags: 5 },
  threads: { chars: [80, 500] },
  blog: { chars: [1200, 3200], sections: [5, 9], tags: [6, 15] },
};

// 화면 글자 길이 (한 줄 기준)
const CAPTION_MAX = 22;
const HOOK_LINE_MAX = 16;

/** 장면 길이 추정: 한국어 초당 약 6자 + 장면 여유 */
export const estimateSec = (scenes) =>
  scenes.reduce((a, s) => a + Math.max(2.2, (String(s.narration || '').replace(/\s/g, '').length / 6) + 0.9), 0);

/** 텍스트 속 가격들 (예: "9,900원", "1,199,000원", "5천 원"은 제외) */
function prices(text) {
  return [...String(text).matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,})\s*원/g)].map((m) => Number(m[1].replace(/,/g, '')));
}

/** 근거 자료(분석 결과·메모)에 있는 숫자들 */
export function knownNumbers(plan, project) {
  const src = [
    ...(plan.key_facts || []),
    ...(plan.shots || []).flatMap((s) => [s.description, ...(s.items || []).flatMap((i) => [i.name, i.price, i.note])]),
    project?.hints?.memo || '',
  ].join(' ');
  return new Set([...src.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)].map((m) => Number(m[0].replace(/,/g, ''))));
}

/** 이 결과물의 모든 글 (검사용) */
export function allText(key, out) {
  if (!out) return '';
  if (['shorts', 'reels', 'tiktok', 'longform'].includes(key)) {
    return [out.title, out.hook, out.description, ...out.scenes.flatMap((s) => [s.narration, s.caption, s.price_tag])].join('\n');
  }
  if (key === 'carousel') return [out.caption, ...out.slides.flatMap((s) => [s.headline, s.body])].join('\n');
  if (key === 'threads') return out.text;
  if (key === 'blog') return [out.title, ...out.sections.flatMap((s) => [s.heading, s.body])].join('\n');
  return '';
}

export function lintOutput(key, out, plan, project) {
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  const L = LIMITS[key] || {};
  const text = allText(key, out);

  // 1) AI 티 나는 표현
  const found = AI_PHRASES.filter((p) => text.includes(p));
  if (found.length) add('warn', `AI 티 나는 표현: ${found.map((f) => `"${f}"`).join(', ')}`);

  // 2) 근거 없는 가격 (분석 결과·메모에 없는 금액)
  const known = knownNumbers(plan, project);
  // 자료 숫자 두 개의 합·차·배수(2~4배)는 계산한 값으로 본다 (예: 6,800 + 7,500 = 14,300)
  const base = [...known].filter((n) => n >= 100);
  const derived = (n) => base.some((a) => [2, 3, 4].some((k) => a * k === n))
    || base.some((a) => base.some((b) => a + b === n || Math.abs(a - b) === n));
  const unknown = [...new Set(prices(text))].filter((n) => !known.has(n) && !derived(n));
  // 합계·차액처럼 계산한 숫자일 수 있어 경고로만
  if (unknown.length) add(unknown.length > 2 ? 'error' : 'warn', `자료에 없는 금액: ${unknown.slice(0, 6).map((n) => `${n.toLocaleString()}원`).join(', ')} (계산한 값이 아니라면 확인 필요)`);

  // 3) 같은 어미 반복: 평범한 "~요"(어요/에요/해요 등) 문장이 계속 이어지는지
  const SPECIAL = /(더라고요|거든요|네요|죠|지요|던데요|잖아요|는데요|군요|래요|고요|구요|나요|까요|세요|데요)$/;
  const sentences = (key === 'blog' || key === 'threads' ? text : '')
    .split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim().replace(/[.!?~)\s]+$/, '')).filter((s) => s.length > 6);
  let run = 0;
  for (const s of sentences) {
    run = /요$/.test(s) && !SPECIAL.test(s) ? run + 1 : 0;
    if (run >= 6) { add('warn', '"~어요/~에요" 같은 평범한 말끝이 6문장 연속 (더라고요·거든요·네요 등 섞기)'); break; }
  }

  // 4) 플랫폼별
  if (L.sec) {
    const sec = estimateSec(out.scenes);
    if (sec < L.sec[0] || sec > L.sec[1]) add('warn', `예상 길이 ${Math.round(sec)}초 (권장 ${L.sec[0]}~${L.sec[1]}초)`);
    if (out.scenes.length < L.scenes[0] || out.scenes.length > L.scenes[1]) add('warn', `장면 ${out.scenes.length}개 (권장 ${L.scenes[0]}~${L.scenes[1]}개)`);
    const longCaps = out.scenes.filter((s) => s.caption.length > CAPTION_MAX);
    if (longCaps.length) add('warn', `화면 자막이 긴 장면 ${longCaps.length}개 (${CAPTION_MAX}자 넘음): "${longCaps[0].caption}"`);
    const hookLines = String(out.hook || '').split('\n');
    if (!out.hook) add('error', '첫 화면 문구(hook)가 없음');
    else if (hookLines.some((l) => l.length > HOOK_LINE_MAX)) add('warn', `훅 한 줄이 ${HOOK_LINE_MAX}자 넘음: "${out.hook}"`);
    if (/^(안녕|오늘은|여러분)/.test(out.scenes[0]?.narration || '')) add('warn', '첫 나레이션이 인사/도입으로 시작 (훅이 약함)');
    const norm = (x) => String(x || '').replace(/[\s\n.,!?~·]/g, '');
    const h = norm(out.hook);
    const n0 = norm(out.scenes[0]?.narration);
    if (h.length >= 4 && (n0.includes(h) || (h.length >= 8 && n0.includes(h.slice(0, 8))))) add('warn', '훅(화면 제목)과 첫 나레이션이 같은 문장 (첫 나레이션은 다른 말로)');
    const shots = out.scenes.map((s) => s.shot);
    if (key !== 'longform' && new Set(shots).size < shots.length) add('warn', '같은 장면을 두 번 사용');
    const bad = new Set((plan.shots || []).filter((s) => s.quality === 'bad').map((s) => s.ref));
    const usedBad = shots.filter((s) => bad.has(s));
    if (usedBad.length) add('warn', `품질 낮은 장면 사용: ${usedBad.join(', ')}`);
    if (key === 'longform' && !out.scenes.some((s) => s.chapter)) add('warn', '챕터가 없음');
    const longPrice = out.scenes.filter((s) => s.price_tag.length > 16);
    if (longPrice.length) add('warn', `가격 표시가 긴 장면 ${longPrice.length}개 (16자 넘음): "${longPrice[0].price_tag}"`);
    if (key !== 'longform') {
      const longNarr = out.scenes.filter((s) => s.narration.replace(/\s/g, '').length > 45);
      if (longNarr.length) add('warn', `나레이션이 긴 장면 ${longNarr.length}개 (공백 제외 45자 넘음)`);
    }
  }
  // 장소 이름 핵심(연도·○·공백 제외): "2026 ○○강 억새축제" → "강억새축제"
  const place = String(plan.place_name || '').replace(/^\s*\d{4}\s*/, '').replace(/[\s○●◯()]/g, '');
  const cores = place.length >= 3 ? [place.slice(0, 3), place.slice(-3)] : [place];
  if (out.hashtags && place.length >= 2 && !out.hashtags.some((t) => cores.some((c) => t.includes(c)))) {
    add('warn', `해시태그에 장소 이름(${plan.place_name})이 없음`);
  }
  if (L.tags && out.hashtags) {
    const max = Array.isArray(L.tags) ? L.tags[1] : L.tags;
    const min = Array.isArray(L.tags) ? L.tags[0] : 1;
    if (out.hashtags.length > max) add('warn', `해시태그 ${out.hashtags.length}개 (최대 ${max}개)`);
    if (out.hashtags.length < min) add('warn', `해시태그 ${out.hashtags.length}개 (최소 ${min}개)`);
  }
  if (key === 'carousel') {
    const n = out.slides.length;
    if (n < L.slides[0] || n > L.slides[1]) add('warn', `캐러셀 ${n}장 (권장 ${L.slides[0]}~${L.slides[1]}장)`);
    const longHead = out.slides.filter((s) => s.headline.split('\n').some((l) => l.length > 16));
    if (longHead.length) add('warn', `제목이 긴 장 ${longHead.length}개 (한 줄 16자 넘음)`);
    if (!/[?？]/.test(out.caption)) add('warn', '캡션에 질문이 없음 (댓글 유도)');
  }
  if (key === 'threads') {
    const n = out.text.length;
    if (n > 500) add('error', `${n}자 (쓰레드 최대 500자)`);
    else if (n > 380) add('warn', `${n}자 (참여가 좋은 길이는 150~350자)`);
    if (n < L.chars[0]) add('warn', `${n}자로 너무 짧음`);
    if (!/[?？]\s*$/.test(out.text.trim().split('\n').pop())) add('warn', '마지막이 질문이 아님 (답글 유도)');
    if (/#\S/.test(out.text)) add('warn', '본문에 해시태그 (주제 태그 1개만 따로)');
  }
  if (key === 'blog') {
    const body = out.sections.map((s) => s.body).join('\n');
    const n = body.replace(/\s/g, '').length;
    // 쓸 만한 장면 수에 맞춘 최소 분량 (장면이 적으면 짧아도 됨)
    const usable = (plan.shots || []).filter((s) => s.quality !== 'bad').length || 8;
    const minChars = Math.max(900, Math.min(L.chars[0] + 300, usable * 120));
    if (n < minChars || n > L.chars[1]) add('warn', `본문 ${n}자 (공백 제외, 이 자료 기준 권장 ${minChars}~${L.chars[1]}자)`);
    if (/(영상으로 담|사진에도 .{0,6}찍혀|영상만 봐도|사진만 봐도|사진 한 장에)/.test(body)) add('warn', '촬영 과정 이야기("영상으로 담았죠" 등) — 보이는 것을 쓰기');
    const k = out.sections.length;
    if (k < L.sections[0] || k > L.sections[1]) add('warn', `섹션 ${k}개 (권장 ${L.sections[0]}~${L.sections[1]}개)`);
    const photos = out.sections.filter((s) => s.shot).length;
    if (photos < 4) add('warn', `사진 ${photos}장 (4장 이상 권장)`);
    if (!/(아쉬|단점|불편|웨이팅|대기|주의|다만|흠)/.test(body)) add('warn', '아쉬운 점이 없음 (신뢰도)');
    if (!/(📍|위치|주소|⏰|영업|운영|주차|🚗)/.test(body)) add('warn', '방문 정보(위치·시간·주차)가 없음');
    if (/위 사진은|아래 사진은|사진에서 보시는/.test(body)) add('warn', '사진 설명체("위 사진은")');
    if (out.title.length > 35) add('warn', `제목 ${out.title.length}자 (32자 이내 권장)`);
  }

  const score = Math.max(0, 100 - issues.reduce((a, i) => a + (i.level === 'error' ? 25 : 8), 0));
  return { score, issues };
}

export function lintPlan(plan, project, keys) {
  return Object.fromEntries(keys.filter((k) => plan[k]).map((k) => [k, lintOutput(k, plan[k], plan, project)]));
}
