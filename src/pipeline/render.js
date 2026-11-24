// 계획(plan)의 장면 목록으로 실제 영상을 만든다 (ffmpeg)
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { ffmpeg, audioDuration, concatLine } from './media.js';
import { narrate, makeMusic } from './audio.js';

export const FORMATS = {
  shorts: { label: '유튜브 쇼츠', w: 1080, h: 1920, maxTotal: 59, minScene: 2.2, maxScene: 7, captionMargin: 420 },
  reels: { label: '인스타그램 릴스', w: 1080, h: 1920, maxTotal: 90, minScene: 2.0, maxScene: 6, captionMargin: 460 },
  // 틱톡은 오른쪽 버튼·아래쪽 캡션이 화면을 가려서 글자를 더 안쪽·위쪽에 둔다
  tiktok: { label: '틱톡', w: 1080, h: 1920, maxTotal: 90, minScene: 2.0, maxScene: 6, captionMargin: 600, marginL: 70, marginR: 190 },
  longform: { label: '유튜브 롱폼', w: 1920, h: 1080, maxTotal: 1800, minScene: 3.5, maxScene: 20, captionMargin: 90 },
};

const FPS = 30;
const VOICE_LEAD = 0.25; // 장면 시작 후 나레이션이 시작되기까지
const VOICE_TAIL = 0.45; // 나레이션이 끝난 뒤 여유

/** 음성이 없을 때 읽는 속도로 장면 길이를 추정 (한국어 초당 약 6자) */
const estimateSeconds = (text) => (text ? text.replace(/\s/g, '').length / 6 + 0.9 : 0);

/**
 * @param {object} opts
 * @param {'shorts'|'reels'|'longform'} opts.format
 * @param {object} opts.script  plan.shorts / plan.reels / plan.longform
 * @param {object} opts.project
 * @param {string} opts.dir     프로젝트 폴더
 * @param {string} opts.musicPrompt
 * @param {(p:number)=>void} [opts.onProgress]
 */
