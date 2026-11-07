// 완성 알림: 브라우저 푸시(폰에 앱처럼 설치했을 때) + 텔레그램(선택)
import fs from 'node:fs/promises';
import path from 'node:path';
import * as webpush from 'web-push';
import { config } from './config.js';

const subsFile = () => path.join(config.dataDir, 'push-subscriptions.json');
const vapidFile = () => path.join(config.dataDir, 'vapid.json');

let vapid;
/** VAPID 키: 환경변수에 없으면 처음 실행 때 자동으로 만들어 data/ 에 저장 */
export async function getVapid() {
  if (vapid) return vapid;
  if (config.vapid.publicKey && config.vapid.privateKey) {
    vapid = { publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey };
  } else {
    try {
      vapid = JSON.parse(await fs.readFile(vapidFile(), 'utf8'));
    } catch {
      vapid = webpush.generateVAPIDKeys();
      await fs.mkdir(config.dataDir, { recursive: true });
      await fs.writeFile(vapidFile(), JSON.stringify(vapid, null, 2));
    }
  }
  webpush.setVapidDetails(config.vapid.subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

async function readSubs() {
  try { return JSON.parse(await fs.readFile(subsFile(), 'utf8')); } catch { return []; }
}
async function writeSubs(list) {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(subsFile(), JSON.stringify(list, null, 2));
}

export async function addSubscription(sub) {
  if (!sub?.endpoint) throw new Error('잘못된 구독 정보');
  const list = (await readSubs()).filter((s) => s.endpoint !== sub.endpoint);
  list.push(sub);
  await writeSubs(list);
}

export async function notify({ title, body, url }) {
  const results = { push: 0, telegram: false };

  // 브라우저 푸시
  await getVapid();
  const subs = await readSubs();
  const alive = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(s, JSON.stringify({ title, body, url }));
      alive.push(s);
      results.push++;
    } catch (err) {
      // 만료된 구독은 지운다
      if (err.statusCode !== 404 && err.statusCode !== 410) alive.push(s);
      else console.warn('[notify] 만료된 푸시 구독 삭제');
    }
  }
  if (alive.length !== subs.length) await writeSubs(alive);

  // 텔레그램
  if (config.telegram.botToken && config.telegram.chatId) {
    const link = config.publicUrl ? `\n${config.publicUrl.replace(/\/$/, '')}${url}` : '';
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text: `🎬 ${title}\n${body}${link}` }),
      });
      results.telegram = res.ok;
      if (!res.ok) console.warn('[notify] 텔레그램 실패', res.status, await res.text());
    } catch (err) {
      console.warn('[notify] 텔레그램 오류', err.message);
    }
  }
  console.log(`[notify] ${title} — 푸시 ${results.push}건, 텔레그램 ${results.telegram ? '보냄' : '안 보냄'}`);
  return results;
}
