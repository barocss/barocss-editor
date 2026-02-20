import { describe, it, expect } from 'vitest';
import { fromDOMSelection } from '../src/types';

describe('fromDOMSelection', () => {
  it('동일 노드에서 anchor/focus 순서가 뒤집혀도 시작/끝 정렬과 방향이 맞아야 한다', () => {
    const selection = fromDOMSelection('text-1', 8, 'text-1', 2, 'range');

    expect(selection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 8,
      collapsed: false,
      direction: 'backward'
    });
  });

  it('문서 순서 비교 콜백이 주어지면 anchor/focus를 순서 기준으로 정렬해야 한다', () => {
    const compareNodeOrder = (a: string, b: string): number =>
      ['p-1', 'p-2', 'p-3'].indexOf(a) - ['p-1', 'p-2', 'p-3'].indexOf(b);

    const selection = fromDOMSelection('p-3', 4, 'p-1', 1, 'range', compareNodeOrder);

    expect(selection).toEqual({
      type: 'range',
      startNodeId: 'p-1',
      startOffset: 1,
      endNodeId: 'p-3',
      endOffset: 4,
      collapsed: false,
      direction: 'backward'
    });
  });

  it('문서 순서가 앞뒤로 바뀌면 방향이 backward여야 한다', () => {
    const compareNodeOrder = (a: string, b: string): number =>
      ['p-1', 'p-2', 'p-3'].indexOf(a) - ['p-1', 'p-2', 'p-3'].indexOf(b);

    const selection = fromDOMSelection('p-2', 5, 'p-3', 2, 'range', compareNodeOrder);

    expect(selection).toMatchObject({
      type: 'range',
      startNodeId: 'p-2',
      startOffset: 5,
      endNodeId: 'p-3',
      endOffset: 2,
      direction: 'forward'
    });
  });
});
