import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS, Editor } from '@barocss/editor-core';
import { createNoteExtensions } from '@barocss/office-note';
import { createWordExtensions } from '@barocss/office-word';
import { createSlidesExtensions } from '@barocss/office-slides';
import { createSiteExtensions } from '@barocss/office-site';

/**
 * **엔진이 묶은 키는 제품에서 무언가에 닿는다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * `DEFAULT_KEYBINDINGS` 는 마흔을 묶고 모든 제품이 받는다. 그런데 그 키가 부르는 **명령이 제품에
 * 없으면** 무슨 일이 나는가: `handleKeydown` 이 바인딩을 찾아 `preventDefault()` 를 하고,
 * `executeCommand` 가 `console.warn('Command … not found')` 를 찍고 `false` 를 돌려준다.
 * **키는 먹혔고 아무 일도 안 난다.** 브라우저의 기본 동작도 막혔으므로 그 키는 죽은 키다.
 *
 * ## 무엇을 잡았나 — 이 검사를 쓴 그 날의 것
 *
 * 재보니 엔진 키가 부르는 명령 서른다섯 중 **word · slides · site 는 없는 것이 0**, **note 만
 * 둘**이었다: `moveBlockUp` · `moveBlockDown`. 그래서 노트에서 `Alt+↑` 는 죽어 있었다.
 *
 * **그런데 노트는 블록을 옮길 수 있다** — 손잡이를 끌면 되고, 손잡이 옆 두 단추도 그것을 한다
 * (`moveNoteBlockUp`/`Down`). 기능이 없는 것이 아니라 **그 이름의 명령이 없어서 키가 안 닿는**
 * 것이었다. 그리고 그 기능은 공용 `MoveBlockExtension` 에 이미 있었고 **셋은 싣고 노트만 안
 * 싣고 있었다** — 이 저장소가 매 회차 찾는 그 모양이다: *있는데 못 닿는다.*
 *
 * ## 기준
 *
 * `docs/specs/keybindings.md` — **기능이 있으면 엔진이 부르는 그 이름으로 등록한다.** 기능이 정말
 * 없어서 키를 내려놓아야 하는 날이 오면 그때 레지스트리에 그 방법을 더한다. 그전에 더하면
 * 등록해야 할 것이 그리로 도망간다.
 */
const PRODUCTS: [string, () => unknown[]][] = [
  ['office-note', createNoteExtensions],
  ['office-word', createWordExtensions],
  ['office-slides', createSlidesExtensions],
  ['office-site', createSiteExtensions]
];

describe('엔진 키', () => {
  it('제품 넷에서 다 무언가를 부른다', () => {
    const wanted = [
      ...new Set(
        (DEFAULT_KEYBINDINGS as never as { command?: string }[])
          .map((one) => one.command)
          .filter(Boolean) as string[]
      )
    ];
    expect(wanted.length, '엔진이 키를 하나도 안 묶습니다').toBeGreaterThan(20);

    const found: string[] = [];
    for (const [name, make] of PRODUCTS) {
      const editor = new Editor({ extensions: make() as never });
      /*
       * `commandNames()` 는 이 질문을 위해 공개돼 있다 — 그 프로세가 그렇게 적어 뒀다:
       * *"finding that out needed a way in that was not reaching for a private field."*
       * 처음엔 `_commands` 를 캐스팅으로 열었고, `editor-is-typed` 래칫이 357→358 로 잡았다.
       */
      const has = new Set(editor.commandNames());
      for (const command of wanted) {
        if (!has.has(command)) found.push(`${name}: ${command}`);
      }
    }

    expect(
      found,
      `엔진이 묶은 키가 부르는 명령이 제품에 없습니다 — 그 키는 먹히고 아무 일도 안 합니다:\n${found.join('\n')}`
    ).toEqual([]);
  });
});
