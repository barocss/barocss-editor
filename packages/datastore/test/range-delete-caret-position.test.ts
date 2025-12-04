import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import type { ModelSelection } from '@barocss/editor-core';

describe('RangeOperations.deleteText - multi-node range behavior', () => {
  it('paragraph-1 끝 ~ paragraph-2 중간 Range 를 삭제하면 텍스트 tail/head 가 올바르게 잘린다', () => {
    const store = new DataStore();

    // document 구조:
    // doc
    //  ├─ para-1: "Hello World"
    //  └─ para-2: "Foo Bar"
    store.setNode({
      sid: 'doc-1',
      stype: 'doc',
      content: ['para-1', 'para-2']
    } as any);

    store.setNode({
      sid: 'para-1',
      stype: 'paragraph',
      parentId: 'doc-1',
      content: ['text-1']
    } as any);

    store.setNode({
      sid: 'para-2',
      stype: 'paragraph',
      parentId: 'doc-1',
      content: ['text-2']
    } as any);

    store.setNode({
      sid: 'text-1',
      stype: 'inline-text',
      parentId: 'para-1',
      text: 'Hello World'
    } as any);

    store.setNode({
      sid: 'text-2',
      stype: 'inline-text',
      parentId: 'para-2',
      text: 'Foo Bar'
    } as any);

    // Range: "Hello[ World" ~ "Fo]o Bar"
    const range: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5, // "Hello| World"
      endNodeId: 'text-2',
      endOffset: 2,   // "Fo|o Bar"
      collapsed: false,
      direction: 'forward'
    };

    const rangeOps = (store as any).range;

    const deleted = rangeOps.deleteText(range);
    // 삭제된 내용이 어떤 문자열인지보다, 남은 구조가 중요한 테스트
    expect(typeof deleted).toBe('string');

    const t1 = store.getNode('text-1');
    const t2 = store.getNode('text-2');

    expect(t1?.text).toBe('Hello');  // tail 잘림
    expect(t2?.text).toBe('o Bar');  // head 잘림
  });
});


