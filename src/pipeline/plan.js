// 대본·글 만들기: ① 자료 분석 → ② 플랫폼별 스킬로 각각 작성 → (필요하면) ③ 수정 요청 반영
import path from 'node:path';
import { z } from 'zod';
import { generate, aiBackend } from '../ai/index.js';
import { loadSkill, loadStyleSamples, recentFeedback } from '../ai/skills.js';
import { smallJpegBase64 } from './media.js';
import { speechText } from './speech.js';
import { FRAMINGS, FRAMING_IDS, storyboardFor, storyboardGuide, scoreStoryboard, autoStoryboard, usableShots } from '../guides/storyboards.js';

export const STORYBOARD_PASS = 75;
const STORYBOARD_KEYS = ['shorts', 'reels', 'tiktok'];

const SPEECH_NOTE = '## 영상 속 말소리 (자동 받아쓰기: 직원 설명·안내 방송·촬영자가 한 말)\n'
  + '- 화면에 없는 정보(메뉴 설명, 가격, 영업시간, 추천)가 있으면 사실로 써도 된다. 누가 한 말인지 모르면 "직원분이 ~래요"처럼 단정하지 말고 "~라고 하더라고요"로.\n'
  + '- 받아쓰기라 글자가 틀릴 수 있다. 화면·메모와 어긋나는 숫자(가격·시간)는 화면·메모를 믿고, 뜻이 안 통하는 문장은 쓰지 않는다.\n'
  + '- 손님 대화·사적인 말(이름, 전화번호, 개인 이야기)은 옮기지 않는다.';
import { CONCEPTS, CONCEPT_BY_ID } from '../guides/concepts.js';

export const CATEGORIES = {
  mart: '마트·시장·상점',
  restaurant: '음식점·카페',
  park_event: '공원·행사·축제',
  other: '기타 장소',
};

/** 만들 결과물. 순서 = 만드는 순서 = 보고 순서 */
export const PLATFORMS = {
  shorts: { label: '유튜브 쇼츠', skill: 'youtube-shorts', type: 'video' },
  reels: { label: '인스타 릴스', skill: 'instagram-reels', type: 'video' },
  tiktok: { label: '틱톡', skill: 'tiktok', type: 'video' },
  longform: { label: '유튜브 롱폼', skill: 'youtube-longform', type: 'video' },
  carousel: { label: '인스타 캐러셀', skill: 'instagram-carousel', type: 'carousel' },
  threads: { label: '쓰레드', skill: 'threads', type: 'text' },
  blog: { label: '블로그', skill: 'naver-blog', type: 'blog' },
};
export const PLATFORM_KEYS = Object.keys(PLATFORMS);
export const VIDEO_KEYS = PLATFORM_KEYS.filter((k) => PLATFORMS[k].type === 'video');

// ---------- 답 형식 ----------

const CONCEPT_IDS = [...CONCEPTS.map((c) => c.id), 'other'];
const AnalysisSchema = z.object({
  category: z.enum(['mart', 'restaurant', 'park_event', 'other']),
  concept: z.enum(CONCEPT_IDS).describe(CONCEPTS.map((c) => `${c.id}=${c.label}`).join(', ') + ', other=기타'),
  place_name: z.string(),
  summary: z.string(),
  key_facts: z.array(z.string()),
  music_prompt: z.string(),
  shots: z.array(z.object({
    ref: z.string().describe("사진 'm3', 영상 장면 'm1:f5'"),
    description: z.string(),
    framing: z.enum(FRAMING_IDS).describe(Object.entries(FRAMINGS).map(([k, v]) => `${k}=${v}`).join(', ')),
    items: z.array(z.object({ name: z.string(), price: z.string(), note: z.string() })),
    quality: z.enum(['good', 'ok', 'bad']),
    skip_reason: z.string(),
  })),
});

const StoryboardOut = z.object({
  hook_title: z.string().describe('첫 컷 위의 큰 제목 2줄(\\n). 한 줄 10자 안팎. 숫자·동네·결론'),
  beats: z.array(z.object({
    beat: z.string().describe('기준의 비트 id (hook, hero, items ...)'),
    shots: z.array(z.string()).describe('이 비트에서 차례로 보여줄 장면 ref. 여러 컷 비트는 2~6개'),
    sec: z.number().describe('이 비트 전체 길이(초) = 컷 수 × 한 컷 길이'),
    label: z.string().describe('번호 이름표(예: "1. 딸기 1팩"). 번호 이름표를 쓰는 컨셉의 목록 비트만, 아니면 빈칸'),
    note: z.string().describe('이 비트에서 말할 핵심 한 줄 (사실만)'),
  })),
});

const SceneOut = z.object({
  shot: z.string().describe("장면 목록의 ref (예: 'm1:f5', 'm3')"),
  extra_shots: z.array(z.string()).describe('같은 나레이션 동안 이어서 보여줄 장면 ref (스토리보드의 나머지 컷). 없으면 빈 배열'),
  label: z.string().describe('화면 위쪽 번호 이름표 (스토리보드의 label). 없으면 빈 문자열'),
  cut_captions: z.array(z.string()).describe('컷이 2개 이상인 장면만: 컷마다 화면에 뜰 짧은 이름 (shot, extra_shots 순서, 각 10자 안팎, 그 컷에 보이는 것). 컷 1개면 빈 배열'),
  narration: z.string(),
  caption: z.string(),
  price_tag: z.string().describe('확인된 가격만. 없으면 빈 문자열'),
  chapter: z.string().describe('롱폼에서 새 챕터가 시작되는 장면만. 아니면 빈 문자열'),
});
const VideoOut = z.object({
  title: z.string(),
  hook: z.string(),
  scenes: z.array(SceneOut),
  description: z.string(),
  hashtags: z.array(z.string()).describe("'#' 없이 단어만"),
});
const LongformOut = VideoOut.extend({
  thumbnail_text: z.string().describe('유튜브 썸네일에 크게 넣을 글자. 2줄(\\n), 한 줄 9자 이내. 숫자·장소·핵심 한 방'),
});
const CarouselOut = z.object({
  slides: z.array(z.object({ shot: z.string(), headline: z.string(), body: z.string() })),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
const ThreadsOut = z.object({ text: z.string(), topic_tag: z.string() });
const BlogOut = z.object({
  title: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    body: z.string(),
    shot: z.string().describe('섹션 대표 사진 ref. 없으면 빈 문자열'),
    extra_shots: z.array(z.string()).describe('같은 섹션에 더 넣을 사진 ref 0~3개 (문단 사이에 들어감). 대표 사진·다른 섹션과 겹치지 않게'),
    facts: z.array(z.string()).describe('이 섹션 본문이 근거로 쓴 사실 카드 번호 (예: ["F3","M2"])'),
  })),
  hashtags: z.array(z.string()),
});
const OUT_SCHEMA = { video: VideoOut, carousel: CarouselOut, text: ThreadsOut, blog: BlogOut };

