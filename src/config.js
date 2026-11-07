import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const env = (k, d = '') => (process.env[k] ?? d).trim();

export const config = {
  port: Number(env('PORT', '3000')),
  // 공개 주소 (알림 링크에 사용). 예: https://video.example.com
  publicUrl: env('PUBLIC_URL', ''),
  // 비워두면 로그인 없이 사용 (내 컴퓨터에서 테스트할 때만 권장)
  appPassword: env('APP_PASSWORD', ''),
  dataDir: path.resolve(ROOT, env('DATA_DIR', 'data')),
  fontsDir: path.join(ROOT, 'assets', 'fonts'),

  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('CLAUDE_MODEL', 'claude-opus-5-5'),
  },
  elevenlabs: {
    apiKey: env('ELEVENLABS_API_KEY'),
    // 한국어를 잘 읽는 목소리 ID로 바꿔 쓰세요 (ElevenLabs Voice Library)
    voiceId: env('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL'),
    ttsModel: env('ELEVENLABS_TTS_MODEL', 'eleven_multilingual_v2'),
    music: env('ELEVENLABS_MUSIC', 'on') !== 'off',
  },
  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN'),
    chatId: env('TELEGRAM_CHAT_ID'),
  },
  vapid: {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT', 'mailto:admin@example.com'),
  },
};

export const features = {
  get ai() { return Boolean(config.anthropic.apiKey); },
  get voice() { return Boolean(config.elevenlabs.apiKey); },
  get aiMusic() { return Boolean(config.elevenlabs.apiKey) && config.elevenlabs.music; },
};
