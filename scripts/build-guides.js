// src/guides 의 데이터로 컨셉 스킬 문서를 만든다: node scripts/build-guides.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { CONCEPTS, COMMON_TIPS, totals, useLabel } from '../src/guides/concepts.js';
import { STORIES } from '../src/guides/stories.js';

const skillsDir = path.join(ROOT, '.claude', 'skills');

for (const c of CONCEPTS) {
  const t = totals(c);
  const s = STORIES[c.id];
  const rows = c.shots.map((x, i) => `| ${i + 1} | ${x.must ? '⭐ ' : ''}${x.name} | ${x.type === 'photo' ? `사진 ${x.count}장` : `영상 ${x.count}개 × ${x.sec}초`} | ${x.how} | ${x.uses.map(useLabel).join(', ')} |`);
  const md = `---
name: concept-${c.id}
description: ${c.label} 콘텐츠 가이드. 무엇을 몇 컷 찍어야 하는지(촬영 체크리스트)와, 이 컨셉의 영상·글을 어떤 훅·정보·순서로 만들지. ${c.label} 자료로 대본을 쓰거나 촬영 계획을 세울 때 사용.
---

<!-- 이 파일은 scripts/build-guides.js 가 src/guides/ 데이터로 만든다. 직접 고치지 말고 데이터를 고친 뒤 다시 만들 것 -->

# ${c.emoji} ${c.label}

${c.summary}

## 1. 촬영 체크리스트

총 **사진 ${t.photos}장 · 영상 ${t.videos}개(약 ${t.videoSec}초)** · 걸리는 시간 ${c.time}
꼭 필요한 것(⭐)만: 사진 ${t.mustPhotos}장 · 영상 ${t.mustVideos}개

| # | 컷 | 개수 | 찍는 법 | 쓰이는 곳 |
|---|---|---|---|---|
${rows.join('\n')}

**메모.txt에 적을 것**: ${c.memo.join(' / ')}
**피할 것**: ${c.avoid.join(' / ')}
**드라이브 폴더 이름**: \`[${c.tag}] 장소 이름\`

## 2. 콘텐츠 전략

**훅 아이디어**
${s.hooks.map((h) => `- ${h}`).join('\n')}

**꼭 들어가야 할 정보** (확인된 것만)
${s.mustInfo.map((h) => `- ${h}`).join('\n')}

**쇼츠·릴스·틱톡 흐름**
${s.shortFlow.map((h, i) => `${i + 1}. ${h}`).join('\n')}

**관점**: ${s.angle}

## 공통 촬영 팁
${COMMON_TIPS.map((h) => `- ${h}`).join('\n')}
`;
  const dir = path.join(skillsDir, `concept-${c.id}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), md);
  console.log('작성:', path.relative(ROOT, path.join(dir, 'SKILL.md')));
}

// 전체 목록 스킬
const list = CONCEPTS.map((c) => {
  const t = totals(c);
  return `| ${c.emoji} ${c.label} | \`concept-${c.id}\` | 사진 ${t.photos} · 영상 ${t.videos} | ⭐ 사진 ${t.mustPhotos} · 영상 ${t.mustVideos} | \`[${c.tag}]\` |`;
}).join('\n');
await fs.mkdir(path.join(skillsDir, 'shoot-guide'), { recursive: true });
await fs.writeFile(path.join(skillsDir, 'shoot-guide', 'SKILL.md'), `---
name: shoot-guide
description: 촬영 전에 "무엇을 만들 건지(컨셉)"를 고르고 필요한 사진·영상 컷 수를 알려주는 가이드 목록. 컨셉별 자세한 내용은 concept-* 스킬.
---

<!-- scripts/build-guides.js 로 만든 파일 -->

# 촬영 가이드: 컨셉 고르기

| 컨셉 | 스킬 | 전체 컷 | 꼭 필요한 컷 | 폴더 태그 |
|---|---|---|---|---|
${list}

- 텔레그램: \`/guide\` → 컨셉 버튼을 누르면 체크리스트를 보내요.
- 웹: 홈 화면의 "📋 촬영 가이드" → 컨셉을 누르면 체크리스트(체크 가능)가 나와요.
- 드라이브 폴더 이름 앞에 태그를 붙이면 그 컨셉으로 만들어요. 예: \`[맛집] 을지로 노가리집\`

## 공통 팁
${COMMON_TIPS.map((h) => `- ${h}`).join('\n')}
`);
console.log('작성: .claude/skills/shoot-guide/SKILL.md');