// ---------- 공통 ----------

const hintText = (project) => {
  const h = project.hints || {};
  return [
    `- 컨셉: ${h.concept && CONCEPT_BY_ID[h.concept] ? `${CONCEPT_BY_ID[h.concept].label} (${h.concept})` : '자동 판단'}`,
    `- 장소 종류: ${h.category && h.category !== 'auto' ? CATEGORIES[h.category] : '자동 판단'}`,
    `- 장소 이름: ${h.placeName || '(없음)'}`,
    `- 촬영자 메모: ${h.memo || '(없음)'}`,
  ].join('\n');
};

const fmtTime = (t) => `${Math.floor(t / 60)}분 ${Math.round(t % 60)}초`;

/** 모든 장면(shot) 목록: 사진은 m3, 영상은 m1:f0, m1:f1 ... */
export function allShots(project) {
  const out = [];
  for (const m of project.media) {
    if (m.kind === 'image') out.push({ ref: m.id, media: m, frame: m.frames[0], time: 0 });
    else m.frames.forEach((f, i) => out.push({ ref: `${m.id}:f${i}`, media: m, frame: f, time: f.time }));
  }
  return out;
}

function shotTable(plan, project) {
  const byRef = new Map(allShots(project).map((s) => [s.ref, s]));
  return plan.shots.map((s) => {
    const info = byRef.get(s.ref);
    const where = info?.media.kind === 'video' ? `영상 ${fmtTime(info.time)} 지점` : '사진';
    const items = s.items.map((i) => `${i.name}${i.price ? ` ${i.price}` : ''}${i.note ? ` (${i.note})` : ''}`).join(', ');
    return `${s.ref} | ${where} | ${s.framing || '-'} | ${s.quality}${s.skip_reason ? `(${s.skip_reason})` : ''} | ${s.description}${items ? ` | ${items}` : ''}`;
  }).join('\n');
}

/**
 * 사실 카드: 글에 쓸 수 있는 근거를 번호 붙인 짧은 문장으로 (M=촬영자 메모, F=분석 결과·장면)
 * 블로그처럼 긴 글은 이 카드에 있는 것만으로 쓰게 한다.
 */
export function factCards(project, plan) {
  const cards = [];
  const memo = String(project.hints?.memo || '');
  memo.split(/(?<=[.!?。])\s+|\n+|,\s*(?=[가-힣])/).map((x) => x.trim()).filter((x) => x.length > 1)
    .forEach((x, i) => cards.push(`M${i + 1}. ${x}`));
  // S = 영상 속 말소리 (직원 설명·안내 방송·촬영자가 한 말)
  let k = 0;
  for (const m of project.media || []) {
    for (const s of m.speech?.segments || []) {
      cards.push(`S${++k}. [${m.id} ${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, '0')}] "${s.text}"`);
    }
  }
  let n = 0;
  const add = (t) => { if (t && String(t).trim()) cards.push(`F${++n}. ${String(t).trim()}`); };
  (plan.key_facts || []).forEach(add);
  for (const s of plan.shots || []) {
    if (s.quality === 'bad') continue;
    add(`[${s.ref}] ${s.description}`);
    for (const it of s.items || []) add(`[${s.ref}] ${it.name}${it.price ? ` ${it.price}` : ''}${it.note ? ` (${it.note})` : ''}`);
  }
  return cards;
}

export async function contextText(project, plan, key) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const parts = [
    `## 오늘 날짜: ${today}`,
    '- 행사·할인·팝업 기간이 오늘 이전에 끝났다면 "지금 가세요"라고 쓰지 않는다. 단, 훅·첫 문장은 볼거리(풍경·음식·가격)로 시작하고, "올해는 ○일에 끝남·내년 참고"는 마지막 장면·설명란·마무리에만 한 번 쓴다. 기간이 남아 있으면 끝나는 날을 강조한다.',
    '',
    '## 촬영자 정보', hintText(project), '',
    '## 자료 분석 결과',
    `- 컨셉: ${CONCEPT_BY_ID[plan.concept]?.label || '기타'}`,
    `- 장소 종류: ${CATEGORIES[plan.category]}`,
    `- 장소 이름: ${plan.place_name || '(모름)'}`,
    `- 요약: ${plan.summary}`,
    '- 핵심 사실:', ...plan.key_facts.map((f) => `  - ${f}`), '',
    '## 장면 목록 (ref | 위치 | 구도 | 품질 | 보이는 것 | 상품·가격)', shotTable(plan, project),
  ];
  if (STORYBOARD_KEYS.includes(key) && plan.storyboard?.beats?.length) parts.push('', storyboardText(plan, key));
  const heard = speechText(project);
  if (heard) parts.push('', SPEECH_NOTE, heard);
  if (key === 'blog' || key === 'factcheck') {
    parts.push('', '## 사실 카드 (글의 모든 정보 문장은 이 카드에 근거해야 함. M=촬영자 메모: 감상·맛·경험은 M 카드에 있을 때만. S=영상 속 말소리 받아쓰기)', ...factCards(project, plan));
  }
  const style = await loadStyleSamples();
  if (style) parts.push('', '## 촬영자가 예전에 쓴 글 (이 말투와 표현을 닮게 쓴다. 내용은 베끼지 않는다)', style);
  const fb = await recentFeedback(key);
  if (fb.length) parts.push('', '## 촬영자가 예전에 요청한 수정 (취향으로 반영)', ...fb.map((f) => `- ${f}`));
  return parts.join('\n');
}

