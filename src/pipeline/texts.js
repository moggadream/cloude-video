// 결과물별 제목·본문(올릴 때 붙여넣는 글) 만들기
import { PLATFORMS, PLATFORM_KEYS } from './plan.js';

const tagLine = (tags = []) => tags.map((t) => `#${t}`).join(' ');

export function longformBody(script, chapters = []) {
  const parts = [String(script.description || '').trim()];
  if (chapters.length) parts.push(chapters.map((c) => `${c.label} ${c.title}`).join('\n'));
  if (script.hashtags?.length) parts.push(tagLine(script.hashtags));
  return parts.filter(Boolean).join('\n\n');
}

export function blogMarkdown(blog) {
  const out = [];
  for (const s of blog.sections) {
    if (s.shot) out.push(`[사진: ${s.shot}]`);
    if (s.heading) out.push(`## ${s.heading}`);
    out.push(s.body.trim(), '');
  }
  if (blog.hashtags?.length) out.push(tagLine(blog.hashtags));
  return out.join('\n').trim();
}

/** 한 결과물의 { title, body } */
export function textFor(key, plan, extra = {}) {
  const s = plan[key];
  switch (key) {
    case 'shorts': {
      const tags = s.hashtags.includes('shorts') ? s.hashtags : [...s.hashtags, 'shorts'];
      return { title: s.title.slice(0, 100), body: [s.description.trim(), tagLine(tags)].filter(Boolean).join('\n\n') };
    }
    case 'longform':
      return { title: s.title.slice(0, 100), body: longformBody(s, extra.chapters) };
    case 'reels':
    case 'tiktok':
      return { title: '', body: [s.description.trim(), tagLine(s.hashtags)].filter(Boolean).join('\n\n') };
    case 'carousel':
      return { title: '', body: [s.caption.trim(), tagLine(s.hashtags)].filter(Boolean).join('\n\n') };
    case 'threads':
      return { title: '', body: s.text, topic: s.topic_tag || '' };
    case 'blog':
      return { title: s.title, body: blogMarkdown(s) };
    default:
      return { title: '', body: '' };
  }
}

/** 처음 만들 때 결과물 상태 */
export function buildOutputs(plan) {
  const out = {};
  for (const key of PLATFORM_KEYS) {
    const needsRender = ['video', 'carousel'].includes(PLATFORMS[key].type);
    out[key] = {
      status: needsRender ? 'queued' : 'ready',
      approval: 'pending',
      publish: null,
      error: null,
      ...textFor(key, plan),
    };
  }
  return out;
}

/** 모든 글을 한 파일로 (드라이브 저장용) */
export function allTextsDoc(project) {
  const parts = [];
  for (const key of PLATFORM_KEYS) {
    const o = project.outputs?.[key];
    if (!o) continue;
    const lines = [`■ ${PLATFORMS[key].label}`];
    if (o.title) lines.push(`제목: ${o.title}`);
    if (o.topic) lines.push(`주제 태그: ${o.topic}`);
    lines.push('', o.body || '');
    parts.push(lines.join('\n'));
  }
  return `${parts.join('\n\n────────────────\n\n')}\n`;
}
