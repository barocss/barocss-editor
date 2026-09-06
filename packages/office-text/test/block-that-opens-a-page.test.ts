import { describe, expect, it } from 'vitest';
import { WORD_ENV_KEY, blockStyle, createTextEnv } from '../src/index';
import type { DocumentAccess } from '../src/document-access';

/**
 * **페이지를 여는 블록은 자기 앞 간격을 잃는다** — 그리고 그것은 결정이다.
 *
 * `block-style.ts` 의 한 줄이 페이지를 여는 블록을 시트에 닿도록 밀어 내리면서 `marginTop` 을
 * **덮어쓴다**:
 *
 * ```ts
 * if (push !== undefined) style.marginTop = `${push}px`;
 * ```
 *
 * 문단 간격 대화상자를 만들며 브라우저에서 이것을 만났다 — 새 문서의 첫 문단에 앞 간격을 주었는데
 * 화면이 안 바뀌었다. 처음에는 결함처럼 보였고, 재보니 **Word 와 같은 답**이다: 앞 간격은 *앞
 * 문단과의 거리*이고, 앞 문단이 다른 페이지에 있으면 잴 거리가 없다.
 *
 * 그러나 그 답이 `=` 한 글자의 부수 효과로만 있었다. `+=` 로 바꾸면 Word 와 달라지면서도 아무
 * 검사도 빨개지지 않는다. 이 파일이 그 한 글자를 세운다.
 */

const doc = (): DocumentAccess => {
  const nodes = new Map<string, Record<string, unknown>>([
    ['root', { sid: 'root', stype: 'document', content: ['p1'] }],
    [
      'p1',
      {
        sid: 'p1',
        stype: 'paragraph',
        /** 24pt 앞 간격 — 페이지 안에서라면 32px 로 그려질 값. */
        attributes: { spacingBefore: 480 },
        content: []
      }
    ]
  ]);
  return {
    rootId: 'root',
    getNode: (sid: string) => nodes.get(sid) as never
  } as DocumentAccess;
};

const styleOf = (pushes?: Map<string, number>) => {
  const access = doc();
  const text = createTextEnv(access) as Record<string, unknown>;
  if (pushes) text.pushes = pushes;
  return blockStyle(access.getNode('p1') as never, { [WORD_ENV_KEY]: text } as never);
};

describe('페이지를 여는 블록', () => {
  it('페이지 안에 있으면 자기 앞 간격을 그린다', () => {
    expect(styleOf().marginTop).toBe('24pt');
  });

  /**
   * **더하지 않고 덮는다.** 56px(= 24pt + 32px)이 나오면 이 줄이 `+=` 로 바뀐 것이고, 그러면
   * 페이지마다 위쪽 여백이 문단 사정에 따라 들쭉날쭉해진다.
   */
  it('페이지를 열면 앞 간격 대신 시트까지의 거리를 그린다', () => {
    expect(styleOf(new Map([['p1', 96]])).marginTop).toBe('96px');
  });

  it('앞 간격이 0 이어도 밀어 내린 값이 이긴다 — 규칙이 값에 달려 있지 않다', () => {
    const access = doc();
    (access.getNode('p1') as Record<string, any>).attributes = { spacingBefore: 0 };
    const text = createTextEnv(access) as Record<string, unknown>;
    text.pushes = new Map([['p1', 96]]);
    const style = blockStyle(access.getNode('p1') as never, { [WORD_ENV_KEY]: text } as never);
    expect(style.marginTop).toBe('96px');
  });
});