/** 컨셉 스킬에서 "콘텐츠 전략" 부분만 */
async function conceptStrategy(concept) {
  if (!CONCEPT_BY_ID[concept]) return '';
  const text = await loadSkill(`concept-${concept}`);
  const i = text.indexOf('## 2. 콘텐츠 전략');
  const j = text.indexOf('## 공통 촬영 팁');
  return i >= 0 ? text.slice(i, j > i ? j : undefined).replace('## 2. 콘텐츠 전략', '').trim() : '';
}

/** 블로그 카테고리별 작성법 (.claude/skills/naver-blog/categories/<concept>.md) */
async function blogCategoryGuide(concept) {
  try {
    const fs = await import('node:fs/promises');
    const { ROOT } = await import('../config.js');
    const dir = path.join(ROOT, '.claude', 'skills', 'naver-blog');
    const cat = (await fs.readFile(path.join(dir, 'categories', `${CONCEPT_BY_ID[concept] ? concept : 'other'}.md`), 'utf8')).trim();
    const ex = await fs.readFile(path.join(dir, 'examples.md'), 'utf8').catch(() => '');
    return [cat, ex.trim()].filter(Boolean).join('\n\n');
  } catch { return ''; }
}

async function platformSystem(key, extra = '', concept = '') {
  const p = PLATFORMS[key];
  const strategy = await conceptStrategy(concept);
  const blogCat = key === 'blog' ? await blogCategoryGuide(concept) : '';
  return [
    '당신은 한국에서 동네 가게·맛집·행사를 소개하는 1인 크리에이터의 대본 작가입니다.',
    '촬영자가 직접 다녀와 찍은 자료로, 촬영자 본인이 쓴 것처럼 1인칭으로 씁니다.',
    '장면은 반드시 장면 목록의 ref만 씁니다. 가격·날짜·시간은 분석 결과에 있는 것만 씁니다.',
    extra,
    '', '# 공통 규칙', await loadSkill('humanize-korean'),
    '', `# ${p.label} 스킬`, await loadSkill(p.skill),
    strategy ? `\n# 이 컨셉(${CONCEPT_BY_ID[concept].label})의 콘텐츠 전략\n${strategy}` : '',
    blogCat ? `\n# 이 컨셉의 블로그 작성법\n${blogCat}` : '',
  ].join('\n');
}

// ---------- ① 분석 ----------

async function analyze(project, dir) {
  const content = [{
    type: 'text',
    text: `## 촬영자 정보\n${hintText(project)}\n\n아래에 사진·영상 장면이 있습니다. 모든 ref에 대해 shots를 하나씩 작성하세요.`,
  }];
  const heard = speechText(project);
  if (heard) content.push({ type: 'text', text: `${SPEECH_NOTE}\n${heard}` });
  for (const s of allShots(project)) {
    const label = s.media.kind === 'video'
      ? `[${s.ref}] 영상 ${s.media.id}의 ${fmtTime(s.time)} 지점`
      : `[${s.ref}] 사진`;
    content.push({ type: 'text', text: label });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: await smallJpegBase64(path.join(dir, 'work', s.frame.file)) },
    });
  }
  return generate({
    system: await loadSkill('content-analyze'),
    content,
    schema: AnalysisSchema,
    label: '자료 분석',
  });
}

// ---------- ①-2 스토리보드 (세로 숏폼의 컷 순서·구도·길이를 대본보다 먼저) ----------

function shotInfoMap(plan, project) {
  const time = new Map(project ? allShots(project).map((x) => [x.ref, x.time]) : []);
  return new Map((plan.shots || []).map((s) => [s.ref, { framing: s.framing, quality: s.quality, time: time.get(s.ref) ?? 0 }]));
}

/** 세로 숏폼 목표 길이(초): 스토리보드 컷 수 × 컨셉 기준 한 컷 길이(가운데 값), 기준 최소 길이 이상 */
export function targetSeconds(plan) {
  const tpl = storyboardFor(plan.concept);
  const cuts = (plan.storyboard?.beats || []).reduce((a, b) => a + (b.shots?.length || 0), 0);
  const ideal = (tpl.cutSec[0] + tpl.cutSec[1]) / 2;
  return Math.max(tpl.totalSec[0], Math.min(tpl.totalSec[1], cuts * ideal));
}