export async function renderVideo({ format, script, project, dir, musicPrompt, onProgress = () => {} }) {
  const fmt = FORMATS[format];
  const work = path.join(dir, 'work', format);
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });
  const mediaById = new Map(project.media.map((m) => [m.id, m]));

  // 1) 장면별 나레이션과 길이 결정
  const scenes = [];
  let total = 0;
  for (const s of script.scenes) {
    const m = mediaById.get(s.media_id);
    if (!m) continue;
    const voice = await narrate(s.narration, path.join(dir, 'work'));
    let dur = voice
      ? voice.duration + VOICE_LEAD + VOICE_TAIL
      : Math.max(estimateSeconds(s.narration), estimateSeconds(s.caption));
    if (!dur) dur = m.kind === 'video' ? Math.min(4, m.duration - s.clip_start) : 3;
    dur = Math.min(Math.max(dur, fmt.minScene), voice ? Infinity : fmt.maxScene);
    if (total + dur > fmt.maxTotal) {
      if (scenes.length === 0) dur = fmt.maxTotal; // 장면이 하나뿐이면 자른다
      else break;
    }
    dur = Math.round(dur * FPS) / FPS;
    scenes.push({ ...s, media: m, voice, start: total, duration: dur });
    total += dur;
  }
  if (scenes.length === 0) throw new Error(`${fmt.label}: 사용할 장면이 없습니다`);
  onProgress(0.1);

  // 2) 컷 나누기: 한 장면(나레이션 한 줄)에 extra_shots 가 있으면 장면 길이를 나눠 빠르게 이어 붙인다
  const framingOf = new Map((project.plan?.shots || []).map((s) => [s.ref, s.framing]));
  const cuts = splitCuts(scenes, mediaById).map((c) => ({ ...c, framing: framingOf.get(c.shot) || '' }));

  // 3) 컷 영상 조각 만들기
  const segFiles = [];
  for (const [i, cut] of cuts.entries()) {
    const out = path.join(work, `seg_${String(i).padStart(3, '0')}.mp4`);
    await renderSegment(cut, i, fmt, dir, out);
    segFiles.push(out);
    onProgress(0.1 + 0.6 * ((i + 1) / cuts.length));
  }

  // 3) 이어 붙이기
  const listFile = path.join(work, 'segments.txt');
  await fs.writeFile(listFile, segFiles.map(concatLine).join('\n'));
  const joined = path.join(work, 'joined.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', joined]);

  // 4) 나레이션 트랙
  const voiceTrack = await buildVoiceTrack(scenes, work);
  onProgress(0.75);

  // 5) 배경음악
  const music = await makeMusic(musicPrompt, total, path.join(dir, 'work'));
  onProgress(0.8);

  // 6) 자막 파일
  const assFile = path.join(work, 'subs.ass');
  await fs.writeFile(assFile, buildAss(scenes, script, fmt, format, cuts));

  // 7) 최종 합성: 자막 입히기 + 나레이션 + 배경음악(나레이션 나올 때 자동으로 작아짐)
  const outFile = path.join(dir, 'out', `${format}.mp4`);
  const hasVoice = scenes.some((s) => s.voice);
  // Windows의 'D:\\...' 같은 경로는 필터 안에서 깨지기 쉬워, 작업 폴더 기준 상대 경로를 쓴다
  const fontsRel = path.relative(work, config.fontsDir).split(path.sep).join('/');
  const subs = `subtitles=filename=subs.ass:fontsdir=${escapeFilterPath(fontsRel)}`;
  const audioFilter = hasVoice
    ? `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[v1][v2];` +
      `[2:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.35,atrim=0:${total}[m];` +
      `[m][v1]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=500[duck];` +
      `[duck][v2]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5,alimiter=limit=0.95[a]`
    : `[2:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.6,atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5[a]`;
  await ffmpeg([
    '-i', joined,
    '-i', voiceTrack,
    '-stream_loop', '-1', '-i', music.file,
    '-filter_complex', `[0:v]${subs}[v];${audioFilter}`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(total),
    '-movflags', '+faststart', outFile,
  ], { cwd: work });
  onProgress(0.95);

  const thumb = path.join(dir, 'out', `${format}_thumb.jpg`);
  await ffmpeg(['-ss', String(Math.min(1, total / 2)), '-i', outFile, '-frames:v', '1', '-q:v', '3', thumb]);

  await fs.rm(work, { recursive: true, force: true });
  onProgress(1);
  return {
    file: `${format}.mp4`,
    thumb: `${format}_thumb.jpg`,
    duration: Math.round(total * 10) / 10,
    width: fmt.w,
    height: fmt.h,
    voice: hasVoice,
    music: music.source,
    chapters: format === 'longform' ? chapterList(scenes) : [],
    sceneCount: scenes.length,
    cutCount: cuts.length,
    avgCut: Math.round((total / cuts.length) * 10) / 10,
    // 스토리보드 비교용: 실제로 화면에 나간 컷 (시작 시각·길이·장면 ref)
    cuts: cuts.map((c) => ({ t: Math.round(c.start * 10) / 10, d: Math.round(c.duration * 10) / 10, shot: c.shot, fill: c.fill })),
    plannedScenes: script.scenes.length,
    usedMedia: [...new Set(scenes.map((s) => s.media_id))],
    renderedAt: new Date().toISOString(),
  };
}

const MIN_CUT = 0.9; // 컷 하나의 최소 길이(초)

/** 장면을 컷으로 나눈다 (장면 길이는 그대로, 컷마다 같은 길이) */
export function splitCuts(scenes, mediaById) {
  const cuts = [];
  for (const sc of scenes) {
    let list = [{ shot: sc.shot, media: sc.media, clip_start: sc.clip_start, caption: sc.cut_caption || '' }];
    for (const x of sc.extra_shots || []) {
      const m = mediaById.get(x.media_id);
      if (m) list.push({ shot: x.shot, media: m, clip_start: x.clip_start || 0, caption: x.caption || '' });
    }
    // 같은 자료(영상)의 컷이 연달아 오면 한 컷처럼 보이므로 번갈아 놓는다 (장면 첫 컷은 그대로)
    list = interleave(list, cuts.at(-1)?.media.id);
    const n = Math.max(1, Math.min(list.length, Math.floor(sc.duration / MIN_CUT)));
    const totalFrames = Math.round(sc.duration * FPS);
    let used = 0;
    for (let i = 0; i < n; i++) {
      const f = i === n - 1 ? totalFrames - used : Math.round(totalFrames / n);
      cuts.push({ ...list[i], scene: sc, start: sc.start + used / FPS, duration: f / FPS });
      used += f;
    }
  }
  return cuts;
}

