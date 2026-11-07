import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, features, ROOT } from './config.js';
import {
  createProject, getProject, listProjects, updateProject, deleteProject, projectDir, isValidId,
} from './store.js';
import { enqueue, queueLength } from './queue.js';
import { processProject, renderOne, OUTPUT_KEYS, OUTPUT_LABELS } from './pipeline/index.js';
import { kindOf } from './pipeline/media.js';
import { CATEGORIES } from './pipeline/plan.js';
import { addSubscription, getVapid, notify } from './notify.js';
import { publishOutput, platformStatus } from './publish/index.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// ---------- 로그인 (APP_PASSWORD가 있을 때만) ----------
const authToken = () => crypto.createHash('sha256').update(`cloude-video:${config.appPassword}`).digest('hex');
const readCookie = (req, name) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
const isAuthed = (req) => !config.appPassword || readCookie(req, 'cv_auth') === authToken();

app.post('/api/login', (req, res) => {
  const ok = config.appPassword && typeof req.body?.password === 'string' &&
    crypto.timingSafeEqual(
      crypto.createHash('sha256').update(req.body.password).digest(),
      crypto.createHash('sha256').update(config.appPassword).digest(),
    );
  if (!ok) return res.status(401).json({ error: '비밀번호가 틀렸어요' });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `cv_auth=${authToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}${secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/status', async (req, res) => {
  res.json({
    authed: isAuthed(req),
    passwordRequired: Boolean(config.appPassword),
    features: { ai: features.ai, voice: features.voice, aiMusic: features.aiMusic },
    telegram: Boolean(config.telegram.botToken && config.telegram.chatId),
    vapidPublicKey: (await getVapid()).publicKey,
    platforms: platformStatus(),
    categories: CATEGORIES,
    outputLabels: OUTPUT_LABELS,
    queue: queueLength(),
  });
});

const requireAuth = (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: '로그인이 필요해요' }));
app.use('/api', requireAuth);
app.use('/files', requireAuth);

// ---------- 업로드 ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = path.join(config.dataDir, 'incoming');
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { files: 40, fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(kindOf(file.originalname, file.mimetype))),
});

app.post('/api/projects', upload.array('files', 40), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: '사진이나 영상을 1개 이상 올려 주세요' });
  const category = Object.hasOwn(CATEGORIES, req.body.category) ? req.body.category : 'auto';
  const project = await createProject({
    hints: {
      category,
      placeName: String(req.body.placeName || '').slice(0, 100),
      memo: String(req.body.memo || '').slice(0, 1000),
    },
  });
  const dir = projectDir(project.id);
  const media = [];
  for (const [i, f] of files.entries()) {
    const id = `m${i + 1}`;
    const name = `${id}${path.extname(f.filename)}`;
    await fs.rename(f.path, path.join(dir, 'media', name));
    media.push({
      id,
      kind: kindOf(f.originalname, f.mimetype),
      file: name,
      originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
      size: f.size,
    });
  }
  await updateProject(project.id, (p) => { p.media = media; p.status = 'queued'; p.step = '순서 기다리는 중'; });
  enqueue(`process ${project.id}`, () => processProject(project.id)).catch(() => {});
  res.json({ id: project.id });
});

// ---------- 프로젝트 ----------
app.get('/api/projects', async (req, res) => {
  const list = await listProjects();
  res.json(list.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    status: p.status,
    step: p.step,
    progress: p.progress,
    placeName: p.plan?.place_name || p.hints?.placeName || '',
    category: p.plan?.category || p.hints?.category,
    mediaCount: p.media.length,
    thumb: p.outputs?.shorts?.video?.thumb ? `/files/${p.id}/out/${p.outputs.shorts.video.thumb}` : null,
    approvals: Object.fromEntries(Object.entries(p.outputs || {}).map(([k, o]) => [k, o.approval])),
  })));
});

const loadProject = async (req, res, next) => {
  const p = await getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '프로젝트를 찾을 수 없어요' });
  req.project = p;
  next();
};
const checkKey = (req, res, next) =>
  (OUTPUT_KEYS.includes(req.params.key) ? next() : res.status(404).json({ error: '알 수 없는 결과물' }));

app.get('/api/projects/:id', loadProject, (req, res) => res.json(req.project));

app.delete('/api/projects/:id', loadProject, async (req, res) => {
  if (['processing', 'queued'].includes(req.project.status)) {
    return res.status(409).json({ error: '제작 중에는 지울 수 없어요' });
  }
  await deleteProject(req.project.id);
  res.json({ ok: true });
});

app.post('/api/projects/:id/retry', loadProject, async (req, res) => {
  if (req.project.status !== 'failed') return res.status(409).json({ error: '실패한 프로젝트만 다시 만들 수 있어요' });
  await updateProject(req.project.id, (p) => { p.status = 'queued'; p.step = '순서 기다리는 중'; p.error = null; p.progress = 0; });
  enqueue(`retry ${req.project.id}`, () => processProject(req.project.id)).catch(() => {});
  res.json({ ok: true });
});

// 제목/본문 수정
app.patch('/api/projects/:id/outputs/:key', loadProject, checkKey, async (req, res) => {
  const { title, body } = req.body || {};
  const p = await updateProject(req.project.id, (p) => {
    const o = p.outputs[req.params.key];
    if (typeof title === 'string') o.title = title.slice(0, 200);
    if (typeof body === 'string') o.body = body.slice(0, 30000);
    o.editedAt = new Date().toISOString();
  });
  res.json(p.outputs[req.params.key]);
});

// 영상 장면(나레이션/자막/가격) 수정 → 다시 만들기
app.put('/api/projects/:id/plan/:key', loadProject, checkKey, async (req, res) => {
  const key = req.params.key;
  if (!['shorts', 'reels', 'longform'].includes(key)) return res.status(400).json({ error: '영상만 장면을 고칠 수 있어요' });
  const { hook, scenes } = req.body || {};
  if (!Array.isArray(scenes) || scenes.length === 0) return res.status(400).json({ error: '장면이 비어 있어요' });
  const ids = new Set(req.project.media.map((m) => m.id));
  const clean = scenes.filter((s) => ids.has(s.media_id)).slice(0, 80).map((s) => ({
    media_id: s.media_id,
    clip_start: Math.max(0, Number(s.clip_start) || 0),
    narration: String(s.narration || '').slice(0, 500),
    caption: String(s.caption || '').slice(0, 80),
    price_tag: String(s.price_tag || '').slice(0, 60),
    chapter: String(s.chapter || '').slice(0, 60),
  }));
  await updateProject(req.project.id, (p) => {
    if (typeof hook === 'string') p.plan[key].hook = hook.slice(0, 60);
    p.plan[key].scenes = clean;
    p.outputs[key].status = 'queued';
  });
  enqueue(`rerender ${req.project.id} ${key}`, () => renderOne(req.project.id, key)).catch(() => {});
  res.json({ ok: true });
});

app.post('/api/projects/:id/outputs/:key/rerender', loadProject, checkKey, async (req, res) => {
  const key = req.params.key;
  if (!['shorts', 'reels', 'longform'].includes(key)) return res.status(400).json({ error: '영상만 다시 만들 수 있어요' });
  await updateProject(req.project.id, (p) => { p.outputs[key].status = 'queued'; });
  enqueue(`rerender ${req.project.id} ${key}`, () => renderOne(req.project.id, key)).catch(() => {});
  res.json({ ok: true });
});

// 승인 → 게시
app.post('/api/projects/:id/outputs/:key/approve', loadProject, checkKey, async (req, res) => {
  const key = req.params.key;
  const o = req.project.outputs[key];
  if (!o || o.status !== 'ready') return res.status(409).json({ error: '아직 완성되지 않았어요' });
  try {
    const publish = await publishOutput(req.project, key);
    const p = await updateProject(req.project.id, (p) => {
      p.outputs[key].approval = 'approved';
      p.outputs[key].approvedAt = new Date().toISOString();
      p.outputs[key].publish = publish;
    });
    res.json(p.outputs[key]);
  } catch (err) {
    await updateProject(req.project.id, (p) => {
      p.outputs[key].publish = { status: 'failed', message: err.message, at: new Date().toISOString() };
    });
    res.status(502).json({ error: `게시 실패: ${err.message}` });
  }
});

app.post('/api/projects/:id/outputs/:key/reject', loadProject, checkKey, async (req, res) => {
  const p = await updateProject(req.project.id, (p) => { p.outputs[req.params.key].approval = 'rejected'; });
  res.json(p.outputs[req.params.key]);
});

app.post('/api/projects/:id/outputs/:key/reset', loadProject, checkKey, async (req, res) => {
  const p = await updateProject(req.project.id, (p) => {
    p.outputs[req.params.key].approval = 'pending';
    p.outputs[req.params.key].publish = null;
  });
  res.json(p.outputs[req.params.key]);
});

// ---------- 알림 ----------
app.post('/api/push/subscribe', async (req, res) => {
  try {
    await addSubscription(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post('/api/push/test', async (req, res) => {
  res.json(await notify({ title: '알림 테스트', body: '이 알림이 보이면 설정 완료!', url: '/' }));
});

// ---------- 결과 파일 ----------
app.get('/files/:id/:area/*', async (req, res) => {
  const { id, area } = req.params;
  if (!isValidId(id) || !['out', 'work', 'media'].includes(area)) return res.sendStatus(404);
  const base = path.join(projectDir(id), area);
  const file = path.resolve(base, req.params[0]);
  if (!file.startsWith(base + path.sep)) return res.sendStatus(404);
  res.sendFile(file, { dotfiles: 'deny', headers: { 'Cache-Control': 'private, max-age=60' } }, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
});

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? '파일이 너무 커요 (최대 1GB)' : err.message;
  res.status(err.status || 500).json({ error: msg });
});

// 서버가 꺼졌다 켜지면 진행 중이던 작업은 실패로 표시 (다시 만들기 가능)
async function recoverInterrupted() {
  for (const p of await listProjects()) {
    if (p.status === 'processing' || p.status === 'queued') {
      await updateProject(p.id, (x) => {
        x.status = 'failed';
        x.error = '서버가 다시 시작되어 제작이 중단됐어요. "다시 만들기"를 눌러 주세요.';
      });
    } else if (p.status === 'ready') {
      // 다시 만들던 영상만 중단된 경우
      const stuck = Object.entries(p.outputs || {}).filter(([, o]) => ['queued', 'rendering'].includes(o.status));
      if (stuck.length) {
        await updateProject(p.id, (x) => {
          for (const [k] of stuck) {
            x.outputs[k].status = x.outputs[k].video ? 'ready' : 'failed';
            if (!x.outputs[k].video) x.outputs[k].error = '서버가 다시 시작되어 중단됐어요';
          }
        });
      }
    }
  }
}

await fs.mkdir(config.dataDir, { recursive: true });
await recoverInterrupted();
await getVapid();
app.listen(config.port, () => {
  console.log(`\n🎬 cloude-video 실행 중: http://localhost:${config.port}`);
  console.log(`   AI 분석: ${features.ai ? '켜짐' : '꺼짐 (예시 데이터 사용)'} · 나레이션: ${features.voice ? '켜짐' : '꺼짐'} · AI 음악: ${features.aiMusic ? '켜짐' : '꺼짐 (내장 음악)'}`);
  if (!config.appPassword) console.log('   ⚠️  APP_PASSWORD가 없어 누구나 접속할 수 있어요. 인터넷에 공개할 때는 꼭 설정하세요.');
});