/** 대본 작성 때 보여줄 스토리보드 */
function storyboardText(plan, key) {
  const sb = plan.storyboard;
  // 목표 길이 = 컷 수 × 기준 한 컷 길이 (컷이 적은데 말을 길게 하면 컷이 늘어져 인기 쇼츠보다 느려진다)
  const sbTotal = targetSeconds(plan);
  const lines = [
    `## 스토리보드 (점수 ${sb.score}/100, 인기 쇼츠 기준과 비교해 통과한 컷 구성)`,
    `- 첫 컷 제목: ${String(sb.hook_title || '').replace(/\n/g, ' / ')}`,
    ...sb.beats.map((b, i) => `${i + 1}. [${b.beat}] 컷 ${b.shots.join(', ')} · ${b.sec}초${b.label ? ` · 이름표 "${b.label}"` : ''}${b.note ? ` · ${b.note}` : ''}`),
    '',
    '### 스토리보드로 장면 쓰는 법 (스킬의 장면 구성보다 이것이 우선)',
    '- 비트 하나 = 장면 하나. 장면의 shot 은 그 비트의 첫 컷, extra_shots 는 나머지 컷 (같은 나레이션 동안 빠르게 이어짐).',
    '- 항목마다 반복하는 비트(이름표가 다른 컷들)는 항목마다 장면을 나눠도 된다. 이때 label 은 그 항목의 이름표.',
    `- **나레이션 전체 분량: 공백 빼고 ${Math.round(sbTotal * 6)}자 안팎** (스토리보드 ${Math.round(sbTotal)}초 × 1초에 약 6자. 인기 리뷰 쇼츠는 영상 내내 말한다). 이보다 크게 짧으면 영상이 기준보다 짧아진다.`,
    '- 장면마다 나레이션은 그 비트 길이 × 6자 정도. 컷이 여러 개인 장면은 그만큼 길게 말하고, 컷이 1개인 장면만 12자 안팎으로 짧게.',
    '- 첫 장면 나레이션은 10자 안팎의 의견·반전·가격 한마디 ("이 가격에 이게 나와?", "여긴 앉아만 있으면 돼"). 누구랑·언제 갔는지 같은 상황 설명으로 시작하지 않는다. 첫 컷은 2초 안에 넘어간다.',
    '- 모든 장면에 나레이션이 있다. 인기 리뷰 쇼츠는 영상의 90% 가까이 쉬지 않고 말한다. 마지막 장면도 팁 한마디로 끝낸다 (화면 글자만 두고 말을 비우지 않는다).',
    '- 스토리보드에 없는 컷을 더하지 않는다. 같은 영상에서 8초 안쪽의 장면(m3:f0과 m3:f1)은 거의 같은 화면이라 함께 쓰지 않는다.',
    '- label 은 스토리보드의 이름표를 그대로. 이름표가 없는 비트는 빈칸.',
    '- 컷이 2개 이상인 장면은 cut_captions 에 컷마다 그 컷에 보이는 것의 짧은 이름(메뉴·상품·장소, 10자 안팎)을 적는다. 인기 쇼츠는 컷이 바뀌면 이름도 바뀐다 (한 컷에 한 정보). 이때 caption 은 비워도 된다.',
  ];
  if (key !== 'shorts') lines.push('- 쇼츠와 같은 스토리보드를 쓰되, 첫 컷은 hook 비트의 다른 후보로 바꾸거나 비트 안의 컷 순서를 바꿔 겹치지 않게 해도 된다. 비트 순서는 지킨다.');
  return lines.join('\n');
}

/**
 * 스토리보드 만들기: 기준(인기 쇼츠 분석)에 맞춰 컷을 고르고 점수를 매긴다.
 * 기준 점수(75) 미만이면 고칠 점을 알려주고 한 번 더 짠다. 그래도 낮으면 더 높은 쪽을 쓴다.
 */
export async function makeStoryboard(project, plan) {
  const concept = plan.concept;
  const info = shotInfoMap(plan, project);
  const tpl = storyboardFor(concept);
  const usable = usableShots(info);
  const base = [
    '## 이 컨셉의 스토리보드 기준 (인기 쇼츠를 컷 단위로 분석한 결과)', storyboardGuide(concept), '',
    '## 장면 목록 (ref | 위치 | 구도 | 품질 | 보이는 것 | 상품·가격)', shotTable(plan, project), '',
    `## 쓸 수 있는 서로 다른 장면 ${usable.length}개 (이 중 최소 ${Math.min(tpl.minCuts || 6, usable.length)}개 이상을 컷으로)`,
    usable.join(', '), '',
    `## 자료 요약\n- 장소: ${plan.place_name || '(모름)'}\n- ${plan.summary}\n- 핵심 사실: ${(plan.key_facts || []).join(' / ')}`,
  ].join('\n');
  const system = [
    '당신은 한국 숏폼(쇼츠·릴스·틱톡) 편집자입니다. 대본을 쓰기 전에 컷 구성(스토리보드)만 짭니다.',
    '- 기준의 비트 순서를 지키고, 각 비트에는 구도가 맞는 장면 ref 를 고릅니다. 품질 bad 장면은 쓰지 않습니다.',
    '- 같은 장면을 두 번 쓰지 않습니다. **같은 영상의 장면(m3:f0, m3:f1)은 연달아 두지 않습니다** (화면이 거의 같아 한 컷처럼 보임). 다른 자료와 번갈아 놓습니다.',
    '- 각 컷의 구도는 그 비트의 기준 구도 안에서 고릅니다. 맞는 좋은 장면이 없는 비트(꼭이 아닌 것)는 **억지로 채우지 말고 뺍니다**.',
    '- 비트의 note(말할 내용)는 그 비트 화면에 보이는 것과 맞아야 합니다 (음식 화면에 "테이블 간격 좁음" 같은 말 금지).',
    '- 마지막 비트는 보는 사람의 다음 행동에 도움 되는 정보(위치·웨이팅·주문 팁·가는 법)로 끝냅니다. 아쉬운 점으로만 끝내지 않고, 아쉬운 점은 팁으로 바꿔 씁니다 (예: "냄새 배니 겉옷은 맡기고").',
    '- **쓸 수 있는 장면은 아끼지 말고 많이 씁니다.** 인기 쇼츠는 13초에 12컷, 30초에 20컷처럼 컷이 많습니다. 같은 영상이라도 8초 넘게 떨어진 장면은 다른 컷입니다. 여러 컷 비트(hero, more 등)에 2~4컷씩 넣습니다.',
    '- sec 는 컷 수 × 기준 한 컷 길이로 맞춥니다. 전체 길이도 기준 범위 안으로 (기준 최소 길이보다 짧으면 안 됩니다).',
    tpl.label ? '- 목록 비트의 컷마다 label 에 "번호. 이름(+용량·가격)"을 적습니다. 이름은 장면 목록에 있는 것만.' : '- label 은 모두 빈칸.',
    '- note 에는 그 비트에서 전할 사실 한 줄 (장면 목록·자료 요약에 있는 것만).',
  ].join('\n');

  const attempts = [];
  let feedback = '';
  for (let i = 0; i < 3; i++) {
    const sb = await generate({
      system,
      content: [{ type: 'text', text: `${base}${feedback}\n\n위 기준으로 세로 숏폼 스토리보드를 짜 주세요.` }],
      schema: StoryboardOut,
      label: '스토리보드',
    });
    sb.beats = (sb.beats || []).map((b) => ({ ...b, shots: (b.shots || []).filter((r) => info.has(r)), sec: Number(b.sec) || 0 }))
      .filter((b) => b.shots.length);
    const r = scoreStoryboard(sb, concept, info);
    attempts.push({ ...sb, ...r });
    if (r.score >= STORYBOARD_PASS) break;
    feedback = `\n\n## 지난 스토리보드가 기준에 못 미쳤어요 (${r.score}점). 고칠 점:\n${r.issues.map((x) => `- ${x}`).join('\n')}`;
  }
  const best = attempts.reduce((a, b) => (b.score > a.score ? b : a));
  console.log(`[storyboard] ${concept}: ${attempts.map((a) => a.score).join(' → ')}점 (${best.stats.cuts}컷, 평균 ${best.stats.avgCut}초)`);
  return { ...best, concept, attempts: attempts.map((a) => ({ score: a.score, issues: a.issues })) };
}

