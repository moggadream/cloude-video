// 영상 속 말소리 받아쓰기 (faster-whisper, 내 컴퓨터에서 실행)
// 사장님 설명, 메뉴 소개, 안내 방송처럼 화면에는 없고 소리로만 있는 정보를 대본에 쓰기 위해.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, ROOT } from '../config.js';
import { ffmpeg } from './media.js';

let okCache; // 받아쓰기 가능 여부 (한 번만 확인)

/** 받아쓰기를 쓸 수 있는지 (STT=off 이거나 faster-whisper 가 없으면 false) */
export async function sttAvailable() {
  if (config.stt.mode === 'off') return false;
  if (okCache !== undefined) return okCache;
  okCache = await new Promise((resolve) => {
    const p = spawn(config.stt.python, ['-c', 'import faster_whisper'], { windowsHide: true });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
  if (!okCache) console.warn(`[stt] 말소리 인식(faster-whisper)을 쓸 수 없어요 (${config.stt.python}). .env 의 STT_PYTHON 을 확인하세요.`);
  return okCache;
}

// 소리가 거의 없거나 음악뿐일 때 whisper 가 지어내는 흔한 문장
const HALLUCINATION = /시청(해|하여)\s*주셔서\s*감사|구독(과|이랑)?\s*좋아요|좋아요(와|랑)?\s*구독|다음\s*영상에서\s*(만나|뵙)|MBC|KBS|SBS|자막\s*(제작|제공)|뉴스\s*[가-힣]+입니다$/;

/** 믿기 어려운 구간을 걸러낸다 */
export function cleanSegments(segments = []) {
  const out = [];
  for (const s of segments) {
    const text = String(s.text || '').trim();
    if (text.length < 2) continue;
    if (s.no_speech > 0.6 && s.logprob < -0.7) continue; // 말소리가 아닐 가능성이 큼
    if (s.logprob < -1.2) continue; // 알아듣기 어려운 구간
    if (HALLUCINATION.test(text)) continue;
    // 바로 앞 구간과 같은 말 되풀이
    if (out.length && out[out.length - 1].text === text) continue;
    out.push({ start: s.start, end: s.end, text });
  }
  return out;
}

function runWhisper(jobs, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(config.stt.python, [path.join(ROOT, 'scripts', 'py', 'stt_whisper.py')], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    let err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('말소리 인식 시간 초과')); }, timeoutMs);
    p.stderr.on('data', (d) => { err += d; if (err.length > 50_000) err = err.slice(-20_000); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`말소리 인식 실패: ${err.slice(-500)}`));
    });
    p.stdin.end(JSON.stringify(jobs), 'utf8');
  });
}

/**
 * 소리가 있는 영상들의 말소리를 받아 적어 media[].speech 에 넣는다.
 * 실패해도 제작은 계속된다 (말소리 없이 진행).
 * @returns {Promise<object[]>} 고친 media 배열
 */
export async function transcribeMedia(media, dir, onStep = () => {}) {
  const targets = media.filter((m) => m.kind === 'video' && m.hasAudio && !m.speech);
  if (!targets.length || !(await sttAvailable())) return media;

  const files = [];
  let total = 0;
  for (const [i, m] of targets.entries()) {
    onStep(`영상 속 말소리 준비 중 (${i + 1}/${targets.length})`, i / targets.length / 3);
    const audio = path.join(dir, 'work', `${m.id}_speech.wav`);
    try {
      await ffmpeg(['-i', path.join(dir, 'media', m.file), '-vn', '-ac', '1', '-ar', '16000', audio]);
      files.push({ id: m.id, audio, out: path.join(dir, 'work', `${m.id}_speech.json`) });
      total += m.duration || 0;
    } catch (err) {
      console.warn(`[stt] ${m.id} 소리 꺼내기 실패:`, err.message);
    }
  }
  if (!files.length) return media;

  onStep('영상 속 말소리 듣는 중', 0.4);
  try {
    // 모델 불러오기 ~1분 + 영상 길이만큼 (CPU면 더 느림)
    await runWhisper({
      model: config.stt.model,
      model_dir: config.stt.modelDir,
      language: config.stt.language,
      files: files.map(({ audio, out }) => ({ audio, out })),
    }, 120_000 + total * 3000);
  } catch (err) {
    console.warn('[stt]', err.message);
  }

  const byId = new Map();
  for (const f of files) {
    try {
      const r = JSON.parse(await fs.readFile(f.out, 'utf8'));
      const segments = cleanSegments(r.segments);
      byId.set(f.id, { language: r.language, segments, text: segments.map((s) => s.text).join(' ') });
    } catch { /* 이 영상은 결과 없음 */ }
    await fs.rm(f.audio, { force: true }).catch(() => {});
  }
  return media.map((m) => (byId.has(m.id) ? { ...m, speech: byId.get(m.id) } : m));
}

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** AI 에게 보여줄 받아쓰기 글 (영상별, 시간 표시) */
export function speechText(project, { maxChars = 6000 } = {}) {
  const lines = [];
  for (const m of project.media || []) {
    const segs = m.speech?.segments || [];
    if (!segs.length) continue;
    lines.push(`### 영상 ${m.id}`);
    for (const s of segs) lines.push(`- [${clock(s.start)}] ${s.text}`);
  }
  const text = lines.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n- (이하 생략)` : text;
}
