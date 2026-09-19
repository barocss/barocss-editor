import { describe, it, expect } from 'vitest';
import { extractModelTextFromRange, selectsCharacters, type ModelTextReader } from './selection-text';
import type { ModelSelection } from './selection';

/**
 * **범위가 덮는 글자 — `collapsed` 가 답하지 못하는 마지막 한 칸.**
 *
 * `t1:2 → t2:0` 은 sid 가 둘이고 고른 글자는 0개다. 두 끝만 보는 함수는 그것을 말할 수 없고
 * (`fromDOMSelection` 은 `collapsed: false` 를 적는다), 선택 하나만 보는 함수도 말할 수 없다
 * (`isCollapsedSelection` 의 주석이 그 경계를 적어 두었다). **문서를 읽어야 안다.**
 *
 * 이 검사가 여기 있는 이유는 함수가 여기 있기 때문이다 — 옮기면서 검사도 같이 왔다
 * (`docs/specs/testing.md` §"검사는 모듈과 함께 옮긴다"). 술어로서의 검사는 그것을 쓰는 층에
 * 있다: `extensions/test/guards.test.ts`.
 */

/** 문단 하나에 런 셋, 그리고 두 번째 문단. 원자(구분선)가 런 사이에 하나. */
function store(): ModelTextReader {
  const nodes: Record<string, unknown> = {
    doc: { sid: 'doc', stype: 'document', content: ['p1', 'p2'] },
    p1: { sid: 'p1', stype: 'paragraph', content: ['t1', 'hr', 't2'], parentId: 'doc' },
    p2: { sid: 'p2', stype: 'paragraph', content: ['t3'], parentId: 'doc' },
    t1: { sid: 't1', stype: 'inline-text', text: '가나', parentId: 'p1' },
    hr: { sid: 'hr', stype: 'inline-image', parentId: 'p1' },
    t2: { sid: 't2', stype: 'inline-text', text: '다라', parentId: 'p1' },
    t3: { sid: 't3', stype: 'inline-text', text: '마바', parentId: 'p2' }
  };
  const parentOf = (sid: string) => {
    const one = nodes[sid] as { parentId?: string } | undefined;
    return one?.parentId ? nodes[one.parentId] : undefined;
  };
  return {
    getNode: (sid) => nodes[sid],
    getParent: (sid) => parentOf(sid),
    getNextSibling: (sid) => {
      const parent = parentOf(sid) as { content?: string[] } | undefined;
      const siblings = parent?.content;
      if (!Array.isArray(siblings)) return null;
      const i = siblings.indexOf(sid);
      return i < 0 || i >= siblings.length - 1 ? null : siblings[i + 1];
    }
  };
}

const range = (
  startNodeId: string,
  startOffset: number,
  endNodeId: string,
  endOffset: number
): ModelSelection => ({
  type: 'range',
  startNodeId,
  startOffset,
  endNodeId,
  endOffset,
  collapsed: startNodeId === endNodeId && startOffset === endOffset
});

