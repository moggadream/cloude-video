// 사진·영상을 분석하고 5가지 결과물(쇼츠/롱폼/릴스/쓰레드/블로그)의 대본·글을 한 번에 만든다.
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { config, features } from '../config.js';
import { smallJpegBase64 } from './media.js';

export const CATEGORIES = {
  mart: '마트·시장·상점',
  restaurant: '음식점·카페',
  park_event: '공원·행사·축제',
  other: '기타 장소',
};

const Scene = z.object({
  media_id: z.string().describe('사용할 미디어 ID (예: m1)'),
  clip_start: z.number().describe('영상이면 사용할 구간의 시작 초, 사진이면 0'),
  narration: z.string().describe('나레이션 문장. 자연스러운 구어체 한국어'),
  caption: z.string().describe('화면 자막. 짧고 굵게 (20자 이내 권장)'),
  price_tag: z.string().describe('화면에 띄울 가격 표시 (예: "딸기 1팩 9,900원"). 확인된 가격이 없으면 빈 문자열'),
  chapter: z.string().describe('롱폼 챕터 이름. 롱폼이 아니거나 이전 장면과 같은 챕터면 빈 문자열'),
});

export const PlanSchema = z.object({
  category: z.enum(['mart', 'restaurant', 'park_event', 'other']),
  place_name: z.string().describe('가게/장소 이름. 모르면 빈 문자열'),
  summary: z.string().describe('장소와 촬영 내용 요약 2~3문장'),
  music_prompt: z.string().describe('배경음악 생성용 영어 프롬프트 (분위기, 장르, 템포, 보컬 없음)'),
  media_notes: z.array(z.object({
    media_id: z.string(),
    description: z.string(),
    items: z.array(z.object({ name: z.string(), price: z.string() })),
  })),
  shorts: z.object({
    title: z.string(),
    hook: z.string().describe('첫 2초에 크게 띄울 문구'),
    scenes: z.array(Scene),
    description: z.string(),
    hashtags: z.array(z.string()),
  }),
  longform: z.object({
    title: z.string(),
    hook: z.string(),
    scenes: z.array(Scene),
    description: z.string().describe('유튜브 설명란. 챕터 타임스탬프는 시스템이 자동으로 붙이므로 쓰지 말 것'),
    hashtags: z.array(z.string()),
  }),
  reels: z.object({
    title: z.string(),
    hook: z.string(),
    scenes: z.array(Scene),
    description: z.string().describe('인스타그램 캡션 본문'),
    hashtags: z.array(z.string()),
  }),
  threads: z.object({ text: z.string() }),
  blog: z.object({
    title: z.string(),
    sections: z.array(z.object({
      heading: z.string(),
      body: z.string(),
      media_id: z.string().describe("이 문단 위에 넣을 사진. 사진은 'm1', 영상 장면은 'm1:f3'. 없으면 빈 문자열"),
    })),
    hashtags: z.array(z.string()),
  }),
});

const SYSTEM = `당신은 한국의 지역 소개 콘텐츠를 만드는 숏폼·블로그 크리에이터입니다.
사용자가 폰으로 찍은 사진과 영상(프레임)을 보고, 한 번에 다섯 가지 결과물의 대본과 글을 씁니다.

장소 종류별 초점
- 마트·시장·상점(mart): 눈에 띄는 상품, 가격표에서 읽은 가격, 할인·행사, 가게 분위기와 위치 느낌
- 음식점·카페(restaurant): 대표 메뉴와 음식의 모습·맛 표현, 가격, 가게 내부와 외관, 분위기
- 공원·행사·축제(park_event): 경치와 볼거리, 행사 품목·부스, 현수막·안내판의 행사 일정과 시간
- 기타(other): 장소의 매력 포인트

사실 규칙
- 가격, 영업시간, 행사 시간은 사진 속 글자나 사용자 메모로 확인된 것만 씁니다. 추측한 숫자를 쓰지 마세요.
- 확인 안 된 가격은 price_tag를 빈 문자열로 둡니다.
- 사진에 없는 메뉴나 상품을 지어내지 마세요.

결과물 규칙
- shorts(유튜브 쇼츠, 세로): 6~10장면, 전체 나레이션 25~50초 분량. 첫 장면은 가장 눈길을 끄는 미디어로. 장면당 나레이션 1~2문장.
- reels(인스타그램 릴스, 세로): 4~7장면, 15~30초 분량. 쇼츠보다 더 짧고 리듬감 있게, 다른 문장으로.
- longform(유튜브 롱폼, 가로): 모든 미디어를 활용하고, 좋은 미디어는 두 번 써도 됩니다. 장면당 2~4문장으로 자세히. 인트로·본론·마무리 흐름, chapter로 구간을 나눕니다(3~6개).
- threads(쓰레드): 450자 이내, 친구에게 말하듯 편한 말투, 이모지 약간, 핵심 정보 위주.
- blog(네이버 블로그 스타일): 제목, 5~8개 섹션, 총 1500~2500자. 방문 정보·추천 포인트·가격 정리 포함. 섹션마다 어울리는 사진을 media_id로 지정.
- hashtags는 '#' 없이 단어만, 결과물마다 8~15개.
- 영상 미디어의 clip_start는 보여주려는 장면의 프레임 시각보다 0.3초쯤 앞으로 잡고, 영상 길이를 넘지 않게 합니다. 편집된 영상은 한 장면이 몇 초뿐일 수 있으니 장면당 나레이션을 짧게 씁니다.
- 블로그 사진은 사진이면 미디어 ID(m1), 영상의 특정 장면이면 'm1:f3'처럼 장면 번호까지 씁니다.
- caption은 화면에 크게 뜨는 문구이니 짧게 씁니다.`;

