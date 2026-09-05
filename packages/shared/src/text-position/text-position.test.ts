import { describe, it, expect } from 'vitest';
import {
  bestContainer,
  domPointFromModelOffset,
  isTextContainer,
  offsetWithRuns,
  runsOf,
  type PositionContext
} from './text-position';
import { FILLER_ATTR, FILLER_CHAR } from '../text-run-index';

/**
 * **자리 맞바꿈의 표** — 규칙은 `docs/specs/text-position.md` 에 있고 여기서 그 표를 세운다.
 *
 * 이 검사가 뷰 층이 아니라 여기 있는 이유가 그 문서의 요점이다: 2026-09-05 회차에 같은 이음매를 세
 * 번 따로 기웠고 세 번 다 브라우저 회차가 찾아 줬다. **30분짜리 도구로 ms 짜리 결정을 재고 있었다.**
 */

type Kind = 'tworuns' | 'decorated' | 'empty';

function build(kind: Kind) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  const p = document.createElement('p');
  p.setAttribute('data-bc-sid', 'p1');
  const nodes: Record<string, { text?: unknown; stype?: unknown }> = { p1: { stype: 'paragraph' } };
  const runEl = (sid: string) => {
    const one = document.createElement('span');
    one.setAttribute('data-bc-sid', sid);
    return one;
  };

  if (kind === 'tworuns') {
    /* 그릇 **둘**: 문단이 두 개의 inline-text 를 가진다. */
    for (const [sid, text] of [['t1', '가나'], ['t2', '다라']] as const) {
      const one = runEl(sid);
      one.appendChild(document.createTextNode(text));
      p.append(one);
      nodes[sid] = { stype: 'inline-text', text };
    }
  } else if (kind === 'decorated') {
    /* 그릇 **하나**에 런 **셋**: `가나[다라]마바`, 대괄호가 인라인 데코레이터다. */
    const one = runEl('t1');
    const deco = document.createElement('span');
    deco.setAttribute('data-bc-decorator', 'inline');
    deco.setAttribute('data-decorator-category', 'inline');
    deco.appendChild(document.createTextNode('다라'));
    one.append(document.createTextNode('가나'), deco, document.createTextNode('마바'));
    p.append(one);
    nodes.t1 = { stype: 'inline-text', text: '가나다라마바' };
  } else {
    /* 빈 그릇: 캐럿을 받으려고 채움 글자를 그린다. */
    const one = runEl('t1');
    one.setAttribute(FILLER_ATTR, 'true');
    one.appendChild(document.createTextNode(FILLER_CHAR));
    p.append(one);
    nodes.t1 = { stype: 'inline-text', text: '' };
  }

  root.appendChild(p);
  document.body.appendChild(root);
  const ctx: PositionContext = { getNode: (sid) => nodes[sid] ?? null };
  return { root, p, ctx, at: (sid: string) => root.querySelector(`[data-bc-sid="${sid}"]`)! };
}

const show = (point: { node: Node; offset: number } | null) => {
  if (!point) return '없음';
  const n = point.node;
  const what = n.nodeType === Node.TEXT_NODE ? JSON.stringify((n as Text).data) : (n as Element).tagName;
  return `${what}:${point.offset}`;
};

describe('그릇인지는 text 로 묻는다', () => {
  it('inline-text 는 그릇이고 문단은 아니다', () => {
    const { at, ctx } = build('tworuns');
    expect(isTextContainer(at('t1'), ctx)).toBe(true);
    expect(isTextContainer(at('p1'), ctx)).toBe(false);
  });
});