// ---------- ② 플랫폼별 ----------

export async function writePlatform(key, project, plan, siblings = '') {
  const ctx = await contextText(project, plan, key);
  return generate({
    system: await platformSystem(key, '', plan.concept),
    content: [{ type: 'text', text: `${ctx}${siblings ? `\n\n${siblings}` : ''}\n\n위 자료로 ${PLATFORMS[key].label} 결과물을 써주세요.` }],
    schema: key === 'longform' ? LongformOut : OUT_SCHEMA[PLATFORMS[key].type],
    label: PLATFORMS[key].label,
  });
}

/** 동시에 n개씩 실행 */
export async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

/**
 * 계획 만들기
 * @param {(step:string, ratio:number)=>void} [onStep]
 */
export async function makePlan(project, dir, onStep = () => {}) {
  const backend = await aiBackend();
  if (backend === 'off') return finalizePlan(mockPlan(project), project);

  onStep('AI가 사진·영상을 살펴보는 중', 0);
  const analysis = await analyze(project, dir);
  const plan = { _source: backend, ...analysis };

  onStep('스토리보드 짜는 중 (인기 쇼츠 기준과 비교)', 0.2);
  try {
    plan.storyboard = await makeStoryboard(project, plan);
  } catch (err) {
    console.warn('[storyboard] AI 스토리보드 실패, 기본 틀 사용:', err.message);
    const sb = autoStoryboard(plan.concept, plan.shots || []);
    plan.storyboard = { ...sb, ...scoreStoryboard(sb, plan.concept, shotInfoMap(plan, project)), concept: plan.concept, auto: true };
  }

  let done = 0;
  onStep('플랫폼별 대본 쓰는 중', 0.3);
  await writeAll(project, plan, () => {
    done++;
    onStep(`플랫폼별 대본 쓰는 중 (${done}/${PLATFORM_KEYS.length})`, 0.3 + 0.7 * (done / PLATFORM_KEYS.length));
  });
  return finalizePlan(plan, project);
}

/**
 * 7개 결과물 쓰기 (두 단계)
 * ① 쇼츠·롱폼·블로그·쓰레드  ② 릴스·틱톡·캐러셀은 쇼츠를 보고 "겹치지 않게"
 */
export const STAGE_A = ['shorts', 'longform', 'blog', 'threads'];
export const STAGE_B = ['tiktok', 'carousel'];
export const STAGE_C = ['reels']; // 쇼츠·틱톡을 다 보고 마지막에 (훅이 겹치지 않게)
export async function writeAll(project, plan, onDone = () => {}) {
  const run = (keys, siblings) => pool(keys, 3, async (k) => {
    plan[k] = await writePlatform(k, project, plan, siblings);
    onDone(k);
  });
  await run(STAGE_A, '');
  const describe = (k, label) => {
    const s = plan[k];
    if (!s?.scenes) return '';
    return [`### ${label}`, `- 훅: ${String(s.hook).replace(/\n/g, ' / ')}`,
      `- 장면 순서: ${s.scenes.map((x) => x.shot).join(' → ')}`, `- 첫 나레이션: ${s.scenes[0]?.narration || ''}`].join('\n');
  };
  const note = (blocks) => (blocks.filter(Boolean).length ? [
    '## 이미 쓴 다른 숏폼 (이것들과 겹치지 않게)', ...blocks.filter(Boolean),
    '훅 문구, 첫 장면, 장면 순서, 문장을 위 숏폼들과 다르게 하세요. 같은 사실을 전하더라도 표현을 바꿉니다.',
  ].join('\n') : '');
  await run(STAGE_B, note([describe('shorts', '유튜브 쇼츠')]));
  await run(STAGE_C, note([describe('shorts', '유튜브 쇼츠'), describe('tiktok', '틱톡')]));
  // 블로그 사실 확인: 근거 없는 문장만 찾아서 지우거나 바꾼다
  if (process.env.FACTCHECK !== 'off') {
    try {
      const { factCheckBlog } = await import('./factcheck.js');
      const fc = await factCheckBlog(project, plan);
      plan.factcheck = { blog: { applied: fc.applied, edits: fc.edits } };
      console.log(`[factcheck] 블로그 ${fc.applied}문장 고침`);
    } catch (err) {
      console.warn('[factcheck] 블로그 사실 확인 실패:', err.message);
    }
  }
}

/** 가격 표시가 여러 개면 첫 번째만 (화면에 길게 나오지 않게) */
function firstPrice(tag) {
  const t = String(tag || '').trim();
  if (t.length <= 16) return t;
  // 숫자 사이 쉼표(3,000)는 자르지 않고, 구분자(· / | 또는 쉼표+공백)에서만 자른다
  const first = t.split(/\s*[·/|]\s*|,\s+|\s+-\s+/)[0].trim();
  return first.length <= 18 ? first : t.slice(0, 16);
}

// ---------- ③ 수정 요청 ----------

