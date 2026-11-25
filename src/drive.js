// 구글 드라이브 데스크톱 폴더로 자료를 받고 결과를 저장한다
//   <DRIVE_DIR>/업로드/<작업 이름>/  ← 사진·영상 (메모.txt 가 있으면 메모로 사용)
//   <DRIVE_DIR>/결과/<작업 이름>/    ← 만든 영상·이미지·글
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { createProject, updateProject, projectDir, getProject } from './store.js';
import { kindOf } from './pipeline/media.js';
import { CATEGORIES } from './pipeline/plan.js';
import { conceptFromTag, CONCEPT_BY_ID } from './guides/concepts.js';
import { allTextsDoc } from './pipeline/texts.js';

export const driveReady = () => Boolean(config.drive.dir) && fsSync.existsSync(config.drive.dir);
const uploadRoot = () => path.join(config.drive.dir, config.drive.uploadName);
const resultRoot = () => path.join(config.drive.dir, config.drive.resultName);
const jobsFile = () => path.join(config.dataDir, 'drive-jobs.json');

async function readJobs() {
  try { return JSON.parse(await fs.readFile(jobsFile(), 'utf8')); } catch { return {}; }
}
async function writeJobs(jobs) {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(jobsFile(), JSON.stringify(jobs, null, 2));
}

/** 폴더 이름이 업로드 폴더 바로 아래의 진짜 폴더인지 (경로 장난 방지) */
function safeFolder(name) {
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') return null;
  const full = path.join(uploadRoot(), name);
  return path.dirname(full) === uploadRoot() ? full : null;
}

async function mediaFiles(dir) {
  let names = [];
  try { names = await fs.readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))) {
    if (n.startsWith('.') || n.startsWith('~')) continue;
    const kind = kindOf(n);
    if (!kind) continue;
    const st = await fs.stat(path.join(dir, n)).catch(() => null);
    if (st?.isFile() && st.size > 0) out.push({ name: n, kind, size: st.size });
  }
  return out;
}

/** 드라이브 작업 폴더 안에 "업로드", "결과" 폴더 만들기 (앱 시작 때) */
export async function ensureDriveFolders() {
  if (!driveReady()) return false;
  await fs.mkdir(uploadRoot(), { recursive: true });
  await fs.mkdir(resultRoot(), { recursive: true });
  return true;
}

