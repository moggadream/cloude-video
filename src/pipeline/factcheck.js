// 사실 확인: 긴 글(블로그 등)의 문장을 자료와 대조해 근거 없는 문장만 정확히 지우거나 바꾼다.
// 글 전체를 다시 쓰게 하면 새 지어내기가 섞이기 쉬워서, "찾아서 바꾸기" 목록만 받아 프로그램이 적용한다.
import { z } from 'zod';
import { generate } from '../ai/index.js';
import { contextText } from './plan.js';

const EditsSchema = z.object({
  edits: z.array(z.object({
    find: z.string().describe('글에 있는 문장(또는 구절)을 한 글자도 바꾸지 말고 그대로'),
    replace: z.string().describe('바꿀 문장. 지우려면 빈 문자열'),
    reason: z.string().describe('짧게: 메모에 없는 감상 / 강도 과장 / 위치 지어냄 / 반복 / 촬영 과정 이야기 등'),
  })),
});

const SYSTEM = `당신은 사실 확인 담당 편집자입니다. 블로그 글의 문장을 하나씩 원본 자료(촬영자 메모 + 사진 분석 결과)와 대조합니다.

찾아야 할 문장
1. 메모에 없는 감상·평가·느낌 ("편하더라고요", "기억에 남아요", "만족스러웠어요")
2. 메모에 없는 행동·조언 ("포장해 가세요", "일찍 가세요")
3. 사진·메모보다 세게 쓴 표현 ("많음" → "가득", "짭짤" → "짠맛이 확실")
4. 자료에 없는 위치·순서·이유·시간 ("입구에 붙은", "지나면 나와요", "그래서 ~했어요")
5. 한 번 간 것을 일반화 ("늘 줄 서는 곳")
6. 촬영 과정 이야기 ("영상으로 담았어요", "사진에 찍혀 있네요")
7. 같은 섹션이나 앞 섹션에서 이미 한 말을 되풀이하는 문장

고치는 법
- 자료로 뒷받침되는 사실로 바꿀 수 있으면 바꾼다 (말투는 앞뒤 문장과 맞게, "~어요/~더라고요" 블로그 존댓말).
- 바꿀 사실이 없으면 replace를 빈 문자열로 (문장 삭제).
- find는 글에 실제로 있는 문장을 **그대로 복사**한다. 한 문장 단위로.
- 근거가 있는 문장, 방문 정보 목록, Q&A는 건드리지 않는다.
- 문제가 없으면 edits를 빈 배열로.`;

/** 블로그 섹션 본문에 수정 목록을 적용 */
function applyEdits(blog, edits) {
  let applied = 0;
  for (const e of edits) {
    const find = String(e.find || '').trim();
    if (find.length < 4) continue;
    for (const sec of blog.sections) {
      if (!sec.body.includes(find)) continue;
      sec.body = sec.body.replace(find, String(e.replace || '').trim())
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s+|\s+$/g, '');
      applied++;
      break;
    }
  }
  // 문장이 다 지워져 빈 섹션은 사진과 소제목만 남기지 않도록 제거
  blog.sections = blog.sections.filter((s) => s.body.replace(/\s/g, '').length > 0);
  return applied;
}

/**
 * @returns {Promise<{applied:number, edits:Array}>}
 */
export async function factCheckBlog(project, plan) {
  if (!plan.blog?.sections?.length) return { applied: 0, edits: [] };
  const ctx = await contextText(project, plan, null);
  const text = plan.blog.sections.map((s, i) => `### [${i + 1}] ${s.heading}\n${s.body}`).join('\n\n');
  const { edits } = await generate({
    system: SYSTEM,
    content: [{ type: 'text', text: `${ctx}\n\n## 확인할 블로그 글\n제목: ${plan.blog.title}\n\n${text}\n\n근거 없는 문장을 찾아 고치기 목록을 만드세요.` }],
    schema: EditsSchema,
    label: '블로그 사실 확인',
  });
  const applied = applyEdits(plan.blog, edits);
  return { applied, edits };
}