/** 현재 결과물을 "장면 ref" 형식으로 되돌린다 (AI에게 보여주기 위해) */
export function toShotForm(key, plan, project) {
  const cur = plan[key];
  const type = PLATFORMS[key].type;
  if (type === 'video') {
    return { ...cur, scenes: cur.scenes.map((s) => ({ shot: s.shot || nearestShot(project, s.media_id, s.clip_start), extra_shots: (s.extra_shots || []).map((x) => x.shot || x), cut_captions: (s.extra_shots || []).length ? [s.cut_caption || '', ...(s.extra_shots || []).map((x) => x.caption || '')] : [], label: s.label || '', narration: s.narration, caption: s.caption, price_tag: s.price_tag, chapter: s.chapter })) };
  }
  if (type === 'carousel') return { slides: cur.slides.map(({ shot, headline, body }) => ({ shot, headline, body })), caption: cur.caption, hashtags: cur.hashtags };
  if (type === 'blog') return { title: cur.title, sections: cur.sections.map((s) => ({ heading: s.heading, body: s.body, shot: s.shot || s.media_id || '', extra_shots: s.extra_shots || [] })), hashtags: cur.hashtags };
  return cur;
}

function nearestShot(project, mediaId, clipStart = 0) {
  const shots = allShots(project).filter((s) => s.media.id === mediaId);
  if (!shots.length) return mediaId;
  return shots.reduce((a, b) => (Math.abs(b.time - clipStart - 0.3) < Math.abs(a.time - clipStart - 0.3) ? b : a)).ref;
}

/**
 * 한 결과물만 수정 요청대로 다시 쓴다. 바뀐 plan을 돌려준다.
 */
export async function reviseOutput(project, key, instruction, { plan: basePlan, auto = false } = {}) {
  const backend = await aiBackend();
  if (backend === 'off') {
    throw new Error('테스트 모드(AI 없음)에서는 말로 하는 수정을 처리할 수 없어요. 확인 화면의 "장면 고치기"를 써 주세요.');
  }
  const plan = structuredClone(basePlan || project.plan);
  const ctx = await contextText(project, plan, key);
  const current = JSON.stringify(toShotForm(key, plan, project), null, 1);
  const out = await generate({
    system: await platformSystem(key, '지금은 이미 쓴 결과물을 촬영자의 수정 요청대로 고치는 중입니다. 요청과 관계없는 부분은 최대한 그대로 둡니다.', plan.concept),
    content: [{
      type: 'text',
      text: `${ctx}\n\n## 지금 결과물 (${PLATFORMS[key].label})\n${current}\n\n## ${auto ? '편집장의 검토 의견 (고칠 점)' : '촬영자의 수정 요청'}\n${instruction}\n\n${auto ? '고칠 점을 모두 반영하되 잘 된 부분은 살려서' : '요청을 반영해'} 같은 형식으로 다시 써주세요.`,
    }],
    schema: key === 'longform' ? LongformOut : OUT_SCHEMA[PLATFORMS[key].type],
    label: `${PLATFORMS[key].label} ${auto ? '자동 보완' : '수정'}`,
  });
  plan[key] = out;
  return finalizePlan(plan, project, [key]);
}

// ---------- 테스트 모드 (AI 없음) ----------

/** 배열에서 n개를 처음부터 끝까지 고르게 고른다 */
export function spread(arr, n) {
  if (arr.length <= n) return [...arr];
  if (n <= 1) return [arr[0]];
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
}

export function mockPlan(project) {
  const hint = project.hints || {};
  const category = hint.category && hint.category !== 'auto' ? hint.category : (CONCEPT_BY_ID[hint.concept]?.category || 'other');
  const name = hint.placeName || '오늘 다녀온 곳';
  const memo = hint.memo || '';
  // 영상은 짧으면 가운데 장면 하나, 길면 뽑은 장면 모두
  const shots = project.media.flatMap((m) => {
    if (m.kind === 'image') return [m.id];
    if (m.frames.length <= 3) return [`${m.id}:f${Math.min(1, m.frames.length - 1)}`];
    return m.frames.map((_, i) => `${m.id}:f${i}`);
  });
  const words = {
    mart: ['신선한 상품이 가득해요', '오늘의 특가 상품', '가격도 착해요', '장보기 좋은 곳'],
    restaurant: ['대표 메뉴 등장', '보기만 해도 맛있어요', '가게 분위기도 좋아요', '재방문 각'],
    park_event: ['풍경이 정말 예뻐요', '볼거리가 가득', '행사 정보 확인하세요', '주말 나들이 추천'],
    other: ['여기 꼭 가보세요', '분위기 최고', '놓치면 아쉬운 곳', '추천합니다'],
  }[category];
  const w = (i) => words[i % words.length];
  const scene = (ref, i, long = false) => ({
    shot: ref,
    narration: long ? `[예시] ${i + 1}번째 장면이에요. ${w(i)}. AI를 연결하면 사진 내용대로 바뀌어요.` : `${w(i)}.`,
    caption: w(i),
    price_tag: category === 'mart' && i % 2 === 1 ? '예시 9,900원' : '',
    chapter: long && i % 3 === 0 ? `파트 ${i / 3 + 1}` : '',
  });
  const tags = ['동네소개', CATEGORIES[category].split('·')[0], name.replace(/\s/g, '')];
  const pick = (n, offset = 0) => spread(shots.filter((_, i) => (i + offset) % 2 === 0).length >= n
    ? shots.filter((_, i) => (i + offset) % 2 === 0) : shots, n);
  const video = (title, hook, refs, desc, extraTags = [], long = false) => ({
    title, hook, scenes: refs.map((r, i) => scene(r, i, long)), description: desc, hashtags: [...tags, ...extraTags],
  });
  // 테스트 모드: 기본 스토리보드로 쇼츠를 만들어 빠른 컷·이름표 렌더링도 시험한다
  const concept = CONCEPT_BY_ID[hint.concept] ? hint.concept : 'other';
  const mockShots = allShots(project).map((s) => ({ ref: s.ref, framing: s.framing || 'medium', quality: 'ok' }));
  const sb = autoStoryboard(concept, mockShots);
  const sbVideo = sb.beats.length ? {
    title: `${name} 1분 소개`, hook: `${name}\n가봤어요`, description: `[예시 설명] ${name} 짧게 소개해요.`, hashtags: tags,
    scenes: sb.beats.map((b, i) => ({ ...scene(b.shots[0], i), extra_shots: b.shots.slice(1), label: storyboardFor(concept).label ? `${i}. ${w(i)}` : '' })),
  } : null;
  return {
    storyboard: { ...sb, concept, auto: true },
    _source: 'mock',
    category,
    concept,
    place_name: hint.placeName || '',
    summary: `[예시] ${name}에서 찍은 자료 ${project.media.length}개예요. ${memo}`.trim(),
    key_facts: memo ? [memo] : [],
    music_prompt: 'bright cheerful acoustic background music, light percussion, no vocals, 110 bpm',
    shots: allShots(project).map((s) => ({ ref: s.ref, description: `${s.media.kind === 'image' ? '사진' : '영상 장면'} (${s.media.originalName})`, items: [], quality: 'ok', skip_reason: '' })),
    shorts: sbVideo || video(`${name} 1분 소개`, `${name}\n가봤어요`, pick(8), `[예시 설명] ${name} 짧게 소개해요.`),
    reels: video(name, '여기 어디게?', pick(5, 1), `[예시 캡션] ${name} 다녀왔어요 ✨`, ['릴스']),
    tiktok: video(`${name} 실화?`, '이거 실화냐', pick(6, 1).reverse(), `[예시 캡션] ${name} 가본 사람?`, ['틱톡']),
    longform: video(`${name} 자세히 둘러보기`, `${name} 투어`, shots, `[예시 설명] ${name}을 처음부터 끝까지 보여드려요.`, [], true),
    carousel: {
      slides: spread(shots, 6).map((r, i) => ({ shot: r, headline: i === 0 ? `${name}\n다녀왔어요` : w(i), body: i === 0 ? '[예시] 넘겨서 보세요' : '[예시] AI 연결 후 실제 내용으로 바뀌어요' })),
      caption: `[예시 캡션] ${name} 정리 📌`,
      hashtags: tags,
    },
    threads: { text: `[예시] ${name} 다녀왔는데 생각보다 좋았어요\n${memo ? `${memo}\n` : ''}AI를 연결하면 사진 내용으로 진짜 후기가 써져요.`, topic_tag: '' },
    blog: {
      title: `[예시] ${name} 방문 후기`,
      sections: [
        { heading: '들어가며', body: `${name}에 다녀온 이야기예요. (AI 연결 전 예시 글)`, shot: shots[0] || '' },
        ...spread(shots.slice(1), 5).map((r, i) => ({ heading: `${i + 1}. ${w(i)}`, body: '이 자리에 사진 내용을 바탕으로 한 설명이 들어가요.', shot: r })),
        { heading: '마무리', body: memo || '다음에 또 가고 싶은 곳이에요.', shot: '' },
      ],
      hashtags: tags,
    },
  };
}

