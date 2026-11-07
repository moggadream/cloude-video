// 프로젝트(업로드 1건)를 data/projects/<id>/project.json 에 저장한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const projectsDir = () => path.join(config.dataDir, 'projects');
export const projectDir = (id) => path.join(projectsDir(), id);

const ID_RE = /^[a-z0-9-]{8,40}$/;
export const isValidId = (id) => ID_RE.test(String(id));

export function newId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function createProject(data) {
  const id = newId();
  const dir = projectDir(id);
  await fs.mkdir(path.join(dir, 'media'), { recursive: true });
  await fs.mkdir(path.join(dir, 'work'), { recursive: true });
  await fs.mkdir(path.join(dir, 'out'), { recursive: true });
  const project = {
    id,
    createdAt: new Date().toISOString(),
    status: 'uploaded', // uploaded → processing → ready | failed
    step: '',
    progress: 0,
    error: null,
    media: [],
    plan: null,
    outputs: {},
    ...data,
  };
  await saveProject(project);
  return project;
}

// 같은 프로젝트에 대한 동시 쓰기를 순서대로 처리
const locks = new Map();
export async function updateProject(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(async () => {
    const p = await getProject(id);
    if (!p) throw new Error('프로젝트를 찾을 수 없습니다');
    const result = (await fn(p)) ?? p;
    await saveProject(result);
    return result;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

export async function saveProject(p) {
  const file = path.join(projectDir(p.id), 'project.json');
  const tmp = `${file}.tmp`;
  p.updatedAt = new Date().toISOString();
  await fs.writeFile(tmp, JSON.stringify(p, null, 2));
  await fs.rename(tmp, file);
}

export async function getProject(id) {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(projectDir(id), 'project.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function listProjects() {
  let ids = [];
  try { ids = await fs.readdir(projectsDir()); } catch { return []; }
  const all = await Promise.all(ids.filter(isValidId).map(getProject));
  return all.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteProject(id) {
  if (!isValidId(id)) return;
  await fs.rm(projectDir(id), { recursive: true, force: true });
}
