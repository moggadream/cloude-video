// 텔레그램 봇: 지시 받기(만들기·수정·승인)와 결과 보고
//
// 내 컴퓨터에서도 돌아가도록 "긴 폴링" 방식: 앱이 텔레그램에 새 메시지가 있는지 계속 물어본다.
// (공개 주소나 포트 열기가 필요 없음. AI를 쓰는 일이 아니라 토큰도 들지 않음)
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { bus } from '../events.js';
import { call, upload, sendPhotoGroup, downloadFile, TelegramError } from './api.js';
import { enqueue, queueLength } from '../queue.js';
import { getProject, listProjects, createProject, updateProject, projectDir, isValidId } from '../store.js';
import { processProject, reviseAndRender, setApproval } from '../pipeline/index.js';
import { PLATFORMS, PLATFORM_KEYS, CATEGORIES } from '../pipeline/plan.js';
import { driveReady, listUploadFolders, createProjectFromFolder, conceptFromName, readFolderMemo } from '../drive.js';
import { aiStatus } from '../ai/index.js';
import { kindOf } from '../pipeline/media.js';
import { CONCEPTS, CONCEPT_BY_ID, guideText, totals } from '../guides/concepts.js';
import { VOICES, VOICE_BY_ID, currentVoiceInfo, setVoice } from '../voices.js';
import { narrate, ttsProvider } from '../pipeline/audio.js';

const MAX_UPLOAD = 49 * 1024 * 1024; // 봇이 보낼 수 있는 파일 크기 (50MB 제한)
const stateFile = () => path.join(config.dataDir, 'telegram-state.json');

const st = {
  offset: 0,
  msgMap: {}, // 보낸 메시지 id → { pid, key } (답장으로 수정 요청 받기)
  progressMsg: {}, // pid → 진행 상황 메시지 id
  folderChoices: [], // 마지막으로 보여준 폴더 목록
  pendingEdit: null, // { pid, key } 다음 글을 수정 요청으로 받기
  pendingMemo: null, // { name, concept } 다음 글을 메모로 받기
};

async function loadState() {
  try { Object.assign(st, JSON.parse(await fs.readFile(stateFile(), 'utf8'))); } catch { /* 처음 */ }
}
let saveTimer;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const keys = Object.keys(st.msgMap);
    if (keys.length > 800) for (const k of keys.slice(0, keys.length - 800)) delete st.msgMap[k];
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(stateFile(), JSON.stringify({ msgMap: st.msgMap, progressMsg: st.progressMsg, folderChoices: st.folderChoices }, null, 1));
  }, 300);
}

const chatId = () => config.telegram.chatId;
const send = (text, extra = {}) => call('sendMessage', { chat_id: chatId(), text: text.slice(0, 4096), disable_web_page_preview: true, ...extra });
const kb = (rows) => ({ reply_markup: { inline_keyboard: rows } });
const remember = (msg, pid, key) => { if (msg?.message_id) { st.msgMap[msg.message_id] = { pid, key }; saveState(); } };

function pageUrl(pid) {
  return /^https:\/\//.test(config.publicUrl) ? `${config.publicUrl.replace(/\/$/, '')}/project.html?id=${pid}` : null;
}
function linkButtons(pid) {
  const row = [];
  if (config.drive.resultUrl) row.push({ text: '📁 드라이브 결과 폴더', url: config.drive.resultUrl });
  const page = pageUrl(pid);
  if (page) row.push({ text: '🌐 확인 화면', url: page });
  return row.length ? [row] : [];
}
const actionRow = (pid, key, approval = 'pending') => (approval === 'approved'
  ? [[{ text: '✅ 승인됨 · 취소하려면 누르기', callback_data: `pd:${pid}:${key}` }]]
  : [[
    { text: '✅ 승인', callback_data: `ap:${pid}:${key}` },
    { text: '✏️ 수정', callback_data: `ed:${pid}:${key}` },
    { text: approval === 'rejected' ? '⏸ 보류됨' : '⏸ 보류', callback_data: `rj:${pid}:${key}` },
  ]]);

// ---------- 시작 ----------

