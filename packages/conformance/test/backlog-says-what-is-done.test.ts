import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **`BACKLOG.md` 의 두 구간이 자기 표식과 맞는다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * 그 파일의 머리에 규칙이 적혀 있다 — *"Move it to Done when it ships, with the surprise it
 * produced. The surprises are the part worth keeping: they are what the next person would
 * otherwise rediscover."*
 *
 * 그런데 그 규칙을 지키는 것이 **덧붙이는 사람의 기억** 이었다. 항목을 파일 **끝** 에 덧붙이면
 * 그 끝은 `## Done` 이므로, 아직 안 고친 것이 *고침* 칸에 들어간다.
 *
 * 실제로 그렇게 됐다. 2026-09-05 에 세어 보니:
 *
 * | | Open | Done |
 * |---|---|---|
 * | 🔴 (열림) | 7 | **14** ← 여기 있으면 안 된다 |
 * | ✅ (고침) | **16** ← 여기 있으면 안 된다 | 10 |
 *
 * 열넷은 내가 *"맨 끝에 덧붙이세요"* 라고 적어 두고 그대로 한 결과이고, 열여섯은 고친 뒤 옮기지
 * 않은 것이다. **둘 다 조용하다** — 파일은 커지고, 무엇이 남았는지는 아무도 모른다.
 *
 * ## 왜 세는가
 *
 * `BACKLOG.md` 는 지금 14,343줄이고 열린 항목이 21개다. **일을 고르는 사람이 그 파일을 읽고
 * 고른다.** 표식이 자리와 어긋나면 고르는 근거가 없어진다 — 다 끝난 것처럼 보이거나, 다 남은
 * 것처럼 보인다.
 *
 * ## 표식이 없는 항목은 세지 않는다
 *
 * 이 저장소의 앞선 관례는 표식 없이 자리로만 말했다. 그 항목이 365개이고, 거기에 표식을 붙이는
 * 것은 이 검사의 일이 아니다 — **표식이 있는데 자리와 어긋난 것** 만 잡는다.
 */
const ROOT = join(__dirname, '..', '..', '..');
const OPEN = '🔴';
const DONE = '✅';

const sections = (): { open: string[]; done: string[] } => {
  const text = readFileSync(join(ROOT, 'docs', 'BACKLOG.md'), 'utf8');
  const at = text.indexOf('\n## Open\n');
  const to = text.indexOf('\n## Done\n');
  if (at < 0 || to < 0 || to < at) throw new Error('BACKLOG.md 에 `## Open` 과 `## Done` 이 그 순서로 있어야 합니다');
  const cut = (body: string): string[] => {
    const heads = [...body.matchAll(/^- \*\*.*$/gm)];
    return heads.map((one) => one[0]);
  };
  return {
    open: cut(text.slice(at, to)),
    done: cut(text.slice(to))
  };
};

describe('BACKLOG 의 두 구간', () => {
  it('둘 다 있고 비어 있지 않다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    const { open, done } = sections();
    expect(open.length, 'Open 에 항목이 없습니다').toBeGreaterThan(0);
    expect(done.length, 'Done 에 항목이 없습니다').toBeGreaterThan(0);
  });

  it('Open 에 고쳤다고 적힌 항목이 없다', () => {
    const stray = sections().open.filter((head) => head.includes(DONE));
    expect(
      stray,
      `고친 항목이 Open 에 남아 있습니다. \`## Done\` 으로 옮기세요 — 놀란 것과 함께:\n${stray.map((one) => `  ${one.slice(0, 90)}`).join('\n')}`
    ).toEqual([]);
  });

  it('Done 에 아직 열린 항목이 없다', () => {
    const stray = sections().done.filter((head) => head.includes(OPEN));
    expect(
      stray,
      `열린 항목이 Done 에 있습니다 — 파일 **끝** 에 덧붙이면 그 끝이 Done 입니다. \`## Open\` 의 끝에 넣으세요:\n${stray.map((one) => `  ${one.slice(0, 90)}`).join('\n')}`
    ).toEqual([]);
  });

  /** 한 머리에 둘이 있으면 어느 쪽인지 아무도 모른다. */
  it('한 항목이 두 표식을 갖지 않는다', () => {
    const { open, done } = sections();
    const both = [...open, ...done].filter((head) => head.includes(OPEN) && head.includes(DONE));
    expect(both, both.map((one) => one.slice(0, 90)).join('\n')).toEqual([]);
  });
});
