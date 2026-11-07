// 영상 제작은 CPU를 많이 쓰므로 한 번에 하나씩 처리한다.
const jobs = [];
let running = false;

export function enqueue(name, fn) {
  return new Promise((resolve, reject) => {
    jobs.push({ name, fn, resolve, reject });
    runNext();
  });
}

export const queueLength = () => jobs.length + (running ? 1 : 0);

async function runNext() {
  if (running || jobs.length === 0) return;
  running = true;
  const job = jobs.shift();
  try {
    job.resolve(await job.fn());
  } catch (err) {
    console.error(`[queue] ${job.name} 실패:`, err);
    job.reject(err);
  } finally {
    running = false;
    runNext();
  }
}
