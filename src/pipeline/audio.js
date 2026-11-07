// 나레이션(TTS)과 배경음악
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, features } from '../config.js';
import { ffmpeg, audioDuration } from './media.js';

const EL = 'https://api.elevenlabs.io/v1';

async function exists(f) {
  try { await fs.access(f); return true; } catch { return false; }
}

/**
 * 문장을 음성 파일로 만든다. 같은 문장은 캐시를 재사용한다.
 * 키가 없으면 null (자막만 나오는 영상이 된다).
 */
export async function narrate(text, workDir) {
  if (!features.voice || !text.trim()) return null;
  const hash = crypto.createHash('sha1')
    .update(`${config.elevenlabs.voiceId}|${config.elevenlabs.ttsModel}|${text}`)
    .digest('hex').slice(0, 16);
  const file = path.join(workDir, `tts_${hash}.mp3`);
  if (!(await exists(file))) {
    const res = await fetch(
      `${EL}/text-to-speech/${config.elevenlabs.voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': config.elevenlabs.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: config.elevenlabs.ttsModel,
          language_code: 'ko',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
        }),
      },
    );
    if (!res.ok) throw new Error(`음성 생성 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return { file, duration: await audioDuration(file) };
}

/**
 * 배경음악을 만든다.
 * ElevenLabs 키가 있으면 AI 작곡, 없거나 실패하면 내장 임시 음악(합성음)을 쓴다.
 */
export async function makeMusic(prompt, seconds, workDir) {
  const len = Math.ceil(Math.min(Math.max(seconds + 2, 10), 300));
  if (features.aiMusic) {
    const file = path.join(workDir, `music_ai_${len}.mp3`);
    if (await exists(file)) return { file, source: 'ai' };
    try {
      const res = await fetch(`${EL}/music?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': config.elevenlabs.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, music_length_ms: len * 1000, force_instrumental: true }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
      await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
      return { file, source: 'ai' };
    } catch (err) {
      console.warn('[music] AI 음악 생성 실패, 임시 음악으로 대체:', err.message);
    }
  }
  return { file: await fallbackMusic(len, workDir), source: 'builtin' };
}

/** 키 없이 쓸 수 있는 부드러운 코드 진행 (C - Am - F - G) */
async function fallbackMusic(len, workDir) {
  const file = path.join(workDir, `music_builtin_${len}.m4a`);
  if (await exists(file)) return file;
  const chords = [
    [261.63, 329.63, 392.0], // C
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [196.0, 246.94, 293.66], // G
  ];
  const bar = 2; // 한 코드 2초
  // 시간에 따라 코드가 바뀌는 사인파 합성 + 부드러운 박자감
  const idx = `mod(floor(t/${bar}),4)`;
  const pick = (n) => chords
    .map((c, i) => `eq(${idx},${i})*${c[n]}`)
    .join('+');
  const env = `(0.55+0.45*pow(sin(PI*mod(t,0.5)/0.5),2))`;
  const expr = `${env}*(0.10*sin(2*PI*(${pick(0)})*t)+0.07*sin(2*PI*(${pick(1)})*t)+0.06*sin(2*PI*(${pick(2)})*t)+0.05*sin(PI*(${pick(0)})*t))`;
  await ffmpeg([
    '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${len}`,
    '-af', `lowpass=f=2500,aecho=0.8:0.7:120:0.25,afade=t=in:d=1,afade=t=out:st=${len - 2}:d=2`,
    '-c:a', 'aac', '-b:a', '128k', file,
  ]);
  return file;
}
