// ffmpeg / ffprobe 도우미
import { spawn } from 'node:child_process';
// (spawn은 run()과 장면 찾기에서 함께 사용)
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export function run(cmd, args, { quiet = true, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => {
      err += d;
      if (err.length > 200_000) err = err.slice(-100_000);
      if (!quiet) process.stderr.write(d);
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} 실패 (code ${code}): ${err.slice(-1500)}`));
    });
  });
}

export const ffmpeg = (args, opts = {}) => run(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

/** ffmpeg 목록 파일(concat)에 쓰는 경로. Windows의 \\ 도 / 로 바꿔 둔다 */
export const concatLine = (f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;

export async function probe(file) {
  const out = await run(config.ffprobePath, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  const info = JSON.parse(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  let width = v?.width || 0;
  let height = v?.height || 0;
  // 폰 영상은 회전 정보가 따로 붙어 있는 경우가 많다
  const rotation = Number(
    v?.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0,
  );
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const duration = Number(info.format?.duration || v?.duration || 0);
  return { width, height, duration, hasAudio: Boolean(a), codec: v?.codec_name };
}

export async function audioDuration(file) {
  const out = await run(config.ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  return Number(out.trim()) || 0;
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.bmp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.3gp', '.mkv', '.avi']);

export function kindOf(filename, mimetype = '') {
  const ext = path.extname(filename).toLowerCase();
  if (mimetype.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  if (mimetype.startsWith('video/') || VIDEO_EXT.has(ext)) return 'video';
  return null;
}

/**
 * 업로드된 파일을 다루기 쉬운 형태로 정리한다.
 * - 사진: 회전 보정 + 최대 2160px JPEG로 변환 (HEIC 등도 가능한 범위에서 변환)
 * - 영상: 길이/크기 확인, 분석용 프레임 3장 추출
 */
export async function prepareMedia(item, dir) {
  const src = path.join(dir, 'media', item.file);
  if (item.kind === 'image') {
    const norm = `${item.id}.jpg`;
    await ffmpeg([
      '-i', src, '-frames:v', '1',
      '-vf', "scale='min(2160,iw)':'min(2160,ih)':force_original_aspect_ratio=decrease",
      '-q:v', '3', path.join(dir, 'work', norm),
    ]);
    const info = await probe(path.join(dir, 'work', norm));
    return {
      ...item,
      normalized: norm,
      width: info.width,
      height: info.height,
      frames: [{ file: norm, time: 0 }],
    };
  }

  const info = await probe(src);
  const times = await pickVideoTimes(src, info.duration);
  const frames = [];
  for (const [i, t] of times.entries()) {
    const f = `${item.id}_f${i}.jpg`;
    await ffmpeg([
      '-ss', String(t), '-i', src, '-frames:v', '1',
      '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease",
      '-q:v', '4', path.join(dir, 'work', f),
    ]);
    frames.push({ file: f, time: t });
  }
  return {
    ...item,
    width: info.width,
    height: info.height,
    duration: info.duration,
    hasAudio: info.hasAudio,
    frames,
  };
}

/**
 * 영상에서 분석할 장면 시각을 고른다.
 * - 짧은 영상(20초 이하): 앞·가운데·뒤 3장
 * - 긴 영상: 키프레임만 빠르게 훑어 화면이 크게 바뀌는 지점 + 고르게 채운 지점
 *   (약 20초에 1장, 최대 60장)
 */
export async function pickVideoTimes(src, duration) {
  const round = (t) => Math.round(t * 10) / 10;
  if (duration <= 20) {
    return duration > 1 ? [0.15, 0.5, 0.85].map((r) => round(duration * r)) : [0];
  }
  const want = Math.min(60, Math.max(4, Math.round(duration / 20)));
  let keys = [];
  let cuts = [];
  try {
    // 키프레임만 디코딩해서 장면 변화 점수를 얻는다 (stderr로 출력됨)
    const text = await new Promise((resolve, reject) => {
      const p = spawn(config.ffmpegPath, [
        '-hide_banner', '-skip_frame', 'nokey', '-i', src, '-an',
        '-vf', "scale=192:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score", '-f', 'null', '-',
      ]);
      let out = '';
      p.stderr.on('data', (d) => { out += d; });
      p.on('error', reject);
      p.on('close', () => resolve(out));
    });
    const re = /pts_time:([0-9.]+)\s*\n?.*?lavfi\.scene_score=([0-9.]+)/gs;
    for (const m of text.matchAll(re)) {
      const t = Number(m[1]);
      keys.push(t);
      if (Number(m[2]) > 0.3) cuts.push(t);
    }
  } catch (err) {
    console.warn('[media] 장면 찾기 실패, 고르게 나눔:', err.message);
  }
  const margin = Math.min(3, duration * 0.02);
  // 편집 영상은 컷이 바뀌는 곳에 키프레임이 있다. 컷 바로 앞뒤 프레임은 어느 장면인지 애매하므로
  // 이웃한 두 키프레임의 "가운데" 시각을 쓴다 (한 장면 안쪽이 확실함).
  keys.sort((a, b) => a - b);
  const mids = [];
  for (let i = 0; i < keys.length; i++) {
    const next = keys[i + 1] ?? duration;
    if (next - keys[i] >= 0.6) mids.push({ t: (keys[i] + next) / 2, cut: cuts.includes(keys[i]) });
  }
  const usable = (t) => t >= margin && t <= duration - margin;
  const pool = mids.filter((m) => usable(m.t));
  if (pool.length === 0) {
    for (let i = 0; i < want * 2; i++) pool.push({ t: margin + ((duration - 2 * margin) * (i + 0.5)) / (want * 2), cut: false });
  }

  const picked = [];
  const minGap = (duration / want) * 0.5;
  const tooClose = (t) => picked.some((p) => Math.abs(p - t) < minGap);
  // 장면이 크게 바뀐 직후 구간을 우선 사용
  for (const m of pool.filter((x) => x.cut)) {
    if (picked.length >= Math.ceil(want / 2)) break;
    if (!tooClose(m.t)) picked.push(m.t);
  }
  // 나머지는 고르게
  for (let i = 0; picked.length < want && i < want * 3; i++) {
    const target = margin + ((duration - 2 * margin) * (i % want + 0.5)) / want;
    const near = pool.reduce((a, b) => (Math.abs(b.t - target) < Math.abs(a.t - target) ? b : a), pool[0]).t;
    if (!tooClose(near)) picked.push(near);
  }
  return [...new Set(picked.map(round))].sort((a, b) => a - b);
}

/** 분석용으로 작은 JPEG(base64)를 만든다 (토큰 절약) */
export async function smallJpegBase64(file) {
  const out = `${file}.small.jpg`;
  await ffmpeg([
    '-i', file, '-frames:v', '1',
    '-vf', "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease",
    '-q:v', '5', out,
  ]);
  const b = await fs.readFile(out);
  await fs.rm(out, { force: true });
  return b.toString('base64');
}
