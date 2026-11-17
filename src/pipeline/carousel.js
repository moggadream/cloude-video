// 인스타그램 캐러셀(카드뉴스): 1080x1350 이미지에 제목·설명을 얹는다
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ffmpeg } from './media.js';
import { assText, escapeFilterPath } from './render.js';
import { allShots } from './plan.js';

const W = 1080;
const H = 1350;

function slideAss(slide, index, total) {
  const cover = index === 0;
  const headSize = cover ? 104 : 84;
  const bodySize = cover ? 46 : 44;
  // 색상 형식: &HAABBGGRR
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Head,Black Han Sans,${headSize},${cover ? '&H0000E1FF' : '&H00FFFFFF'},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,4,3,1,72,72,${cover ? 250 : 200},1`,
    `Style: Body,NanumGothicExtraBold,${bodySize},&H00F2F2F2,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,1,72,72,${cover ? 150 : 100},1`,
    'Style: Page,NanumGothicExtraBold,30,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,3,10,0,9,40,40,40,1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const ev = (style, text) => `Dialogue: 0,0:00:00.00,0:00:05.00,${style},,0,0,0,,${assText(text)}`;
  if (slide.headline) lines.push(ev('Head', slide.headline));
  if (slide.body) lines.push(ev('Body', slide.body));
  lines.push(ev('Page', `${index + 1}/${total}`));
  return `${lines.join('\n')}\n`;
}

/** 캐러셀 이미지들을 만든다. out/carousel/01.jpg ... */
export async function renderCarousel({ script, project, dir }) {
  const byRef = new Map(allShots(project).map((s) => [s.ref, s]));
  const outDir = path.join(dir, 'out', 'carousel');
  const work = path.join(dir, 'work', 'carousel');
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(work, { recursive: true });
  const fontsRel = path.relative(work, config.fontsDir).split(path.sep).join('/');

  // 아래쪽을 점점 어둡게 (글자가 잘 보이도록)
  // 겹쳐 칠하면 아래로 갈수록 진해진다: 얇은 띠 40개로 부드럽게
  const STEPS = 40;
  const top = 0.42;
  const bandH = Math.ceil((H * (1 - top)) / STEPS);
  const shade = Array.from({ length: STEPS }, (_, i) =>
    `drawbox=x=0:y=${Math.round(H * top + i * bandH)}:w=${W}:h=${H}:color=black@0.03:t=fill`).join(',');

  const images = [];
  for (const [i, slide] of script.slides.entries()) {
    const shot = byRef.get(slide.shot);
    if (!shot) continue;
    const name = `${String(i + 1).padStart(2, '0')}.jpg`;
    const assName = `slide_${i}.ass`;
    await fs.writeFile(path.join(work, assName), slideAss(slide, i, script.slides.length));
    await ffmpeg([
      '-i', path.join(dir, 'work', shot.frame.file),
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${shade},` +
        `subtitles=filename=${assName}:fontsdir=${escapeFilterPath(fontsRel)}`,
      '-frames:v', '1', '-q:v', '2', path.join(outDir, name),
    ], { cwd: work });
    images.push(name);
  }
  await fs.rm(work, { recursive: true, force: true });
  return { images, width: W, height: H, renderedAt: new Date().toISOString() };
}
