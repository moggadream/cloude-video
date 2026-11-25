// 제작 문서: 완성 영상 하나마다 "대본 + 컷별 스토리보드"를 실제 제작 현장처럼 한 장에 정리한다.
//   out/<형식>_storyboard.html  (사진이 안에 들어 있어 파일 하나만 보내도 열림)
// 컷 사진은 완성 영상에서 각 컷의 가운데 순간을 뽑아 쓴다 → 문서와 영상이 항상 같다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from './media.js';
import { FORMATS } from './render.js';
import { storyboardFor, FRAMINGS } from '../guides/storyboards.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = (t) => { const s = Math.max(0, t); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const media = (ref) => String(ref).split(':')[0];

/** 완성 영상에서 시각 t 의 화면 한 장 (작은 jpg, base64) */
async function frameAt(outDir, file, t, name) {
  await ffmpeg(['-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-vf', 'scale=300:-2', '-q:v', '4', '-y', name], { cwd: outDir });
  const p = path.join(outDir, name);
  const b = await fs.readFile(p);
  await fs.rm(p, { force: true });
  return `data:image/jpeg;base64,${b.toString('base64')}`;
}

/**
 * @param {{project:object, key:string, dir:string}} o
 * @returns {Promise<string|null>} 만든 파일 이름 (out 폴더 기준)
 */
