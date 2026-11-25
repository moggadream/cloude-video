// 작업 1건을 처음부터 끝까지: 자료 정리 → AI 분석·대본 → 영상·이미지 → 드라이브 저장 → 알림
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectDir, getProject, updateProject } from '../store.js';
import { prepareMedia } from './media.js';
import { transcribeMedia } from './speech.js';
import { makePlan, finalizePlan, reviseOutput, PLATFORMS, PLATFORM_KEYS, VIDEO_KEYS, allShots } from './plan.js';
import { renderVideo, FORMATS, fmtClock } from './render.js';
import { renderCarousel, renderThumbnail } from './carousel.js';
import { writeProductionDoc } from './production.js';
import { buildOutputs, textFor } from './texts.js';
import { recordFeedback } from '../ai/skills.js';
import { aiBackend } from '../ai/index.js';
import { selfReview, reviewEnabled } from './review.js';
import { lintPlan, lintOutput } from './lint.js';
import { exportToDrive } from '../drive.js';
import { notify } from '../notify.js';
import { bus } from '../events.js';
import { config } from '../config.js';

export const OUTPUT_KEYS = PLATFORM_KEYS;
export const OUTPUT_LABELS = Object.fromEntries(PLATFORM_KEYS.map((k) => [k, PLATFORMS[k].label]));
const RENDER_KEYS = PLATFORM_KEYS.filter((k) => ['video', 'carousel'].includes(PLATFORMS[k].type));

let lastStepAt = 0;
async function setStep(id, step, progress) {
  await updateProject(id, (p) => { p.step = step; p.progress = Math.round(progress * 100) / 100; });
  // 알림 쪽에는 너무 자주 보내지 않는다
  if (Date.now() - lastStepAt > 1500) { lastStepAt = Date.now(); bus.emit('step', id, step, progress); }
}

export async function processProject(id, opts = {}) {
  const dir = projectDir(id);
  try {
    await updateProject(id, (p) => { p.status = 'processing'; p.error = null; p.startedAt = new Date().toISOString(); });
    bus.emit('started', id);

    // 1) 자료 정리
    let project = await getProject(id);
    const media = [];
    for (const [i, m] of project.media.entries()) {
      await setStep(id, `사진·영상 정리 중 (${i + 1}/${project.media.length})`, 0.02 + 0.08 * (i / project.media.length));
      media.push(await prepareMedia(m, dir));
    }
    // 1-1) 영상 속 말소리 받아쓰기 (실패해도 계속)
    const heard = await transcribeMedia(media, dir, (step, r) => setStep(id, step, 0.1 + 0.04 * r).catch(() => {}))
      .catch((err) => { console.warn('[stt] 건너뜀:', err.message); return media; });
    project = await updateProject(id, (p) => { p.media = heard; });

    // 2) AI 분석 + 플랫폼별 대본 (opts.plan: 미리 써둔 계획을 쓸 때)
    let plan = opts.plan
      ? finalizePlan(structuredClone(opts.plan), project)
      : await makePlan(project, dir, (step, r) => setStep(id, step, 0.14 + 0.2 * r).catch(() => {}));

    // 2-1) 자체 검증: 규칙 검사 + AI 편집장 채점 → 기준 미달만 자동 보완
    if (!opts.plan && plan._source !== 'mock' && reviewEnabled() && (await aiBackend()) !== 'off') {
      const r = await selfReview(project, plan, (step, x) => setStep(id, step, 0.34 + 0.07 * x).catch(() => {}));
      plan = r.plan;
      plan.review = r.review;
    } else {
      plan.review = { at: new Date().toISOString(), ai: null, lint: lintPlan(plan, project, PLATFORM_KEYS), revised: [] };
    }
    project = await updateProject(id, (p) => {
      p.plan = plan;
      p.outputs = buildOutputs(plan);
    });

    // 3) 블로그 사진 (영상 장면 포함)
    await exportBlogImages(project, dir);

    // 4) 영상·캐러셀
    const weight = { shorts: 0.1, reels: 0.08, tiktok: 0.08, longform: 0.24, carousel: 0.05 };
    let base = 0.42;
    for (const key of RENDER_KEYS) {
      const w = weight[key] || 0.05;
      const label = `${PLATFORMS[key].label} 만드는 중`;
      await setStep(id, label, base);
      try {
        await renderOne(id, key, (r) => setStep(id, label, base + w * r).catch(() => {}), { silent: true });
      } catch (err) {
        // 하나가 실패해도 나머지는 계속 만든다
        console.error(`[pipeline] ${id} ${key} 실패:`, err.message);
      }
      base += w;
    }

    // 4-1) 유튜브 썸네일 (롱폼용 대표 이미지)
    try {
      const th = await renderThumbnail({ plan: (await getProject(id)).plan, project: await getProject(id), dir });
      if (th) await updateProject(id, (p) => { p.outputs.longform.thumbnail = th; });
    } catch (err) {
      console.warn('[thumbnail] 실패:', err.message);
    }

    // 5) 드라이브에 저장
    project = await getProject(id);
    await setStep(id, '드라이브에 저장 중', 0.98);
    const drive = await exportToDrive(project).catch((err) => {
      console.warn('[drive] 저장 실패:', err.message);
      return null;
    });

    project = await updateProject(id, (p) => {
      p.status = 'ready';
      p.step = '완성';
      p.progress = 1;
      p.drive = drive;
      p.finishedAt = new Date().toISOString();
    });
    bus.emit('ready', id);
    await notify({
      title: '영상과 글이 완성됐어요',
      body: `${project.plan.place_name || '새 작업'} · 결과물 ${PLATFORM_KEYS.length}종을 확인하고 승인해 주세요.`,
      url: `/project.html?id=${id}`,
      skipTelegram: true, // 텔레그램은 telegram 모듈이 자세히 보낸다
    }).catch(() => {});
  } catch (err) {
    console.error(`[pipeline] ${id} 실패`, err);
    await updateProject(id, (p) => { p.status = 'failed'; p.error = err.message; p.step = '실패'; });
    bus.emit('failed', id, err.message);
    await notify({ title: '제작에 실패했어요', body: err.message.slice(0, 120), url: `/project.html?id=${id}`, skipTelegram: true }).catch(() => {});
  }
}