// ---------- 정리·검증 ----------

/** 장소 이름 해시태그: "2026 ○○강 억새축제" → "○○강억새축제" */
function placeTag(name) {
  return String(name || '').replace(/^\s*\d{4}\s*/, '').replace(/[\s#]/g, '').slice(0, 20);
}
/** 해시태그에 장소 이름이 없으면 맨 앞에 넣는다 (AI가 자주 빠뜨림) */
function withPlaceTag(tags, plan, max) {
  const tag = placeTag(plan.place_name);
  if (tag.length < 2) return tags;
  const core = tag.replace(/[○●◯]/g, '');
  const has = tags.some((t) => t.replace(/[○●◯]/g, '').includes(core.slice(0, 3)) || t.replace(/[○●◯]/g, '').includes(core.slice(-3)));
  return has ? tags : [tag, ...tags].slice(0, max);
}
const cleanTags = (t, max = 30) => [...new Set((t || []).map((x) => String(x).replace(/^#+/, '').replace(/\s+/g, '').trim()).filter(Boolean))].slice(0, max);
const TAG_MAX = { shorts: 5, reels: 5, tiktok: 5, longform: 5, carousel: 5, blog: 15 };

/**
 * AI 결과를 앱에서 쓰는 형태로 바꾸고 검증한다.
 * - 장면 ref → media_id + clip_start
 * - 없는 ref 제거, 해시태그 정리
 * @param {string[]} [only] 이 결과물만 다시 정리 (수정 요청 후)
 */
// 짧은 영상은 처음부터, 긴 영상은 그 장면 직전부터
const clipStartOf = (s) => (s.media.kind === 'video' && s.media.frames.length > 3 ? Math.max(0, Math.round((s.time - 0.3) * 10) / 10) : 0);

/**
 * 컷 구성은 스토리보드가 정한다: 대본(장면)이 스토리보드 비트의 컷을 빠뜨리면 그 장면의 extra_shots 로 되돌려 넣는다.
 * (대본을 쓰는 AI 는 나레이션·자막만 쓰고, 컷을 줄이면 영상이 인기 쇼츠보다 느려진다)
 */
export function enforceStoryboard(sb, cur) {
  if (!sb?.beats?.length || !cur?.scenes?.length) return;
  const refOf = (x) => (typeof x === 'string' ? x : x?.shot || '');
  // 대본이 스토리보드에 없는 컷을 extra_shots 에 더했으면 뺀다 (같은 화면 반복·기준 밖 컷 방지)
  const inBoard = new Set(sb.beats.flatMap((b) => b.shots));
  for (const sc of cur.scenes) {
    if (Array.isArray(sc.extra_shots)) sc.extra_shots = sc.extra_shots.filter((x) => inBoard.has(refOf(x)));
    // 장면 첫 컷이 스토리보드 밖이면, 뒤따르는 스토리보드 컷을 첫 컷으로 올린다
    if (!inBoard.has(refOf(sc.shot)) && sc.extra_shots?.length) {
      const next = sc.extra_shots.shift();
      sc.shot = typeof next === 'string' ? next : next.shot;
      if (typeof next === 'object') Object.assign(sc, { media_id: next.media_id, clip_start: next.clip_start });
    }
  }
  const used = new Set(cur.scenes.flatMap((s) => [refOf(s.shot), ...(s.extra_shots || []).map(refOf)]));
  for (const sc of cur.scenes) {
    const mine = [refOf(sc.shot), ...(sc.extra_shots || []).map(refOf)];
    const beat = sb.beats.find((b) => b.shots.some((r) => mine.includes(r)));
    if (!beat) continue;
    const add = beat.shots.filter((r) => !used.has(r));
    if (!add.length) continue;
    sc.extra_shots = [...(sc.extra_shots || []), ...add];
    add.forEach((r) => used.add(r));
  }
}

export function finalizePlan(plan, project, only = null) {
  const shots = allShots(project);
  const byRef = new Map(shots.map((s) => [s.ref, s]));
  const resolve = (ref) => {
    let s = byRef.get(String(ref || '').trim());
    // 'm2'처럼 영상 ID만 온 경우 가운데 장면
    if (!s) {
      const m = project.media.find((x) => x.id === String(ref || '').trim());
      if (m?.kind === 'video') s = byRef.get(`${m.id}:f${Math.min(1, m.frames.length - 1)}`);
    }
    return s || null;
  };
  const keys = only || PLATFORM_KEYS;

  for (const k of keys) {
    const p = PLATFORMS[k];
    const cur = plan[k];
    if (!cur) continue;
    if (p.type === 'video') {
      if (STORYBOARD_KEYS.includes(k)) enforceStoryboard(plan.storyboard, cur);
      let scenes = (cur.scenes || []).map((sc) => {
        if (sc.media_id && !sc.shot) return sc; // 이미 변환된 장면
        const s = resolve(sc.shot);
        if (!s) return null;
        // 같은 나레이션 동안 이어서 보여줄 컷 (스토리보드의 빠른 컷)
        // cut_captions: [첫 컷, extra_shots...] 순서의 컷별 짧은 이름 (컷이 바뀌면 자막도 바뀜)
        const caps = Array.isArray(sc.cut_captions) ? sc.cut_captions.map((c) => String(c || '').trim()) : [];
        const extras = [];
        for (const [k, x] of (Array.isArray(sc.extra_shots) ? sc.extra_shots : []).entries()) {
          if (x && typeof x === 'object' && x.media_id) { extras.push(x); continue; } // 이미 변환됨
          const e = resolve(x);
          if (e && e.ref !== s.ref && !extras.some((y) => y.shot === e.ref)) extras.push({ shot: e.ref, media_id: e.media.id, clip_start: clipStartOf(e), caption: caps[k + 1] || '' });
        }
        return {
          shot: s.ref,
          media_id: s.media.id,
          clip_start: clipStartOf(s),
          extra_shots: extras.slice(0, 6),
          cut_caption: sc.cut_caption ?? (extras.length ? caps[0] || '' : ''),
          label: String(sc.label || '').trim(),
          narration: String(sc.narration || '').trim(),
          caption: String(sc.caption || '').trim(),
          price_tag: firstPrice(sc.price_tag),
          chapter: String(sc.chapter || '').trim(),
        };
      }).filter(Boolean);
      if (!scenes.length) {
        scenes = spread(shots, 6).map((s) => ({ shot: s.ref, media_id: s.media.id, clip_start: 0, extra_shots: [], label: '', narration: '', caption: '', price_tag: '', chapter: '' }));
      }
      cur.scenes = scenes;
      cur.hook = String(cur.hook || '').replace(/\\n/g, '\n');
      if (cur.thumbnail_text !== undefined) cur.thumbnail_text = String(cur.thumbnail_text).replace(/\\n/g, '\n').trim();
      cur.hashtags = withPlaceTag(cleanTags(cur.hashtags, TAG_MAX[k]), plan, TAG_MAX[k]);
    } else if (p.type === 'carousel') {
      cur.slides = (cur.slides || []).map((sl) => {
        const s = resolve(sl.shot);
        return s ? { shot: s.ref, headline: String(sl.headline || '').replace(/\\n/g, '\n').trim(), body: String(sl.body || '').trim() } : null;
      }).filter(Boolean).slice(0, 10);
      if (!cur.slides.length) cur.slides = spread(shots, 5).map((s) => ({ shot: s.ref, headline: '', body: '' }));
      cur.hashtags = withPlaceTag(cleanTags(cur.hashtags, TAG_MAX.carousel), plan, TAG_MAX.carousel);
    } else if (p.type === 'blog') {
      cur.sections = (cur.sections || []).map((sec) => {
        const s = sec.shot ? resolve(sec.shot) : null;
        return {
          heading: String(sec.heading || '').trim(),
          // 문단 앞 공백·빈 줄 정리
          body: String(sec.body || '').split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim(),
          shot: s ? s.ref : '',
          extra_shots: [...new Set((Array.isArray(sec.extra_shots) ? sec.extra_shots : []).map((x) => resolve(x)?.ref).filter((r) => r && r !== s?.ref))].slice(0, 4),
          facts: Array.isArray(sec.facts) ? sec.facts.slice(0, 20) : [],
        };
      });
      cur.hashtags = withPlaceTag(cleanTags(cur.hashtags, TAG_MAX.blog), plan, TAG_MAX.blog);
    } else if (p.type === 'text') {
      cur.text = String(cur.text || '').trim();
      cur.topic_tag = String(cur.topic_tag || '').replace(/^#+/, '').trim();
    }
  }

  // 확인 화면용: 자료(m1, m2 ...)별 설명과 뺀 이유
  if (!only) {
    plan.media_notes = project.media.map((m) => {
      const mine = (plan.shots || []).filter((s) => s.ref === m.id || s.ref.startsWith(`${m.id}:`));
      const bad = mine.length && mine.every((s) => s.quality === 'bad');
      return {
        media_id: m.id,
        description: mine[0]?.description || '',
        items: mine.flatMap((s) => s.items || []).slice(0, 20),
        skip_reason: bad ? mine.map((s) => s.skip_reason).filter(Boolean)[0] || '품질이 낮음' : '',
      };
    });
  }
  return plan;
}
