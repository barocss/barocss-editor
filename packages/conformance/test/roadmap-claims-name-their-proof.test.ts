import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **로드맵의 `- [x]` 는 자기를 증명하는 것의 이름을 댄다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * `docs/specs/agents.md` 가 이 저장소의 규칙을 한 줄로 적어 두었다 — *"붙잡히지 않은 주장은
 * 주장일 뿐이다."* 그런데 그 문장을 쓴 두 문서 자신이 아무에게도 붙잡히지 않고 있었다.
 *
 * 2026-09-05 에 세어 보니:
 *
 * | | 체크박스 | 그것을 붙잡는 검사 |
 * |---|---|---|
 * | `docs/ROADMAP.md` | 20 | **0** |
 * | `docs/TECHNICAL-ROADMAP.md` | 30 | **0** |
 *
 * 쉰 개가 다 사람의 기억 위에 서 있었다. 그리고 **틀린 것이 실제로 있었다.** `ROADMAP.md` 는
 * *"키맵이 Word 에만 있다(71개)"* 라고 적어 두었는데, 재보니 `DEFAULT_KEYBINDINGS` 마흔을 모든
 * 제품이 받고 있었고 `WORD_KEYBINDINGS` 는 71개도 70개도 아닌 **52개**였다. 같은 날 `[ ]` 로
 * 남아 있던 항목 다섯이 **이미 끝나 있었다** — 크롬 이주 넷, 타임라인, `createWordTables`,
 * 셀 제스처, 노트의 블록 드래그.
 *
 * 그 둘은 같은 결함의 앞뒤다: **문장과 코드를 대보는 것이 없으면 문서는 양쪽으로 다 낡는다.**
 *
 * ## 왜 *근거의 이름* 만 세는가 — 숫자를 세지 않고
 *
 * `spec-numbers` 는 문서의 숫자를 코드에서 다시 세어 대조한다. 그것이 더 센 검사이고, 그래서
 * `note.md`·`word.md` 에만 있다. 로드맵은 그렇게 할 수 없다 — 쉰 개의 항목이 쉰 가지 다른 것을
 * 주장하고, 그 하나하나를 여기서 다시 세면 이 파일이 저장소의 사본이 된다.
 *
 * 그러므로 이 검사는 **한 단계 아래를 묻는다: 그 주장을 대볼 수 있는 자리가 적혀 있는가.**
 * 적혀 있으면 다음 사람이 그것을 돌려 볼 수 있고, 안 적혀 있으면 못 돌려 본다. 그 차이가
 * `spec-numbers` 가 있는 문서와 없는 문서 사이의 차이 전부였다.
 *
 * ## `근거 없음(주장)` 을 통과시키는 이유
 *
 * 거짓이 아니라 **표시되지 않은 것**이 결함이다. 증거를 못 찾은 완료 주장은 지우는 것이 아니라
 * *증거가 없다* 고 적는 것이 맞다 — 그러면 다음에 그 줄을 읽는 사람이 무엇을 의심해야 하는지
 * 안다. 이 검사가 막는 것은 **아무 말도 안 하는 `[x]`** 하나다.
 *
 * ## `- [ ]` 는 세지 않는다
 *
 * 아직 안 한 일에 증거를 요구할 수는 없다. 열린 항목이 *틀렸는지* — 이미 끝났거나 숫자가
 * 어긋났는지 — 는 세는 것이 아니라 재는 것이고, 그건 사람이 한 회차씩 한다.
 */
const ROOT = join(__dirname, '..', '..', '..');

/** 붙잡는 문서 둘. 주인은 `docs/specs/agents.md` 의 소유 지도에 있다. */
const DOCS = ['ROADMAP.md', 'TECHNICAL-ROADMAP.md'];

/** 완료 주장이 자기 근거를 대는 두 가지 방법. 둘 중 하나면 된다. */
const NAMED = '— 근거:';
const UNPROVEN = '— 근거 없음(주장)';

/** 들여쓴 것도 체크박스다 — 목록 안의 남은 일이 그렇게 적혀 있다. */
const DONE = /^\s*- \[x\] /;
const OPEN = /^\s*- \[ \] /;

type Line = { doc: string; at: number; text: string };

const linesOf = (doc: string): Line[] =>
  readFileSync(join(ROOT, 'docs', doc), 'utf8')
    .split('\n')
    .map((text, index) => ({ doc, at: index + 1, text }));

