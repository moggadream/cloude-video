// 텔레그램 Bot API 호출 (외부 라이브러리 없이)
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const base = () => `${config.telegram.apiBase.replace(/\/$/, '')}/bot${config.telegram.botToken}`;

export class TelegramError extends Error {
  constructor(method, status, description) {
    super(`텔레그램 ${method} 실패 (${status}): ${description}`);
    this.status = status;
    this.description = description;
  }
}

export async function call(method, params = {}, { timeoutMs = 70_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new TelegramError(method, res.status, data.description || res.statusText);
    return data.result;
  } finally {
    clearTimeout(t);
  }
}

/** 파일 올리기 (sendVideo, sendPhoto, sendDocument) */
export async function upload(method, field, filePath, params = {}, fileName) {
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const blob = await fs.openAsBlob(filePath);
  form.append(field, blob, fileName || path.basename(filePath));
  const res = await fetch(`${base()}/${method}`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new TelegramError(method, res.status, data.description || res.statusText);
  return data.result;
}

/** 여러 사진을 한 묶음으로 (최대 10장) */
export async function sendPhotoGroup(chatId, files, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  const media = [];
  for (const [i, f] of files.slice(0, 10).entries()) {
    const key = `p${i}`;
    form.append(key, await fs.openAsBlob(f), path.basename(f));
    media.push({ type: 'photo', media: `attach://${key}`, ...(i === 0 && caption ? { caption: caption.slice(0, 1024) } : {}) });
  }
  form.append('media', JSON.stringify(media));
  const res = await fetch(`${base()}/sendMediaGroup`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new TelegramError('sendMediaGroup', res.status, data.description || res.statusText);
  return data.result;
}

/** 사용자가 보낸 파일 받기 (봇은 20MB까지만 받을 수 있음) */
export async function downloadFile(fileId, dest) {
  const info = await call('getFile', { file_id: fileId });
  const url = `${config.telegram.apiBase.replace(/\/$/, '')}/file/bot${config.telegram.botToken}/${info.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`파일 받기 실패 (${res.status})`);
  await fs.promises.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return { path: dest, telegramPath: info.file_path };
}
