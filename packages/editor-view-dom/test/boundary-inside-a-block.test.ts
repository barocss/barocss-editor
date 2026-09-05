import { describe, it, expect } from 'vitest';
import { DOMSelectionHandlerImpl } from '../src/event-handlers/selection-handler';

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
    const { root, p, handler } = build((editor, host) => {
      const one = new DOMSelectionHandlerImpl(editor);
      (one as never as { view: unknown }).view = { contentEditableElement: host };
      return one;
    });

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
    const { root, p, handler } = build((editor, host) => {
      const one = new DOMSelectionHandlerImpl(editor);
      (one as never as { view: unknown }).view = { contentEditableElement: host };
      return one;
    });

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
  it('문단 끝의 캐럿은 문단 끝이다 — 접기가 앞으로 튀지 않는다', () => {
    const { p, handler } = build((editor, host) => {
      const one = new DOMSelectionHandlerImpl(editor);
      (one as never as { view: unknown }).view = { contentEditableElement: host };
      return one;
    });

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
  });

});

/**
 * **접히지 않은 모델 선택을 만들 수 있는 DOM 자리 — 아홉을 세고 여기 내려 적는다.**
 *
 * 브라우저가 잡은 것은 단위로 내려 적는다(`docs/specs/testing.md`). 잡은 것은
 * `site.spec.ts:8298` 이고 증상은 *떠 있는 표면이 둘* 이었다 — 슬래시 메뉴가 두 끝을 비교해
 * *캐럿* 이라 하고 버블 툴바가 필드를 물어 *범위* 라 했다. 27회 중 4회, 15%.
 *
 * 원인을 좇아 **`offsetWithRuns(…, isEnd=false)` 와 `isEnd=true` 가 같은 DOM 자리에 다른 답을
 * 주는 경우를 전부** 열거했다. 그 표가 이 파일의 나머지다:
 *
 * | # | 입력 | 두 해석 | 여기서 |
 * |---|---|---|---|
 * | 1 | 블록 경계, 안에 그릇 ≥2 | `t1:0` vs `t2:2` | 위의 세 검사 |
 * | 2 | 데코레이터가 **제 글자**를 그린 것 안 — 색인에서 빠져 `byNode` 미스 | `0` vs `총길이` | 아래 |
 * | 3 | **길이 0 글자 노드** 섞인 그릇 | 같음 | 아래 |
 * | 4 | 그 미스에서 **DOM 오프셋을 모델 오프셋처럼** 씀 | 엉뚱한 런 | 아래 (`it.fails`) |
 * | 5 | 그릇 없는 블록 → `bestContainer` 가 **블록 자신**을 줌 | `text` 없는 노드 | 아래 |
 * | 6 | 채움(ZWNBSP) 앞 | 같음 ✔ | 아래 |
 * | 7 | 빈 그릇 | 둘 다 0 ✔ | 아래 |
 * | 8 | **인접 런 사이를 걸친 범위** — sid 가 둘이라 `collapsed:false` 하드코딩 | 글자 0개 | 아래 (`it.fails`) |
 * | 9 | 타이핑이 쓴 깃발 없는 캐럿 | `collapsed: undefined` | `typing-says-where-the-caret-is.test.ts` |
 *
 * **묻는 것은 하나다: 접힌 DOM 자리는 접힌 모델 선택인가.** 그리고 **두 경로에 다 묻는다** —
 * 선택을 읽는 `convertDOMSelectionToModel` 과 타이핑이 지나는 `convertStaticRangeToModel`.
 * 앞의 것만 고쳐 두면 결함은 조용한 쪽으로 옮겨간다. 실제로 이 회차 전까지 2·3·5는 *선택
 * 경로만* 막혀 있었다.
 */
function plant(
  nodes: Record<string, unknown>,
  draw: (root: HTMLElement) => void
): { root: HTMLElement; handler: DOMSelectionHandlerImpl } {
  const root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  draw(root);
  document.body.appendChild(root);

  const editor = {
    dataStore: { getNode: (id: string) => nodes[id] ?? null },
    updateSelection: () => {}
  } as never;
  const handler = new DOMSelectionHandlerImpl(editor);
  (handler as never as { view: unknown }).view = { contentEditableElement: root };
  return { root, handler };
}

interface Said {
  type?: string;
  startNodeId?: string;
  startOffset?: number;
  endNodeId?: string;
  endOffset?: number;
  collapsed?: boolean;
}

