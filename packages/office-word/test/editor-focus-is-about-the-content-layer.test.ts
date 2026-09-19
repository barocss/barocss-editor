import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { evaluateWhenExpression, type Editor } from '@barocss/editor-core';
import {
  WORD_KEYBINDINGS,
  createSampleDocument,
  createWordEditor,
  getWordSchemaDefinition
} from '../src/index';

/**
 * **`editorFocus` 는 *문서를 만지고 있다* 를 뜻하지 않는다 — *콘텐츠 층에 초점이 있다* 를 뜻한다.**
 *
 * `docs/specs/keybindings.md` 의 규칙 4가 말하는 두 표면 중 **글자 표면** 하나에 대한 사실이고,
 * Word 의 바인딩 **쉰넷 전부**가 그것을 건다. Word 에서 그것이 통하는 이유는 하나뿐이다:
 * `.w-canvas` 가 콘텐츠 층 **안**이라 두 표면이 우연히 같다. 우연이 이름에 안 적혀 있다.
 *
 * ## 왜 여기서 재는가
 *
 * 엔진은 `keySurface` 를 받는다(기본값 = 콘텐츠 층). **키를 듣는 자리는 넓힐 수 있는데 초점을
 * 세우는 자리는 못 넓힌다** — `focus`/`blur` 가 콘텐츠 층에 박혀 있다. 그러므로 더 넓은 표면을
 * 건네는 순간 *키는 도착하는데 `when` 이 전부 거짓* 이 된다. 슬라이드가 레지스트리로 오지
 * **못한** 이유가 이것이고, Word 가 언젠가 캔버스를 콘텐츠 층 밖으로 옮기면 같은 자리에 선다.
 *
 * 고칠 자리는 `editor-view-dom` 이고 이 회차의 소유가 아니다. **여기서는 그 함정을 못 박는다** —
 * 재봤고, 밀리초에 답하고, 그날 이 검사가 무엇을 고쳐야 하는지 말한다.
 */
const wordEditor = (): Editor => {
  const schema = createSchema('word', getWordSchemaDefinition());
  const dataStore = new DataStore(undefined as never, schema as never);
  const editor = createWordEditor({
    editable: true,
    schema,
    dataStore,
    author: { name: 'Jinho', date: () => '2026-08-10' }
  } as never);
  editor.loadDocument(createSampleDocument(), 'word');
  return editor;
};

/**
 * 무대가 콘텐츠 층보다 넓은 제품의 모양 — 표면 안에 편집기가 들어 있다.
 *
 * `Editor` 그대로 넘긴다. `createWordEditor` 는 `Editor` 를 돌려주고 `EditorViewDOM` 은 `Editor`
 * 를 받으므로 여기 캐스트가 낄 자리가 없다 — `editor-core/test/editor-is-typed.test.ts` 가 세는
 * 것이 정확히 그 자리다.
 */
const wideSurface = (editor: Editor) => {
  const surface = document.createElement('div');
  const container = document.createElement('div');
  surface.appendChild(container);
  document.body.appendChild(surface);

  const view = new EditorViewDOM(editor, { container, keySurface: surface });
  return { surface, view, content: view.contentEditableElement };
};

describe('editorFocus 가 실제로 무엇을 뜻하나', () => {
  it('Word 문서 명령은 모두 editorFocus 조건을 건다', () => {
    const bindings = WORD_KEYBINDINGS as readonly { when?: string }[];
    expect(bindings.length).toBeGreaterThan(0);
    expect(bindings.filter((one) => (one.when ?? '').includes('editorFocus')).length).toBe(bindings.length);
  });

  it('콘텐츠 층의 focus 하나가 그것을 세우고, blur 하나가 내린다', () => {
    const editor = wordEditor();
    const { content } = wideSurface(editor);

    expect(editor.getContext('editorFocus')).toBe(false);
    content.dispatchEvent(new FocusEvent('focus'));
    expect(editor.getContext('editorFocus')).toBe(true);
    content.dispatchEvent(new FocusEvent('blur'));
    expect(editor.getContext('editorFocus')).toBe(false);
  });

  /**
   * **문서 표면이 초점을 받아도 `editorFocus` 는 거짓이다.**
   *
   * `focus` 는 버블하지 않는다. 그러므로 콘텐츠 층에 붙은 리스너는 그 **바깥** 요소가 초점을 받는
   * 것을 볼 수 없다 — 도형을 골라 놓은 상태가 정확히 그 상태다.
   */
  it('표면에 초점이 와도 거짓이다 — 그리고 그때 Word 의 키가 몇 개 도는지', () => {
    const editor = wordEditor();
    const { surface } = wideSurface(editor);

    surface.dispatchEvent(new FocusEvent('focus'));
    expect(editor.getContext('editorFocus')).toBe(false);

    /*
     * 그래서 그 자리에서 도는 Word 의 키는 **영**이다. `keySurface` 가 넓어서 keydown 은 도착하고,
     * `when` 이 전부 거짓이라 아무것도 안 난다 — *키가 안 잡히는 것* 이 아니라 *잡히고 죽는 것* 이라
     * 화면에서는 구분이 안 된다.
     */
    const context = editor.getContext() as Record<string, unknown>;
    const alive = (WORD_KEYBINDINGS as readonly { when?: string }[]).filter((one) =>
      evaluateWhenExpression(one.when ?? '', context)
    );
    expect(alive.length).toBe(0);
  });

  /**
   * **고치는 방법의 크기.** `focus`/`blur` 를 `focusin`/`focusout` 으로 바꾸고 `keySurface` 에
   * 붙이면 된다 — 그 둘은 버블하므로 표면 **안** 어디서 초점이 움직여도 도착한다.
   *
   * 이 검사가 붙잡는 것은 그 주장의 사실 부분이다: 버블하는가. `editor-view-dom` 이 그렇게
   * 바뀌는 날, 여기 두 줄이 왜 그것이 답인지 말한다.
   */
  it('focusin 은 버블하고 focus 는 안 한다 — 고치는 방법이 여기서 나온다', () => {
    const surface = document.createElement('div');
    const inner = document.createElement('div');
    surface.appendChild(inner);
    document.body.appendChild(surface);

    let byFocus = 0;
    let byFocusin = 0;
    surface.addEventListener('focus', () => {
      byFocus += 1;
    });
    surface.addEventListener('focusin', () => {
      byFocusin += 1;
    });

    inner.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    inner.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(byFocus).toBe(0);
    expect(byFocusin).toBe(1);
  });
});