let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

export async function makePlan(project, dir) {
  const plan = features.ai ? await aiPlan(project, dir) : mockPlan(project);
  return sanitizePlan(plan, project);
}

async function aiPlan(project, dir) {
  const content = [];
  const hint = project.hints || {};
  content.push({
    type: 'text',
    text: [
      '촬영자가 남긴 정보',
      `- 장소 종류: ${hint.category && hint.category !== 'auto' ? CATEGORIES[hint.category] : '자동 판단'}`,
      `- 장소 이름: ${hint.placeName || '(없음)'}`,
      `- 메모: ${hint.memo || '(없음)'}`,
      '',
      `아래에 미디어 ${project.media.length}개가 있습니다.`,
    ].join('\n'),
  });
  for (const m of project.media) {
    if (m.kind === 'image') {
      content.push({ type: 'text', text: `[${m.id}] 사진` });
    } else {
      content.push({
        type: 'text',
        text: `[${m.id}] 영상 (길이 ${m.duration.toFixed(1)}초) — 아래 장면 ${m.frames.length}개`,
      });
    }
    for (const [i, f] of m.frames.entries()) {
      if (m.kind === 'video') content.push({ type: 'text', text: `${m.id}:f${i} (${f.time}초)` });
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: await smallJpegBase64(path.join(dir, 'work', f.file)) },
      });
    }
  }
  content.push({ type: 'text', text: '위 자료로 다섯 가지 결과물의 계획을 작성하세요.' });

  const stream = getClient().beta.messages.stream({
    model: config.anthropic.model,
    max_tokens: 32000,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: betaZodOutputFormat(PlanSchema) },
    // 안전 분류기가 요청을 거절하면 서버에서 다른 모델로 다시 시도
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('AI가 이 요청을 처리하지 않았습니다 (refusal)');
  if (msg.stop_reason === 'max_tokens') throw new Error('AI 응답이 너무 길어 잘렸습니다. 미디어 수를 줄여 다시 시도해 주세요.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = PlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`AI 응답 형식 오류: ${parsed.error.message.slice(0, 300)}`);
  return { ...parsed.data, _source: 'ai', _usage: msg.usage };
}

/** API 키가 없을 때 쓰는 예시 계획. 전체 흐름 테스트용. */
export function mockPlan(project) {
  const hint = project.hints || {};
  const category = hint.category && hint.category !== 'auto' ? hint.category : 'other';
  const name = hint.placeName || '오늘 다녀온 곳';
  const memo = hint.memo || '';
  // 긴 영상은 고른 장면마다 하나의 컷으로 본다
  const media = project.media.flatMap((m) => (m.kind === 'video' && m.frames.length > 3
    ? m.frames.map((f) => ({ ...m, frames: [f, f] }))
    : [m]));
  const words = {
    mart: ['신선한 상품이 가득해요', '오늘의 특가 상품', '가격도 착해요', '장보기 좋은 곳'],
    restaurant: ['대표 메뉴 등장', '보기만 해도 맛있어요', '가게 분위기도 좋아요', '재방문 각'],
    park_event: ['풍경이 정말 예뻐요', '볼거리가 가득', '행사 정보 확인하세요', '주말 나들이 추천'],
    other: ['여기 꼭 가보세요', '분위기 최고', '놓치면 아쉬운 곳', '추천합니다'],
  }[category];

  const scene = (m, i, long = false) => ({
    media_id: m.id,
    clip_start: m.kind === 'video' ? Math.max(0, (m.frames[1]?.time ?? 0) - 0.3) : 0,
    narration: long
      ? `${i + 1}번째 장면입니다. ${name}의 모습을 자세히 보여드릴게요. ${words[i % words.length]}. 실제 AI 연결 후에는 사진 내용을 보고 설명이 자동으로 바뀝니다.`
      : `${words[i % words.length]}. ${i === 0 ? `${name}을 소개합니다.` : ''}`.trim(),
    caption: words[i % words.length],
    price_tag: category === 'mart' && i % 2 === 1 ? '예시 상품 9,900원' : '',
    chapter: long && i % 2 === 0 ? `파트 ${i / 2 + 1}` : '',
  });

  const tags = ['동네소개', '추천', CATEGORIES[category].split('·')[0], name.replace(/\s/g, '')];
  return {
    _source: 'mock',
    category,
    place_name: hint.placeName || '',
    summary: `[예시] ${name}에서 찍은 미디어 ${media.length}개입니다. ${memo}`.trim(),
    music_prompt: 'bright cheerful acoustic background music, light percussion, no vocals, 110 bpm',
    media_notes: project.media.map((m) => ({ media_id: m.id, description: `${m.kind === 'image' ? '사진' : '영상'} (${m.originalName})`, items: [] })),
    shorts: {
      title: `${name} 1분 소개`,
      hook: `${name} 가봤어요!`,
      scenes: media.slice(0, 8).map((m, i) => scene(m, i)),
      description: `[예시 설명] ${name}을 짧게 소개합니다. ${memo}`.trim(),
      hashtags: [...tags, 'shorts'],
    },
    longform: {
      title: `${name} 자세히 둘러보기`,
      hook: `${name} 전체 투어`,
      scenes: media.map((m, i) => scene(m, i, true)),
      description: `[예시 설명] ${name}을 처음부터 끝까지 자세히 소개합니다.`,
      hashtags: tags,
    },
    reels: {
      title: `${name}`,
      hook: `여기 어디게?`,
      scenes: media.slice(0, 5).map((m, i) => scene(m, i)),
      description: `[예시 캡션] ${name} 다녀왔어요 ✨ ${memo}`.trim(),
      hashtags: [...tags, 'reels', '릴스'],
    },
    threads: {
      text: `[예시] ${name} 다녀왔는데 생각보다 좋았어요 😊\n${memo ? `${memo}\n` : ''}AI를 연결하면 사진 내용을 보고 진짜 후기 글이 자동으로 써집니다.`,
    },
    blog: {
      title: `[예시] ${name} 방문 후기`,
      sections: [
        { heading: '들어가며', body: `${name}에 다녀온 이야기를 정리했어요. (AI 연결 전 예시 글입니다)`, media_id: media[0]?.id || '' },
        ...media.slice(1, 6).map((m, i) => ({
          heading: `${i + 1}. ${words[i % words.length]}`,
          body: '이 자리에 사진 내용을 바탕으로 한 설명이 들어갑니다.',
          media_id: m.id,
        })),
        { heading: '마무리', body: memo || '다음에 또 방문하고 싶은 곳이에요.', media_id: '' },
      ],
      hashtags: tags,
    },
  };
}

/** AI 결과를 검증·보정한다 (없는 미디어 ID, 범위를 벗어난 시작 시간 등) */
export function sanitizePlan(plan, project) {
  const byId = new Map(project.media.map((m) => [m.id, m]));
  const fixScenes = (scenes, fallbackCount) => {
    let list = (scenes || []).filter((s) => byId.has(s.media_id));
    if (list.length === 0) {
      list = project.media.slice(0, fallbackCount).map((m) => ({
        media_id: m.id, clip_start: 0, narration: '', caption: '', price_tag: '', chapter: '',
      }));
    }
    return list.map((s) => {
      const m = byId.get(s.media_id);
      const maxStart = m.kind === 'video' ? Math.max(0, (m.duration || 0) - 1) : 0;
      return {
        ...s,
        clip_start: Math.min(Math.max(0, Number(s.clip_start) || 0), maxStart),
        narration: String(s.narration || '').trim(),
        caption: String(s.caption || '').trim(),
        price_tag: String(s.price_tag || '').trim(),
        chapter: String(s.chapter || '').trim(),
      };
    });
  };
  const cleanTags = (t) => [...new Set((t || []).map((x) => String(x).replace(/^#+/, '').replace(/\s+/g, '').trim()).filter(Boolean))];
  for (const k of ['shorts', 'longform', 'reels']) {
    plan[k].scenes = fixScenes(plan[k].scenes, k === 'longform' ? project.media.length : 8);
    plan[k].hashtags = cleanTags(plan[k].hashtags);
  }
  plan.blog.hashtags = cleanTags(plan.blog.hashtags);
  const validPhoto = (ref) => {
    const [mid, f] = String(ref || '').split(':f');
    const m = byId.get(mid);
    if (!m) return false;
    return f === undefined || (m.kind === 'video' && Number.isInteger(Number(f)) && m.frames[Number(f)] !== undefined);
  };
  plan.blog.sections = plan.blog.sections.map((s) => ({ ...s, media_id: validPhoto(s.media_id) ? s.media_id : '' }));
  return plan;
}
