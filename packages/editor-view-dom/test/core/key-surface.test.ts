import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom';

/**
 * **키를 듣는 요소는 캐럿이 사는 곳보다 넓을 수 있다.**
 *
 * 표면이 둘이다 — **글자 표면**(콘텐츠 층: 타이핑·IME·캐럿)과 **문서 표면**(읽는 사람이 이 문서를
 * 만지고 있는 가장 바깥 요소: 키 해석). `Delete` 로 도형을 지울 때 캐럿은 **없고**, 슬라이드를
 * 골라 놓고 누르는 `Delete` 도 그렇다.
 *
 * 그 둘이 같은 것으로 박혀 있었다(`contentEditableElement = layers.content`). 그래서:
 *
 * | 제품 | 문서 표면 | 결과 |
 * |---|---|---|
 * | word · note | 콘텐츠 층과 **같다** (`.w-canvas` 가 그 안이다) | 도형 키가 레지스트리로 그냥 됐다 |
 * | slides | 무대 — `.sl-host` 가 그 안이고 오버레이는 **밖** | **레지스트리로 갈 길이 없었다** |
 *
 * 그래서 slides 는 `window` 에 자기 디스패처를 붙였고, 그러면 사이드바 입력칸의 키도 들리므로
 * `activeElement` 를 물어야 했다. **붙이는 자리를 잘못 고른 대가** 이고, 고를 자리가 없었다.
 *
 * 기준은 `docs/specs/keybindings.md`.
 */
describe('키를 듣는 표면', () => {
  let container: HTMLElement;
  let outer: HTMLElement;
  let view: EditorViewDOM | null = null;
  let resolved: string[];

  const editor = () =>
    ({
      executeCommand: vi.fn(),
      executeTransaction: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      destroy: vi.fn(),
      dataStore: { getNode: () => undefined },
      selection: null,
      keybindings: {
        resolve: (key: string) => {
          resolved.push(key);
          return [];
        }
      }
    }) as never;

  beforeEach(() => {
    resolved = [];
    outer = document.createElement('div');
    container = document.createElement('div');
    outer.appendChild(container);
    document.body.appendChild(outer);
  });

  afterEach(() => {
    view?.destroy();
    view = null;
    outer.remove();
  });

  it('기본값은 콘텐츠 층이다 — 아무것도 안 건네면 지금까지와 같다', () => {
    view = new EditorViewDOM(editor(), { container });
    expect(view.keySurface).toBe(view.contentEditableElement);
  });

  /**
   * **콘텐츠 층 밖에서 누른 키가 들린다.** 이것이 없으면 도형을 고르고 `Delete` 를 눌러도 엔진은
   * 아무것도 못 듣는다 — 그 자리에 캐럿이 없기 때문이다.
   */
  it('건네면 그 요소에서 듣는다 — 콘텐츠 층 밖의 키도', () => {
    view = new EditorViewDOM(editor(), { container, keySurface: outer });
    expect(view.keySurface).toBe(outer);

    /* 콘텐츠 층 밖, 그러나 문서 표면 안. 도형을 고른 채 누르는 자리가 여기다. */
    const beside = document.createElement('div');
    outer.appendChild(beside);
    beside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(resolved, '문서 표면에서 누른 키가 레지스트리에 안 닿았습니다').toContain('Delete');
  });

  /** 그리고 문서 표면 **밖** 은 안 들린다 — 크롬의 입력칸이 거기다. */
  it('표면 밖의 키는 안 듣는다 — 크롬 입력칸이 거기다', () => {
    view = new EditorViewDOM(editor(), { container, keySurface: container });

    const chrome = document.createElement('input');
    outer.appendChild(chrome);
    chrome.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(resolved, '크롬에서 친 키가 문서 키로 읽혔습니다').toEqual([]);
  });
});
