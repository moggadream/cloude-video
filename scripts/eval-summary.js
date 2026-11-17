// data/evals/*.json 을 모아 docs/evals/README.md 요약표를 만든다: node scripts/eval-summary.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { PLATFORMS, PLATFORM_KEYS } from '../src/pipeline/plan.js';

const dir = path.join(ROOT, 'data', 'evals');
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
const runs = [];
for (const f of files) {
  const d = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
  const name = f.replace(/-\d{4}-\d{2}-\d{2}T.*$/, '');
  const at = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2})/)?.[1]?.replace('T', ' ').replace(/-(\d{2})$/, ':$1') || '';
  const ai = d.review?.ai || [];
  const byKey = Object.fromEntries(ai.map((x) => [x.key, x]));
  const avg = ai.length ? ai.reduce((a, x) => a + x.total, 0) / ai.length : null;
  const facts3 = ai.filter((x) => x.scores.facts <= 3).length;
  const fin = d.review?.final || [];
  const finalAvg = fin.length ? fin.reduce((a, x) => a + x.total, 0) / fin.length : null;
  const finalByKey = Object.fromEntries(fin.map((x) => [x.key, x]));
  runs.push({ name, at, avg, finalAvg, finalByKey, facts3, revised: d.review?.revised || [], byKey });
}

const latest = {};
for (const r of runs) latest[r.name] = r;
const history = {};
for (const r of runs) (history[r.name] ||= []).push(r);

const fmt = (n) => (n == null ? '-' : n.toFixed(2));
const lines = [
  '# 평가 요약',
  '',
  '자동 생성: `node scripts/eval-summary.js` · 개별 보고서는 같은 폴더의 `<컨셉>.md`',
  '',
  '## 최신 결과 (첫 버전 기준 편집장 점수, 5점 만점)',
  '',
  `| 컨셉 | 첫 버전 | 최종본 | 사실 3점↓ | ${PLATFORM_KEYS.map((k) => PLATFORMS[k].label).join(' | ')} | 자동 보완 |`,
  `|---|---|---|---|${PLATFORM_KEYS.map(() => '---').join('|')}|---|`,
  ...Object.values(latest).map((r) => `| ${r.name} | ${fmt(r.avg)} | **${fmt(r.finalAvg)}** | ${r.facts3} | ${PLATFORM_KEYS.map((k) => (r.byKey[k] ? r.byKey[k].total.toFixed(1) : '-')).join(' | ')} | ${r.revised.length}개 |`),
  '',
  '## 회차별 평균',
  '',
  '| 컨셉 | 회차별 첫 버전 평균 (오래된 순, 괄호는 최종본) |',
  '|---|---|',
  ...Object.entries(history).map(([n, rs]) => `| ${n} | ${rs.map((r) => `${fmt(r.avg)}${r.finalAvg != null ? ` (${fmt(r.finalAvg)})` : ''}`).join(' → ')} |`),
  '',
];
const all = Object.values(latest).filter((r) => r.avg != null);
if (all.length) {
  lines.push(`전체 평균(최신): **${fmt(all.reduce((a, r) => a + r.avg, 0) / all.length)}**`, '');
  const plat = PLATFORM_KEYS.map((k) => {
    const xs = all.map((r) => r.byKey[k]?.total).filter((x) => x != null);
    return [k, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null];
  });
  lines.push('## 플랫폼별 평균 (최신)', '', '| 플랫폼 | 평균 |', '|---|---|', ...plat.map(([k, v]) => `| ${PLATFORMS[k].label} | ${fmt(v)} |`), '');
}
await fs.writeFile(path.join(ROOT, 'docs', 'evals', 'README.md'), lines.join('\n'));
console.log(lines.join('\n'));
