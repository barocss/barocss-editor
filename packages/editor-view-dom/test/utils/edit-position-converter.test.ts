import { describe, it, expect } from 'vitest';
import { extractModelTextFromRange } from '../../src/utils/edit-position-converter';

describe('edit-position-converter', () => {
  const createDataStore = (nodes: Record<string, any>) => ({
    getNode: (nodeId: string) => nodes[nodeId],
    getChildren: (nodeId: string) => {
      const node = nodes[nodeId];
      if (!node || !Array.isArray(node.content)) return [];
      return node.content
        .map((childId: unknown) => {
          if (typeof childId !== 'string') return undefined;
          return nodes[childId];
        })
        .filter(Boolean);
    },
    getParent: (nodeId: string) => {
      const node = nodes[nodeId];
      if (!node?.parentId) return undefined;
      return nodes[node.parentId];
    },
    getNextSibling: (nodeId: string) => {
      const node = nodes[nodeId];
      if (!node?.parentId) return null;
      const siblings = nodes[node.parentId]?.content;
      if (!Array.isArray(siblings)) return null;
      const index = siblings.indexOf(nodeId);
      if (index < 0 || index >= siblings.length - 1) return null;
      const next = siblings[index + 1];
      return typeof next === 'string' ? next : null;
    }
  } as any);

  it('단일 inline-text 노드에서 정상적으로 substring을 반환해야 함', () => {
    const dataStore = createDataStore({
      t1: { sid: 't1', stype: 'inline-text', text: 'hello world' }
    });

    const result = extractModelTextFromRange(dataStore, {
      type: 'range',
      startNodeId: 't1',
      startOffset: 1,
      endNodeId: 't1',
      endOffset: 5
    });

    expect(result).toBe('ello');
  });

  it('여러 inline-text 노드를 문서 순서대로 이어붙여 반환해야 함', () => {
    const dataStore = createDataStore({
      doc: {
        sid: 'doc',
        stype: 'document',
        content: ['p1']
      },
      p1: {
        sid: 'p1',
        stype: 'paragraph',
        content: ['t1', 'space', 't2'],
        parentId: 'doc'
      },
      space: {
        sid: 'space',
        stype: 'text-container',
        content: ['i1'],
        parentId: 'p1'
      },
      i1: {
        sid: 'i1',
        stype: 'inline-text',
        text: 'ignore',
        parentId: 'space'
      },
      t1: {
        sid: 't1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'p1'
      },
      t2: {
        sid: 't2',
        stype: 'inline-text',
        text: 'World',
        parentId: 'p1'
      }
    });

    const result = extractModelTextFromRange(dataStore, {
      type: 'range',
      startNodeId: 't1',
      startOffset: 2,
      endNodeId: 't2',
      endOffset: 2
    });

    expect(result).toBe('lloWo');
  });

  it('스타트/엔드 노드가 존재하지 않으면 빈 문자열을 반환해야 함', () => {
    const dataStore = createDataStore({
      doc: {
        sid: 'doc',
        stype: 'document',
        content: ['p1']
      },
      p1: {
        sid: 'p1',
        stype: 'paragraph',
        content: ['t1'],
        parentId: 'doc'
      },
      t1: {
        sid: 't1',
        stype: 'inline-text',
        text: 'Hello',
        parentId: 'p1'
      }
    });

    const result = extractModelTextFromRange(dataStore, {
      type: 'range',
      startNodeId: 'missing',
      startOffset: 0,
      endNodeId: 't1',
      endOffset: 2
    });

    expect(result).toBe('');
  });
});
