// ffmpeg / ffprobe 도우미
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function run(cmd, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

export const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export async function probe(file) {
  const out = await run('ffprobe', [
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
  const out = await run('ffprobe', [
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
  const times = info.duration > 1
    ? [0.15, 0.5, 0.85].map((r) => Math.round(info.duration * r * 10) / 10)
    : [0];
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
