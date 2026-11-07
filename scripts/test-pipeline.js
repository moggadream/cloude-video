// 샘플로 전체 제작 과정을 서버 없이 실행해 본다: npm run sample && npm run test:pipeline
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { createProject, updateProject, projectDir, getProject } from '../src/store.js';
import { processProject } from '../src/pipeline/index.js';
import { kindOf } from '../src/pipeline/media.js';

const sampleDir = path.join(ROOT, 'samples');
const files = (await fs.readdir(sampleDir)).sort();
const project = await createProject({
  hints: { category: process.argv[2] || 'mart', placeName: '행복마트 역삼점', memo: '이번 주 과일 특가 행사 중' },
});
const media = [];
for (const [i, f] of files.entries()) {
  const id = `m${i + 1}`;
  const name = `${id}${path.extname(f)}`;
  await fs.copyFile(path.join(sampleDir, f), path.join(projectDir(project.id), 'media', name));
  media.push({ id, kind: kindOf(f), file: name, originalName: f, size: 0 });
}
await updateProject(project.id, (p) => { p.media = media; });
console.time('전체 제작');
await processProject(project.id);
console.timeEnd('전체 제작');
const done = await getProject(project.id);
console.log('상태:', done.status, done.error || '');
for (const [k, o] of Object.entries(done.outputs)) {
  console.log(`- ${k}: ${o.status}${o.video ? ` ${o.video.duration}s ${o.video.width}x${o.video.height}` : ''}`);
}
console.log('결과 폴더:', path.join(projectDir(project.id), 'out'));
