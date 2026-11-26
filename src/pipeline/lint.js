// 규칙 검사 (AI 없이 바로): 길이·개수·금지 표현·근거 없는 가격 등
// 결과: { score: 0~100, issues: [{ level: 'error'|'warn', msg }] }
import { storyboardFor } from '../guides/storyboards.js';
import { musicOnly, baseKey } from '../config.js';

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
  if (['shorts', 'reels', 'tiktok', 'longform'].includes(baseKey(key))) {
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
  const L = LIMITS[baseKey(key)] || {};
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
    const silent = musicOnly(key); // 말 없는 음악+글자 판: 나레이션 규칙 대신 컷 글자 검사
    const cutCount = out.scenes.reduce((a, s) => a + 1 + (s.extra_shots || []).length, 0);
    const sec = silent ? cutCount * 1.25 : estimateSec(out.scenes);
    // 말 없는 판은 박자 컷이라 짧다 (인스타 인기 음악+글자 릴스 9~19초)
    const range = silent ? [8, 35] : L.sec;
    if (sec < range[0] || sec > range[1]) add('warn', `예상 길이 ${Math.round(sec)}초 (권장 ${range[0]}~${range[1]}초)`);
    const usesBoard = out.scenes.some((s) => (s.extra_shots || []).length); // 스토리보드(빠른 컷)를 쓰면 장면 수 대신 컷 수가 기준
    if (!usesBoard && (out.scenes.length < L.scenes[0] || out.scenes.length > L.scenes[1])) add('warn', `장면 ${out.scenes.length}개 (권장 ${L.scenes[0]}~${L.scenes[1]}개)`);
    const longCaps = out.scenes.filter((s) => s.caption.length > CAPTION_MAX);
    if (longCaps.length) add('warn', `화면 자막이 긴 장면 ${longCaps.length}개 (${CAPTION_MAX}자 넘음): "${longCaps[0].caption}"`);
    const hookLines = String(out.hook || '').split('\n');
    if (!out.hook) add('error', '첫 화면 문구(hook)가 없음');
    if (/@/.test([out.hook, ...out.scenes.flatMap((s) => [s.caption, s.cut_caption, ...(s.cut_captions || []), ...(s.extra_shots || []).map((x) => x?.caption)])].join(' '))) add('error', '화면 글자에 @ 가 있음 (친구 태그 표현은 쓰지 않는다)');
    else if (hookLines.some((l) => l.length > HOOK_LINE_MAX)) add('warn', `훅 한 줄이 ${HOOK_LINE_MAX}자 넘음: "${out.hook}"`);
    if (/^(안녕|오늘은|여러분)/.test(out.scenes[0]?.narration || '')) add('warn', '첫 나레이션이 인사/도입으로 시작 (훅이 약함)');
    // 인기 리뷰 쇼츠는 첫마디가 의견·반전·가격 ("절대 다시 안 가", "아직 안 죽었다"). 누구랑 언제 갔는지는 뒤로
    else if (key !== 'longform' && /^(동료|친구|가족|엄마|아빠|남편|아내|와이프|남친|여친|애들|아이|회사|오늘|어제|주말|퇴근|점심|저녁)/.test(out.scenes[0]?.narration || '')) {
      add('warn', '첫 나레이션이 상황 설명(누구랑·언제)으로 시작. 첫마디는 의견·반전·가격으로 ("이 가격에 이게 나와?")');
    }
    // 인기 리뷰 쇼츠는 영상의 86~97% 동안 말한다 → 숏폼에서 나레이션 없는 장면은 오류 (docs/evals/2026-11-24-reference-shorts.md)
    if (silent) {
      // 컷마다 그 컷에 보이는 것 한 줄 (말이 없으니 글자가 유일한 정보)
      const missing = [];
      const long = [];
      out.scenes.forEach((s, i) => {
        const n = 1 + (s.extra_shots || []).length;
        const caps = n >= 2 ? (s.cut_captions?.length ? s.cut_captions : [s.cut_caption, ...(s.extra_shots || []).map((x) => x?.caption)]) : [s.caption];
        for (let j = 0; j < n; j++) {
          const c = String(caps[j] || (n >= 2 && j === 0 ? s.caption : '') || '').trim();
          if (!c) missing.push(`${i + 1}번 장면 ${j + 1}번째 컷`);
          else if (c.length > 14) long.push(`"${c}"`);
        }
      });
      if (missing.length) add(missing.length >= 3 ? 'error' : 'warn', `화면 글자가 없는 컷: ${missing.slice(0, 5).join(', ')}. 말 없는 판은 컷마다 그 컷에 보이는 것 한 줄 (4~12자)`);
      if (long.length) add('warn', `컷 글자가 길다 (14자 넘음, 1초 안에 못 읽음): ${long.slice(0, 3).join(', ')}`);
      if (out.scenes.some((s) => String(s.narration || '').trim())) add('warn', '말 없는 판인데 나레이션이 있음 (목소리는 넣지 않으니 비운다)');
      if (plan.storyboard?.beats?.length) {
        const minSec = storyboardFor(plan.concept).totalSec[0];
        if (sec < minSec * 0.75) add('error', `컷이 ${cutCount}개뿐이라 영상이 ≈${Math.round(sec)}초 (기준 ${Math.round(minSec * 0.75)}초 이상). 스토리보드 컷을 빠짐없이 쓴다`);
      }
    }
    if (key !== 'longform' && !silent) {
      const silent = out.scenes.map((s, i) => (String(s.narration || '').trim() ? 0 : i + 1)).filter(Boolean);
      if (silent.length) add('error', `나레이션이 없는 장면: ${silent.join(', ')}번. 숏폼은 끝까지 쉬지 않고 말한다 (마지막 장면도 팁 한마디)`);
      // 인기 맛집 영상은 장면 끝을 이어지는 말끝(~인데, ~고, ~까지)으로 맺는다. 장면마다 '~요.'로 끊으면 멈추는 느낌 (docs/research/scripts.md)
      const mids = out.scenes.slice(0, -1).map((s) => String(s.narration || '').trim()).filter(Boolean);
      const stops = mids.filter((n) => /(요|다|죠|니다)[.!]?$/.test(n) && !/[?]$/.test(n)).length;
      if (mids.length >= 3 && stops / mids.length > 0.5) add('warn', `장면 ${mids.length}개 중 ${stops}개가 "~요."로 끝남. 이어지는 말끝(~인데, ~고, ~까지)으로 다음 장면에 넘긴다`);
      // 말과 화면 맞추기: 컷이 여러 개인 장면은 구절 수 = 컷 수여야 컷이 구절 끝에서 바뀐다
      const off = out.scenes.map((s, i) => {
        const n = 1 + (s.extra_shots || []).length;
        const c = String(s.narration || '').split(/(?<=[.,!?~…])s*/).filter((x) => x.replace(/[s.,!?~…]/g, '')).length;
        return n >= 2 && c !== n ? `${i + 1}번(컷 ${n}개, 구절 ${c}개)` : '';
      }).filter(Boolean);
      if (off.length) add('warn', `컷 수와 나레이션 구절 수가 다른 장면: ${off.join(', ')}. 컷마다 그 컷에 보이는 것을 한 구절씩 (쉼표·마침표로 나눔)`);
      // 끝은 볼 사람에게 쓸모 있는 팁 한마디 (저장·방문으로 이어짐). 사실만 말하고 끝나면 영상이 뚝 끊긴 느낌
      const last = String(out.scenes.at(-1)?.narration || '');
      if (last && !/[?？]\s*$/.test(last) && !/(세요|하면|면 돼|챙기|추천|꼭|피해|예약|팁|가 좋|게 좋|드셔|시키|노려|가시|오세|기억|저장|조심|주의|챙겨|가면|전에|마세요)/.test(last)) {
        add('error', `마지막 나레이션이 팁 없이 끝남: "${last}". 마지막 장면은 팁 한마디나 댓글 질문으로 끝낸다 (예: "겉옷은 따로 챙기세요", "7시 전에 가면 바로 앉아요")`);
      }
    }
    const norm = (x) => String(x || '').replace(/[\s\n.,!?~·]/g, '');
    const h = norm(out.hook);
    const n0 = norm(out.scenes[0]?.narration);
    if (!silent && h.length >= 4 && (n0.includes(h) || (h.length >= 8 && n0.includes(h.slice(0, 8))))) add('warn', '훅(화면 제목)과 첫 나레이션이 같은 문장 (첫 나레이션은 다른 말로)');
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
    // 같은 영상에서 8초 안쪽의 장면을 여러 번 쓰면 같은 화면이 반복돼 보인다 (컷 전체 기준)
    if (key !== 'longform') {
      const refOf = (x) => (typeof x === 'string' ? x : x?.shot || '');
      const cuts = out.scenes.flatMap((s) => [s.shot, ...(s.extra_shots || []).map(refOf)]).filter(Boolean);
      const timeOf = (ref) => {
        const [mid, f] = String(ref).split(':f');
        const m = (project?.media || []).find((x) => x.id === mid);
        return m && f !== undefined ? m.frames?.[Number(f)]?.time : undefined;
      };
      const framingOf = new Map((plan.shots || []).map((s) => [s.ref, s.framing]));
      const near = [];
      for (let i = 0; i < cuts.length; i++) {
        for (let j = i + 1; j < cuts.length; j++) {
          const a = timeOf(cuts[i]); const b = timeOf(cuts[j]);
          const fa = framingOf.get(cuts[i]); const fb = framingOf.get(cuts[j]);
          if (cuts[i].split(':')[0] === cuts[j].split(':')[0] && (cuts[i] === cuts[j] || (a !== undefined && b !== undefined && Math.abs(a - b) < 8) || (fa && fa === fb))) near.push(`${cuts[i]}~${cuts[j]}`);
        }
      }
      if (near.length) add('error', `같은 화면이 반복되는 컷: ${near.slice(0, 4).join(', ')} (같은 영상 8초 안쪽이거나 같은 구도). 영상 하나에서 한 컷만 쓴다`);
    }
    // 스토리보드 컷 길이: 나레이션이 길면 컷이 늘어져 기준(인기 쇼츠)보다 느려진다 → 오류로 보고 자동 보완
    // 스토리보드 기준 길이보다 짧은 영상 (나레이션이 너무 짧음) → 오류로 보고 자동 보완
    if (key !== 'longform' && !silent && plan.storyboard?.beats?.length) {
      const minSec = storyboardFor(plan.concept).totalSec[0];
      const chars = out.scenes.reduce((a, s) => a + String(s.narration || '').replace(/\s/g, '').length, 0);
      // 숏폼 목소리는 +18% 빨라 실제로 1초에 7~8자 (11/25 측정: 67자 5장면 → 10.1초) → 짧은 쪽은 빠르게 잡는다
      const est = chars / 7.5 + out.scenes.length * 0.25;
      if (est < minSec) add('error', `영상이 너무 짧음 (나레이션 공백 빼고 ${chars}자 ≈ ${Math.round(est)}초, 기준 ${minSec}초 이상 → 나레이션을 ${Math.round((minSec - out.scenes.length * 0.25) * 7.5)}자 이상으로)`);
      // 컷 수에 비해 나레이션이 길면 컷이 늘어져 인기 쇼츠(맛집 평균 컷 1.5~1.8초)보다 느려진다
      const tpl = storyboardFor(plan.concept);
      const cutsN = out.scenes.reduce((a, s) => a + 1 + (s.extra_shots || []).length, 0);
      const target = Math.max(minSec, Math.min(tpl.totalSec[1], cutsN * ((tpl.cutSec[0] + tpl.cutSec[1]) / 2)));
      if (est > target * 1.1) add(est > target * 1.2 ? 'error' : 'warn', `컷 ${cutsN}개에 나레이션이 길어 컷이 느려짐 (≈${Math.round(est)}초, 목표 ${Math.round(target)}초 → 나레이션을 공백 빼고 ${Math.round((target - out.scenes.length * 0.25) * 7.5)}자 안팎으로)`);
    }
    if (key !== 'longform' && !silent && plan.storyboard?.beats?.length) {
      const hi = storyboardFor(plan.concept).cutSec[1];
      const slow = [];
      let firstSlow = false;
      out.scenes.forEach((s, i) => {
        const cutsN = 1 + (s.extra_shots || []).length;
        const chars = String(s.narration || '').replace(/\s/g, '').length;
        const perCut = Math.max(2.2, chars / 6 + 0.9) / cutsN;
        // 첫 컷은 더 엄격하게: 인기 쇼츠의 첫 컷은 1.3~2.5초 (우리 릴스는 5.2초였음)
        const limit = i === 0 ? hi * 1.25 : hi * 1.4;
        if (perCut > limit) {
          // 첫 장면·마지막 장면(사진 한 장인 경우가 많음)이 오래 멈춰 있으면 바로 이탈 → 오류
          if (i === 0 || i === out.scenes.length - 1) firstSlow = true;
          slow.push(`${i + 1}번(${chars}자, 컷 ${cutsN}개 → 공백 빼고 ${Math.max(6, Math.floor(((i === 0 ? hi * 1.1 : hi * 1.2) * cutsN - 0.9) * 6))}자 이하)`);
        }
      });
      if (slow.length) add(slow.length >= 2 || firstSlow ? 'error' : 'warn', `컷이 기준(${hi}초)보다 오래 머무는 장면: ${slow.join(', ')}. 나레이션을 줄이거나 그 비트의 컷(extra_shots)을 늘린다${firstSlow ? '. 특히 첫 장면은 2초 안에 다음 컷으로, 마지막 장면(간판·외관 한 컷)은 팁 한마디만 짧게' : ''}`);
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
    // 인기 블로그는 사진 11~41장 (보통 20장 안팎, 사진 1장당 글 75~125자). 쓸 만한 장면은 사진으로도 거의 다 쓴다
    const photos = out.sections.reduce((a, s) => a + (s.shot ? 1 : 0) + (s.extra_shots || []).length, 0);
    const wantPhotos = Math.max(4, Math.round(Math.min(usable, 12) * 0.7));
    if (photos < wantPhotos) add('warn', `사진 ${photos}장 (쓸 만한 장면 ${usable}개 → ${wantPhotos}장 이상 권장, 섹션마다 extra_shots 로 더 넣기)`);
    // 인기 블로그는 한 줄이 짧다 (평균 12~14자, 줄의 80~90%가 22자 이하): 모바일에서 한 줄 = 한 문장
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const longLines = lines.filter((l) => l.length > 45).length;
    if (lines.length && longLines / lines.length > 0.35) add('warn', `긴 줄이 많음 (45자 넘는 줄 ${longLines}/${lines.length}). 한 줄에 한 문장, 긴 문장은 쉼표에서 줄바꿈`);
    if (!/(아쉬|단점|불편|웨이팅|대기|주의|다만|흠)/.test(body)) add('warn', '아쉬운 점이 없음 (신뢰도)');
    if (!/(📍|위치|주소|⏰|영업|운영|주차|🚗)/.test(body)) add('warn', '방문 정보(위치·시간·주차)가 없음');
    if (/위 사진은|아래 사진은|사진에서 보시는/.test(body)) add('warn', '사진 설명체("위 사진은")');
    if (out.title.length > 45) add('warn', `제목 ${out.title.length}자 (40자 안팎 권장, 앞 25자에 검색어)`);
  }

  const score = Math.max(0, 100 - issues.reduce((a, i) => a + (i.level === 'error' ? 25 : 8), 0));
  return { score, issues };
}

export function lintPlan(plan, project, keys) {
  return Object.fromEntries(keys.filter((k) => plan[k]).map((k) => [k, lintOutput(k, plan[k], plan, project)]));
}
