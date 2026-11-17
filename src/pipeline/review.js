// 자체 검증: ① 규칙 검사 → ② AI 편집장 채점(한 번에 전부) → ③ 기준 미달만 자동으로 다시 쓰기 → ④ 다시 규칙 검사
import { z } from 'zod';
import { generate } from '../ai/index.js';
import { loadSkill } from '../ai/skills.js';
import { config } from '../config.js';
import { PLATFORMS, PLATFORM_KEYS, contextText, toShotForm, reviseOutput } from './plan.js';
import { lintPlan } from './lint.js';

const Score = z.number().min(1).max(5);
const ReviewSchema = z.object({
  reviews: z.array(z.object({
    key: z.enum(PLATFORM_KEYS),
    scores: z.object({ facts: Score, hook: Score, human: Score, platform: Score, value: Score, specific: Score }),
    total: z.number(),
    verdict: z.enum(['pass', 'fix']),
    strengths: z.array(z.string()),
    fixes: z.array(z.string()),
  })),
});

const THRESHOLD = Number(process.env.REVIEW_THRESHOLD || 4.3);
export const reviewEnabled = () => (process.env.REVIEW || 'on') !== 'off';

export async function aiReview(project, plan, lint) {
  const ctx = await contextText(project, plan, null);
  const outputs = PLATFORM_KEYS.map((k) => `### ${k} (${PLATFORMS[k].label})\n${JSON.stringify(toShotForm(k, plan, project), null, 1)}`).join('\n\n');
  const lintText = PLATFORM_KEYS.map((k) => `- ${k}: ${lint[k]?.issues.map((i) => `[${i.level}] ${i.msg}`).join(' / ') || '문제 없음'}`).join('\n');
  // 플랫폼 스킬 요약을 함께 주면 "플랫폼 적합" 채점이 정확해진다
  const skills = [];
  for (const k of PLATFORM_KEYS) skills.push(`### ${k}\n${(await loadSkill(PLATFORMS[k].skill)).slice(0, 1800)}`);
  return generate({
    system: [await loadSkill('content-review'), '', '# 사람다움 기준', await loadSkill('humanize-korean'), '', '# 플랫폼 스킬 (요약)', ...skills].join('\n'),
    content: [{
      type: 'text',
      text: `${ctx}\n\n## 채점할 결과물 (7종)\n${outputs}\n\n## 규칙 검사 결과\n${lintText}\n\n7개 결과물을 모두 채점하세요.`,
    }],
    schema: ReviewSchema,
    label: '자체 검증',
  });
}

/**
 * @returns {Promise<{plan, review}>} 보완된 plan과 검증 기록
 */
export async function selfReview(project, plan, onStep = () => {}) {
  const before = lintPlan(plan, project, PLATFORM_KEYS);
  onStep('자체 검증: 편집장 AI가 채점하는 중', 0);
  let ai;
  try {
    ai = await aiReview(project, plan, before);
  } catch (err) {
    console.warn('[review] AI 채점 실패, 규칙 검사만 기록:', err.message);
    return { plan, review: { at: new Date().toISOString(), lint: before, ai: null, revised: [], error: err.message } };
  }
  const byKey = Object.fromEntries(ai.reviews.map((r) => [r.key, r]));
  const toFix = PLATFORM_KEYS.filter((k) => {
    const r = byKey[k];
    const lintErr = before[k]?.issues.some((i) => i.level === 'error');
    // 기준: 편집장이 fix 판정 / 총점 미달 / 한 항목이라도 3점 이하 / 규칙 오류 / 짧은 영상 길이 초과
    const low = r && Object.values(r.scores).some((v) => v <= 3);
    const tooLong = ['shorts', 'reels', 'tiktok'].includes(k) && before[k]?.issues.some((i) => i.msg.startsWith('예상 길이'));
    return (r && (r.verdict === 'fix' || r.total < THRESHOLD || low)) || lintErr || tooLong;
  });

  let current = plan;
  const revised = [];
  let done = 0;
  for (const k of toFix) {
    onStep(`자체 검증: ${PLATFORMS[k].label} 보완 중 (${++done}/${toFix.length})`, done / (toFix.length + 1));
    const fixes = [
      ...(byKey[k]?.fixes || []),
      ...(before[k]?.issues || []).filter((i) => i.level === 'error' || i.msg.startsWith('예상 길이') || i.msg.startsWith('훅')).map((i) => i.msg),
    ];
    if (!fixes.length) continue;
    try {
      current = await reviseOutput(project, k, fixes.map((f) => `- ${f}`).join('\n'), { plan: current, auto: true });
      revised.push(k);
    } catch (err) {
      console.warn(`[review] ${k} 보완 실패:`, err.message);
    }
  }
  // 마무리 손질: 블로그·쓰레드는 규칙 검사(말끝·길이·제목)가 남아 있으면 그것만 한 번 더 고친다
  let after = lintPlan(current, project, PLATFORM_KEYS);
  for (const k of ['blog', 'threads']) {
    const left = (after[k]?.issues || []).filter((i) => /말끝|본문|제목|자\b|자 \(|질문/.test(i.msg));
    if (!left.length) continue;
    onStep(`자체 검증: ${PLATFORMS[k].label} 마무리 손질`, 0.95);
    try {
      current = await reviseOutput(project, k, [
        ...left.map((i) => `- ${i.msg}`),
        '- 내용(사실)은 바꾸지 말고 위 형식 문제만 고칠 것. 분량을 늘릴 때는 장면 목록에 보이는 사실만 쓸 것.',
      ].join('\n'), { plan: current, auto: true });
      if (!revised.includes(k)) revised.push(k);
    } catch (err) {
      console.warn(`[review] ${k} 마무리 손질 실패:`, err.message);
    }
  }
  after = lintPlan(current, project, PLATFORM_KEYS);
  return {
    plan: current,
    review: {
      at: new Date().toISOString(),
      threshold: THRESHOLD,
      ai: ai.reviews,
      lint: before,
      lintAfter: after,
      revised,
    },
  };
}

export { config };
