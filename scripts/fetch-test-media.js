// 시험용 사진·영상 받기 (tests/media/manifest.json 목록, 모두 Pexels 무료 라이선스)
//   node scripts/fetch-test-media.js            → 모든 컨셉
//   node scripts/fetch-test-media.js cafe park  → 고른 컨셉만
// 받은 파일은 tests/media/<컨셉>/ 에 (GitHub에는 올리지 않음), 출처는 tests/media/<컨셉>/SOURCES.md
// 시험 제작: SAMPLE_DIR=tests/media/cafe CONCEPT=cafe node scripts/test-pipeline.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { ffmpeg, probe } from '../src/pipeline/media.js';

const UA = 'Mozilla/5.0 (cloude-video test media)';
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'tests', 'media', 'manifest.json'), 'utf8'));
const want = process.argv.slice(2);
const sets = Object.entries(manifest.sets).filter(([k]) => !want.length || want.includes(k));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(urls, out) {
  for (const url of urls) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' }).catch(() => null);
    if (!res?.ok) continue;
    const type = res.headers.get('content-type') || '';
    if (!/^(video|image)\//.test(type)) continue;
    await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
    return { url: res.url, type };
  }
  return null;
}

/** 시험 속도를 위해 영상은 짧은 쪽 720픽셀, 20초 이하로 줄인다 */
async function shrinkVideo(file) {
  const info = await probe(file).catch(() => null);
  if (!info) return;
  if (Math.min(info.width, info.height) <= 720 && info.duration <= 20) return;
  const tmp = `${file}.tmp.mp4`;
  const scale = info.width < info.height ? 'scale=720:-2' : 'scale=-2:720';
  await ffmpeg(['-i', file, '-t', '20', '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', tmp]);
  await fs.rename(tmp, file);
}

for (const [concept, set] of sets) {
  const dir = path.join(ROOT, 'tests', 'media', concept);
  await fs.mkdir(dir, { recursive: true });
  const rows = [];
  for (const [i, [kind, id, slug]] of set.items.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const file = `${n}_${kind === 'v' ? 'v' : 'p'}_${slug.slice(0, 40)}.${kind === 'v' ? 'mp4' : 'jpg'}`;
    const out = path.join(dir, file);
    const page = `https://www.pexels.com/${kind === 'v' ? 'video' : 'photo'}/${slug}-${id}/`;
    const have = await fs.stat(out).then((s) => s.size > 0).catch(() => false);
    if (!have) {
      const urls = kind === 'v'
        // 세로 720p → 가로 720p → 다른 프레임 수 순서로 시도 (원본 4K는 너무 커서 피함)
        ? [...[[720, 1280, 30], [720, 1280, 25], [720, 1280, 24], [1280, 720, 30], [1280, 720, 25], [1280, 720, 24], [540, 960, 25], [960, 540, 25]]
          .map(([w, h, fps]) => `https://www.pexels.com/download/video/${id}/?fps=${fps}&h=${h}&w=${w}`),
          `https://www.pexels.com/download/video/${id}/`] // 마지막: 원본 (아래에서 줄임)
        : [`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`];
      const got = await download(urls, out);
      console.log(`${concept} ${file}: ${got ? '받음' : '실패'}`);
      await sleep(400);
      if (!got) continue;
      if (kind === 'v') await shrinkVideo(out);
    }
    rows.push(`| ${file} | [Pexels ${id}](${page}) | Pexels License |`);
  }
  await fs.writeFile(path.join(dir, 'SOURCES.md'), [
    `# ${set.place}`, '', '시험용 자료예요. 여러 장소에서 찍힌 Pexels 자료를 모은 가상 장소라, 장소 이름·메모는 지어낸 거예요.',
    '라이선스: https://www.pexels.com/license/ (무료, 상업 이용 가능, 출처 표시 불필요)', '',
    `메모: ${set.memo}`, '', '| 파일 | 출처 | 라이선스 |', '|---|---|---|', ...rows, '',
  ].join('\n'));
  await fs.writeFile(path.join(dir, 'memo.txt'), set.memo);
}
console.log('끝');