let running = false;
export async function startTelegram() {
  if (!config.telegram.botToken) return false;
  if (running) return true;
  running = true;
  await loadState();
  try {
    const me = await call('getMe');
    console.log(`[telegram] @${me.username} 연결됨${chatId() ? '' : ' — TELEGRAM_CHAT_ID가 비어 있어요. 봇에게 /start 를 보내 보세요'}`);
    await call('setMyCommands', {
      commands: [
        { command: 'guide', description: '무엇을 몇 컷 찍을지 촬영 가이드' },
        { command: 'make', description: '자료로 콘텐츠 만들기' },
        { command: 'list', description: '최근 작업 보기' },
        { command: 'status', description: 'AI·드라이브 연결 상태' },
        { command: 'voice', description: '나레이션 목소리 고르기' },
        { command: 'help', description: '사용법' },
      ],
    }).catch(() => {});
  } catch (err) {
    console.error('[telegram] 연결 실패:', err.message);
    running = false;
    return false;
  }
  attachEvents();
  pollLoop();
  return true;
}

async function pollLoop() {
  while (running) {
    try {
      const updates = await call('getUpdates', { offset: st.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        st.offset = u.update_id + 1;
        handleUpdate(u).catch((err) => {
          console.error('[telegram] 처리 오류:', err);
          if (chatId()) send(`⚠️ 처리 중 오류가 났어요: ${err.message}`).catch(() => {});
        });
      }
    } catch (err) {
      if (err instanceof TelegramError && err.status === 409) {
        console.error('[telegram] 같은 봇을 다른 곳에서도 실행 중이에요. 하나만 켜 주세요.');
      } else if (err.name !== 'AbortError') {
        console.warn('[telegram] 메시지 확인 실패, 잠시 후 다시:', err.message);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function handleUpdate(u) {
  const from = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
  // 처음 설정: 채팅 ID 알려주기
  if (!chatId()) {
    if (u.message) {
      await call('sendMessage', {
        chat_id: from,
        text: `안녕하세요! 이 채팅의 ID는 ${from} 이에요.\n\n앱 폴더의 .env 파일에\nTELEGRAM_CHAT_ID=${from}\n을 적고 앱을 다시 켜 주세요. 그다음부터 이 채팅의 지시만 받아요.`,
      });
    }
    return;
  }
  if (String(from) !== String(chatId())) return; // 다른 사람은 무시
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.message) return onMessage(u.message);
}

// ---------- 메시지 ----------

const HELP = () => `🎬 사용법

1) 자료 올리기
${driveReady()
    ? `구글 드라이브 "${config.drive.uploadName}" 폴더 안에 작업별 폴더를 만들고 사진·영상을 넣어 주세요.
 • 폴더 이름 = 장소 이름 (예: "코스트코 양재점")
 • 앞에 컨셉 태그를 붙여 주세요: ${CONCEPTS.map((c) => `[${c.tag}]`).join(' ')}
 • 폴더 안 메모.txt 내용은 메모로 써요 (영업시간, 행사 기간 등)`
    : '⚠️ 아직 드라이브 폴더가 연결되지 않았어요 (.env 의 DRIVE_DIR)'}
작은 사진(20MB 이하)은 이 채팅으로 바로 보내도 돼요.

0) 찍기 전에: /guide 로 컨셉(맛집·카페·마트·시장·공원·유원지·축제·팝업)을 고르면 무엇을 몇 컷 찍을지 알려드려요.

2) 만들기: /make  (또는 "만들어줘", "코스트코 만들어줘")

3) 확인: 완성되면 영상·이미지·글을 여기로 보내드려요.
 • ✅ 승인 / ✏️ 수정 / ⏸ 보류 버튼
 • 수정은 버튼을 누르고 어떻게 고칠지 적거나, 결과 메시지에 "답장"으로 적어도 돼요.

/list 최근 작업 · /status 연결 상태 · /voice 나레이션 목소리 고르기`;

async function onMessage(msg) {
  const text = (msg.text || '').trim();

  // 사진·영상을 바로 보낸 경우
  const file = msg.photo?.at(-1) || msg.video || msg.document;
  if (file) return receiveFile(msg, file);

  if (/^\/(start|help)\b/.test(text)) return send(HELP());
  if (/^\/status\b/.test(text)) return sendStatus();
  if (/^\/guide\b/.test(text) || /^(촬영\s*)?가이드/.test(text)) return sendGuideMenu();
  if (/^\/list\b/.test(text)) return sendList();
  if (/^\/voice\b/.test(text) || /^목소리/.test(text)) return sendVoiceMenu();

  // 결과 메시지에 답장 → 그 결과물 수정
  const replied = msg.reply_to_message && st.msgMap[msg.reply_to_message.message_id];
  if (replied && text && !text.startsWith('/')) return startRevision(replied.pid, replied.key, text);
  // 메모 추가 버튼을 누른 뒤 보낸 글
  if (st.pendingMemo && text && !text.startsWith('/')) {
    const { name, concept } = st.pendingMemo;
    st.pendingMemo = null;
    if (/^(취소|그만)/.test(text)) return send('취소했어요.');
    return startFolder(name, concept || 'auto', { memoAsked: true, extraMemo: text });
  }
  // 수정 버튼을 누른 뒤 보낸 글
  if (st.pendingEdit && text && !text.startsWith('/')) {
    const { pid, key } = st.pendingEdit;
    st.pendingEdit = null;
    if (/^(취소|그만|아니)/.test(text)) return send('수정을 취소했어요.');
    return startRevision(pid, key, text);
  }

  const make = text.match(/^\/make(?:@\w+)?\s*(.*)$/) || text.match(/^(.*?)\s*만들어\s*(줘|주세요|봐)?\s*$/);
  if (make) return askMake(make[1]?.trim() || '');

  return send('무엇을 할까요? /make 로 만들기를 시작하거나 /help 로 사용법을 볼 수 있어요.');
}

// ---------- 만들기 ----------

const inboxDir = () => path.join(config.dataDir, 'telegram-inbox');
async function inboxFiles() {
  try { return (await fs.readdir(inboxDir())).filter((n) => kindOf(n)).sort(); } catch { return []; }
}

async function receiveFile(msg, file) {
  if (file.file_size && file.file_size > 20 * 1024 * 1024) {
    return send('20MB가 넘는 파일은 텔레그램 봇이 받을 수 없어요. 구글 드라이브 업로드 폴더에 넣어 주세요.');
  }
  const name = file.file_name || (msg.photo ? 'photo.jpg' : msg.video ? 'video.mp4' : 'file');
  const kind = kindOf(name, file.mime_type || (msg.photo ? 'image/jpeg' : ''));
  if (!kind) return send('사진이나 영상만 받을 수 있어요.');
  await fs.mkdir(inboxDir(), { recursive: true });
  const ext = path.extname(name) || (kind === 'image' ? '.jpg' : '.mp4');
  const dest = path.join(inboxDir(), `${Date.now()}_${msg.message_id}${ext.toLowerCase()}`);
  await downloadFile(file.file_id, dest);
  if (msg.caption) await fs.appendFile(path.join(inboxDir(), 'memo.txt'), `${msg.caption}\n`);
  const n = (await inboxFiles()).length;
  // 여러 장을 한 번에 보내면 메시지가 여러 개 오니 마지막 것에만 답한다
  clearTimeout(receiveFile.t);
  receiveFile.t = setTimeout(() => {
    send(`📥 받은 자료 ${n}개. 다 보냈으면 /make 를 눌러 주세요.`).catch(() => {});
  }, 1500);
}

async function askMake(query) {
  const folders = await listUploadFolders();
  const inbox = await inboxFiles();
  if (query) {
    const hit = folders.find((f) => f.name === query) || folders.find((f) => f.name.includes(query));
    if (hit) return startFolder(hit.name);
  }
  const fresh = folders.filter((f) => !f.projectId && f.images + f.videos > 0).slice(0, 8);
  const done = folders.filter((f) => f.projectId).slice(0, 4);
  st.folderChoices = [...fresh, ...done].map((f) => f.name);
  saveState();
  const rows = st.folderChoices.map((name, i) => {
    const f = folders.find((x) => x.name === name);
    const count = [f.images && `사진 ${f.images}`, f.videos && `영상 ${f.videos}`].filter(Boolean).join(', ');
    return [{ text: `${f.projectId ? '🔁 ' : '📂 '}${name} (${count})`.slice(0, 60), callback_data: `mk:${i}` }];
  });
  if (inbox.length) rows.unshift([{ text: `📥 텔레그램으로 받은 자료 ${inbox.length}개로 만들기`, callback_data: 'mkin' }]);
  if (!rows.length) {
    return send(driveReady()
      ? `만들 자료가 없어요. 드라이브 "${config.drive.uploadName}" 폴더에 작업 폴더를 만들고 사진·영상을 넣은 뒤 다시 /make 해 주세요.\n(드라이브 앱이 내 컴퓨터로 받는 데 시간이 조금 걸릴 수 있어요)`
      : '만들 자료가 없어요. 사진을 이 채팅으로 보내거나, 드라이브 폴더를 연결해 주세요 (/help).');
  }
  return send(`어떤 자료로 만들까요?${query ? `\n("${query}" 폴더는 찾지 못했어요)` : ''}\n🔁 표시는 이미 만든 폴더예요 (다시 만들기).`, kb(rows));
}

async function startFolder(name, concept, opts = {}) {
  // 폴더 이름에 [태그]가 없으면 컨셉부터 물어본다 (컨셉별 전략이 대본에 반영됨)
  if (!concept && !conceptFromName(name)) {
    const i = st.folderChoices.indexOf(name) >= 0 ? st.folderChoices.indexOf(name) : st.folderChoices.push(name) - 1;
    saveState();
    const rows = [];
    for (let j = 0; j < CONCEPTS.length; j += 2) {
      rows.push(CONCEPTS.slice(j, j + 2).map((c) => ({ text: `${c.emoji} ${c.label}`, callback_data: `mc:${i}:${c.id}` })));
    }
    rows.push([{ text: '🤖 AI가 알아서 판단', callback_data: `mc:${i}:auto` }]);
    return send(`"${name}" 은(는) 어떤 컨셉인가요?\n(다음부터는 폴더 이름 앞에 [맛집] 처럼 붙여 두면 바로 시작해요)`, kb(rows));
  }
  // 메모가 짧으면 먼저 물어본다 (메모가 자세할수록 글이 사람답고 정확해짐 — 평가 10회차에서 확인)
  if (!opts.memoAsked) {
    const memo = await readFolderMemo(name);
    if (memo.replace(/\s/g, '').length < 60) {
      const i = st.folderChoices.indexOf(name) >= 0 ? st.folderChoices.indexOf(name) : st.folderChoices.push(name) - 1;
      saveState();
      const c = CONCEPT_BY_ID[concept] || CONCEPT_BY_ID[conceptFromName(name)];
      return send([
        `📝 "${name}" 메모가 ${memo ? '짧아요' : '없어요'}. 몇 줄만 적어 주시면 글이 훨씬 사람답고 정확해져요.`,
        '',
        '이런 걸 적어 주세요: 언제·누구랑 / 맛·느낌 / 기다린 시간 / 산 것·시킨 것 / 아쉬운 점 / 기억에 남는 순간',
        c?.memoExample ? `\n예) ${c.memoExample}` : '',
      ].join('\n'), kb([[
        { text: '✍️ 메모 추가하기', callback_data: `mm:${i}:${concept || 'auto'}` },
        { text: '그냥 만들기', callback_data: `mn:${i}:${concept || 'auto'}` },
      ]]));
    }
  }
  const id = await createProjectFromFolder(name, { concept: concept === 'auto' ? undefined : concept, extraMemo: opts.extraMemo });
  return startProject(id, name);
}

async function startInbox() {
  const files = await inboxFiles();
  if (!files.length) return send('받은 자료가 없어요.');
  let memo = '';
  try { memo = (await fs.readFile(path.join(inboxDir(), 'memo.txt'), 'utf8')).trim(); } catch { /* 없음 */ }
  const project = await createProject({ source: { type: 'telegram' }, hints: { category: 'auto', placeName: '', memo } });
  const media = [];
  for (const [i, n] of files.entries()) {
    const id = `m${i + 1}`;
    const file = `${id}${path.extname(n)}`;
    await fs.rename(path.join(inboxDir(), n), path.join(projectDir(project.id), 'media', file));
    media.push({ id, kind: kindOf(n), file, originalName: n, size: 0 });
  }
  await fs.rm(path.join(inboxDir(), 'memo.txt'), { force: true });
  await updateProject(project.id, (p) => { p.media = media; p.status = 'queued'; p.step = '순서 기다리는 중'; });
  return startProject(project.id, `텔레그램 자료 ${files.length}개`);
}

async function startProject(id, label) {
  const waiting = queueLength();
  const ai = await aiStatus();
  const msg = await send(`⏳ "${label}" 만들기 시작${waiting ? ` (앞에 ${waiting}개 작업 대기 중)` : ''}\nAI: ${ai.label}${ai.backend === 'off' ? '\n⚠️ AI가 연결되지 않아 예시 글로 만들어요' : ''}`);
  st.progressMsg[id] = msg.message_id;
  saveState();
  enqueue(`telegram ${id}`, () => processProject(id)).catch(() => {});
}

// ---------- 버튼 ----------

async function onCallback(q) {
  const data = q.data || '';
  const answer = (text) => call('answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => {});

  if (data === 'mkin') { await answer(); return startInbox(); }
  if (data.startsWith('vo:')) {
    const v = VOICE_BY_ID[data.slice(3)];
    if (!v) return answer('알 수 없는 목소리');
    setVoice(v.id);
    await answer(`${v.name} 목소리로 바꿨어요`);
    return sendVoiceSample(v);
  }
  if (data.startsWith('gd:')) {
    const c = CONCEPT_BY_ID[data.slice(3)];
    await answer();
    return c ? send(guideText(c)) : null;
  }
  if (data.startsWith('mm:') || data.startsWith('mn:')) {
    const [act, idx, concept] = data.split(':');
    const name = st.folderChoices[Number(idx)];
    await answer();
    if (!name) return send('목록이 오래됐어요. /make 를 다시 눌러 주세요.');
    if (act === 'mn') return startFolder(name, concept, { memoAsked: true });
    st.pendingMemo = { name, concept };
    return send('메모를 보내 주세요. 한 메시지에 편하게 적으면 돼요.', { reply_markup: { force_reply: true, input_field_placeholder: '언제·누구랑, 맛, 아쉬운 점...' } });
  }
  if (data.startsWith('mc:')) {
    const [, idx, concept] = data.split(':');
    const name = st.folderChoices[Number(idx)];
    await answer();
    if (!name) return send('목록이 오래됐어요. /make 를 다시 눌러 주세요.');
    return startFolder(name, concept);
  }
  if (data.startsWith('mk:')) {
    const name = st.folderChoices[Number(data.slice(3))];
    await answer();
    if (!name) return send('목록이 오래됐어요. /make 를 다시 눌러 주세요.');
    return startFolder(name);
  }
  const [act, pid, key] = data.split(':');
  if (!isValidId(pid)) return answer('알 수 없는 작업');
  const project = await getProject(pid);
  if (!project) return answer('작업을 찾을 수 없어요');

  if (act === 're') { await answer('다시 만들어요'); return retryProject(project); }
  if (act === 'rp') { await answer(); return sendReport(pid); }
  if (!PLATFORM_KEYS.includes(key)) return answer();

  if (act === 'ap' || act === 'rj' || act === 'pd') {
    const approval = { ap: 'approved', rj: 'rejected', pd: 'pending' }[act];
    await setApproval(pid, key, approval);
    await answer({ approved: '승인했어요', rejected: '보류했어요', pending: '승인을 취소했어요' }[approval]);
    await call('editMessageReplyMarkup', {
      chat_id: chatId(), message_id: q.message.message_id, reply_markup: { inline_keyboard: actionRow(pid, key, approval) },
    }).catch(() => {});
    if (approval === 'approved') await maybeAllApproved(pid);
    return null;
  }
  if (act === 'ed') {
    st.pendingEdit = { pid, key };
    await answer();
    const m = await send(`✏️ ${PLATFORMS[key].label}을(를) 어떻게 고칠까요? 그대로 적어 주세요.\n예) "첫 장면을 딸기로 바꾸고 자막을 더 짧게", "말투를 더 친근하게", "가격 표시 빼줘"\n(취소하려면 "취소")`,
      { reply_markup: { force_reply: true, input_field_placeholder: '수정할 내용' } });
    remember(m, pid, key);
    return null;
  }
  return answer();
}

async function retryProject(project) {
  if (!['failed', 'ready'].includes(project.status)) return send('지금 만드는 중이에요.');
  await updateProject(project.id, (p) => { p.status = 'queued'; p.error = null; p.progress = 0; });
  return startProject(project.id, project.source?.folder || project.plan?.place_name || project.id);
}

async function startRevision(pid, key, instruction) {
  const project = await getProject(pid);
  if (!project) return send('작업을 찾을 수 없어요.');
  await send(`✏️ ${PLATFORMS[key].label} 고치는 중이에요...\n"${instruction.slice(0, 200)}"`);
  enqueue(`revise ${pid} ${key}`, () => reviseAndRender(pid, key, instruction)).catch(() => {});
  return null;
}

async function maybeAllApproved(pid) {
  const p = await getProject(pid);
  const all = PLATFORM_KEYS.every((k) => p.outputs[k]?.approval === 'approved');
  if (all) await send(`🎉 ${p.plan?.place_name || '이 작업'}의 결과물 ${PLATFORM_KEYS.length}개를 모두 승인했어요.\n(각 플랫폼 자동 업로드는 다음 단계에서 연결돼요. 지금은 드라이브의 파일을 올려 주세요)`, kb(linkButtons(pid)));
}

// ---------- 보고 ----------

const nameOf = (p) => p.plan?.place_name || p.hints?.placeName || p.source?.folder || '새 작업';
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초` : `${Math.round(s)}초`);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 20)}…\n(전체 글은 드라이브 0_글모음.txt)` : s);

/** 결과물 하나 보내기 */
async function sendOutput(p, key, prefix = '') {
  const o = p.outputs[key];
  const label = PLATFORMS[key].label;
  const out = path.join(projectDir(p.id), 'out');
  const markup = { inline_keyboard: actionRow(p.id, key, o.approval) };
  if (o.status === 'failed') {
    const m = await send(`${prefix}❌ ${label} 만들기 실패: ${o.error || ''}`, { reply_markup: markup });
    return remember(m, p.id, key);
  }
  const head = `${prefix}${label}${reviewBadge(p, key)}`;
  const textBlock = [o.title && `제목: ${o.title}`, o.topic && `주제 태그: ${o.topic}`, o.body].filter(Boolean).join('\n\n');

  if (PLATFORMS[key].type === 'video' && o.video) {
    const file = path.join(out, o.video.file);
    const size = fsSync.statSync(file).size;
    const caption = clip(`🎬 ${head} · ${dur(o.video.duration)}\n\n${textBlock}`, 1024);
    if (key === 'longform' && o.thumbnail) {
      await upload('sendPhoto', 'photo', path.join(out, o.thumbnail.file), { chat_id: chatId(), caption: '🖼 유튜브 썸네일 (롱폼용)' }).catch(() => {});
    }
    if (size <= MAX_UPLOAD) {
      const m = await upload('sendVideo', 'video', file, {
        chat_id: chatId(), caption, supports_streaming: true,
        width: o.video.width, height: o.video.height, duration: Math.round(o.video.duration), reply_markup: markup,
      }, `${key}.mp4`);
      return remember(m, p.id, key);
    }
    const m = await send(`🎬 ${head} · ${dur(o.video.duration)} (${Math.round(size / 1e6)}MB라 드라이브에서 봐 주세요)\n\n${clip(textBlock, 3500)}`,
      { reply_markup: { inline_keyboard: [...linkButtons(p.id), ...markup.inline_keyboard] } });
    return remember(m, p.id, key);
  }
  if (PLATFORMS[key].type === 'carousel' && o.images?.length) {
    await sendPhotoGroup(chatId(), o.images.map((n) => path.join(out, 'carousel', n)), `🖼 ${head} (${o.images.length}장)`);
    const m = await send(`🖼 ${head} 캡션\n\n${clip(textBlock, 3800)}`, { reply_markup: markup });
    return remember(m, p.id, key);
  }
  if (key === 'blog') {
    const body = textBlock.replace(/\[사진: (m\d+(?::f\d+)?)\]/g, '📷');
    if (body.length > 3800) {
      const tmp = path.join(projectDir(p.id), 'work', '블로그.txt');
      await fs.writeFile(tmp, `﻿${o.title}\n\n${o.body}`);
      await upload('sendDocument', 'document', tmp, { chat_id: chatId(), caption: `📝 ${head} 전체 글 (📷 자리에 사진)` }, '블로그.txt');
    }
    const m = await send(`📝 ${head}\n\n${clip(body, 3800)}`, { reply_markup: markup });
    return remember(m, p.id, key);
  }
  const m = await send(`💬 ${head}\n\n${clip(textBlock, 3800)}`, { reply_markup: markup });
  return remember(m, p.id, key);
}

/** 자체 검증 점수 한 줄: " · 🧪 4.6/5 (자동 보완)" */
function reviewBadge(p, key) {
  const r = p.plan?.review;
  const ai = r?.ai?.find((x) => x.key === key);
  const lint = (r?.lintAfter || r?.lint)?.[key];
  const parts = [];
  if (ai) parts.push(`🧪 ${ai.total.toFixed(1)}/5`);
  else if (lint) parts.push(`🧪 규칙 ${lint.score}점`);
  if (r?.revised?.includes(key)) parts.push('자동 보완');
  return parts.length ? ` · ${parts.join(' ')}` : '';
}

export async function sendReport(pid) {
  const p = await getProject(pid);
  if (!p) return;
  const ai = p.plan?._source === 'mock' ? '⚠️ AI 없이 예시로 만들었어요' : '';
  const facts = (p.plan?.key_facts || []).slice(0, 5).map((f) => `• ${f}`).join('\n');
  const rv = p.plan?.review;
  const avg = rv?.ai?.length ? (rv.ai.reduce((a, x) => a + x.total, 0) / rv.ai.length).toFixed(1) : null;
  const reviewLine = avg ? `🧪 자체 검증 평균 ${avg}/5${rv.revised?.length ? ` · 기준 미달 ${rv.revised.length}개 자동 보완` : ''}` : '';
  await send([
    `✅ "${nameOf(p)}" 완성! (${PLATFORM_KEYS.length}종)`,
    `${CATEGORIES[p.plan?.category] || ''} · 자료 ${p.media.length}개`,
    p.plan?.summary || '',
    facts,
    ai,
    reviewLine,
    p.drive ? `📁 드라이브: ${config.drive.resultName}/${p.drive.folder}` : '',
    '',
    '아래 결과물마다 ✅ 승인 / ✏️ 수정 / ⏸ 보류를 눌러 주세요.',
  ].filter((x) => x !== '').join('\n'), kb(linkButtons(pid)));
  for (const key of PLATFORM_KEYS) {
    try { await sendOutput(p, key); } catch (err) {
      console.error(`[telegram] ${key} 보내기 실패:`, err.message);
      await send(`⚠️ ${PLATFORMS[key].label} 보내기 실패: ${err.message}`).catch(() => {});
    }
  }
}

async function sendGuideMenu() {
  const rows = [];
  for (let i = 0; i < CONCEPTS.length; i += 2) {
    rows.push(CONCEPTS.slice(i, i + 2).map((c) => {
      const t = totals(c);
      return { text: `${c.emoji} ${c.label} (📷${t.photos} 🎥${t.videos})`, callback_data: `gd:${c.id}` };
    }));
  }
  return send('어떤 걸 만들 건가요? 누르면 무엇을 몇 컷 찍을지 알려드려요.\n(📷 사진 장수, 🎥 영상 개수)', kb(rows));
}

// ---------- 목소리 ----------

async function sendVoiceMenu() {
  const now = currentVoiceInfo();
  const provider = await ttsProvider();
  const note = provider === 'azure' ? '마이크로소프트 공식 음성 (상업 이용 가능)'
    : provider === 'edge' ? '무료 edge 음성 (개인 시험용)'
      : provider === 'elevenlabs' ? 'ElevenLabs (이 메뉴의 목소리 대신 ElevenLabs 목소리를 써요)'
        : '나레이션 꺼짐 (목소리 설치 필요)';
  return send(`🎙 나레이션 목소리\n지금: ${now.name} (${now.desc})\n방식: ${note}\n\n고르면 다음 영상부터 그 목소리로 만들고, 들어볼 수 있게 보내 드려요.`, {
    reply_markup: { inline_keyboard: VOICES.map((v) => [{ text: `${v.id === now.id ? '✅ ' : ''}${v.name} · ${v.desc}`, callback_data: `vo:${v.id}` }]) },
  });
}

async function sendVoiceSample(v) {
  const dir = path.join(config.dataDir, 'voice-samples');
  await fs.mkdir(dir, { recursive: true });
  try {
    const r = await narrate('안녕하세요. 오늘 다녀온 곳, 솔직하게 정리해 봤어요. 이 가격이면 그냥 지나칠 수가 없더라고요.', dir);
    if (!r) return send(`${v.name} 목소리로 정했어요. (지금은 목소리 프로그램이 없어 미리듣기를 못 보내요)`);
    await upload('sendAudio', 'audio', r.file, { chat_id: chatId(), title: `${v.name} 목소리`, performer: 'cloude-video' }, `${v.name}.mp3`);
  } catch (err) {
    return send(`${v.name} 목소리로 정했어요. 미리듣기는 만들지 못했어요: ${err.message.slice(0, 200)}`);
  }
}

async function sendStatus() {
  const ai = await aiStatus();
  const folders = driveReady() ? await listUploadFolders() : [];
  return send([
    '📊 연결 상태',
    `• AI: ${ai.label}${ai.cliVersion ? ` (${ai.cliVersion})` : ''}`,
    `• 목소리: ${currentVoiceInfo().name} (${(await ttsProvider()) || '꺼짐'})`,
    `• 드라이브: ${driveReady() ? `연결됨 (${config.drive.dir})\n  업로드 폴더 ${folders.length}개, 새 폴더 ${folders.filter((f) => !f.projectId).length}개` : '연결 안 됨 (.env 의 DRIVE_DIR)'}`,
    `• 대기 중인 작업: ${queueLength()}개`,
  ].join('\n'));
}

async function sendList() {
  const list = (await listProjects()).slice(0, 8);
  if (!list.length) return send('아직 작업이 없어요. /make 로 시작해 보세요.');
  const icon = { ready: '✅', failed: '❌', processing: '⏳', queued: '⏳' };
  const rows = list.map((p) => {
    const ok = Object.values(p.outputs || {}).filter((o) => o.approval === 'approved').length;
    return [{
      text: `${icon[p.status] || '•'} ${nameOf(p)} ${p.status === 'ready' ? `(승인 ${ok}/${PLATFORM_KEYS.length})` : p.status === 'failed' ? '실패' : `${Math.round((p.progress || 0) * 100)}%`}`.slice(0, 60),
      callback_data: p.status === 'failed' ? `re:${p.id}` : `rp:${p.id}`,
    }];
  });
  return send('최근 작업 (누르면 결과를 다시 보내요, 실패한 작업은 다시 만들어요)', kb(rows));
}

// ---------- 제작 상황 알림 ----------

let lastEdit = {};
function attachEvents() {
  bus.on('step', async (id, step, progress) => {
    const mid = st.progressMsg[id];
    if (!mid || Date.now() - (lastEdit[id] || 0) < 4000) return;
    lastEdit[id] = Date.now();
    const p = await getProject(id);
    call('editMessageText', {
      chat_id: chatId(), message_id: mid,
      text: `⏳ "${nameOf(p)}" 만드는 중 ${Math.round(progress * 100)}%\n${step}`,
    }).catch(() => {});
  });
  bus.on('ready', async (id) => {
    const mid = st.progressMsg[id];
    if (mid) {
      const p = await getProject(id);
      await call('editMessageText', { chat_id: chatId(), message_id: mid, text: `✅ "${nameOf(p)}" 완성! 아래에 결과를 보내요.` }).catch(() => {});
      delete st.progressMsg[id];
      saveState();
    }
    sendReport(id).catch((err) => console.error('[telegram] 보고 실패:', err));
  });
  bus.on('failed', async (id, message) => {
    const p = await getProject(id);
    send(`❌ "${nameOf(p)}" 만들기 실패\n${message}`, kb([[{ text: '🔄 다시 만들기', callback_data: `re:${id}` }]])).catch(() => {});
  });
  bus.on('output', async (id, key) => {
    const p = await getProject(id);
    sendOutput(p, key, '✏️ 수정본 · ').catch((err) => send(`⚠️ 수정본 보내기 실패: ${err.message}`).catch(() => {}));
  });
  bus.on('output-failed', (id, key, message) => {
    send(`❌ ${PLATFORMS[key].label} 수정 실패: ${message}`).catch(() => {});
  });
}
