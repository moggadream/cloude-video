// 공통 도우미
export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers['content-type'] = 'application/json';
    init.method = init.method || 'POST';
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith('/login')) { showLogin(); throw new Error('로그인이 필요해요'); }
  if (!res.ok) throw new Error(data.error || `오류 (${res.status})`);
  return data;
}

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

let toastTimer;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = h('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했어요'); }
  catch {
    const ta = h('textarea', {}, text); document.body.append(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast('복사했어요');
  }
}

export const STATUS = {
  uploaded: ['업로드됨', ''], queued: ['대기 중', 'run'], processing: ['만드는 중', 'run'],
  ready: ['완성', 'ok'], failed: ['실패', 'bad'],
};
export const APPROVAL = { pending: ['확인 필요', ''], approved: ['승인됨', 'ok'], rejected: ['보류', 'bad'] };
export const pill = ([text, cls]) => h('span', { class: `pill ${cls}` }, text);

export function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- 로그인 ----------
export function showLogin() {
  if ($('#login')) return;
  const box = h('div', { id: 'login', class: 'card', style: 'max-width:420px;margin:40px auto' },
    h('h2', {}, '비밀번호를 입력하세요'),
    h('input', { type: 'password', id: 'pw', autocomplete: 'current-password' }),
    h('div', { class: 'actions' }, h('button', { class: 'primary big', onclick: login }, '들어가기')));
  $('main').replaceChildren(box);
  $('#pw').addEventListener('keydown', (e) => e.key === 'Enter' && login());
  async function login() {
    try { await api('/api/login', { json: { password: $('#pw').value } }); location.reload(); }
    catch (e) { toast(e.message); }
  }
}

// ---------- 알림 (푸시) ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function enablePush(vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('이 브라우저는 푸시 알림을 지원하지 않아요. 아이폰은 "홈 화면에 추가"한 뒤 그 앱에서 켜 주세요.');
  }
  if (!window.isSecureContext) throw new Error('푸시 알림은 https 주소에서만 켤 수 있어요.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한이 거부됐어요. 브라우저 설정에서 허용해 주세요.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) });
  await api('/api/push/subscribe', { json: sub.toJSON() });
}
