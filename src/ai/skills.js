// 스킬 문서(.claude/skills/*/SKILL.md), 내 말투 샘플, 지난 수정 요청을 읽어 AI 지시문에 넣는다
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, config } from '../config.js';

const cache = new Map();

/** 스킬 본문 (앞부분 설명 블록 제외). 파일을 고치면 앱을 다시 켜지 않아도 반영되도록 수정 시각으로 캐시 */
export async function loadSkill(name) {
  const file = path.join(ROOT, '.claude', 'skills', name, 'SKILL.md');
  const st = await fs.stat(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.text;
  const raw = await fs.readFile(file, 'utf8');
  const text = raw.replace(/^---[\s\S]*?---\s*/, '').trim();
  cache.set(file, { mtime: st.mtimeMs, text });
  return text;
}

/** 내 말투 샘플: style-samples/ 폴더(와 드라이브의 "말투샘플" 폴더)의 글. 최대 약 6천 자 */
export async function loadStyleSamples(limit = 6000) {
  const dirs = [path.join(ROOT, 'style-samples')];
  if (config.drive.dir) dirs.push(path.join(config.drive.dir, '말투샘플'));
  const parts = [];
  let total = 0;
  for (const dir of dirs) {
    let names = [];
    try { names = (await fs.readdir(dir)).filter((n) => /\.(txt|md)$/i.test(n)).sort(); } catch { continue; }
    for (const n of names) {
      if (total >= limit) break;
      const t = (await fs.readFile(path.join(dir, n), 'utf8')).trim().slice(0, limit - total);
      if (!t) continue;
      parts.push(`### ${n}\n${t}`);
      total += t.length;
    }
  }
  return parts.join('\n\n');
}

const feedbackFile = () => path.join(config.dataDir, 'feedback.jsonl');

/** 수정 요청을 기록해 두고 다음 대본에 참고한다 */
export async function recordFeedback(entry) {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.appendFile(feedbackFile(), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

export async function recentFeedback(key, max = 12) {
  if (process.env.NO_FEEDBACK) return []; // 평가 실행 때는 지난 수정 요청을 섞지 않는다
  let lines = [];
  try { lines = (await fs.readFile(feedbackFile(), 'utf8')).split('\n').filter(Boolean); } catch { return []; }
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((f) => f && (!key || f.key === key || f.key === 'all'))
    .slice(-max)
    .map((f) => f.instruction);
}
