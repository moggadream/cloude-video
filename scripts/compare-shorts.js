// 우리 숏폼을 인기 쇼츠와 같은 잣대(rea-video)로 재서 나란히 비교한다.
//   node scripts/compare-shorts.js <우리 영상.mp4> [이름]
// rea-video 설치 위치: REA_VIDEO (기본 D:\ProgramFiles\rea-video). 인기 쇼츠 분석 결과는 그 안의 out/ref*
// 결과 표는 화면에 출력 (docs/evals/2026-11-24-reference-shorts.md 와 같은 항목)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const REA = process.env.REA_VIDEO || 'D:\\ProgramFiles\\rea-video';
const EXE = path.join(REA, '.venv', 'Scripts', 'rea-video.exe');
const [video, name = `ours_${Date.now()}`] = process.argv.slice(2);

function decompose(file, outDir) {
  return new Promise((resolve, reject) => {
    const p = spawn(EXE, ['decompose', file, '-o', outDir, '--ocr-lang', 'ko', '--no-moments'], {
      cwd: REA, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true,
    });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`rea-video 실패 (${code}): ${err.slice(-400)}`))));
  });
}

/** rea-video 결과에서 비교 항목만 */
export function measure(outDir) {
  const b = JSON.parse(fs.readFileSync(path.join(outDir, 'breakdown.json'), 'utf8'));
  const d = b.summary.duration;
  const shots = b.shots || [];
  const lines = b.speech?.lines || [];
  const speechSec = lines.reduce((a, l) => a + Math.max(0, l.end - l.start), 0);
  const chars = lines.reduce((a, l) => a + String(l.text || '').replace(/\s/g, '').length, 0);
  return {
    name: path.basename(outDir),
    duration: d,
    shots: shots.length,
    avgShot: b.summary.avg_shot_s,
    firstShot: shots[0]?.duration ?? null,
    speechRatio: d ? speechSec / d : 0,
    charsPerSec: speechSec ? chars / speechSec : 0,
    subtitles: b.packaging?.counts?.text?.subtitle ?? null,
    firstLine: (lines[0]?.text || '').slice(0, 24),
  };
}

const row = (m) => `| ${m.name} | ${m.duration.toFixed(1)}초 | ${m.shots} | ${m.avgShot.toFixed(2)}초 | ${m.firstShot?.toFixed(2) ?? '-'}초 | ${Math.round(m.speechRatio * 100)}% | ${m.charsPerSec.toFixed(1)} | ${m.subtitles ?? '-'} | ${m.firstLine} |`;

if (video) {
  const outDir = path.join(REA, 'out', name);
  if (!fs.existsSync(path.join(outDir, 'breakdown.json'))) {
    console.log(`rea-video 로 재는 중 (${path.basename(video)} → out/${name}) ...`);
    await decompose(path.resolve(video), outDir);
  }
  const refs = fs.readdirSync(path.join(REA, 'out')).filter((d) => /^ref\d/.test(d))
    .map((d) => path.join(REA, 'out', d)).filter((d) => fs.existsSync(path.join(d, 'breakdown.json')));
  const ours = measure(outDir);
  const ref = refs.map(measure);
  console.log('| 영상 | 길이 | 컷 | 평균 컷 | 첫 컷 | 말하는 시간 | 초당 글자 | 자막 줄 | 첫마디 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  console.log(row({ ...ours, name: `**${ours.name}**` }));
  ref.forEach((m) => console.log(row(m)));
  const range = (k) => [Math.min(...ref.map((m) => m[k])), Math.max(...ref.map((m) => m[k]))];
  const [a0, a1] = range('avgShot'); const [f0, f1] = range('firstShot');
  console.log(`\n인기 쇼츠 범위: 평균 컷 ${a0.toFixed(2)}~${a1.toFixed(2)}초 · 첫 컷 ${f0.toFixed(2)}~${f1.toFixed(2)}초 · 말하는 시간 86~97% (광고 제외)`);
}