/** 업로드 폴더 안의 작업 폴더 목록 (최근 것 먼저) */
export async function listUploadFolders() {
  if (!driveReady()) return [];
  await fs.mkdir(uploadRoot(), { recursive: true });
  const jobs = await readJobs();
  const entries = await fs.readdir(uploadRoot(), { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const full = path.join(uploadRoot(), e.name);
    const files = await mediaFiles(full);
    const st = await fs.stat(full);
    const job = jobs[e.name];
    const project = job ? await getProject(job.projectId) : null;
    out.push({
      name: e.name,
      images: files.filter((f) => f.kind === 'image').length,
      videos: files.filter((f) => f.kind === 'video').length,
      modified: st.mtimeMs,
      projectId: project ? project.id : null,
      status: project?.status || null,
    });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

/** 폴더 이름에서 장소 종류 힌트: "[마트] 코스트코" 처럼 앞에 붙여 두면 사용 */
export function conceptFromName(name) {
  const m = name.match(/^\s*\[(.+?)\]/);
  return m ? conceptFromTag(m[1]) : null;
}

function categoryFromName(name) {
  const m = name.match(/^\s*\[(.+?)\]/);
  if (!m) return 'auto';
  const concept = conceptFromTag(m[1]);
  if (concept) return CONCEPT_BY_ID[concept].category;
  const t = m[1];
  if (/마트|시장|상점|가게/.test(t)) return 'mart';
  if (/음식|식당|맛집|카페/.test(t)) return 'restaurant';
  if (/공원|행사|축제/.test(t)) return 'park_event';
  return Object.keys(CATEGORIES).includes(t) ? t : 'auto';
}

/** 드라이브 폴더 → 새 작업. 자료는 내 컴퓨터로 복사해 둔다 (드라이브는 받는 중일 수 있어서) */
/** 폴더의 메모.txt 읽기 */
export async function readFolderMemo(name) {
  const dir = safeFolder(name);
  if (!dir) return '';
  for (const m of ['메모.txt', 'memo.txt', '메모.md']) {
    try { return (await fs.readFile(path.join(dir, m), 'utf8')).trim().slice(0, 2000); } catch { /* 없음 */ }
  }
  return '';
}

export async function createProjectFromFolder(name, { concept: pickedConcept, extraMemo = '' } = {}) {
  const dir = safeFolder(name);
  if (!dir || !fsSync.existsSync(dir)) throw new Error(`"${name}" 폴더를 찾지 못했어요`);
  const files = await mediaFiles(dir);
  if (!files.length) throw new Error(`"${name}" 폴더에 사진·영상이 없어요`);
  let memo = '';
  for (const m of ['메모.txt', 'memo.txt', '메모.md']) {
    try { memo = (await fs.readFile(path.join(dir, m), 'utf8')).trim().slice(0, 2000); break; } catch { /* 없음 */ }
  }
  if (extraMemo) memo = [memo, extraMemo].filter(Boolean).join('\n').slice(0, 3000);
  const placeName = name.replace(/^\s*\[.+?\]\s*/, '').replace(/^\d{4}[-.]?\d{2}[-.]?\d{2}[\s_-]*/, '').trim();
  const project = await createProject({
    source: { type: 'drive', folder: name },
    hints: {
      category: CONCEPT_BY_ID[pickedConcept]?.category || categoryFromName(name),
      concept: CONCEPT_BY_ID[pickedConcept] ? pickedConcept : (conceptFromName(name) || 'auto'),
      placeName,
      memo,
    },
  });
  const pdir = projectDir(project.id);
  const media = [];
  for (const [i, f] of files.entries()) {
    const id = `m${i + 1}`;
    const file = `${id}${path.extname(f.name).toLowerCase()}`;
    await fs.copyFile(path.join(dir, f.name), path.join(pdir, 'media', file));
    media.push({ id, kind: f.kind, file, originalName: f.name, size: f.size });
  }
  await updateProject(project.id, (p) => { p.media = media; p.status = 'queued'; p.step = '순서 기다리는 중'; });
  const jobs = await readJobs();
  jobs[name] = { projectId: project.id, at: new Date().toISOString() };
  await writeJobs(jobs);
  return project.id;
}

const FILE_NAMES = {
  shorts: '1_유튜브쇼츠.mp4',
  reels: '2_인스타릴스.mp4',
  tiktok: '3_틱톡.mp4',
  // 말 없는 판 (음악 + 글자)
  shorts_music: '1_유튜브쇼츠_말없음.mp4',
  reels_music: '2_인스타릴스_말없음.mp4',
  tiktok_music: '3_틱톡_말없음.mp4',
  longform: '4_유튜브롱폼.mp4',
};

export function resultFolderName(project) {
  if (project.source?.folder) return project.source.folder;
  const d = project.createdAt.slice(0, 10);
  const place = (project.plan?.place_name || project.hints?.placeName || '작업').replace(/[\\/:*?"<>|]/g, '').trim();
  return `${d} ${place}`.slice(0, 80);
}

/** 결과를 드라이브 "결과/<작업 이름>/" 에 저장. 드라이브 앱이 알아서 올린다 */
export async function exportToDrive(project) {
  if (!driveReady()) return null;
  const folder = resultFolderName(project);
  const dest = path.join(resultRoot(), folder);
  await fs.mkdir(dest, { recursive: true });
  const out = path.join(projectDir(project.id), 'out');
  for (const [key, name] of Object.entries(FILE_NAMES)) {
    const v = project.outputs?.[key]?.video;
    if (v) await fs.copyFile(path.join(out, v.file), path.join(dest, name));
    const doc = project.outputs?.[key]?.doc;
    if (doc) await fs.copyFile(path.join(out, doc), path.join(dest, name.replace('.mp4', '_대본스토리보드.html'))).catch(() => {});
  }
  const thumb = project.outputs?.longform?.thumbnail;
  if (thumb) await fs.copyFile(path.join(out, thumb.file), path.join(dest, '4_유튜브롱폼_썸네일.jpg')).catch(() => {});
  const car = project.outputs?.carousel?.images;
  if (car?.length) {
    const cdir = path.join(dest, '5_인스타캐러셀');
    await fs.rm(cdir, { recursive: true, force: true });
    await fs.mkdir(cdir, { recursive: true });
    for (const img of car) await fs.copyFile(path.join(out, 'carousel', img), path.join(cdir, img));
  }
  // 블로그 본문에 쓴 사진
  const shots = [...(project.outputs?.blog?.body || '').matchAll(/\[사진: (m\d+(?::f\d+)?)\]/g)].map((m) => m[1]);
  if (shots.length) {
    const bdir = path.join(dest, '6_블로그사진');
    await fs.rm(bdir, { recursive: true, force: true });
    await fs.mkdir(bdir, { recursive: true });
    for (const [i, ref] of shots.entries()) {
      const src = path.join(out, 'blog', `${ref.replace(':', '_')}.jpg`);
      await fs.copyFile(src, path.join(bdir, `${String(i + 1).padStart(2, '0')}_${ref.replace(':', '_')}.jpg`)).catch(() => {});
    }
  }
  await fs.writeFile(path.join(dest, '0_글모음.txt'), `﻿${allTextsDoc(project)}`);
  return { folder, path: dest };
}
