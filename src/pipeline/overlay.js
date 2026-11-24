// 화면 글자 층 (Remotion): 이어 붙인 영상 위에 제목·자막·가격표·이름표를 움직이는 글자로 그린다.
// remotion/ 폴더에 설치돼 있을 때만 쓰고(cd remotion && npm install), 없거나 실패하면 예전 방식(ASS 자막)으로.
// 끄기: .env 의 OVERLAY=ass
// Remotion 라이선스: 개인·3명 이하 회사는 무료(상업 이용 포함). https://www.remotion.dev/docs/license
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../config.js';

const DIR = path.join(ROOT, 'remotion');
let libs; // { bundle, renderer }
let bundled; // 한 번 묶은 결과(주소)를 계속 쓴다

export function overlayAvailable() {
  if ((process.env.OVERLAY || 'auto') === 'ass') return false;
  return fs.existsSync(path.join(DIR, 'node_modules', '@remotion', 'renderer', 'package.json'));
}

async function load() {
  if (libs) return libs;
  const req = createRequire(path.join(DIR, 'package.json'));
  const bundler = await import(pathToFileURL(req.resolve('@remotion/bundler')).href);
  const renderer = await import(pathToFileURL(req.resolve('@remotion/renderer')).href);
  libs = { bundle: bundler.bundle, renderer };
  return libs;
}

async function serveUrl() {
  if (bundled) return bundled;
  const { bundle, renderer } = await load();
  await renderer.ensureBrowser(); // 처음 한 번 렌더용 크롬(헤드리스)을 받는다
  bundled = await bundle({ entryPoint: path.join(DIR, 'src', 'index.jsx'), publicDir: path.join(ROOT, 'assets') });
  return bundled;
}

/** 작업 폴더의 파일 하나를 잠깐 내주는 작은 서버 (영상 탐색용 Range 지원) */
function serveFile(file) {
  return new Promise((resolve) => {
    const size = fs.statSync(file).size;
    const server = http.createServer((req, res) => {
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': size });
        fs.createReadStream(file).pipe(res);
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/video.mp4`, close: () => server.close() }));
  });
}

/** 형식별 글자 위치 (픽셀). 틱톡은 오른쪽 버튼·아래 캡션을 피해 안쪽·위쪽 */
export function overlayLayout(fmt) {
  const vertical = fmt.h > fmt.w;
  return {
    captionBottom: fmt.captionMargin,
    hookTop: vertical ? 300 : 110,
    priceTop: vertical ? 560 : 250,
    labelTop: vertical ? 330 : 60,
    marginL: fmt.marginL ?? (vertical ? 70 : 160),
    marginR: fmt.marginR ?? (vertical ? 70 : 160),
  };
}

/**
 * @param {{video:string, out:string, events:object[], fmt:object, duration:number, onProgress?:(r:number)=>void}} o
 * @returns {Promise<boolean>} 성공하면 true (out 에 소리 없는 영상)
 */
export async function renderOverlay({ video, out, events, fmt, duration, onProgress = () => {} }) {
  if (!overlayAvailable()) return false;
  const srv = await serveFile(video);
  try {
    const { renderer } = await load();
    const url = await serveUrl();
    const inputProps = { video: srv.url, events, layout: overlayLayout(fmt), duration, fps: 30, width: fmt.w, height: fmt.h };
    if (process.env.KEEP_WORK === '1') fs.writeFileSync(`${out}.props.json`, JSON.stringify(inputProps, null, 1));
    const composition = await renderer.selectComposition({ serveUrl: url, id: 'Overlay', inputProps, onBrowserLog: (l) => { if (l.type !== 'log') console.warn('[overlay:browser]', l.text.slice(0, 200)); } });
    await renderer.renderMedia({
      composition, serveUrl: url, inputProps, codec: 'h264', crf: 18, muted: true, outputLocation: out,
      concurrency: Math.max(2, Math.floor(os.cpus().length / 2)),
      onProgress: ({ progress }) => onProgress(progress),
      onBrowserLog: (l) => { if (l.type === 'warning' || l.type === 'error') console.warn('[overlay:browser]', l.text.slice(0, 200)); },
    });
    return fs.existsSync(out);
  } catch (err) {
    console.warn('[overlay] Remotion 글자 층 실패, 예전 자막 방식 사용:', String(err.message).slice(0, 300));
    return false;
  } finally {
    srv.close();
  }
}