describe('모델 → DOM', () => {
  /** `가나[다라]마바` — 경계는 **다음 런의 처음**이다. */
  it.each([
    [0, '"가나":0'],
    [1, '"가나":1'],
    [2, '"다라":0'],
    [3, '"다라":1'],
    [4, '"마바":0'],
    [6, '"마바":2']
  ])('데코레이터가 가른 런 셋 — t1:%i', (offset, wants) => {
    const { at } = build('decorated');
    const el = at('t1');
    expect(show(domPointFromModelOffset(runsOf(el)!, offset as number, el))).toBe(wants);
  });

  /**
   * **빈 그릇은 채움 글자 안, ZWNBSP 뒤다.** 두 뷰가 갈렸던 유일한 논리이고, 요소 경계에 두면
   * 브라우저가 다시 해석해서 캐럿이 채움 **앞** 에 설 수 있다 — 거기서 친 글자는 모델에 없는 자리에
   * 들어간다.
   */
  it('빈 그릇', () => {
    const { at } = build('empty');
    const el = at('t1');
    expect(show(domPointFromModelOffset(runsOf(el)!, 0, el))).toBe(`"${FILLER_CHAR}":1`);
  });

  it('범위를 벗어난 오프셋은 없음', () => {
    const { at } = build('decorated');
    const el = at('t1');
    expect(domPointFromModelOffset(runsOf(el)!, 7, el)).toBeNull();
    expect(domPointFromModelOffset(runsOf(el)!, -1, el)).toBeNull();
  });
});

describe('DOM → 모델', () => {
  /** 그릇 밖의 자리는 그릇 **안** 으로 내려간다 — 어느 쪽 끝인가가 첫 런과 마지막 런을 가른다. */
  it('경계가 블록이면 안으로 내려간다', () => {
    const { p, ctx } = build('tworuns');
    expect(bestContainer(p, ctx, false)?.getAttribute('data-bc-sid')).toBe('t1');
    expect(bestContainer(p, ctx, true)?.getAttribute('data-bc-sid')).toBe('t2');
  });

  it('그릇 안의 글자 노드는 그 그릇이다', () => {
    const { at, ctx } = build('decorated');
    const text = at('t1').firstChild!;
    expect(bestContainer(text, ctx)?.getAttribute('data-bc-sid')).toBe('t1');
  });

  /**
   * 요소 경계의 자식 색인 — 뒤의 첫 글자가 있으면 그 런의 처음, 없으면 앞의 마지막 런의 끝.
   *
   * `t1` 의 자식은 셋이다: `"가나"` · `[다라]` · `"마바"`. 그러므로 색인 `i` 는 *i 번째 자식 앞* 이고,
   * 색인 3 만 *전부 뒤* 다. **처음 이 표를 세울 때 색인 2 를 6 이라고 적었고 틀렸다** — 6 은 색인
   * 3 이다. 표를 세우는 값의 절반이 이것이다: 코드가 아니라 내 기대가 틀린 자리도 나온다.
   */
  it.each([
    [0, 0],
    [1, 2],
    [2, 4],
    [3, 6]
  ])('요소 경계 (t1, %i) → 모델 %i', (childIndex, wants) => {
    const { at, ctx } = build('decorated');
    const el = at('t1');
    expect(offsetWithRuns(el, el, childIndex as number, runsOf(el)!, false)).toBe(wants);
    void ctx;
  });

  it('채움 글자 뒤가 모델 0 이다', () => {
    const { at } = build('empty');
    const el = at('t1');
    const filler = el.firstChild as Text;
    expect(offsetWithRuns(el, filler, 1, runsOf(el)!, false)).toBe(0);
    expect(offsetWithRuns(el, filler, 0, runsOf(el)!, false)).toBe(0);
  });
});

describe('왕복', () => {
  /** 모델 → DOM → 모델 이 제자리로 와야 한다. 경계에서도. */
  it.each([0, 1, 2, 3, 4, 5, 6])('t1:%i 가 그대로 돌아온다', (offset) => {
    const { at } = build('decorated');
    const el = at('t1');
    const runs = runsOf(el)!;
    const point = domPointFromModelOffset(runs, offset, el)!;
    expect(point, `모델 ${offset} 에서 DOM 자리를 못 찾았습니다`).not.toBeNull();
    expect(offsetWithRuns(el, point.node, point.offset, runs, false)).toBe(offset);
  });

  it('빈 그릇도 왕복한다', () => {
    const { at } = build('empty');
    const el = at('t1');
    const runs = runsOf(el)!;
    const point = domPointFromModelOffset(runs, 0, el)!;
    expect(offsetWithRuns(el, point.node, point.offset, runs, false)).toBe(0);
  });
});