const claims = (): Line[] => DOCS.flatMap((doc) => linesOf(doc).filter((one) => DONE.test(one.text)));
const open = (): Line[] => DOCS.flatMap((doc) => linesOf(doc).filter((one) => OPEN.test(one.text)));

/** 실패 메시지에 붙일 자리 — 사람이 그대로 열 수 있게 `파일:줄` 로. */
const where = (one: Line): string => `  docs/${one.doc}:${one.at}  ${one.text.trim().slice(0, 88)}`;

describe('로드맵의 완료 주장', () => {
  it('두 문서에 체크박스가 있다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    for (const doc of DOCS) {
      const boxes = linesOf(doc).filter((one) => DONE.test(one.text) || OPEN.test(one.text));
      expect(boxes.length, `docs/${doc} 에 체크박스가 없습니다 — 파일이 바뀌었거나 경로가 틀렸습니다`).toBeGreaterThan(0);
    }
  });

  it('`- [x]` 마다 근거를 댄다 — 이름이든, 없다는 말이든', () => {
    const silent = claims().filter((one) => !one.text.includes(NAMED) && !one.text.includes(UNPROVEN));

    expect(
      silent,
      `끝났다고만 적고 무엇이 그것을 증명하는지 말하지 않는 줄이 ${silent.length}개 있습니다.\n` +
        `${silent.map(where).join('\n')}\n\n` +
        `그 줄에 둘 중 하나를 적으세요:\n` +
        `  1. 대볼 자리를 찾았으면 — \`${NAMED} packages/office-word/test/spec-numbers.test.ts:41\` 처럼 **파일:줄** 로.\n` +
        `     검사 이름·spec-numbers 가 잡는 숫자·e2e 스펙의 한 줄 — 다음 사람이 열어서 돌려 볼 수 있는 것이면 됩니다.\n` +
        `  2. 찾아봤는데 없으면 — \`${UNPROVEN}\`. 지우지 마세요: 증거 없는 완료 주장은 그렇게 적혀 있어야\n` +
        `     다음에 읽는 사람이 무엇을 의심할지 압니다.\n\n` +
        `그리고 근거를 찾다가 주장이 **틀린** 것을 발견하면, \`- [ ]\` 로 되돌리고 무엇이 실제였는지 한 줄 적으세요.`
    ).toEqual([]);
  });

  /**
   * 근거를 댄 것이 하나도 없으면 위 검사는 통과한다 — 완료 주장이 0일 때. 그건 통과가 아니라
   * 이 검사가 볼 것이 없었다는 뜻이므로, 그 경우를 구분해 둔다.
   */
  it('근거를 실제로 댄 줄이 있다 — 규칙이 빈 채로 서 있지 않게', () => {
    const named = claims().filter((one) => one.text.includes(NAMED));
    expect(named.length, '`— 근거:` 를 단 줄이 하나도 없습니다 — 규칙만 있고 지키는 줄이 없습니다').toBeGreaterThan(0);
  });

  /** 한 줄이 둘 다 달고 있으면 근거가 있다는 것인지 없다는 것인지 아무도 모른다. */
  it('한 줄이 근거와 근거 없음을 함께 달지 않는다', () => {
    const both = claims().filter((one) => one.text.includes(NAMED) && one.text.includes(UNPROVEN));
    expect(both, `근거를 대면서 동시에 없다고 적은 줄입니다 — 하나만 남기세요:\n${both.map(where).join('\n')}`).toEqual([]);
  });

  /**
   * **`- [ ]` 가 근거를 대면 그건 `[x]` 여야 한다.**
   *
   * 열린 항목에 *무엇이 그것을 증명하는가* 를 적는 일은 없다. 적었다면 그 사이에 끝난 것이고,
   * 상자를 안 바꾼 것이다 — `BACKLOG.md` 에서 열넷이 `## Done` 에 앉아 있던 것과 같은 모양이다.
   * (재본 사실을 적는 `— 재보니` 는 열린 항목에도 정당하므로 여기서 세지 않는다.)
   */
  it('`- [ ]` 가 근거를 대고 있지 않다 — 대고 있으면 끝난 것이다', () => {
    const stray = open().filter((one) => one.text.includes(NAMED));
    expect(
      stray,
      `열린 항목이 자기 근거를 대고 있습니다. 그 사이에 끝난 것이면 \`- [x]\` 로 바꾸고,\n` +
        `아직 아니면 그 자리는 근거가 아니라 \`— 재보니 …\` 로 적으세요:\n${stray.map(where).join('\n')}`
    ).toEqual([]);
  });
});
