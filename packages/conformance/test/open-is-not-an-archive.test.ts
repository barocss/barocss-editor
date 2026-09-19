import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **`## Open` 의 절 제목에 완료 도장이 찍혀 있으면 안 된다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * 이 저장소의 앞선 관례는 항목마다 표식(✅/🔴)을 달지 않고 **절 제목의 도장** 으로 말했다:
 * `### 제목 — 2026-08-30 *(fixed)*`. 그리고 그 절들은 자리로만 구분됐다 — 끝나면 `## Done` 으로
 * 옮기는 것이 사람의 기억이었고, 아무도 안 옮겼다.
 *
 * 2026-09-06 에 세어 보니 `## Open` 의 `###` 절 186개 중 **96개가 `*(built)*` · `*(fixed)*` 도장을
 * 달고 있었다.** 8,500줄 중 2,795줄이다.
 *
 * ## 왜 이것이 크기 문제보다 중요한가
 *
 * 이 파일은 15,000줄이 넘고 "너무 크다" 는 말이 계속 나왔다. 그런데 잘라야 할 것은 크기가 아니다 —
 * **`## Open` 이 작업 목록이 아니라 기록 보관소인데 그 안에 작업 목록이 섞여 있던 것** 이다. 일을
 * 고르는 사람이 8,500줄을 읽어서 5,700줄 쪽을 골라내야 했다.
 *
 * 형제 검사 `backlog-says-what-is-done` 은 이것을 못 잡는다. 그것은 `- **…** ✅/🔴` 줄만 세는데,
 * 옛 관례의 절에는 그 표식이 아예 없다. **표식이 없으면 조용하다** — 검사가 있는데도 그렇다.
 *
 * ## 남는 도장
 *
 * 도장이 *남았다* 고 말하면 끝난 것이 아니다: `*(measured, not built)*`, `*(37 fixed, 5 left)*`,
 * `*(started)*`, `*(two of the four built; the other two are not what this said)*`. 이런 것은
 * `## Open` 에 있어야 맞다. 넓게 잡아 다 옮기면 **안 끝난 일이 Done 에 묻히고**, 그게 이 회차가
 * 고치려는 바로 그 결함이다.
 *
 * ## 반대 방향은 안 본다
 *
 * `## Done` 에 도장 없는 절이 있는 것은 정상이다 — 옛 항목의 대부분이 그렇다.
 */
const ROOT = join(__dirname, '..', '..', '..');

/** 일이 실제로 착지했다고 말하는 낱말. */
const LANDED = /built|fixed|고침|끝|worked through|record corrected|resolved|closed/i;

/** 같은 도장 안에 이것이 있으면 아직 남은 것이다. */
const STILL_OPEN = /\bleft\b|not built|not what this said|started|raised|design,|two more/i;

const openHeadings = (): string[] => {
  const text = readFileSync(join(ROOT, 'docs', 'BACKLOG.md'), 'utf8');
  const at = text.indexOf('\n## Open\n');
  const to = text.indexOf('\n## Done\n');
  if (at < 0 || to < 0 || to < at) {
    throw new Error('BACKLOG.md 에 `## Open` 과 `## Done` 이 그 순서로 있어야 합니다');
  }
  return text
    .slice(at, to)
    .split('\n')
    .filter((one) => one.startsWith('### '));
};

/** 제목 끝의 `*(…)*` 만 읽는다. 본문의 낱말까지 보면 이야기를 도장으로 읽는다. */
const stampOf = (heading: string): string | null => /\*\(([^)]*)\)\*\s*$/.exec(heading)?.[1] ?? null;

describe('BACKLOG 의 `## Open`', () => {
  it('절이 있고 도장을 읽을 수 있다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    const heads = openHeadings();
    expect(heads.length, '`## Open` 에 `###` 절이 없습니다').toBeGreaterThan(10);
    expect(
      heads.filter((one) => stampOf(one) !== null).length,
      '`## Open` 의 어느 절도 `*(…)*` 도장을 달고 있지 않습니다 — 정규식이 낡았을 수 있습니다'
    ).toBeGreaterThan(0);
  });

  it('끝났다고 도장 찍힌 절이 남아 있지 않다', () => {
    const misfiled = openHeadings().filter((one) => {
      const stamp = stampOf(one);
      return stamp !== null && LANDED.test(stamp) && !STILL_OPEN.test(stamp);
    });

    expect(
      misfiled,
      `끝났다고 적힌 절이 \`## Open\` 에 있습니다. \`## Done\` 으로 옮기세요 — 남은 것이 있어서 ` +
        `여기 두는 것이라면 도장이 그렇게 말해야 합니다(\`*(37 fixed, 5 left)*\` 처럼):\n` +
        misfiled.map((one) => `  ${one.slice(0, 120)}`).join('\n')
    ).toEqual([]);
  });
});