/**
 * 같은 DOM 자리를 **두 경로에** 묻는다.
 *
 * `StaticRange` 는 jsdom 에 없고 필요하지도 않다 — `convertStaticRangeToModel` 이 읽는 것은 네
 * 자리와 `collapsed` 뿐이고, 브라우저가 캐럿에 대해 주는 것이 정확히 이 모양이다.
 */
function askBothWays(handler: DOMSelectionHandlerImpl, node: Node, offset: number): { read: Said; typed: Said } {
  const caret = document.createRange();
  caret.setStart(node, offset);
  caret.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(caret);

  return {
    read: handler.convertDOMSelectionToModel(sel) as Said,
    typed: handler.convertStaticRangeToModel({
      startContainer: node,
      startOffset: offset,
      endContainer: node,
      endOffset: offset,
      collapsed: true
    } as unknown as StaticRange) as Said
  };
}

/** 캐럿 하나가 두 경로에서 다 캐럿으로 나오는가. */
function expectOnePoint(said: Said, where: string): void {
  expect(said.collapsed, `${where}: 캐럿이 선택으로 읽혔습니다`).toBe(true);
  expect(said.startNodeId, `${where}: 두 끝이 다른 노드로 갈라졌습니다`).toBe(said.endNodeId);
  expect(said.startOffset, `${where}: 두 끝이 다른 오프셋으로 갈라졌습니다`).toBe(said.endOffset);
}

