// 이미 만든 영상으로 대본·스토리보드 문서를 다시 만든다.
//   node scripts/production-doc.js <작업 ID> [shorts reels tiktok longform]
// 결과: data/projects/<ID>/out/<형식>_storyboard.html
import path from 'node:path';
import { projectDir, getProject, updateProject } from '../src/store.js';
import { writeProductionDoc } from '../src/pipeline/production.js';

const [id, ...want] = process.argv.slice(2);
if (!id) { console.error('작업 ID를 주세요 (data/projects/ 아래 폴더 이름)'); process.exit(1); }
const dir = projectDir(id);
for (const key of want.length ? want : ['shorts', 'reels', 'tiktok', 'naverclip', 'shorts_music', 'reels_music', 'tiktok_music', 'naverclip_music', 'longform']) {
  const doc = await writeProductionDoc({ project: await getProject(id), key, dir });
  if (!doc) { console.log(`- ${key}: 영상 없음 (또는 컷 정보 없는 옛 영상)`); continue; }
  await updateProject(id, (p) => { p.outputs[key].doc = doc; });
  console.log(`- ${key}: ${path.join(dir, 'out', doc)}`);
}