export async function writeProductionDoc({ project, key, dir }) {
  const plan = project.plan || {};
  const script = plan[key];
  const v = project.outputs?.[key]?.video;
  if (!script || !v?.cuts?.length) return null;
  const fmt = FORMATS[key];
  const outDir = path.join(dir, 'out');
  const tpl = storyboardFor(plan.concept);
  const shotBy = new Map((plan.shots || []).map((s) => [s.ref, s]));
  // 스토리보드 비트: 컷 ref → 비트 (숏폼만)
  const beatOf = new Map();
  if (fmt.short) for (const b of plan.storyboard?.beats || []) for (const s of b.shots || []) if (!beatOf.has(s)) beatOf.set(s, b);
  const role = new Map(tpl.beats.map((b) => [b.id, b.role.split(/[:(]/)[0].trim()]));
  const texts = v.texts || [];
  const textAt = (a, b) => texts.filter((e) => e.start < b && e.end > a && e.type !== 'place');
  const scenes = v.scenes || [];
  const sceneAt = (t) => scenes.findIndex((s) => t >= s.t - 0.01 && t < s.t + s.d - 0.01);

  // 1) 컷 카드
  const cards = [];
  for (const [i, c] of v.cuts.entries()) {
    const img = await frameAt(outDir, v.file, c.t + c.d / 2, `_sb_${i}.jpg`);
    const shot = shotBy.get(c.shot) || {};
    const beat = beatOf.get(c.shot);
    const si = sceneAt(c.t + 0.05);
    const on = textAt(c.t, c.t + c.d);
    cards.push(`<article class="cut">
  <img src="${img}" alt="컷 ${i + 1}">
  <div class="meta">
    <div class="row"><b class="no">${i + 1}</b><span class="tc">${clock(c.t)} – ${clock(c.t + c.d)}</span><span class="dur">${c.d.toFixed(1)}초</span></div>
    ${beat ? `<div class="beat">${esc(beat.beat)} · ${esc(role.get(beat.beat) || '')}</div>` : ''}
    <div class="fr">구도: ${esc(FRAMINGS[shot.framing] || shot.framing || '-')}</div>
    <p class="desc">${esc(shot.description || c.shot)}</p>
    ${on.length ? `<div class="on">${on.map((e) => `<span class="t-${e.type}">${esc(e.text).replace(/\n/g, ' / ')}</span>`).join('')}</div>` : ''}
    ${si >= 0 ? `<div class="sc">장면 ${si + 1} 나레이션</div>` : ''}
  </div>
</article>`);
  }

  // 2) 대본 (장면 = 나레이션 한 줄)
  const rows = (scenes.length ? scenes : script.scenes.map((s) => ({ ...s, t: 0, d: 0 }))).map((s, i) => {
    const sc = script.scenes[i] || s;
    const cutNos = v.cuts.map((c, k) => (c.t >= s.t - 0.01 && c.t < s.t + s.d - 0.01 ? k + 1 : 0)).filter(Boolean);
    const screen = [sc.label && `이름표 "${sc.label}"`, sc.price_tag && `가격 "${sc.price_tag}"`, sc.cut_caption && `컷 자막 "${sc.cut_caption}"`,
      ...(sc.extra_shots || []).filter((x) => x.caption).map((x) => `컷 자막 "${x.caption}"`), sc.caption && `장면 자막 "${sc.caption}"`].filter(Boolean);
    return `<tr><td class="n">${i + 1}</td><td class="tc">${s.d ? `${clock(s.t)}<br><small>${s.d.toFixed(1)}초</small>` : ''}</td>
<td class="narr">${esc(sc.narration)}${screen.length ? `<div class="scr">${screen.map(esc).join(' · ')}</div>` : ''}</td><td class="cuts">${cutNos.map((n) => `<span class="pill">${n}</span>`).join('')}</td></tr>`;
  }).join('\n');

  // 3) 인기 영상 기준과 비교
  const ref = tpl.reference;
  const first = v.cuts[0]?.d;
  const sb = plan.storyboard;
  const checks = [
    ['전체 길이', `${v.duration}초`, `${tpl.totalSec.join('~')}초`, v.duration >= tpl.totalSec[0] && v.duration <= tpl.totalSec[1] * 1.1],
    ['컷 수', `${v.cuts.length}컷`, `${tpl.minCuts || 6}컷 이상`, v.cuts.length >= (tpl.minCuts || 6)],
    ['컷 하나 평균', `${v.avgCut}초`, `${tpl.cutSec.join('~')}초`, v.avgCut <= tpl.cutSec[1] * 1.15],
    ['첫 컷', `${first?.toFixed(1)}초`, '2.5초 이하', first <= 2.5],
    ...(v.speechRatio != null ? [['말하는 시간', `${v.speechRatio}%`, '86~97%', v.speechRatio >= 80]] : []),
    ['같은 자료 연속', `${v.cuts.filter((c, i) => i && media(c.shot) === media(v.cuts[i - 1].shot)).length}번`, '0번', !v.cuts.some((c, i) => i && media(c.shot) === media(v.cuts[i - 1].shot))],
  ];
  const checkRows = checks.map(([a, b, c, ok]) => `<tr><td>${a}</td><td><b>${esc(b)}</b></td><td>${esc(c)}</td><td>${ok ? '✅' : '⚠️'}</td></tr>`).join('');

  const tags = (script.hashtags || []).map((h) => `#${String(h).replace(/^#/, '')}`).join(' ');
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plan.place_name || '')} ${esc(fmt.label)} 대본·스토리보드</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--mute:#6b6a66;--line:#e2e0da;--acc:#e8a400;--accbg:#fff4cf}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#212120;--ink:#eeede9;--mute:#a3a19b;--line:#3a3936;--acc:#ffc93c;--accbg:#3b3110}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:34px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--line)}
.sub{color:var(--mute);margin:0 0 16px}.hook{display:inline-block;background:var(--accbg);border-left:5px solid var(--acc);padding:8px 14px;font-weight:800;font-size:18px;white-space:pre-line;border-radius:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden}th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:13px;color:var(--mute);font-weight:600}td.n{width:34px;font-weight:800}td.tc{width:64px;white-space:nowrap;color:var(--mute)}td.narr{font-size:16px;font-weight:600}.scr{color:var(--mute);font-size:13px;font-weight:400;margin-top:4px}td.cuts{width:84px}
.pill{display:inline-block;min-width:22px;padding:0 6px;margin:0 3px 3px 0;border-radius:11px;background:var(--accbg);color:var(--ink);font-size:12px;text-align:center;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.cut{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.cut img{width:100%;aspect-ratio:${fmt.w}/${fmt.h};object-fit:cover;background:#000;display:block}
.meta{padding:10px 12px 12px;font-size:13px}.row{display:flex;gap:8px;align-items:baseline}.no{font-size:18px}.tc{color:var(--mute)}.dur{margin-left:auto;font-weight:700}
.beat{margin-top:4px;font-weight:700;color:var(--acc)}.fr{color:var(--mute)}.desc{margin:6px 0;color:var(--ink)}
.on span{display:inline-block;margin:2px 4px 2px 0;padding:1px 7px;border-radius:5px;background:var(--bg);font-weight:700}.on .t-hook{background:var(--accbg)}.on .t-price{background:#ffd400;color:#111}
.sc{color:var(--mute);font-size:12px}.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;white-space:pre-line}
.ref a{color:var(--acc)}
</style></head><body><main>
<h1>${esc(plan.place_name || '')} — ${esc(fmt.label)} 대본·스토리보드</h1>
<p class="sub">${esc(tpl.form)} · ${v.duration}초 · ${v.cuts.length}컷 · 장면(나레이션) ${scenes.length || script.scenes.length}개${sb?.score != null && fmt.short ? ` · 스토리보드 점수 ${sb.score}점` : ''}</p>
${script.hook ? `<div class="hook">${esc(script.hook)}</div>` : ''}

<h2>1. 인기 영상 기준과 비교</h2>
${ref ? `<p class="ref">기준 영상: <a href="${esc(ref.url)}">${esc(ref.title)}</a> (조회 ${esc(ref.views)}, ${ref.sec}초)</p>` : ''}
<table><tr><th>항목</th><th>이 영상</th><th>기준</th><th></th></tr>${checkRows}</table>

<h2>2. 대본</h2>
<table><tr><th>#</th><th>시간</th><th>나레이션 (말) · 화면 글자</th><th>컷</th></tr>
${rows}</table>

<h2>3. 스토리보드 (컷별 화면)</h2>
<div class="grid">
${cards.join('\n')}
</div>

<h2>4. 올릴 때 쓰는 글</h2>
<div class="box"><b>${esc(script.title || '')}</b>

${esc(script.description || script.caption || '')}

${esc(tags)}</div>
</main></body></html>`;
  const name = `${key}_storyboard.html`;
  await fs.writeFile(path.join(outDir, name), html);
  return name;
}
