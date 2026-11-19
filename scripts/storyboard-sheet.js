// 만든 영상을 인기 쇼츠와 같은 방식(길이를 12등분한 화면 12장)으로 한 장에 모아 비교한다.
//   node scripts/storyboard-sheet.js <작업 ID> [shorts reels tiktok]
// 결과: data/projects/<ID>/out/<형식>_sheet.jpg + 컷 통계·스토리보드 점수 출력
import path from 'node:path';
import { projectDir, getProject } from '../src/store.js';
import { ffmpeg } from '../src/pipeline/media.js';
import { storyboardFor } from '../src/guides/storyboards.js';

const [id, ...want] = process.argv.slice(2);
if (!id) { console.error('작업 ID를 주세요 (data/projects/ 아래 폴더 이름)'); process.exit(1); }
const p = await getProject(id);
const dir = projectDir(id);
const formats = want.length ? want : ['shorts', 'reels', 'tiktok'];
const sb = p.plan?.storyboard;
const tpl = storyboardFor(p.plan?.concept);
const framing = new Map((p.plan?.shots || []).map((s) => [s.ref, s.framing]));

console.log(`# ${p.plan?.place_name || id} (${p.plan?.concept})`);
if (sb) {
  console.log(`스토리보드 ${sb.score}점${sb.auto ? ' (기본 틀)' : ''} · ${sb.stats?.cuts}컷 · 평균 ${sb.stats?.avgCut}초 · 가까운 컷 ${sb.stats?.closeRatio}% · 넓은 컷 ${sb.stats?.wideRatio}%`);
  if (sb.issues?.length) console.log(`  고칠 점: ${sb.issues.join(' / ')}`);
}
console.log(`기준: ${tpl.form} · 컷 ${tpl.cutSec.join('~')}초 · 전체 ${tpl.totalSec.join('~')}초${tpl.reference ? ` · 기준 영상 ${tpl.reference.url}` : ''}`);

for (const f of formats) {
  const v = p.outputs?.[f]?.video;
  if (!v) { console.log(`- ${f}: 영상 없음`); continue; }
  const out = path.join(dir, 'out', `${f}_sheet.jpg`);
  const n = 12;
  // 12등분 지점마다 한 장씩 → 6×2 타일 (상대 경로로: 윈도우 경로가 필터를 깨지 않게)
  await ffmpeg(['-i', v.file, '-vf', `fps=${n}/${v.duration},scale=180:-2,tile=6x2:padding=4:color=black`, '-frames:v', '1', '-q:v', '3', `${f}_sheet.jpg`],
    { cwd: path.join(dir, 'out') });
  const cuts = v.cuts || [];
  const fr = cuts.map((c) => framing.get(c.shot) || '-');
  console.log(`- ${f}: ${v.duration}초 · ${cuts.length || v.sceneCount}컷 · 평균 ${v.avgCut ?? '-'}초 · 채우기 ${[...new Set(cuts.map((c) => c.fill))].join('/')}`);
  console.log(`  컷 구도: ${fr.join(' ')}`);
  console.log(`  화면 모음: ${out}`);
}
