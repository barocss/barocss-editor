import { describe, it, expect } from 'vitest';
import { ReactSelectionHandler } from '../src/selection-handler';

/**
 * **경계가 블록 요소일 때 어느 노드가 답인가.**
 *
 * 브라우저는 문단 경계에서 `focusNode` 를 **요소**에 둔다 — 문단의 첫 자식 앞, 표의 마지막 칸 뒤.
 * 그때 선택의 노드는 그 블록이 아니라 **그 안의 런**이어야 한다: 블록은 `text` 가 없으므로 거기
 * 붙은 오프셋을 아무도 해석할 수 없고, 그 오프셋으로 만든 명령은 엉뚱한 자리를 가리킨다.
 *
 * `editor-view-react` 에는 이 걷기(`textContainerInside`)와 `forEnd` 가 **없었다.** 재본 것: 런 둘을
 * 가진 문단에서 문단 요소에 경계를 두면 React 는 `p1:0 → p1:4`, DOM 은 `t1:0 → t2:2` 를 준다.
 *
 * 검사가 두 곳에 있는 이유는 이 회차에 이미 세 번 나온 것이다 — 한쪽만 고치면 다른 쪽에 남는다.
 */
function build(handlerOf: (editor: never, root: HTMLElement) => { convertDOMSelectionToModel: (s: Selection) => unknown }) {
  const root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  const p = document.createElement('p');
  p.setAttribute('data-bc-sid', 'p1');
  const r1 = document.createElement('span');
  r1.setAttribute('data-bc-sid', 't1');
  r1.appendChild(document.createTextNode('가나'));
  const r2 = document.createElement('span');
  r2.setAttribute('data-bc-sid', 't2');
  r2.appendChild(document.createTextNode('다라'));
  p.append(r1, r2);
  root.appendChild(p);
  document.body.appendChild(root);

  const nodes: Record<string, unknown> = {
    p1: { stype: 'paragraph' },
    t1: { stype: 'inline-text', text: '가나' },
    t2: { stype: 'inline-text', text: '다라' }
  };
  const editor = { dataStore: { getNode: (id: string) => nodes[id] ?? null }, updateSelection: () => {} } as never;
  return { root, p, handler: handlerOf(editor, root) };
}

describe('경계가 블록일 때', () => {
  it('블록이 아니라 그 안의 런이 답이다 — 첫 런의 처음부터 마지막 런의 끝까지', () => {
    const { root, p, handler } = build((editor, host) => new ReactSelectionHandler(editor, () => host));

    const range = document.createRange();
    range.setStart(p, 0);
    range.setEnd(p, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const said = handler.convertDOMSelectionToModel(sel) as {
      startNodeId?: string; startOffset?: number; endNodeId?: string; endOffset?: number;
    };

    expect(said.startNodeId, '시작이 블록입니다 — 그 오프셋은 해석할 수 없습니다').toBe('t1');
    expect(said.startOffset).toBe(0);
    expect(said.endNodeId, '끝이 블록이거나 첫 런입니다 — 끝은 마지막 런이어야 합니다').toBe('t2');
    expect(said.endOffset).toBe(2);

    root.remove();
  });

  it('접힌 것은 접힌 채로 나온다 — 경계가 블록이어도', () => {
    const { root, p, handler } = build((editor, host) => new ReactSelectionHandler(editor, () => host));

    /*
     * **캐럿을 문단 요소에 둔다.** 위의 걷기가 시작을 첫 런, 끝을 마지막 런으로 내려보내므로, 두
     * 경계가 같은 자리였어도 서로 다른 런으로 갈라진다 — `range.collapsed` 를 묻지 않으면 캐럿이
     * 선택으로 읽힌다.
     *
     * 화면에 나타난 자리: 사이트에서 `/` 를 치면 슬래시 메뉴와 **버블 툴바가 같이** 떴다. 버블
     * 툴바는 `collapsed !== true` 면 뜬다.
     */
    const caret = document.createRange();
    caret.setStart(p, 0);
    caret.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(caret);

    const said = handler.convertDOMSelectionToModel(sel) as {
      startNodeId?: string; startOffset?: number; endNodeId?: string; endOffset?: number; collapsed?: boolean;
    };

    expect(said.collapsed, '캐럿이 선택으로 읽혔습니다').toBe(true);
    expect(said.startNodeId, '두 끝이 다른 런으로 갈라졌습니다').toBe(said.endNodeId);
    expect(said.startOffset).toBe(said.endOffset);

    root.remove();
  });

  /**
   * **그리고 반대쪽 끝** — 접기를 어느 쪽으로 하느냐가 여기서 갈린다.
   *
   * 위의 검사는 캐럿을 `(p, 0)` 에 두었다. 거기서는 시작으로 접든 끝으로 접든 답이 같아서, **접는
   * 방향을 고르는 결정을 시험하지 않는다.** 캐럿이 문단 *끝* 에 있을 때에만 그 결정이 보인다:
   * 늘 시작으로 접으면 `t1:2` — 첫 런의 끝이고, 런이 둘인 문단에서는 글자 한복판이다.
   *
   * 문단 끝에 캐럿을 두는 것은 흔한 몸짓이다. 짧은 줄의 오른쪽 빈 곳을 누르면 브라우저가 캐럿을
   * 거기에 두고, 그 자리가 자식 색인이라 요소 경계가 된다.
   */
  it('문단 끝의 캐럿은 문단 끝이다 — 접기가 한복판으로 가지 않는다', () => {
    const { root, p, handler } = build((editor, host) => new ReactSelectionHandler(editor, () => host));

    const caret = document.createRange();
    caret.setStart(p, 2);
    caret.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(caret);

    const said = handler.convertDOMSelectionToModel(sel) as {
      startNodeId?: string; startOffset?: number; endNodeId?: string; endOffset?: number; collapsed?: boolean;
    };

    expect(said.collapsed, '캐럿이 선택으로 읽혔습니다').toBe(true);
    expect(said.startNodeId, '캐럿이 문단 한복판으로 갔습니다 — 첫 런 끝입니다').toBe('t2');
    expect(said.startOffset).toBe(2);
    expect(said.endNodeId).toBe('t2');
    expect(said.endOffset).toBe(2);

    root.remove();
  });
});