describe('범위가 덮는 글자', () => {
  it('한 그릇 안에서는 substring 이다', () => {
    expect(extractModelTextFromRange(store(), range('t1', 0, 't1', 1))).toBe('가');
  });

  it('두 그릇에 걸치면 앞의 꼬리와 뒤의 머리를 잇는다', () => {
    expect(extractModelTextFromRange(store(), range('t1', 1, 't2', 1))).toBe('나다');
  });

  it('문단을 가로지르면 사이의 그릇이 통째로 들어온다', () => {
    expect(extractModelTextFromRange(store(), range('t1', 1, 't3', 1))).toBe('나다라마');
  });

  it('그릇이 아닌 노드는 아무것도 보태지 않는다 — 원자는 글자가 아니다', () => {
    /*
     * `hr` 이 `t1` 과 `t2` 사이에 있다. 훑기는 그것을 지나가고 `text` 가 없으므로 빈손으로 온다.
     * 이 사실이 `selectsCharacters` 의 경계이기도 하다: 원자만 든 범위는 *글자를 고른 것* 이
     * 아니고, 그것을 고르는 것은 `node` 선택의 일이다(`docs/specs/selection.md`).
     */
    expect(extractModelTextFromRange(store(), range('t1', 2, 't2', 0))).toBe('');
  });

  it('두 끝이 문서에 없으면 빈 문자열이다', () => {
    expect(extractModelTextFromRange(store(), range('없음', 0, 't1', 2))).toBe('');
    expect(extractModelTextFromRange(store(), range('t1', 0, '없음', 2))).toBe('');
  });

  it('오프셋은 글자 수로 죈다 — 넘겨도 끝까지다', () => {
    expect(extractModelTextFromRange(store(), range('t1', 0, 't1', 99))).toBe('가나');
    expect(extractModelTextFromRange(store(), range('t1', -5, 't1', 1))).toBe('가');
  });

  it('문서를 못 걷는 저장소는 두 끝만 읽는다', () => {
    /*
     * 지어낸 모양이 아니라 검사 픽스처의 흔한 모양이다: `getNode` 만 있는 것. 사이의 그릇을 못
     * 보므로 `가나` + `다라` 만 나오고, **그래도 0글자 질문에는 옳게 답한다** — 그것이 이 함수를
     * 술어로 쓰는 쪽이 필요한 전부다.
     */
    const thin: ModelTextReader = { getNode: (sid) => store().getNode(sid) };
    expect(extractModelTextFromRange(thin, range('t1', 0, 't3', 2))).toBe('가나마바');
    expect(extractModelTextFromRange(thin, range('t1', 2, 't2', 0))).toBe('');
  });

  it('저장소가 없으면 빈 문자열이다', () => {
    expect(extractModelTextFromRange(null, range('t1', 0, 't2', 2))).toBe('');
    expect(extractModelTextFromRange(undefined, range('t1', 0, 't2', 2))).toBe('');
  });
});

describe('selectsCharacters', () => {
  it('인접한 두 런 사이의 0글자 범위는 아니다', () => {
    expect(selectsCharacters(store(), range('t1', 2, 't2', 0))).toBe(false);
  });

  it('한 글자라도 들어오면 그렇다', () => {
    expect(selectsCharacters(store(), range('t1', 1, 't2', 0))).toBe(true);
    expect(selectsCharacters(store(), range('t1', 2, 't2', 1))).toBe(true);
  });

  it('접힌 캐럿은 아니다', () => {
    expect(selectsCharacters(store(), range('t1', 1, 't1', 1))).toBe(false);
  });

  it('앞이 비어 있으면 계속 걷는다 — 뒤에 글자가 있으면 그렇다', () => {
    expect(selectsCharacters(store(), range('t1', 2, 't3', 0))).toBe(true);
  });

  it('첫 글자에서 멈춘다 — 가드는 그릴 때마다 돈다', () => {
    /*
     * 술어를 `extract(...).length > 0` 으로 쓰면 문서 절반을 고른 채로 매번 그 절반을 이어 붙인다.
     * 답에는 아무것도 안 보태고 값만 치른다. 세어서 적어 둔다: 같은 범위에 `getNode` 가 **다섯 대
     * 둘**.
     *
     * **처음 넷이라고 적었고 틀렸다.** 훑기는 그릇만 세는 것이 아니라 문서 순서로 만나는 노드를 다
     * 읽는다 — `t1` · `t3` · `hr` · `t2` 에 두 번째 문단 `p2` 까지 다섯이다. 표를 세우는 값의 절반이
     * 이것이다: 코드가 아니라 내 기대가 틀린 자리도 나온다.
     */
    const count = (): { reader: ModelTextReader; reads: () => number } => {
      const inner = store();
      let n = 0;
      return {
        reader: {
          ...inner,
          getNode: (sid) => {
            n += 1;
            return inner.getNode(sid);
          }
        },
        reads: () => n
      };
    };

    const whole = count();
    extractModelTextFromRange(whole.reader, range('t1', 0, 't3', 2));
    expect(whole.reads()).toBe(5);

    const early = count();
    selectsCharacters(early.reader, range('t1', 0, 't3', 2));
    expect(early.reads()).toBe(2);
  });
});
