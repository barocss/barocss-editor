import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS } from '@barocss/editor-core';
import { NOTE_KEYBINDINGS } from '@barocss/office-note';
import { SITE_KEYS } from '@barocss/office-site';
import { SLIDES_KEYS } from '@barocss/office-slides';
import { WORD_KEYBINDINGS, WORD_KEYS, WORD_VIEW_KEYS } from '@barocss/office-word';

/**
 * **`docs/specs/keybindings.md` 의 숫자를 코드에서 다시 센다.**
 *
 * `docs/specs/agents.md` 가 이 검사의 이유다: *"붙잡히지 않은 주장은 주장일 뿐이다."*
 * `docs/ROADMAP.md` 의 *"키맵이 Word 에만 있다(71개)"* 는 오래 앉아 있었고 아무도 몰랐다 — 그
 * 문장을 코드와 대조하는 것이 없었기 때문이다.
 *
 * **이번에 같은 것을 하나 더 찾았다.** 그 명세는 site 를 *"`SITE_KEYS` 5 · 문서 키 0"* 이라고
 * 적고 있었다. 재보니 **25이고 그중 명령이 20**이다 — 5는 `view` 항목의 수다. 그 숫자 위에
 * *"site 는 문서 키가 0이므로 slides 보다 작은 이주"* 라는 **순서 결정**이 얹혀 있었다. 숫자가
 * 틀리면 결정이 틀린다.
 *
 * ## 빨개졌을 때
 *
 * 코드가 맞고 문서가 낡은 것이다 — 반대가 아니다. `docs/specs/keybindings.md` 의 해당 숫자를
 * 고치십시오. 그 문서의 주인은 조율자이고, 이 검사가 그 주인에게 말을 거는 방법이다.
 */
type Key = { command?: string; view?: string; when?: string; needsSelection?: boolean; mode?: string; needs?: string };

const counts = (keys: readonly Key[]) => ({
  total: keys.length,
  command: keys.filter((one) => one.command).length,
  view: keys.filter((one) => one.view).length,
  when: keys.filter((one) => one.when).length,
  needsSelection: keys.filter((one) => one.needsSelection).length,
  mode: keys.filter((one) => one.mode).length,
  needs: keys.filter((one) => one.needs).length
});

describe('keybindings.md 가 적은 숫자', () => {
  it('엔진 층은 마흔이고, 모든 제품이 그것을 받는다', () => {
    expect((DEFAULT_KEYBINDINGS as readonly Key[]).length).toBe(40);
  });

  it('레지스트리로 도는 둘 — word 49 · note 2, 그리고 인쇄 목록은 파생이다', () => {
    expect(counts(WORD_KEYBINDINGS as readonly Key[])).toMatchObject({
      total: 49,
      command: 49,
      view: 0,
      // 전부 `when` 을 쓴다. 이것이 word 가 *레지스트리로 돈다* 의 구체적 내용이다.
      when: 49
    });
    expect(counts(NOTE_KEYBINDINGS as readonly Key[])).toMatchObject({ total: 2, command: 2, when: 2 });

    // 규칙 5: 인쇄되는 것은 도는 것에서 나온다. 손으로 두 번 적지 않는다.
    expect(WORD_VIEW_KEYS.length).toBe(6);
    expect(WORD_KEYS.length).toBe(WORD_VIEW_KEYS.length + WORD_KEYBINDINGS.length);
  });

  /**
   * **호스트 디스패처로 도는 둘.** 이 숫자들이 결정의 크기다 — 옮길 항목이 몇이고, 그중 몇이
   * 엔진의 내장 맥락으로 공짜인가(`needsSelection` → `selectionType == 'node'`), 그리고 몇이
   * 엔진에 대응이 없는가(`mode` · `needs`).
   */
  it('데이터로 도는 둘 — slides 24 · site 26, 그리고 그중 무엇이 공짜인가', () => {
    expect(counts(SLIDES_KEYS as readonly Key[])).toMatchObject({
      total: 24,
      command: 22,
      view: 2,
      needsSelection: 15,
      // 엔진의 `when` 을 하나도 안 쓴다. 쓸 수 없었다 — 문서 표면을 건넬 방법이 없었으므로.
      when: 0,
      mode: 0,
      needs: 0
    });

    expect(counts(SITE_KEYS as readonly Key[])).toMatchObject({
      total: 26,
      command: 20,
      view: 6,
      needsSelection: 16,
      when: 0,
      // **`mode` 가 스물여섯 전부다** — site 의 `SiteKey` 는 그것을 필수 필드로 만든다. 엔진에
      // 대응하는 내장 맥락이 없으므로, 이주하면 여기가 유일한 새 맥락이다.
      mode: 26,
      needs: 2
    });
  });
});
