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

import { spawn } from 'node:child_process';
import { ROOT } from '../config.js';
import { currentVoice } from '../voices.js';

let edgeOk; // 무료 음성 사용 가능 여부 (한 번만 확인)
async function edgeAvailable() {
  if (edgeOk !== undefined) return edgeOk;
  edgeOk = await new Promise((resolve) => {
    const p = spawn(config.tts.python, ['-c', 'import edge_tts'], { windowsHide: true });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
  if (!edgeOk) console.warn(`[tts] 무료 음성(edge-tts)을 쓸 수 없어요. "pip install edge-tts" 로 설치하면 나레이션이 들어가요.`);
  return edgeOk;
}

/**
 * 지금 쓸 나레이션 방식: 'elevenlabs' | 'azure' | 'edge' | null
 * azure = 마이크로소프트 공식 음성 서비스(상업 이용 가능, 매달 무료 사용량 있음). 목소리는 edge와 같다.
 */
export async function ttsProvider() {
  const p = config.tts.provider;
  if (p === 'off') return null;
  if (p === 'elevenlabs') return config.elevenlabs.apiKey ? 'elevenlabs' : null;
  if (p === 'azure') return config.azure.key ? 'azure' : null;
  if (p === 'edge') return (await edgeAvailable()) ? 'edge' : null;
  if (config.elevenlabs.apiKey) return 'elevenlabs';
  if (config.azure.key) return 'azure';
  return (await edgeAvailable()) ? 'edge' : null;
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function azureTts(text, out, voice) {
  // 다국어 목소리(비비엔 등)도 한국어로 읽도록 <lang> 으로 지정
  const multi = /Multilingual/.test(voice);
  const body = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ko-KR"><voice name="${voice}">`
    + `<prosody rate="${config.tts.rate}">${multi ? `<lang xml:lang="ko-KR">${xmlEscape(text)}</lang>` : xmlEscape(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${config.azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.azure.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'cloude-video',
    },
    body,
  });
  if (!res.ok) throw new Error(`Azure 음성 생성 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
}

function edgeTts(text, out, voice) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.tts.python, [path.join(ROOT, 'scripts', 'py', 'tts_edge.py'), voice, config.tts.rate, out],
      { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`무료 음성 생성 실패: ${err.slice(-300)}`))));
    p.stdin.end(text, 'utf8');
  });
}

async function elevenTts(text, out) {
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
  await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
}

/**
 * 문장을 음성 파일로 만든다. 같은 문장은 캐시를 재사용한다.
 * 음성을 만들 수 없으면 null (자막만 나오는 영상이 된다).
 */
export async function narrate(text, workDir) {
  const provider = await ttsProvider();
  if (!provider || !String(text || '').trim()) return null;
  const voice = currentVoice();
  const key = provider === 'elevenlabs' ? `el|${config.elevenlabs.voiceId}|${config.elevenlabs.ttsModel}` : `${provider}|${voice}|${config.tts.rate}`;
  const hash = crypto.createHash('sha1').update(`${key}|${text}`).digest('hex').slice(0, 16);
  const file = path.join(workDir, `tts_${hash}.mp3`);
  if (!(await exists(file))) {
    // 화면용 기호는 읽지 않게 정리 (이모지, ·, / 등)
    const spoken = String(text).replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').replace(/[·|]/g, ', ').replace(/\s+/g, ' ').trim();
    if (provider === 'edge') await edgeTts(spoken, file, voice);
    else if (provider === 'azure') await azureTts(spoken, file, voice);
    else await elevenTts(spoken, file);
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