describe('접히지 않은 선택을 만들 수 있는 DOM 자리', () => {
  it('#2 데코레이터가 제 글자를 그린 것 안 — 색인에 없는 글자 노드', () => {
    /*
     * `data-bc-decorator="layer"` 는 **자기 것을 그리는** 데코레이터다. 문서에 그 글자가 없으므로
     * `skipsInIndex` 가 색인에서 빼고, 그래서 그 안의 글자 노드는 `byNode` 에 없다. 캐럿이 거기
     * 서면 `offsetWithRuns` 는 되돌아갈 곳이 없어 런 경계로 붙이는데, 그 붙이기가 **시작이면 런의
     * 처음, 끝이면 런의 끝** 이다 — 같은 한 점에 대해 `t1:0` 과 `t1:4`.
     *
     * 문서가 그 글자를 갖고 있지 않은 이상 이 미스 자체는 옳다. 틀린 것은 *한 점을 두 번 해석해
     * 범위를 만드는 것* 이고, 그것은 `range.collapsed` 하나로 답이 난다.
     */
    const { root, handler } = plant(
      { p1: { stype: 'paragraph' }, t1: { stype: 'inline-text', text: '가나다라' } },
      (host) => {
        const p = document.createElement('p');
        p.setAttribute('data-bc-sid', 'p1');
        const run = document.createElement('span');
        run.setAttribute('data-bc-sid', 't1');
        const badge = document.createElement('span');
        badge.setAttribute('data-bc-decorator', 'layer');
        badge.appendChild(document.createTextNode('§'));
        run.append(badge, document.createTextNode('가나다라'));
        p.appendChild(run);
        host.appendChild(p);
      }
    );

    const inside = root.querySelector('[data-bc-decorator]')!.firstChild!;
    const { read, typed } = askBothWays(handler, inside, 1);

    expectOnePoint(read, '선택 경로');
    expectOnePoint(typed, '타이핑 경로');
    expect(read.startNodeId, '데코레이터가 아니라 그것을 담은 런이 답입니다').toBe('t1');

    root.remove();
  });

  it('#3 길이 0 글자 노드가 섞인 그릇', () => {
    /*
     * 색인은 빈 글자 노드에 런을 만들지 않는다(`addRun` 의 `stripped.length === 0`). 그래서 그
     * 노드도 `byNode` 에 없고 #2 와 같은 자리로 떨어진다.
     *
     * 이것은 지어낸 모양이 아니다 — 마크가 문단을 쪼개거나 조합이 끝난 자리에 빈 글자 노드가
     * 남는다. 브라우저는 거기에 캐럿을 세울 수 있다.
     */
    const { root, handler } = plant(
      { p1: { stype: 'paragraph' }, t1: { stype: 'inline-text', text: '가나다라' } },
      (host) => {
        const p = document.createElement('p');
        p.setAttribute('data-bc-sid', 'p1');
        const run = document.createElement('span');
        run.setAttribute('data-bc-sid', 't1');
        run.append(document.createTextNode(''), document.createTextNode('가나다라'));
        p.appendChild(run);
        host.appendChild(p);
      }
    );

    const empty = root.querySelector('[data-bc-sid="t1"]')!.firstChild!;
    const { read, typed } = askBothWays(handler, empty, 0);

    expectOnePoint(read, '선택 경로');
    expectOnePoint(typed, '타이핑 경로');
    expect(read.startNodeId).toBe('t1');

    root.remove();
  });

  it.fails('#4 색인에 없는 글자 노드의 DOM 오프셋이 모델 오프셋으로 쓰인다 — 아직 열려 있다', () => {
    /*
     * **`text-position.ts` 의 되돌아갈 곳이 자리를 잘못 센다.**
     *
     * ```ts
     * const idx = binarySearchRun(runs.runs, Math.max(0, Math.min(offset, runs.total - 1)));
     * ```
     *
     * `offset` 은 **그 글자 노드 안의 DOM 오프셋**이고 `binarySearchRun` 이 받는 것은 **그릇
     * 전체의 모델 오프셋**이다. 두 수가 같은 자를 쓰지 않는다. 그래서 색인에 없는 노드 안에서
     * 캐럿이 오른쪽으로 갈수록 답이 **뒤쪽 런으로 미끄러진다** — 데코레이터의 글자가 길수록 더.
     *
     * 아래는 배지가 여섯 글자이고 문서의 런은 `가나`(0..2)와 `다라`(2..4) 둘이다. 배지 안 5번
     * 자리의 캐럿은 그 두 런 어느 쪽도 아니고, 있어야 할 답은 **배지가 놓인 자리**(0)다.
     * 지금 나오는 것은 `2` — 뒤 런의 시작이다.
     *
     * 접힌 캐럿이므로 *범위로 읽히지는* 않는다(#2 가 그것을 잡는다). 남은 것은 **자리가
     * 틀린 것**이고, 고칠 자리는 `packages/shared/src/text-position/text-position.ts` 라 이번
     * 회차의 소유 밖이다. `it.fails` 로 붙잡아 둔다 — 고쳐지면 이 검사가 빨개져서 알린다.
     */
    const { root, handler } = plant(
      { p1: { stype: 'paragraph' }, t1: { stype: 'inline-text', text: '가나다라' } },
      (host) => {
        const p = document.createElement('p');
        p.setAttribute('data-bc-sid', 'p1');
        const run = document.createElement('span');
        run.setAttribute('data-bc-sid', 't1');
        const badge = document.createElement('span');
        badge.setAttribute('data-bc-decorator', 'layer');
        badge.appendChild(document.createTextNode('[각주1]'));
        /* 런이 둘이어야 미끄러짐이 보인다 — 하나뿐이면 어느 오프셋도 그 하나로 붙는다. */
        run.append(badge, document.createTextNode('가나'), document.createTextNode('다라'));
        p.appendChild(run);
        host.appendChild(p);
      }
    );

    const inside = root.querySelector('[data-bc-decorator]')!.firstChild!;
    const { read } = askBothWays(handler, inside, 5);

    expect(read.startOffset, '데코레이터 안의 DOM 오프셋이 모델 오프셋으로 세어졌습니다').toBe(0);

    root.remove();
  });

  it('#5 그릇이 하나도 없는 블록 — 답이 블록 자신이 된다', () => {
    /*
     * `bestContainer` 는 위로도 아래로도 그릇을 못 찾으면 **그 블록 자신**을 돌려준다. 문서가
     * 아닌 이상 sid 는 있으니 부르는 쪽이 무엇을 할지 정하라는 뜻이고, 그 판단이 주석에 적혀
     * 있다. 그릇이 아니므로 오프셋에 뜻이 없다 — 그래서 **적어도 두 끝이 갈라지지는 않아야**
     * 한다. 갈라지면 *글자가 없는 노드에 그어진 범위* 가 되고, 버블 툴바가 그 위에 뜬다.
     */
    const { root, handler } = plant({ p1: { stype: 'paragraph' } }, (host) => {
      const p = document.createElement('p');
      p.setAttribute('data-bc-sid', 'p1');
      host.appendChild(p);
    });

    const block = root.querySelector('[data-bc-sid="p1"]')!;
    const { read, typed } = askBothWays(handler, block, 0);

    expectOnePoint(read, '선택 경로');
    expectOnePoint(typed, '타이핑 경로');
    expect(read.startNodeId, '그릇이 없으면 블록 자신이 답입니다').toBe('p1');
    expect(read.startOffset, '글자가 없는 노드의 오프셋은 0 말고 될 것이 없습니다').toBe(0);

    root.remove();
  });

  it('#6 채움 글자(ZWNBSP) 옆 — 두 해석이 이미 같다', () => {
    /*
     * 채움은 렌더러가 놓은 글자이고 색인이 `domStart` 로 건너뛴다. 그래서 ZWNBSP **뒤**가 모델
     * 오프셋 0 이고, 그 자리는 시작으로 읽으나 끝으로 읽으나 같다. 맞는 채로 남아 있는 것을
     * 적어 두는 이유는, 이 표의 아홉 중 *맞는 것* 이 어느 것인지가 다음 사람에게 필요하기
     * 때문이다 — 맞다고 적혀 있지 않으면 다시 재게 된다.
     */
    const { root, handler } = plant(
      { p1: { stype: 'paragraph' }, t1: { stype: 'inline-text', text: '가나' } },
      (host) => {
        const p = document.createElement('p');
        p.setAttribute('data-bc-sid', 'p1');
        const run = document.createElement('span');
        run.setAttribute('data-bc-sid', 't1');
        run.appendChild(document.createTextNode('﻿가나'));
        p.appendChild(run);
        host.appendChild(p);
      }
    );

    const text = root.querySelector('[data-bc-sid="t1"]')!.firstChild!;
    const { read, typed } = askBothWays(handler, text, 1);

    expectOnePoint(read, '선택 경로');
    expectOnePoint(typed, '타이핑 경로');
    expect(read.startOffset, '채움 글자가 오프셋으로 세어졌습니다').toBe(0);

    root.remove();
  });

  it('#7 빈 그릇 — 둘 다 0', () => {
    const { root, handler } = plant(
      { p1: { stype: 'paragraph' }, t1: { stype: 'inline-text', text: '' } },
      (host) => {
        const p = document.createElement('p');
        p.setAttribute('data-bc-sid', 'p1');
        const run = document.createElement('span');
        run.setAttribute('data-bc-sid', 't1');
        p.appendChild(run);
        host.appendChild(p);
      }
    );

    const run = root.querySelector('[data-bc-sid="t1"]')!;
    const { read, typed } = askBothWays(handler, run, 0);

    expectOnePoint(read, '선택 경로');
    expectOnePoint(typed, '타이핑 경로');
    expect(read.startNodeId).toBe('t1');
    expect(read.startOffset).toBe(0);

    root.remove();
  });

  it.fails('#8 인접한 두 런 사이의 범위는 글자를 하나도 안 고른다 — 아직 열려 있다', () => {
    /*
     * `("가나", 2) → ("다라", 0)` 은 **화면의 같은 점**이다. 사이에 글자가 없다. 그런데 DOM 은
     * 두 컨테이너가 다르므로 `range.collapsed` 가 `false` 이고, `fromDOMSelection` 은 sid 가
     * 다르면 `collapsed: false` 를 **하드코딩** 한다(`shared/src/selection.ts`). 그래서 모델은
     * `t1:2 → t2:0` — 글자 0개를 고른 "범위" 다. 버블 툴바가 거기 뜬다.
     *
     * **이 마지막 한 칸은 두 끝만으로 답할 수 없다.** sid 가 둘이면 그 사이에 글자가 있는지는
     * 문서를 읽어야 알고, `isCollapsedSelection` 은 문서를 모른다(`editor-core/collapsed.ts` 에
     * 그렇게 적혀 있다). 도구는 이미 있다 — `extractModelTextFromRange`. 부를 자리는
     * `packages/extensions/src/guards.ts` 의 `hasRange` 이고, 백로그의 표가 그 네 단계를 적어
     * 두었다. **그 파일은 이번 회차의 소유 밖이라 열린 채로 붙잡아 둔다.**
     */
    const { root, handler } = plant(
      {
        p1: { stype: 'paragraph' },
        t1: { stype: 'inline-text', text: '가나' },
        t2: { stype: 'inline-text', text: '다라' }
      },
      (host) => {
        const p = document.createElement('p');
        p.setAttribute('data-bc-sid', 'p1');
        for (const [sid, word] of [['t1', '가나'], ['t2', '다라']] as const) {
          const run = document.createElement('span');
          run.setAttribute('data-bc-sid', sid);
          run.appendChild(document.createTextNode(word));
          p.appendChild(run);
        }
        host.appendChild(p);
      }
    );

    const first = root.querySelector('[data-bc-sid="t1"]')!.firstChild!;
    const second = root.querySelector('[data-bc-sid="t2"]')!.firstChild!;

    const range = document.createRange();
    range.setStart(first, 2);
    range.setEnd(second, 0);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const said = handler.convertDOMSelectionToModel(sel) as Said;

    expect(said.startNodeId).toBe('t1');
    expect(said.endNodeId).toBe('t2');
    expect(said.collapsed, '글자를 하나도 안 고른 범위가 범위로 읽혔습니다').toBe(true);

    root.remove();
  });
});
