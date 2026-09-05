import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **제품은 같은 문으로 만들어진다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * `word` · `slides` · `site` 의 옵션 타입이 **글자까지 같았다**: `extends EditorOptions` 에
 * `kit?: Extension[]` 과 `keybindings?: Keybinding[]`. 세 벌이 같으면 그건 한 제품의 의견이 아니라
 * *이 모음의 제품은 이렇게 만들어진다* 이다 — `three-agree.test.ts` 가 명령에 대해 세는 것과 같은
 * 셈이고, 여기서는 **문 자체**를 센다.
 *
 * **그런데 가장 최근 제품인 `note` 가 그것을 안 따랐다.** `EditorOptions` 를 안 물려받고,
 * `keybindings` 를 아예 못 받고, `dataStore`·`schema` 를 `unknown` 으로 받았다. 아무도 막지 않았다 —
 * 선언이 없었기 때문이다.
 *
 * ## 왜 지금 세는가
 *
 * *"제품을 더 만들어야 할 수도 있으니 제품이 안정화 되어야 해."* 다섯째 제품이 걸릴 자리가 정확히
 * 여기다: 네 개가 같은 모양인데 **그 모양을 읽을 곳이 없으면** 다섯째는 자기 모양을 만든다. 넷째가
 * 이미 그랬다.
 *
 * ## 무엇을 보나
 *
 * `packages/office-<제품>/src/<제품>-kit.ts` 의 `create*Editor` 하나하나가
 *
 * 1. `ProductEditorOptions` 를 (직접이든 물려받아서든) 받는가
 * 2. `kit` 을 **기본 대신** 쓰고 `extensions` 를 그 위에 얹는가
 * 3. `keybindings` 를 **층으로** 얹는가 — 제품의 키를 지우지 않고
 *
 * 3번이 이 검사가 실제로 지키는 것이다. 재보니 이 옵션을 넘기는 호출자가 **0** 이고, 그래서 그 의미가
 * 한 번도 시험된 적이 없었다. 셋의 구현은 **대체** 였다: `keybindings ?? WORD_KEYBINDINGS` 는 하나라도
 * 주면 Word 의 71개가 통째로 사라진다는 뜻이다. `word-kit.ts` 자신이 바로 윗 문단에 *레지스트리를
 * 비우면 Enter·Backspace·화살표까지 사라진다* 고 적어 두고, 한 줄 아래에서 부르는 쪽에게 그 문을
 * 열어 두고 있었다.
 */
const ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');

/** 제품의 문이 사는 파일 — `office-<제품>` 아래의 `<제품>-kit.ts`. */
const kits = (): { product: string; path: string; text: string }[] => {
  const out: { product: string; path: string; text: string }[] = [];
  for (const name of readdirSync(PACKAGES)) {
    if (!name.startsWith('office-')) continue;
    const at = join(PACKAGES, name, 'src');
    if (!existsSync(at)) continue;
    for (const entry of readdirSync(at)) {
      if (!entry.endsWith('-kit.ts')) continue;
      const path = join(at, entry);
      const text = readFileSync(path, 'utf8');
      if (!/export function create\w*Editor\(/.test(text)) continue;
      out.push({ product: name, path: `packages/${name}/src/${entry}`, text });
    }
  }
  return out;
};

describe('제품의 문', () => {
  it('넷 다 있다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    expect(kits().map((one) => one.product).sort()).toEqual([
      'office-note',
      'office-site',
      'office-slides',
      'office-word'
    ]);
  });

  it('같은 계약을 받는다 — ProductEditorOptions', () => {
    const off = kits()
      .filter((one) => !/ProductEditorOptions/.test(one.text))
      .map((one) => one.path);

    expect(
      off,
      `제품의 \`create*Editor\` 는 \`ProductEditorOptions\` 를 받아야 합니다 — 이유는 이 파일 위와 \`editor-core/types.ts\` 에 있습니다:\n${off.join('\n')}`
    ).toEqual([]);
  });

  /**
   * **`keybindings` 는 더하는 것이지 대체가 아니다.**
   *
   * `keybindings ?? 제품의_키맵` 은 대체다. 층이면 제품의 키맵을 먼저 등록하고 `keybindings ?? []` 를
   * 그 위에 얹는다. 문자열로 세는 이유는 그 한 줄이 결정 전부이기 때문이다.
   */
  it('제품의 키를 지우지 않는다 — keybindings 는 층이다', () => {
    const off: string[] = [];
    for (const one of kits()) {
      if (!/\bkeybindings\b/.test(one.text)) continue;
      const replaces = /for \(const binding of keybindings \?\? (?!\[\])/.test(one.text);
      if (replaces) off.push(one.path);
    }

    expect(
      off,
      `\`keybindings ?? 제품의_키맵\` 은 하나만 넘겨도 제품의 키가 통째로 사라집니다. 제품의 것을 먼저 등록하고 이것을 그 위에 얹으세요:\n${off.join('\n')}`
    ).toEqual([]);
  });

  /** `kit` 은 기본을 갈아끼우고, `extensions` 는 그 위에 얹힌다 — 넷이 같은 한 줄이다. */
  it('kit 은 기본 대신, extensions 는 그 위에', () => {
    const off = kits()
      .filter((one) => !/extensions: \[\.\.\.\(kit \?\? create\w+Extensions\(/.test(one.text))
      .map((one) => one.path);

    expect(
      off,
      `\`extensions: [...(kit ?? create<제품>Extensions(...)), ...extensions]\` 한 줄이 넷의 계약입니다:\n${off.join('\n')}`
    ).toEqual([]);
  });
});
