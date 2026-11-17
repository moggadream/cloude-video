// 시나리오(가상 분석 결과)로 플랫폼별 글을 쓰고 자체 검증까지 돌려 보고서를 만든다.
//   node scripts/eval-scenario.js restaurant festival park
// 결과: docs/evals/<시나리오>.md (읽기 좋은 보고서), data/evals/<시나리오>-<시각>.json (원본)
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { PLATFORMS, PLATFORM_KEYS, writeAll, finalizePlan } from '../src/pipeline/plan.js';
import { selfReview } from '../src/pipeline/review.js';
import { lintPlan } from '../src/pipeline/lint.js';
import { aiStatus } from '../src/ai/index.js';

process.env.NO_FEEDBACK = '1'; // 지난 수정 요청이 평가에 섞이지 않게
const names = process.argv.slice(2);
if (!names.length) { console.error('시나리오 이름을 주세요 (tests/scenarios/*.json)'); process.exit(1); }
const ai = await aiStatus();
if (ai.backend === 'off') { console.error('AI가 연결돼 있어야 해요'); process.exit(1); }

function fakeProject(sc) {
  const media = new Map();
  for (const s of sc.analysis.shots) {
    const [id, f] = s.ref.split(':f');
    if (f === undefined) media.set(id, { id, kind: 'image', file: `${id}.jpg`, normalized: `${id}.jpg`, frames: [{ file: `${id}.jpg`, time: 0 }] });
    else media.set(id, { id, kind: 'video', file: `${id}.mp4`, duration: 9, frames: [0, 3, 6].map((t, i) => ({ file: `${id}_f${i}.jpg`, time: t })) });
  }
  return { id: 'eval', hints: sc.hints, media: [...media.values()] };
}

const fmtScenes = (o) => o.scenes.map((s, i) => `| ${i + 1} | ${s.shot} | ${s.caption} | ${s.price_tag} | ${s.narration} |`).join('\n');
function outputMd(key, o) {
  const t = PLATFORMS[key].type;
  if (t === 'video') {
    return [`**제목**: ${o.title}`, `**훅**: ${String(o.hook).replace(/\n/g, ' / ')}`, '',
      '| # | 장면 | 화면 자막 | 가격 | 나레이션 |', '|---|---|---|---|---|', fmtScenes(o), '',
      `**설명/캡션**:\n\n${o.description}`, '', `**해시태그**: ${o.hashtags.map((x) => `#${x}`).join(' ')}`].join('\n');
  }
  if (t === 'carousel') {
    return ['| # | 장면 | 제목 | 본문 |', '|---|---|---|---|',
      o.slides.map((s, i) => `| ${i + 1} | ${s.shot} | ${s.headline.replace(/\n/g, ' / ')} | ${s.body.replace(/\n/g, ' / ')} |`).join('\n'),
      '', `**캡션**:\n\n${o.caption}`, '', `**해시태그**: ${o.hashtags.map((x) => `#${x}`).join(' ')}`].join('\n');
  }
  if (t === 'text') return `${o.text}\n\n주제 태그: ${o.topic_tag}`;
  return [`**제목**: ${o.title}`, '', ...o.sections.map((s) => `${s.shot ? `[사진 ${s.shot}]\n` : ''}#### ${s.heading}\n${s.body}`), '', `**해시태그**: ${o.hashtags.map((x) => `#${x}`).join(' ')}`].join('\n\n');
}

for (const name of names) {
  const sc = JSON.parse(await fs.readFile(path.join(ROOT, 'tests', 'scenarios', `${name}.json`), 'utf8'));
  const project = fakeProject(sc);
  const t0 = Date.now();
  console.log(`\n=== ${name} : 글쓰기 시작 (${ai.label}) ===`);
  let plan = { _source: 'eval', ...structuredClone(sc.analysis) };
  await writeAll(project, plan);
  plan = finalizePlan(plan, project);
  const draft = structuredClone(plan);
  console.log(`=== ${name} : 자체 검증 ===`);
  const r = await selfReview(project, plan);
  plan = r.plan;
  const sec = Math.round((Date.now() - t0) / 1000);

  await fs.mkdir(path.join(ROOT, 'data', 'evals'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.writeFile(path.join(ROOT, 'data', 'evals', `${name}-${stamp}.json`), JSON.stringify({ scenario: sc, draft, plan, review: r.review }, null, 1));

  const byKey = Object.fromEntries((r.review.ai || []).map((x) => [x.key, x]));
  const avg = r.review.ai?.length ? (r.review.ai.reduce((a, x) => a + x.total, 0) / r.review.ai.length).toFixed(2) : '-';
  const lintAfter = r.review.lintAfter || lintPlan(plan, project, PLATFORM_KEYS);
  const md = [
    `# 평가: ${name} (${sc.hints.placeName})`,
    '',
    `> ${sc.note}`,
    `> 실행: ${new Date().toISOString().slice(0, 16)} · AI: ${ai.label} · ${sec}초`,
    '',
    '## 점수 요약 (첫 버전 기준 AI 편집장 채점)',
    '',
    '| 결과물 | 총점 | 사실 | 첫인상 | 사람다움 | 플랫폼 | 정보 | 구체성 | 자동 보완 | 규칙(전→후) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...PLATFORM_KEYS.map((k) => {
      const a = byKey[k];
      const s = a?.scores || {};
      return `| ${PLATFORMS[k].label} | ${a ? a.total.toFixed(1) : '-'} | ${s.facts ?? ''} | ${s.hook ?? ''} | ${s.human ?? ''} | ${s.platform ?? ''} | ${s.value ?? ''} | ${s.specific ?? ''} | ${r.review.revised.includes(k) ? '✅' : ''} | ${r.review.lint[k]?.score ?? '-'} → ${lintAfter[k]?.score ?? '-'} |`;
    }),
    '',
    `평균 ${avg} / 5`,
    '',
    '## 편집장 의견',
    ...PLATFORM_KEYS.map((k) => {
      const a = byKey[k];
      if (!a) return '';
      return [`### ${PLATFORMS[k].label}`, a.strengths.length ? `- 잘된 점: ${a.strengths.join(' / ')}` : '', ...a.fixes.map((f) => `- 고칠 점: ${f}`),
        ...(lintAfter[k]?.issues || []).map((i) => `- 규칙(보완 후): ${i.msg}`)].filter(Boolean).join('\n');
    }),
    '',
    '## 최종 결과물',
    ...PLATFORM_KEYS.map((k) => [`### ${PLATFORMS[k].label}${r.review.revised.includes(k) ? ' (자동 보완 후)' : ''}`, '', outputMd(k, plan[k]),
      r.review.revised.includes(k) ? `\n<details><summary>처음 버전</summary>\n\n${outputMd(k, draft[k])}\n\n</details>` : ''].join('\n')),
  ].join('\n');
  await fs.mkdir(path.join(ROOT, 'docs', 'evals'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'docs', 'evals', `${name}.md`), md);
  console.log(`=== ${name} 완료: 평균 ${avg}, 자동 보완 ${r.review.revised.join(', ') || '없음'}, ${sec}초 → docs/evals/${name}.md`);
}
