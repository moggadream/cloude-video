// 업로드 1건을 처음부터 끝까지 처리한다: 미디어 정리 → AI 계획 → 영상 3종 → 글 2종 → 알림
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir, getProject, updateProject } from '../store.js';
import { prepareMedia } from './media.js';
import { makePlan, sanitizePlan } from './plan.js';
import { renderVideo, FORMATS, fmtClock } from './render.js';
import { notify } from '../notify.js';
import { config } from '../config.js';

export const OUTPUT_KEYS = ['shorts', 'longform', 'reels', 'threads', 'blog'];
export const OUTPUT_LABELS = {
  shorts: '유튜브 쇼츠',
  longform: '유튜브 롱폼',
  reels: '인스타그램 릴스',
  threads: '쓰레드 글',
  blog: '블로그 글',
};
const VIDEO_KEYS = ['shorts', 'reels', 'longform'];

const setStep = (id, step, progress) =>
  updateProject(id, (p) => { p.step = step; p.progress = Math.round(progress * 100) / 100; });

export async function processProject(id, opts = {}) {
  const dir = projectDir(id);
  try {
    await updateProject(id, (p) => { p.status = 'processing'; p.error = null; p.startedAt = new Date().toISOString(); });

    // 1) 미디어 정리
    let project = await getProject(id);
    const media = [];
    for (const [i, m] of project.media.entries()) {
      await setStep(id, `사진·영상 정리 중 (${i + 1}/${project.media.length})`, 0.02 + 0.08 * (i / project.media.length));
      media.push(await prepareMedia(m, dir));
    }
    project = await updateProject(id, (p) => { p.media = media; });

    // 2) AI 분석 + 대본·글 작성
    await setStep(id, 'AI가 사진을 보고 대본과 글을 쓰는 중', 0.12);
    // opts.plan: 미리 작성한 계획을 그대로 쓸 때 (테스트용)
    const plan = opts.plan ? sanitizePlan(structuredClone(opts.plan), project) : await makePlan(project, dir);
    project = await updateProject(id, (p) => {
      p.plan = plan;
      p.outputs = buildTextOutputs(p, plan);
    });

    // 3) 영상 3종
    const weights = { shorts: 0.22, reels: 0.18, longform: 0.38 };
    let base = 0.2;
    for (const key of VIDEO_KEYS) {
      const w = weights[key];
      await setStep(id, `${OUTPUT_LABELS[key]} 만드는 중`, base);
      await renderOne(id, key, (r) => setStep(id, `${OUTPUT_LABELS[key]} 만드는 중`, base + w * r).catch(() => {}));
      base += w;
    }

    // 4) 블로그용 사진 정리
    await setStep(id, '블로그 사진 정리 중', 0.98);
    await exportBlogImages(await getProject(id), dir);

    project = await updateProject(id, (p) => {
      p.status = 'ready';
      p.step = '완성';
      p.progress = 1;
      p.finishedAt = new Date().toISOString();
    });
    await notify({
      title: '영상과 글이 완성됐어요',
      body: `${project.plan.place_name || '새 프로젝트'} · 결과물 5종을 확인하고 승인해 주세요.`,
      url: `/project.html?id=${id}`,
    });
  } catch (err) {
    console.error(`[pipeline] ${id} 실패`, err);
    await updateProject(id, (p) => { p.status = 'failed'; p.error = err.message; p.step = '실패'; });
    await notify({ title: '제작에 실패했어요', body: err.message.slice(0, 120), url: `/project.html?id=${id}` }).catch(() => {});
  }
}

/** 영상 하나를 (다시) 만든다 */
export async function renderOne(id, key, onProgress) {
  const dir = projectDir(id);
  const project = await getProject(id);
  await updateProject(id, (p) => { p.outputs[key].status = 'rendering'; p.outputs[key].error = null; });
  try {
    const result = await renderVideo({
      format: key,
      script: project.plan[key],
      project,
      dir,
      musicPrompt: project.plan.music_prompt,
      onProgress,
    });
    await updateProject(id, (p) => {
      const o = p.outputs[key];
      Object.assign(o, { status: 'ready', video: result, version: (o.version || 0) + 1 });
      // 승인 후 다시 만든 경우 다시 확인받도록
      if (o.approval === 'approved') o.approval = 'pending';
      if (key === 'longform') o.body = longformBody(p.plan.longform, result.chapters);
    });
  } catch (err) {
    await updateProject(id, (p) => { p.outputs[key].status = 'failed'; p.outputs[key].error = err.message; });
    throw err;
  }
}

const tagLine = (tags) => tags.map((t) => `#${t}`).join(' ');

function longformBody(script, chapters = []) {
  const parts = [script.description.trim()];
  if (chapters.length) parts.push(chapters.map((c) => `${c.label} ${c.title}`).join('\n'));
  if (script.hashtags.length) parts.push(tagLine(script.hashtags));
  return parts.filter(Boolean).join('\n\n');
}

/** 각 결과물의 제목/본문 초기값. 확인 화면에서 수정할 수 있다. */
function buildTextOutputs(project, plan) {
  const base = (extra) => ({ status: 'ready', approval: 'pending', publish: null, error: null, ...extra });
  const shortsTags = plan.shorts.hashtags.includes('shorts') ? plan.shorts.hashtags : [...plan.shorts.hashtags, 'shorts'];
  return {
    shorts: base({
      status: 'queued',
      title: plan.shorts.title.slice(0, 100),
      body: [plan.shorts.description.trim(), tagLine(shortsTags)].filter(Boolean).join('\n\n'),
    }),
    longform: base({ status: 'queued', title: plan.longform.title.slice(0, 100), body: longformBody(plan.longform) }),
    reels: base({
      status: 'queued',
      title: '',
      body: [plan.reels.description.trim(), tagLine(plan.reels.hashtags)].filter(Boolean).join('\n\n'),
    }),
    threads: base({ title: '', body: plan.threads.text.trim() }),
    blog: base({ title: plan.blog.title, body: blogMarkdown(plan.blog, project) }),
  };
}

function blogMarkdown(blog, project) {
  const out = [];
  for (const s of blog.sections) {
    if (s.media_id) out.push(`[사진: ${s.media_id}]`);
    if (s.heading) out.push(`## ${s.heading}`);
    out.push(s.body.trim(), '');
  }
  if (blog.hashtags.length) out.push(tagLine(blog.hashtags));
  return out.join('\n').trim();
}

/** 블로그에 올릴 사진을 out/blog/ 에 저장 (영상은 가운데 장면) */
async function exportBlogImages(project, dir) {
  const outDir = path.join(dir, 'out', 'blog');
  await fs.mkdir(outDir, { recursive: true });
  for (const m of project.media) {
    const src = m.kind === 'image' ? m.normalized : (m.frames[1] || m.frames[0]).file;
    await fs.copyFile(path.join(dir, 'work', src), path.join(outDir, `${m.id}.jpg`));
    // 영상은 분석한 장면들도 사진으로 저장 (m1_f3.jpg)
    if (m.kind === 'video') {
      for (const [i, f] of m.frames.entries()) {
        await fs.copyFile(path.join(dir, 'work', f.file), path.join(outDir, `${m.id}_f${i}.jpg`));
      }
    }
  }
}

export function publicLink(p) {
  return config.publicUrl ? `${config.publicUrl.replace(/\/$/, '')}${p}` : p;
}

export { FORMATS, fmtClock };
