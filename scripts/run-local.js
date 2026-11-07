// 서버 없이 파일을 바로 넣어 제작해 본다.
//   node scripts/run-local.js [--category mart] [--name 이름] [--memo 메모] [--plan plan.json] [--prepare-only] 파일...
import fs from 'node:fs/promises';
import path from 'node:path';
import { createProject, updateProject, projectDir, getProject } from '../src/store.js';
import { processProject } from '../src/pipeline/index.js';
import { kindOf, prepareMedia } from '../src/pipeline/media.js';

const args = process.argv.slice(2);
const opt = (k, d = '') => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(`--${k}`); if (i < 0) return false; args.splice(i, 1); return true; };
const category = opt('category', 'auto');
const placeName = opt('name');
const memo = opt('memo');
const planFile = opt('plan');
const prepareOnly = flag('prepare-only');
if (!args.length) { console.error('파일을 지정하세요'); process.exit(1); }

const project = await createProject({ hints: { category, placeName, memo } });
const dir = projectDir(project.id);
const media = [];
for (const [i, f] of args.entries()) {
  const id = `m${i + 1}`;
  const name = `${id}${path.extname(f).toLowerCase()}`;
  const dest = path.join(dir, 'media', name);
  await fs.link(f, dest).catch(() => fs.copyFile(f, dest)); // 큰 파일은 복사 대신 링크
  media.push({ id, kind: kindOf(f), file: name, originalName: path.basename(f), size: (await fs.stat(f)).size });
}
await updateProject(project.id, (p) => { p.media = media; });
console.log('프로젝트:', project.id);

if (prepareOnly) {
  const prepared = [];
  for (const m of media) prepared.push(await prepareMedia(m, dir));
  await updateProject(project.id, (p) => { p.media = prepared; });
  for (const m of prepared) console.log(m.id, m.kind, m.frames.map((f) => `${f.file}@${f.time}`).join(' '));
  console.log('프레임 폴더:', path.join(dir, 'work'));
  process.exit(0);
}

const plan = planFile ? JSON.parse(await fs.readFile(planFile, 'utf8')) : undefined;
console.time('전체 제작');
await processProject(project.id, { plan });
console.timeEnd('전체 제작');
const done = await getProject(project.id);
console.log('상태:', done.status, done.error || '');
for (const [k, o] of Object.entries(done.outputs)) {
  console.log(`- ${k}: ${o.status}${o.video ? ` ${o.video.duration}s ${o.video.width}x${o.video.height}` : ''}`);
}
console.log('결과 폴더:', path.join(dir, 'out'));