/** 영상·캐러셀 하나를 (다시) 만든다 */
export async function renderOne(id, key, onProgress = () => {}, { silent = false } = {}) {
  const dir = projectDir(id);
  const project = await getProject(id);
  await updateProject(id, (p) => { p.outputs[key].status = 'rendering'; p.outputs[key].error = null; });
  try {
    if (PLATFORMS[key].type === 'carousel') {
      const result = await renderCarousel({ script: project.plan.carousel, project, dir });
      await updateProject(id, (p) => {
        const o = p.outputs[key];
        Object.assign(o, { status: 'ready', images: result.images, size: [result.width, result.height], version: (o.version || 0) + 1 });
        if (o.approval === 'approved') o.approval = 'pending';
      });
    } else {
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
        if (key === 'longform') Object.assign(o, textFor(key, p.plan, { chapters: result.chapters }));
      });
      // 대본·스토리보드 문서 (실패해도 영상은 그대로)
      const doc = await writeProductionDoc({ project: await getProject(id), key, dir }).catch((err) => { console.warn('[제작 문서] 실패:', err.message); return null; });
      if (doc) await updateProject(id, (p) => { p.outputs[key].doc = doc; });
    }
  } catch (err) {
    await updateProject(id, (p) => { p.outputs[key].status = 'failed'; p.outputs[key].error = err.message; });
    if (!silent) bus.emit('output-failed', id, key, err.message);
    throw err;
  }
  if (!silent) {
    await syncDrive(id);
    bus.emit('output', id, key);
  }
}

async function syncDrive(id) {
  const p = await getProject(id);
  const drive = await exportToDrive(p).catch(() => null);
  if (drive) await updateProject(id, (x) => { x.drive = drive; });
}

/**
 * 말로 한 수정 요청 반영 (텔레그램 "수정" 등): AI가 그 결과물만 다시 쓰고, 영상이면 다시 만든다
 */
export async function reviseAndRender(id, key, instruction) {
  const project = await getProject(id);
  if (!project?.plan) throw new Error('아직 계획이 없어요');
  await updateProject(id, (p) => { p.outputs[key].status = 'queued'; p.outputs[key].error = null; });
  try {
    const plan = await reviseOutput(project, key, instruction);
    await recordFeedback({ key, instruction, projectId: id });
    // 고친 결과물은 규칙 검사를 다시 (AI 채점은 처음 만들 때만)
    plan.review = plan.review || { lint: {} };
    plan.review.lintAfter = { ...(plan.review.lintAfter || plan.review.lint || {}), [key]: lintOutput(key, plan[key], plan, project) };
    await updateProject(id, (p) => {
      p.plan = plan;
      const o = p.outputs[key];
      Object.assign(o, textFor(key, plan, { chapters: o.video?.chapters }));
      o.revisions = [...(o.revisions || []), { at: new Date().toISOString(), instruction }];
      if (o.approval === 'approved') o.approval = 'pending';
      if (!['video', 'carousel'].includes(PLATFORMS[key].type)) o.status = 'ready';
    });
    if (['video', 'carousel'].includes(PLATFORMS[key].type)) {
      await renderOne(id, key);
    } else {
      if (key === 'blog') await exportBlogImages(await getProject(id), projectDir(id));
      await syncDrive(id);
      bus.emit('output', id, key);
    }
  } catch (err) {
    await updateProject(id, (p) => {
      const o = p.outputs[key];
      o.status = o.video || o.images || !['video', 'carousel'].includes(PLATFORMS[key].type) ? 'ready' : 'failed';
      o.error = err.message;
    });
    bus.emit('output-failed', id, key, err.message);
    throw err;
  }
}

/** 승인 상태 바꾸기: 'approved' | 'rejected' | 'pending' */
export async function setApproval(id, key, approval) {
  const p = await updateProject(id, (x) => {
    x.outputs[key].approval = approval;
    if (approval === 'approved') x.outputs[key].approvedAt = new Date().toISOString();
  });
  return p.outputs[key];
}

/** 블로그 사진: 모든 사진과 영상 장면을 out/blog/ 에 (m3.jpg, m1_f5.jpg) */
async function exportBlogImages(project, dir) {
  const outDir = path.join(dir, 'out', 'blog');
  await fs.mkdir(outDir, { recursive: true });
  for (const s of allShots(project)) {
    await fs.copyFile(path.join(dir, 'work', s.frame.file), path.join(outDir, `${s.ref.replace(':', '_')}.jpg`));
  }
  // 예전 형식 호환: 영상 ID만으로도 대표 장면을
  for (const m of project.media.filter((x) => x.kind === 'video')) {
    const f = m.frames[1] || m.frames[0];
    await fs.copyFile(path.join(dir, 'work', f.file), path.join(outDir, `${m.id}.jpg`));
  }
}

export function publicLink(p) {
  return config.publicUrl ? `${config.publicUrl.replace(/\/$/, '')}${p}` : p;
}

export { FORMATS, fmtClock, VIDEO_KEYS };
