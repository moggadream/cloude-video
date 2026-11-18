// 나레이션 목소리 선택 (사용자가 고른 4가지)
// 고른 목소리는 data/settings.json 에 저장되고, 텔레그램 /voice 로 바꿀 수 있다.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const VOICES = [
  { id: 'sunhi', name: '선희', desc: '여자, 밝고 또렷함', voice: 'ko-KR-SunHiNeural' },
  { id: 'injoon', name: '인준', desc: '남자, 차분한 아나운서', voice: 'ko-KR-InJoonNeural' },
  { id: 'hyunsu', name: '현수', desc: '남자, 신형·자연스러움', voice: 'ko-KR-HyunsuMultilingualNeural' },
  { id: 'vivienne', name: '비비엔', desc: '여자, 신형·감정 풍부', voice: 'fr-FR-VivienneMultilingualNeural' },
];
export const VOICE_BY_ID = Object.fromEntries(VOICES.map((v) => [v.id, v]));

const file = () => path.join(config.dataDir, 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; }
}

/** 지금 쓸 목소리 이름 (예: ko-KR-InJoonNeural). 텔레그램에서 고른 것 → .env TTS_VOICE 순 */
export function currentVoice() {
  const picked = VOICE_BY_ID[readSettings().voice];
  return picked ? picked.voice : config.tts.voice;
}

export function currentVoiceInfo() {
  const v = currentVoice();
  return VOICES.find((x) => x.voice === v) || { id: 'custom', name: v, desc: '.env 에서 지정', voice: v };
}

export function setVoice(id) {
  if (!VOICE_BY_ID[id]) throw new Error('알 수 없는 목소리');
  const s = readSettings();
  s.voice = id;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2));
  return VOICE_BY_ID[id];
}