function interleave(list, prevMedia) {
  // 앞 장면의 마지막 컷과 같은 자료로 시작하면, 다른 자료 컷을 앞으로
  if (prevMedia && list[0].media.id === prevMedia) {
    const k = list.findIndex((c) => c.media.id !== prevMedia);
    if (k > 0) list = [list[k], ...list.slice(0, k), ...list.slice(k + 1)];
  }
  if (list.length < 3) return list;
  const [first, ...rest] = list;
  const out = [first];
  while (rest.length) {
    const last = out.at(-1).media.id;
    const i = rest.findIndex((c) => c.media.id !== last);
    out.push(...rest.splice(i >= 0 ? i : 0, 1));
  }
  return out;
}

/**
 * 화면 채우는 방식: 인기 쇼츠는 화면을 꽉 채운다 (흐린 배경으로 위아래를 채우지 않음)
 * - 'cover': 꽉 채우고 넘치는 부분은 자름
 * - 'pan'  : 세로 화면에 가로 사진 → 꽉 채우고 옆으로 천천히 훑기
 * - 'fit'  : 흐린 배경 위에 전체를 보여줌 (가로 화면에 세로 자료, FILL=off 일 때)
 */
export function fillMode(media, fmt, framing = '') {
  if ((process.env.FILL || 'on') === 'off') return 'fit';
  const ar = media.width && media.height ? media.width / media.height : fmt.w / fmt.h;
  const vertical = fmt.h > fmt.w;
  if (vertical) {
    // 가로로 찍은 가격표·간판은 글자가 잘리면 안 되니 전체를 보여준다
    if (media.kind === 'image' && ar > 0.85 && ['price', 'sign'].includes(framing)) return 'fit';
    if (media.kind === 'image' && ar > 0.85) return 'pan';
    return 'cover';
  }
  return ar >= 1.2 ? 'cover' : 'fit';
}

