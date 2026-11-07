// 테스트용 샘플 사진·영상을 samples/ 에 만든다 (실제 사진 대신)
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { ffmpeg } from '../src/pipeline/media.js';

const out = path.join(ROOT, 'samples');
const font = path.join(ROOT, 'assets/fonts/NanumGothic-ExtraBold.ttf');
await fs.mkdir(out, { recursive: true });

const photos = [
  { name: 'p1_entrance.jpg', w: 3024, h: 4032, color: '0x2e7d32', text: '행복마트 입구' },
  { name: 'p2_strawberry.jpg', w: 4032, h: 3024, color: '0xc62828', text: '딸기 1팩 9,900원' },
  { name: 'p3_apple.jpg', w: 3024, h: 4032, color: '0xef6c00', text: '사과 5입 12,800원' },
  { name: 'p4_aisle.jpg', w: 4032, h: 3024, color: '0x1565c0', text: '과일 코너' },
];
for (const p of photos) {
  await ffmpeg([
    '-f', 'lavfi', '-i', `gradients=s=${p.w}x${p.h}:c0=${p.color}:c1=0xffffff:duration=1`,
    '-vf', `drawtext=fontfile=${font}:text='${p.text}':fontsize=${Math.round(p.w / 12)}:fontcolor=white:borderw=8:bordercolor=black:x=(w-tw)/2:y=(h-th)/2`,
    '-frames:v', '1', '-q:v', '3', path.join(out, p.name),
  ]);
}
await ffmpeg([
  '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=8',
  '-f', 'lavfi', '-i', 'sine=f=440:d=8',
  '-vf', `drawtext=fontfile=${font}:text='매장 둘러보기 영상':fontsize=90:fontcolor=white:borderw=6:x=(w-tw)/2:y=h*0.2`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  path.join(out, 'v1_walk.mp4'),
]);
console.log('samples/ 에 샘플을 만들었어요:', (await fs.readdir(out)).join(', '));
