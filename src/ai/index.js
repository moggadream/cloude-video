// AI 연결 한 곳에서 관리: Anthropic API 키 / 내 컴퓨터의 Claude Code / 없음(테스트 모드)
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { config } from '../config.js';

export const BACKEND_LABEL = {
  api: 'Anthropic API',
  'claude-code': '내 컴퓨터의 Claude Code',
  off: '테스트 모드 (AI 없음)',
};

// ---------- 어떤 AI를 쓸지 ----------

let cliCache; // { cmd, pre, version } | null
let cliCheckedAt = 0;

/** claude 실행 방법을 찾는다. Windows의 npm 설치(.cmd)도 직접 node로 실행해 따옴표 문제를 피한다 */
async function resolveCli() {
  if (config.claudeCode.cli) return { cmd: config.claudeCode.cli, pre: [] };
  if (process.platform !== 'win32') return { cmd: 'claude', pre: [] };
  const found = await new Promise((resolve) => {
    const p = spawn('where', ['claude'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve([]));
    p.on('close', () => resolve(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)));
  });
  const exe = found.find((f) => f.toLowerCase().endsWith('.exe'));
  if (exe) return { cmd: exe, pre: [] };
  const shim = found.find((f) => f.toLowerCase().endsWith('.cmd'));
  if (shim) {
    const js = path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (fsSync.existsSync(js)) return { cmd: process.execPath, pre: [js] };
  }
  return null;
}

async function detectCli() {
  if (cliCache !== undefined && Date.now() - cliCheckedAt < 5 * 60_000) return cliCache;
  cliCheckedAt = Date.now();
  const cli = await resolveCli();
  if (!cli) return (cliCache = null);
  const version = await new Promise((resolve) => {
    const p = spawn(cli.cmd, [...cli.pre, '--version'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? out.trim() : null));
    setTimeout(() => { p.kill(); resolve(null); }, 20_000);
  });
  cliCache = version ? { ...cli, version } : null;
  return cliCache;
}

/** 지금 쓸 AI: 'api' | 'claude-code' | 'off' */
export async function aiBackend() {
  const mode = config.aiMode;
  if (mode === 'off') return 'off';
  if (mode === 'api') return config.anthropic.apiKey ? 'api' : 'off';
  if (mode === 'claude-code') return (await detectCli()) ? 'claude-code' : 'off';
  if (config.anthropic.apiKey) return 'api';
  return (await detectCli()) ? 'claude-code' : 'off';
}

export async function aiStatus() {
  const backend = await aiBackend();
  const cli = backend === 'claude-code' ? await detectCli() : null;
  return { backend, label: BACKEND_LABEL[backend], cliVersion: cli?.version || null };
}

// ---------- 질문하고 정해진 형식으로 답 받기 ----------

/**
 * @param {object} o
 * @param {string} o.system   지시문
 * @param {Array}  o.content  메시지 내용 (text/image 블록)
 * @param {z.ZodType} o.schema 답 형식
 * @param {'low'|'medium'|'high'} [o.effort]
 * @param {string} [o.label]  로그용 이름
 */
export async function generate({ system, content, schema, effort = 'medium', label = 'ai' }) {
  const backend = await aiBackend();
  if (backend === 'off') throw new Error('AI가 연결되어 있지 않아요');
  const t0 = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = backend === 'api'
        ? await viaApi({ system, content, schema, effort })
        : await viaClaudeCode({ system, content, schema });
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(`답 형식이 맞지 않아요: ${parsed.error.message.slice(0, 300)}`);
      console.log(`[ai] ${label} 완료 (${backend}, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
      return parsed.data;
    } catch (err) {
      lastErr = err;
      // 사용량 한도·로그인 문제는 다시 해도 같으니 바로 멈춘다
      if (err.fatal) break;
      console.warn(`[ai] ${label} ${attempt}차 실패: ${err.message.slice(0, 200)}`);
    }
  }
  throw lastErr;
}

let apiClient;
async function viaApi({ system, content, schema, effort }) {
  apiClient ||= new Anthropic({ apiKey: config.anthropic.apiKey });
  const stream = apiClient.beta.messages.stream({
    model: config.anthropic.model,
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
    // 안전 분류기가 거절하면 서버에서 다른 모델로 다시 시도
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('AI가 이 요청을 처리하지 않았어요 (refusal)'), { fatal: true });
  if (msg.stop_reason === 'max_tokens') throw new Error('AI 답이 너무 길어 잘렸어요');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

async function viaClaudeCode({ system, content, schema }) {
  const cli = await detectCli();
  if (!cli) throw Object.assign(new Error('Claude Code를 찾지 못했어요'), { fatal: true });

  // 프로젝트 설정(CLAUDE.md 등)이 섞이지 않게 빈 작업 폴더에서 실행
  const work = path.join(os.tmpdir(), 'cloude-video-ai');
  await fs.mkdir(work, { recursive: true });
  const sysFile = path.join(work, `system_${crypto.randomBytes(4).toString('hex')}.md`);
  await fs.writeFile(sysFile, system);

  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' });
  delete jsonSchema.$schema;
  const args = [
    ...cli.pre,
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--tools', '',
    '--system-prompt-file', sysFile,
    '--json-schema', JSON.stringify(jsonSchema),
    '--max-turns', '4',
    '--no-session-persistence',
  ];
  if (config.claudeCode.model) args.push('--model', config.claudeCode.model);

  const message = JSON.stringify({ type: 'user', message: { role: 'user', content } });
  try {
    const lines = await new Promise((resolve, reject) => {
      const p = spawn(cli.cmd, args, { cwd: work, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        p.kill();
        reject(new Error(`Claude Code가 ${config.claudeCode.timeoutSec}초 안에 답하지 않았어요`));
      }, config.claudeCode.timeoutSec * 1000);
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => {
        clearTimeout(timer);
        const ls = out.split('\n').filter((l) => l.trim());
        if (!ls.length) reject(new Error(`Claude Code 실행 실패 (code ${code}): ${err.slice(-500)}`));
        else resolve(ls);
      });
      p.stdin.end(`${message}\n`);
    });

    let result;
    for (const l of lines) {
      try {
        const ev = JSON.parse(l);
        if (ev.type === 'result') result = ev;
      } catch { /* 진행 상황 줄은 무시 */ }
    }
    if (!result) throw new Error('Claude Code의 답을 읽지 못했어요');
    if (result.is_error || result.subtype !== 'success') {
      const why = String(result.result || result.subtype || '');
      const fatal = /limit|login|auth|credit|quota|한도/i.test(why);
      throw Object.assign(new Error(`Claude Code 오류: ${why.slice(0, 300)}`), { fatal });
    }
    if (result.structured_output) return result.structured_output;
    // 형식 지정이 안 먹었을 때 본문에서 JSON 꺼내기
    const m = String(result.result || '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Claude Code 답에 JSON이 없어요');
    return JSON.parse(m[0]);
  } finally {
    await fs.rm(sysFile, { force: true });
  }
}
