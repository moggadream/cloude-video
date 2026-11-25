import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const env = (k, d = '') => (process.env[k] ?? d).trim();

// FFMPEG_PATH만 적었을 때 같은 폴더의 ffprobe를 쓴다
function ffprobeNextTo(ffmpegPath) {
  if (!ffmpegPath) return 'ffprobe';
  const dir = path.dirname(ffmpegPath);
  const ext = path.extname(ffmpegPath);
  return path.join(dir, `ffprobe${ext}`);
}

// 이 PC에 이미 설치된 프로그램 위치 (윈도우에서만 찾는다)
function firstExisting(paths) {
  if (process.platform !== 'win32') return '';
  return paths.find((p) => fs.existsSync(p)) || '';
}

export const config = {
  port: Number(env('PORT', '3000')),
  // 공개 주소 (알림 링크에 사용). 예: https://video.example.com
  publicUrl: env('PUBLIC_URL', ''),
  // 비워두면 로그인 없이 사용 (내 컴퓨터에서 테스트할 때만 권장)
  appPassword: env('APP_PASSWORD', ''),
  dataDir: path.resolve(ROOT, env('DATA_DIR', 'data')),
  fontsDir: path.join(ROOT, 'assets', 'fonts'),
  // ffmpeg가 PATH에 없으면 실행 파일 위치를 적는다. 예: D:\\ProgramFiles\\ffmpeg\\bin\\ffmpeg.exe
  ffmpegPath: env('FFMPEG_PATH', 'ffmpeg'),
  ffprobePath: env('FFPROBE_PATH', '') || ffprobeNextTo(env('FFMPEG_PATH', '')),

  // AI 방식: auto(API 키 → 내 컴퓨터 Claude Code → 테스트 모드 순서로 자동 선택) | api | claude-code | off
  aiMode: env('AI_MODE', 'auto'),
  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('CLAUDE_MODEL', 'claude-opus-5-5'),
  },
  claudeCode: {
    // claude 실행 파일 위치. 비워두면 PATH에서 찾는다
    cli: env('CLAUDE_CLI'),
    // 비워두면 Claude Code 기본 모델. 사용량을 아끼려면 sonnet
    model: env('CLAUDE_CODE_MODEL'),
    timeoutSec: Number(env('CLAUDE_CODE_TIMEOUT', '900')),
  },
  drive: {
    // 구글 드라이브 데스크톱으로 연결된 작업 폴더. 예: G:\\내 드라이브\\콘텐츠
    // 이 안의 "업로드" 폴더에 작업별 폴더를 만들어 자료를 넣고, 결과는 "결과" 폴더에 저장된다
    dir: env('DRIVE_DIR'),
    uploadName: env('DRIVE_UPLOAD_FOLDER', '업로드'),
    resultName: env('DRIVE_RESULT_FOLDER', '결과'),
    // 드라이브 웹에서 "결과" 폴더를 열었을 때의 주소 (텔레그램 버튼 링크)
    resultUrl: env('DRIVE_RESULT_URL'),
  },
  // 릴스 형식: music(말 없이 음악 + 컷마다 작은 글자, 기본) | voice(쇼츠처럼 나레이션)
  reelsStyle: env('REELS_STYLE', 'music'),
  tts: {
    // 나레이션: auto(ElevenLabs 키 → 무료 edge 음성 → 없음) | elevenlabs | edge | off
    provider: env('TTS_PROVIDER', 'auto'),
    // 기본 목소리 (텔레그램 /voice 로 고르면 그게 우선): 선희 ko-KR-SunHiNeural / 인준 ko-KR-InJoonNeural
    // / 현수 ko-KR-HyunsuMultilingualNeural / 비비엔 fr-FR-VivienneMultilingualNeural
    voice: env('TTS_VOICE', 'ko-KR-SunHiNeural'),
    rate: env('TTS_RATE', '+8%'),
    // 세로 숏폼은 더 빠르게 (인기 리뷰 쇼츠는 1초에 4~6.5자)
    shortRate: env('TTS_RATE_SHORT', '+18%'),
    python: env('PYTHON', process.platform === 'win32' ? 'python' : 'python3'),
  },
  // 영상 속 말소리 인식 (faster-whisper). STT=off 로 끌 수 있다
  stt: {
    mode: env('STT', 'auto'),
    python: env('STT_PYTHON', '') || firstExisting(['D:\\ProgramFiles\\asr\\.venv\\Scripts\\python.exe']) || env('PYTHON', process.platform === 'win32' ? 'python' : 'python3'),
    model: env('STT_MODEL', 'large-v3'),
    modelDir: env('STT_MODEL_DIR', '') || firstExisting(['D:\\ProgramFiles\\asr\\models\\whisper']),
    language: env('STT_LANGUAGE', 'ko'),
  },
  // 작은 사진 선명하게 (Real-ESRGAN). UPSCALE=off 로 끌 수 있다
  upscale: {
    mode: env('UPSCALE', 'auto'),
    bin: env('UPSCALE_BIN', '') || firstExisting(['D:\\ProgramFiles\\Real-ESRGAN\\realesrgan-ncnn-vulkan.exe']),
    model: env('UPSCALE_MODEL', 'realesrgan-x4plus'),
    // 사진의 짧은 쪽이 이것보다 작으면 키운다 (세로 영상 가로폭 1080 기준)
    minSide: Number(env('UPSCALE_MIN', '1080')),
    // AI 결과와 원본 질감을 섞는 비율 (1 = AI 결과만). 실제 사진이 플라스틱처럼 보이지 않게
    mix: Number(env('UPSCALE_MIX', '0.55')),
  },
  // 마이크로소프트 공식 음성(Azure AI Speech): 상업 이용 가능, 매달 무료 사용량 있음
  azure: {
    key: env('AZURE_SPEECH_KEY'),
    region: env('AZURE_SPEECH_REGION', 'koreacentral'),
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
    // 이 채팅에서 온 지시만 받는다 (봇에게 /start 를 보내면 알려줌)
    chatId: env('TELEGRAM_CHAT_ID'),
    apiBase: env('TELEGRAM_API_BASE', 'https://api.telegram.org'),
  },
  vapid: {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT', 'mailto:admin@example.com'),
  },
};

export const features = {
  // 실제 AI 사용 여부는 src/ai/index.js 의 aiBackend() 로 확인 (Claude Code 감지는 비동기)
  get ai() { return Boolean(config.anthropic.apiKey); },
  // 나레이션 사용 여부는 pipeline/audio.js 의 ttsProvider() 로 확인 (무료 음성은 설치 여부를 비동기로 확인)
  get voice() { return Boolean(config.elevenlabs.apiKey || config.azure.key) || config.tts.provider === 'edge'; },
  get aiMusic() { return Boolean(config.elevenlabs.apiKey) && config.elevenlabs.music; },
};

/**
 * 말 없는 "음악 + 글자" 형식인지 (인스타 인기 맛집 릴스의 절반, docs/research/instagram-reels.md).
 * 릴스가 기본으로 이 형식. 릴스도 나레이션을 넣으려면 .env 에 REELS_STYLE=voice
 */
export const musicOnly = (key) => key === 'reels' && config.reelsStyle !== 'voice';
