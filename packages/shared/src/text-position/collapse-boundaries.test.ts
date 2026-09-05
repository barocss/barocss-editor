import { describe, it, expect } from 'vitest';
import { collapseBoundaries } from './text-position';

/**
 * **접힌 캐럿을 어느 쪽 해석으로 접는가.**
 *
 * 규칙 자체는 `collapseBoundaries` 에 재본 표와 함께 적혀 있다. 여기서는 그 표를 그대로 세운다 —
 * 뷰 층 둘이 각자 판단하면 갈라지므로 판단이 하나여야 하고, 하나이면 검사도 한 곳이면 된다.
 *
 * 픽스처의 두 해석은 런 둘(`가나`,`다라`)을 가진 문단에서 실제로 나온 값이다.
 */
const 문단끝에서 = { startNodeId: 't1', startModelOffset: 2, endNodeId: 't2', endModelOffset: 2 };
const 문단처음에서 = { startNodeId: 't1', startModelOffset: 0, endNodeId: 't2', endModelOffset: 0 };
const 런사이에서 = { startNodeId: 't1', startModelOffset: 2, endNodeId: 't2', endModelOffset: 0 };

/* 진짜 DOM 노드로 세운다 — 규칙이 `nodeType` 과 자식 수를 묻기 때문이다. */
const 요소 = (childCount: number) => {
  const el = document.createElement('p');
  for (let i = 0; i < childCount; i += 1) el.appendChild(document.createElement('span'));
  return el;
};
const 글자 = document.createTextNode('가나');

describe('collapseBoundaries', () => {
  it('문단의 처음이면 시작 해석 — 첫 런의 0', () => {
    expect(collapseBoundaries(요소(2), 0, 문단처음에서)).toEqual({ nodeId: 't1', offset: 0 });
  });

  it('런 사이면 시작 해석 — 첫 런의 끝', () => {
    expect(collapseBoundaries(요소(2), 1, 런사이에서)).toEqual({ nodeId: 't1', offset: 2 });
  });

  /** 여기가 갈리는 자리다. 늘 시작으로 접으면 `t1:2` — 런 둘인 문단의 한복판이다. */
  it('자식을 전부 지났으면 끝 해석 — 마지막 런의 끝', () => {
    expect(collapseBoundaries(요소(2), 2, 문단끝에서)).toEqual({ nodeId: 't2', offset: 2 });
  });

  /**
   * **글자 노드는 갈리지 않는다** — 두 해석이 같은 그릇 안을 걸으므로 답이 하나다. 그래도 시작을
   * 고르는 것이 옳다: 글자 노드에 대해 `offset >= 0` 은 늘 참이라, 자식 수로 재는 규칙을 그대로
   * 적용하면 언제나 끝으로 접힌다.
   */
  it('글자 노드면 자식 수와 무관하게 시작 해석', () => {
    expect(collapseBoundaries(글자, 0, 문단끝에서)).toEqual({ nodeId: 't1', offset: 2 });
    expect(collapseBoundaries(글자, 5, 문단끝에서)).toEqual({ nodeId: 't1', offset: 2 });
  });

  /** 빈 그릇: 자식이 없으므로 색인 0 이 이미 *전부 뒤* 다. 런이 없으면 두 해석이 어차피 같다. */
  it('빈 요소는 끝 해석 — 색인 0 이 이미 전부 뒤다', () => {
    expect(collapseBoundaries(요소(0), 0, { startNodeId: 'p1', startModelOffset: 0, endNodeId: 'p1', endModelOffset: 0 }))
      .toEqual({ nodeId: 'p1', offset: 0 });
  });
});
