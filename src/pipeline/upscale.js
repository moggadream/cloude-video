// 작은·흐린 사진을 선명하게 (Real-ESRGAN, 내 컴퓨터 그래픽카드로 실행)
// 카카오톡으로 받은 사진, 캡처, 오래된 폰 사진처럼 작은 사진만 키운다. 큰 폰 사진은 그대로 둔다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';

export function upscaleEnabled() {
  return config.upscale.mode !== 'off' && Boolean(config.upscale.bin);
}

/** 이 크기의 사진을 키워야 하는지 (짧은 쪽이 기준보다 작을 때) */
export function needsUpscale(width, height) {
  if (!upscaleEnabled() || !width || !height) return false;
  const short = Math.min(width, height);
  // 너무 작은 아이콘·스티커는 키워도 쓸모없다
  return short < config.upscale.minSide && short >= 128;
}

/**
 * input(jpg/png/webp)을 4배로 키워 output(jpg)에 저장한다.
 * @returns {Promise<boolean>} 성공 여부 (실패하면 원본을 그대로 쓰면 된다)
 */
export async function upscaleImage(input, output) {
  if (!upscaleEnabled()) return false;
  const bin = config.upscale.bin;
  try {
    await new Promise((resolve, reject) => {
      // 모델 폴더(models)를 찾도록 실행 파일 폴더에서 실행
      const p = spawn(bin, ['-i', input, '-o', output, '-n', config.upscale.model, '-f', 'jpg'], {
        cwd: path.dirname(bin), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      const timer = setTimeout(() => { p.kill(); reject(new Error('시간 초과')); }, 120_000);
      p.stderr.on('data', (d) => { err += d; if (err.length > 20_000) err = err.slice(-5_000); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`code ${code}: ${err.replace(/\d+\.\d+%\s*/g, '').slice(-300)}`));
      });
    });
    const st = await fs.stat(output);
    return st.size > 0;
  } catch (err) {
    console.warn('[upscale] 사진 선명하게 실패, 원본 사용:', err.message);
    await fs.rm(output, { force: true }).catch(() => {});
    return false;
  }
}