async function renderSegment(sc, index, fmt, dir, out) {
  const { w: W, h: H } = fmt;
  const frames = Math.round(sc.duration * FPS);
  const bg = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.12:saturation=1.1`;
  const fg = `scale=${W}:${H}:force_original_aspect_ratio=decrease`;
  const cover = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an'];
  const mode = fillMode(sc.media, fmt, sc.framing);
  sc.fill = mode;

  if (sc.media.kind === 'image' && mode === 'pan') {
    // 가로 사진: 높이에 맞춰 키운 뒤 왼쪽↔오른쪽으로 천천히 훑기 (2배로 키워 움직임을 부드럽게)
    // 아주 넓은 사진은 가운데 60%만 훑는다 (너무 빠르지 않게)
    const dur = sc.duration.toFixed(3);
    const along = index % 2 === 0 ? `t/${dur}` : `(1-t/${dur})`;
    const filter =
      `[0:v]scale=-2:${H * 2}:flags=bicubic,` +
      `crop=${W * 2}:${H * 2}:x='(iw-ow)*(0.2*gt(iw/ow\\,2.2)+(1-0.4*gt(iw/ow\\,2.2))*${along})':y=0,` +
      `scale=${W}:${H}:flags=bicubic,setsar=1,format=yuv420p[v]`;
    await ffmpeg([
      '-loop', '1', '-framerate', String(FPS), '-t', dur,
      '-i', path.join(dir, 'work', sc.media.normalized),
      '-filter_complex', filter, '-map', '[v]', '-frames:v', String(frames), ...enc, out,
    ]);
    return;
  }

  if (sc.media.kind === 'image') {
    // 사진: 천천히 확대/축소 (번갈아가며)
    // 줌은 픽셀 단위로 반올림돼 덜덜 떨리기 쉬워서, 4배로 키운 뒤 줌하고 다시 줄인다 (떨림이 1/4 픽셀 이하)
    const zoom = index % 2 === 0 ? `1+0.05*on/${frames}` : `1.05-0.05*on/${frames}`;
    const base = mode === 'fit'
      ? `[0:v]split=2[a][b];[a]${bg}[bg];[b]${fg}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,`
      : `[0:v]${cover},`;
    const filter =
      `${base}scale=${W * 4}:${H * 4}:flags=bicubic,` +
      `zoompan=z='${zoom}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=${W}x${H}:fps=${FPS},` +
      `setsar=1,format=yuv420p[v]`;
    await ffmpeg([
      '-i', path.join(dir, 'work', sc.media.normalized),
      '-filter_complex', filter, '-map', '[v]', '-frames:v', String(frames), ...enc, out,
    ]);
  } else {
    // 영상: 지정 구간을 잘라 쓰되, 중간에 다른 장면으로 넘어가면 그 직전까지만 쓰고
    // 남는 시간은 마지막 화면을 천천히 확대하며 채운다
    const src = path.join(dir, 'media', sc.media.file);
    const shot = await findShot(src, sc.clip_start, sc.duration, sc.media.duration || sc.clip_start + sc.duration);
    const usable = shot.length;
    // 손떨림 보정 (남는 시간은 줌 없이 마지막 화면을 그대로 둔다: 줌은 영상 해상도에서 떨림이 생김)
    const segDir = path.dirname(out);
    const stab = await stabilizer(src, shot.start, usable, segDir, `seg_${index}`);
    const frame = mode === 'fit'
      ? `split=2[a][b];[a]${bg}[bg];[b]${fg}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
      : cover;
    const filter =
      `[0:v]fps=${FPS}${stab ? `,${stab}` : ''},${frame},tpad=stop_mode=clone:stop_duration=${sc.duration},` +
      `trim=duration=${sc.duration}` +
      `,setsar=1,format=yuv420p[v]`;
    await ffmpeg([
      '-ss', String(shot.start), '-t', String(usable),
      '-i', src,
      '-filter_complex', filter, '-map', '[v]', '-frames:v', String(frames), ...enc, out,
    ], { cwd: segDir });
  }
}

// ---------- 손떨림 보정 ----------
let filterList;
async function hasFilter(name) {
  if (!filterList) {
    const { run } = await import('./media.js');
    filterList = await run(config.ffmpegPath, ['-hide_banner', '-filters']).catch(() => '');
  }
  return new RegExp(`\\s${name}\\s`).test(filterList);
}

/**
 * 손떨림 보정 필터 문자열. STABILIZE=off 면 끔.
 * vidstab(2단계: 흔들림 분석 → 보정)이 있으면 쓰고, 없으면 ffmpeg 기본 deshake.
 * 분석 파일은 상대 경로로 써서 Windows 경로(D:\...) 문제를 피한다.
 */
async function stabilizer(src, start, length, cwd, name) {
  if ((process.env.STABILIZE || 'on') === 'off') return '';
  if (await hasFilter('vidstabdetect')) {
    const trf = `${name}.trf`;
    try {
      await ffmpeg(['-ss', String(start), '-t', String(length), '-i', src,
        '-vf', `fps=${FPS},vidstabdetect=shakiness=6:accuracy=12:result=${trf}`, '-f', 'null', '-'], { cwd });
      // zoom=4: 보정하며 생기는 가장자리를 가리려고 4% 확대, smoothing=12: 약 0.4초 단위로 부드럽게
      return `vidstabtransform=input=${trf}:smoothing=12:zoom=4:interpol=bicubic`;
    } catch (err) {
      console.warn('[stabilize] vidstab 분석 실패, deshake 사용:', err.message.slice(0, 120));
    }
  }
  return (await hasFilter('deshake')) ? 'deshake=rx=32:ry=32:edge=mirror' : '';
}

/**
 * clip_start가 들어 있는 "한 컷"(장면이 끊기지 않고 이어지는 구간)을 찾는다.
 * 편집된 영상이나 끊어 찍은 영상에서 다른 장면이 섞이지 않게 하기 위함.
 * @returns {{start:number, length:number}} 실제로 잘라 쓸 시작 시각과 길이
 */
export async function findShot(src, clipStart, want, mediaDuration) {
  const from = Math.max(0, clipStart - 1.5);
  const span = Math.min(want + 3, Math.max(0.5, mediaDuration - from));
  const text = await new Promise((resolve) => {
    const p = spawn(config.ffmpegPath, ['-hide_banner', '-ss', String(from), '-t', String(span), '-i', src, '-an',
      '-vf', "scale=160:-2,select='gt(scene,0.15)',showinfo", '-f', 'null', '-']);
    let out = '';
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out));
    p.on('error', () => resolve(''));
  });
  const cuts = [...text.matchAll(/pts_time:([0-9.]+)/g)].map((m) => from + Number(m[1]));
  // clip_start 바로 뒤(0.3초)를 "보여주려는 장면"으로 본다
  const anchor = clipStart + 0.3;
  const before = cuts.filter((c) => c <= anchor + 0.25);
  const shotStart = before.length ? Math.max(before.at(-1) + 0.05, clipStart - 1.5) : clipStart;
  const start = Math.max(shotStart, Math.min(clipStart, anchor));
  const next = cuts.find((c) => c > start + 0.3);
  const end = next !== undefined ? next - 0.05 : Math.min(start + want, mediaDuration);
  return { start: Math.round(start * 100) / 100, length: Math.max(0.5, Math.min(want, end - start)) };
}

/** 장면 길이에 맞춰 나레이션을 배치한 하나의 오디오 파일 */
async function buildVoiceTrack(scenes, work) {
  const parts = [];
  for (const [i, sc] of scenes.entries()) {
    const part = path.join(work, `voice_${String(i).padStart(3, '0')}.wav`);
    if (sc.voice) {
      const ms = Math.round(VOICE_LEAD * 1000);
      await ffmpeg([
        '-i', sc.voice.file,
        '-af', `aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},apad`,
        '-t', String(sc.duration), '-c:a', 'pcm_s16le', part,
      ]);
    } else {
      await ffmpeg([
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', String(sc.duration), '-c:a', 'pcm_s16le', part,
      ]);
    }
    parts.push(part);
  }
  const list = path.join(work, 'voice.txt');
  await fs.writeFile(list, parts.map(concatLine).join('\n'));
  const out = path.join(work, 'voice.wav');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  return out;
}

// ---------- 자막 (ASS) ----------

function assTime(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// 화면 글자: 자막 글꼴에 없는 이모지는 빼고(네모로 깨짐), ASS 특수문자 처리
export const assText = (s) => String(s)
  .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
  .replace(/[ \t]{2,}/g, ' ')
  .trim()
  .replace(/\\/g, '＼').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');

function buildAss(scenes, script, fmt, format, cuts = []) {
  const vertical = fmt.h > fmt.w;
  const base = vertical ? 1080 : 1080; // 글자 크기 기준 (짧은 변)
  const capSize = Math.round(base * (vertical ? 0.068 : 0.055));
  const hookSize = Math.round(base * (vertical ? 0.1 : 0.085));
  const priceSize = Math.round(base * (vertical ? 0.06 : 0.05));
  const chapSize = Math.round(base * 0.042);
  const sideMargin = vertical ? 70 : 160;

  // 색상 형식: &HAABBGGRR
  const styles = [
    // 이름, 글꼴, 크기, 글자색, 테두리색, 배경색, 굵게, 테두리 방식, 테두리, 그림자, 정렬, 여백V
    ['Caption', 'NanumGothicExtraBold', capSize, '&H00FFFFFF', '&H00000000', '&H64000000', 1, 1, 6, 2, 2, fmt.captionMargin],
    ['Hook', 'Black Han Sans', hookSize, '&H0000E1FF', '&H00000000', '&H64000000', 0, 1, 9, 3, 8, vertical ? 300 : 120],
    ['Price', 'NanumGothicExtraBold', priceSize, '&H00000000', '&H0000D7FF', '&H0000D7FF', 1, 3, 18, 0, 8, vertical ? 560 : 260],
    ['Chapter', 'NanumGothicExtraBold', chapSize, '&H00FFFFFF', '&H00000000', '&H96000000', 1, 3, 14, 0, 7, 60],
    // 번호 이름표 (인기 목록형 쇼츠의 위쪽 흰 상자 "1. 상품명")
    ['Label', 'NanumGothicExtraBold', Math.round(base * (vertical ? 0.052 : 0.042)), '&H00111111', '&H00FFFFFF', '&H00FFFFFF', 1, 3, 16, 0, 8, vertical ? 330 : 70],
  ];
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${fmt.w}`,
    `PlayResY: ${fmt.h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles.map(([n, f, size, pc, oc, bc, bold, bs, ol, sh, al, mv]) =>
      `Style: ${n},${f},${size},${pc},&H000000FF,${oc},${bc},${bold ? -1 : 0},0,0,0,100,100,0,0,${bs},${ol},${sh},${al},${fmt.marginL ?? sideMargin},${fmt.marginR ?? sideMargin},${mv},1`),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const ev = [];
  const fade = '{\\fad(150,150)}';
  if (script.hook) {
    const end = Math.min(scenes[0].duration, 2.8);
    ev.push(`Dialogue: 2,${assTime(0)},${assTime(end)},Hook,,0,0,0,,{\\fad(100,250)}${assText(script.hook)}`);
  }
  for (const [i, sc] of scenes.entries()) {
    const s = sc.start;
    const e = sc.start + sc.duration;
    // 이름표: 첫 장면은 큰 제목(훅)과 겹치니 뺀다
    if (sc.label && !(i === 0 && script.hook)) ev.push(`Dialogue: 2,${assTime(s + 0.05)},${assTime(e - 0.05)},Label,,0,0,0,,{\\fad(80,80)}${assText(sc.label)}`);
    const own = cuts.filter((c) => c.scene === sc && c.caption);
    if (own.length) {
      // 컷마다 그 컷에 보이는 것의 이름 (컷이 바뀌면 자막도 바뀜)
      for (const c of own) ev.push(`Dialogue: 1,${assTime(c.start + 0.05)},${assTime(c.start + c.duration - 0.03)},Caption,,0,0,0,,{\fad(60,60)}${assText(c.caption)}`);
    } else if (sc.caption) ev.push(`Dialogue: 1,${assTime(s + 0.1)},${assTime(e - 0.05)},Caption,,0,0,0,,${fade}${assText(sc.caption)}`);
    if (sc.price_tag) {
      ev.push(`Dialogue: 3,${assTime(s + 0.35)},${assTime(e - 0.1)},Price,,0,0,0,,{\\fad(120,120)\\t(0,180,\\fscx112\\fscy112)\\t(180,320,\\fscx100\\fscy100)}${assText(sc.price_tag)}`);
    }
    if (format === 'longform' && sc.chapter) {
      ev.push(`Dialogue: 2,${assTime(s + 0.2)},${assTime(Math.min(e, s + 3.5))},Chapter,,0,0,0,,${fade}${assText(sc.chapter)}`);
    }
  }
  return [...header, ...ev, ''].join('\n');
}

export function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

/** 유튜브 챕터 (첫 챕터 0:00, 3개 이상, 각 10초 이상일 때만 유효) */
function chapterList(scenes) {
  const marks = [];
  for (const sc of scenes) {
    if (sc.chapter) marks.push({ time: marks.length === 0 ? 0 : sc.start, title: sc.chapter });
  }
  if (marks.length < 3) return [];
  const total = scenes.at(-1).start + scenes.at(-1).duration;
  for (let i = 0; i < marks.length; i++) {
    const next = marks[i + 1]?.time ?? total;
    if (next - marks[i].time < 10) return [];
  }
  return marks.map((m) => ({ ...m, label: fmtClock(m.time) }));
}

export function fmtClock(t) {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export { audioDuration };
