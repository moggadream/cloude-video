// 시험 자료(tests/media/<컨셉>)로 실제 제작을 돌리고 화면 모음까지 만든다.
//   node scripts/run-test-sets.js restaurant cafe     (AI 연결 필요, 컨셉당 약 8분)
// 결과: 작업 ID 목록과 storyboard-sheet 결과 → data/test-runs.log 에도 추가
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from '../src/config.js';

const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'tests', 'media', 'manifest.json'), 'utf8'));
const concepts = process.argv.slice(2);
if (!concepts.length) { console.error(`컨셉을 주세요: ${Object.keys(manifest.sets).join(' ')}`); process.exit(1); }

function run(args, env = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

const log = path.join(ROOT, 'data', 'test-runs.log');
for (const c of concepts) {
  const set = manifest.sets[c];
  if (!set) { console.log(`${c}: 목록에 없음`); continue; }
  const t0 = Date.now();
  const r = await run([path.join('scripts', 'test-pipeline.js')], {
    SAMPLE_DIR: path.join('tests', 'media', c), CONCEPT: c, PLACE: set.place.replace(/\s*\(.*\)$/, ''), MEMO: set.memo,
  });
  const id = (r.out.match(/projects[\\/]([^\\/\s]+)[\\/]out/) || [])[1];
  const sbLines = r.out.split('\n').filter((l) => /\[storyboard\]|상태:|실패/.test(l)).join('\n');
  let sheet = '';
  if (id) sheet = (await run([path.join('scripts', 'storyboard-sheet.js'), id])).out;
  const text = `\n===== ${c} · ${new Date().toISOString()} · ${Math.round((Date.now() - t0) / 60000)}분 · 작업 ${id || '(없음)'}\n${sbLines}\n${sheet}`;
  console.log(text);
  await fs.appendFile(log, text);
  if (!id) await fs.writeFile(path.join(ROOT, 'data', `run-${c}.log`), r.out);
}
