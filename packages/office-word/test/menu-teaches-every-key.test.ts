import { describe, it, expect } from 'vitest';
import { DEFAULT_KEYBINDINGS, type Keybinding } from '@barocss/editor-core';
import { chordFor, keyLabel, taughtKeys } from '@barocss/office-controls';
import { WORD_KEYS } from '../src/word-keymap';
import { WORD_MENUS } from '../src/menu-model';

/**
 * **메뉴가 가르치는 단축키는 편집기가 *실제로 묶은 것* 에서 나온다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * `WORD_KEYS = [...WORD_VIEW_KEYS, ...WORD_KEYBINDINGS]` 이고 메뉴가 그것으로 힌트를 붙인다
 * (`withHints`). 규칙 5 — *인쇄되는 것은 도는 것에서 나온다* — 가 그 한 줄이다.
 *
 * **그런데 도는 것의 절반이 그 목록에 없었다.** 엔진의 `DEFAULT_KEYBINDINGS` 마흔이 모든 제품에서
 * 돌고 있는데 `WORD_KEYS` 는 제품 것만 담았다. 그 동안 안 들킨 이유는 `WORD_KEYBINDINGS` 가
 * 엔진 것을 **다시 적고 있었기** 때문이다 — 그래서 ⌘Z 가 목록에 있었다.
 *
 * 재진술 열여섯을 걷어내자 **메뉴에서 ⌘Z 가 사라졌다.** 브라우저 회차가 그것을 잡았고
 * (`apps/word/tests/menubar.spec.ts:34`), **여기서 잡혔어야 한다.** 이 파일은 그 회차가 4분 걸려
 * 답한 것을 밀리초에 답한다.
 *
 * ## 그래서 규칙은 이렇게 읽는다
 *
 * *"인쇄되는 것은 도는 것에서 나온다"* 의 **도는 것** 은 제품의 목록이 아니라 **편집기가 묶은 것
 * 전부** 다 — 엔진 것을 포함해서. 제품이 엔진 것을 다시 적어야 메뉴가 맞는다면, 그건 규칙 1을
 * 어겨야 규칙 5가 성립한다는 뜻이고 둘 중 하나가 틀린 것이다.
 */
describe('메뉴가 가르치는 단축키', () => {
  it('편집기가 묶은 것을 담는다 — 엔진 것도', () => {
    const bound = new Set(
      (DEFAULT_KEYBINDINGS as readonly Keybinding[]).map((one) => one.command).filter(Boolean)
    );
    const printed = new Set(taughtKeys(WORD_KEYS).map((one) => one.command).filter(Boolean));
    const missing = [...bound].filter((command) => !printed.has(command as string));

    expect(
      missing,
      `엔진이 묶었는데 Word 의 키 목록에 없습니다 — 메뉴가 그 단축키를 못 가르칩니다:\n${missing.join(' · ')}`
    ).toEqual([]);
  });

  /**
   * 그리고 실제로 메뉴에 붙는지 — 목록에 있는 것과 힌트가 붙는 것은 다른 문장이다.
   * 브라우저 검사가 물은 그 둘(`edit.history.0` → ⌘Z, `edit.find.0` → ⌘F)을 여기서 먼저 묻는다.
   */
  it.each([
    [{ command: 'historyUndo' }, '⌘Z'],
    /* `찾기` 는 명령이 아니라 화면을 여는 것이다 — 크롬 키이고 `WORD_VIEW_KEYS` 에 산다. */
    [{ view: 'find' }, '⌘F']
  ])('%o 의 힌트가 %s 다', (what, wants) => {
    const chord = chordFor(taughtKeys(WORD_KEYS), what);
    const label = keyLabel(chord ?? undefined, true);
    expect(label, `${JSON.stringify(what)} 의 단축키를 메뉴가 못 가르칩니다`).toBe(wants);
  });

  /** 메뉴 안에 그 힌트가 실제로 들어 있는지까지. */
  it('편집 메뉴가 되돌리기의 단축키를 담는다', () => {
    const hints = WORD_MENUS.flatMap((menu) =>
      menu.blocks.flatMap((block) => block.items.map((item) => item.hint))
    ).filter(Boolean);
    expect(hints, '메뉴 어디에도 ⌘Z 가 없습니다').toContain('⌘Z');
  });
});
