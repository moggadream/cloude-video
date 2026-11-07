// 승인된 결과물을 각 플랫폼에 올린다.
// 1단계: 플랫폼 연결 전이므로 "승인됨(직접 올리기)" 상태로 기록만 한다.
// 2단계에서 youtube / instagram / threads 업로더를 이 자리에 붙인다.

export const PLATFORMS = {
  shorts: { name: 'YouTube', auto: false, note: '유튜브 계정 연결 후 자동 업로드 (2단계)' },
  longform: { name: 'YouTube', auto: false, note: '유튜브 계정 연결 후 자동 업로드 (2단계)' },
  reels: { name: 'Instagram', auto: false, note: '인스타그램 비즈니스 계정 연결 후 자동 업로드 (2단계)' },
  threads: { name: 'Threads', auto: false, note: '쓰레드 계정 연결 후 자동 게시 (2단계)' },
  blog: { name: '블로그', auto: false, note: '네이버 블로그는 자동 게시 API가 없어 복사해서 붙여넣기' },
};

const uploaders = {
  // 예: shorts: (project, output) => uploadYouTube(...)
};

export function platformStatus() {
  return Object.fromEntries(
    Object.entries(PLATFORMS).map(([k, v]) => [k, { ...v, auto: Boolean(uploaders[k]) }]),
  );
}

export async function publishOutput(project, key) {
  const uploader = uploaders[key];
  if (!uploader) {
    return {
      status: 'manual',
      message: `${PLATFORMS[key].name}: 아직 자동 게시가 연결되지 않았어요. 내려받기/복사 버튼으로 직접 올려 주세요.`,
      at: new Date().toISOString(),
    };
  }
  const res = await uploader(project, project.outputs[key]);
  return { status: 'published', url: res.url, at: new Date().toISOString() };
}
