import { describe, it, expect } from 'vitest';
import { DOMSelectionHandlerImpl } from '../src/event-handlers/selection-handler';

/**
 * **인라인 데코레이터가 낀 런의 오프셋** — 조용히 누적되던 결함.
 *
 * `buildTextRunIndex` 는 데코레이터를 두 종류로 가른다(`isDecoratorOwnText`): **인라인** 은 이미 있는
 * 글자의 한 구간을 감싸므로 그 안의 글자가 노드 자신의 것이고, 나머지는 자기 것을 그리므로 색인에서
 * 빠져야 한다. 그 판단이 그 파일에 프로세와 함께 적혀 있었다 — *"전부를 건너뛴 것은 조용히 누적되는
 * 결함이었다. 주석 달린 구절이 색인에서 빠져서 68자 문단이 58자로 색인됐다."*
 *
 * **그런데 두 뷰 층이 `excludePredicate` 로 그 판단을 덧걸렀다.** 그리고 서로 다르게:
 *
 * | | `ensureRuns` (DOM→모델) | `getTextRunsForContainer` (모델→DOM) | 증상 |
 * |---|---|---|---|
 * | `editor-view-dom` | 덧걸렀다 | 안 걸렀다 | **왕복이 어긋난다** |
 * | `editor-view-react` | 덧걸렀다 | 덧걸렀다 | **오프셋이 늘 틀리다** |
 *
 * 두 번째가 더 조용하다: 두 방향이 같은 만큼 틀리므로 화면에서는 아무 일도 안 일어난 것처럼 보이고,
 * 그 오프셋이 명령으로 넘어가는 순간 엉뚱한 글자가 지워진다.
 *
 * 고친 것은 지운 것이다 — 아무것도 넘기지 않으면 `buildTextRunIndex` 의 답이 그대로 쓰인다.
 */
function build(category: string | null) {
  const root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  const run = document.createElement('span');
  run.setAttribute('data-bc-sid', 't1');

  /* `가나[다라]마바` — 대괄호가 데코레이터다. 모델의 글자는 여섯. */
  const before = document.createTextNode('가나');
  const decorated = document.createElement('span');
  /*
   * **종류를 적는 이름이 둘이다.** `renderer-dom`/`renderer-react` 는 `data-decorator-category` 를
   * 쓰고, `editor-view-dom` 의 데코레이터 렌더러는 `data-bc-decorator` 에 `'layer'`·`'inline'`·
   * `'block'` 을 쓴다. 그래서 픽스처도 두 이름을 다 세운다 — 첫 판은 `data-bc-decorator` 를 늘
   * `'inline'` 로 두고 category 만 바꿔서, *category 없음* 인 경우가 실제로는 인라인이었다.
   */
  decorated.setAttribute('data-bc-decorator', category ?? 'block');
  if (category) decorated.setAttribute('data-decorator-category', category);
  decorated.appendChild(document.createTextNode('다라'));
  const after = document.createTextNode('마바');

  run.append(before, decorated, after);
  root.appendChild(run);
  document.body.appendChild(root);

  const editor = {
    dataStore: { getNode: (id: string) => (id === 't1' ? { stype: 'inline-text', text: '가나다라마바' } : null) },
    updateSelection: () => {}
  } as never;
  const handler = new DOMSelectionHandlerImpl(editor);
  (handler as never as { view: unknown }).view = { contentEditableElement: root };
  return { root, after, handler };
}

/** 캐럿을 `마` 뒤에 두고 읽는다 — 모델에서 5여야 한다. */
function readAt(category: string | null) {
  const { root, after, handler } = build(category);
  const range = document.createRange();
  range.setStart(after, 1);
  range.setEnd(after, 1);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  const said = handler.convertDOMSelectionToModel(sel) as { startOffset?: number };

  /* 그 오프셋을 되돌려 놓으면 어디로 가나 — 왕복이 맞아야 한다. */
  sel.removeAllRanges();
  handler.convertModelSelectionToDOM({
    type: 'range',
    startNodeId: 't1',
    startOffset: said.startOffset,
    endNodeId: 't1',
    endOffset: said.startOffset,
    collapsed: true
  });
  const back = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const landed = back ? `${(back.startContainer as Text).data}:${back.startOffset}` : '없음';
  root.remove();
  return { read: said.startOffset, landed };
}

describe('인라인 데코레이터가 낀 런', () => {
  it('데코레이터 안의 글자를 센다 — 그것이 노드 자신의 글자이므로', () => {
    const { read, landed } = readAt('inline');
    expect(read, '데코레이터의 두 글자를 세지 않았습니다').toBe(5);
    expect(landed, '되돌린 캐럿이 데코레이터 안으로 갔습니다').toBe('마바:1');
  });

  it('그 밖의 데코레이터는 세지 않는다 — 자기 것을 그리는 것이므로', () => {
    for (const category of ['block', 'widget', null]) {
      const { read, landed } = readAt(category);
      expect(read, `category=${category ?? '없음'}`).toBe(3);
      expect(landed, `category=${category ?? '없음'} 의 왕복`).toBe('마바:1');
    }
  });
});
