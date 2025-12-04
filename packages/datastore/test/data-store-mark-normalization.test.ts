import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore Mark Normalization', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = new Schema('test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { 
          name: 'inline-text', 
          group: 'inline',
          attrs: {
            class: { type: 'string', default: null }
          }
        }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' },
        italic: { name: 'italic', group: 'text-style' },
        link: { name: 'link', group: 'link', attrs: { href: { type: 'string' } } }
      }
    });
    dataStore.setActiveSchema(schema);
  });

  describe('normalizeMarks', () => {
    it('should normalize marks with missing ranges', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold' }, // 범위 없음
          { stype: 'italic', range: [0, 5] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 11] }, // 전체 텍스트에 적용
        { stype: 'italic', range: [0, 5] }
      ]);
    // Spec: different attrs must not merge; we still emit one update for normalized marks
    expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should remove empty marks', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'italic', range: [5, 5] }, // 빈 범위
          { stype: 'link', range: [6, 11] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'link', range: [6, 11] }
      ]);
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should merge overlapping marks of same type', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'bold', range: [3, 8] }, // 겹치는 bold 마크
          { stype: 'italic', range: [6, 11] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 8] }, // 병합됨
        { stype: 'italic', range: [6, 11] }
      ]);
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should not merge marks with different attributes', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'link', range: [0, 5], attrs: { href: 'http://example.com' } },
          { stype: 'link', range: [3, 8], attrs: { href: 'http://different.com' } } // 다른 href
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'link', range: [0, 5], attrs: { href: 'http://example.com' } },
        { stype: 'link', range: [3, 8], attrs: { href: 'http://different.com' } }
      ]);
      // Spec: no update is emitted if normalization causes no change
      // (marks already normalized and not merged due to different attrs)
    });

    it('should remove duplicate marks', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'bold', range: [0, 5] }, // 중복
          { stype: 'italic', range: [6, 11] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [6, 11] }
      ]);
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should sort marks by start position', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'italic', range: [6, 11] },
          { stype: 'bold', range: [0, 5] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [6, 11] }
      ]);
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should handle empty text', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: '',
        marks: [
          { stype: 'bold', range: [0, 5] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([]);
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should normalize ranges to text length', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [
          { stype: 'bold', range: [0, 10] }, // 텍스트 길이 초과
          { stype: 'italic', range: [-2, 3] } // 음수 범위
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      dataStore.normalizeMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 5] }, // 정규화됨
        { stype: 'italic', range: [0, 3] } // 정규화됨
      ]);
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });
  });

  describe('normalizeAllMarks', () => {
    it('should normalize marks in all nodes', () => {
      const textNode1 = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold' }], // 범위 없음
        parentId: 'para-1'
      };
      const textNode2 = {
        sid: 'text-2',
        stype: 'inline-text',
        text: 'World',
        marks: [{ stype: 'italic', range: [0, 5] }],
        parentId: 'para-1'
      };
      
      dataStore.setNode(textNode1);
      dataStore.setNode(textNode2);

      dataStore.begin();
      const normalizedCount = dataStore.normalizeAllMarks();
      const ops = dataStore.end();

      expect(normalizedCount).toBe(2);
      
      const node1 = dataStore.getNode('text-1');
      const node2 = dataStore.getNode('text-2');
      
      expect(node1!.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
      expect(node2!.marks).toEqual([{ stype: 'italic', range: [0, 5] }]);
      // At least one update (only nodes with changes emit updates)
      expect(ops.filter(o => o.type === 'update').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getMarkStatistics', () => {
    it('should return correct statistics', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'bold', range: [3, 8] }, // 겹치는 마크
          { stype: 'italic', range: [6, 11] },
          { stype: 'link', range: [5, 5] } // 빈 마크
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const stats = dataStore.getMarkStatistics('text-1');

      expect(stats.totalMarks).toBe(4);
      expect(stats.markTypes).toEqual({
        bold: 2,
        italic: 1,
        link: 1
      });
      expect(stats.overlappingMarks).toBe(1);
      expect(stats.emptyMarks).toBe(1);
    });

    it('should return empty statistics for node without marks', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      const stats = dataStore.getMarkStatistics('text-1');

      expect(stats.totalMarks).toBe(0);
      expect(stats.markTypes).toEqual({});
      expect(stats.overlappingMarks).toBe(0);
      expect(stats.emptyMarks).toBe(0);
    });
  });

  describe('removeEmptyMarks', () => {
    it('should remove empty marks', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'italic', range: [5, 5] }, // 빈 마크
          { stype: 'link', range: [6, 11] },
          { stype: 'link' } // 범위 없음
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      const removedCount = dataStore.removeEmptyMarks('text-1');
      const ops = dataStore.end();
      const node = dataStore.getNode('text-1');

      expect(removedCount).toBe(2);
      expect(node!.marks).toEqual([
        { stype: 'bold', range: [0, 5] },
        { stype: 'link', range: [6, 11] }
      ]);
    expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(true);
    });

    it('should return 0 if no empty marks', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { stype: 'bold', range: [0, 5] },
          { stype: 'italic', range: [6, 11] }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.begin();
      const removedCount = dataStore.removeEmptyMarks('text-1');
      const ops = dataStore.end();

      expect(removedCount).toBe(0);
      // No updates expected when nothing changed
      expect(ops.some(o => o.type === 'update' && o.nodeId === 'text-1')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle node without marks', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      expect(() => dataStore.normalizeMarks('text-1')).not.toThrow();
    });

    it('should handle non-existent node', () => {
      expect(() => dataStore.normalizeMarks('non-existent')).not.toThrow();
    });

    it('should handle marks with complex attributes', () => {
      const textNode = {
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { 
            stype: 'link', 
            range: [0, 5], 
            attrs: { 
              href: 'http://example.com',
              target: '_blank',
              class: 'external-link'
            } 
          },
          { 
            stype: 'link', 
            range: [3, 8], 
            attrs: { 
              href: 'http://example.com',
              target: '_blank',
              class: 'external-link'
            } 
          }
        ],
        parentId: 'para-1'
      };
      dataStore.setNode(textNode);

      dataStore.normalizeMarks('text-1');
      const node = dataStore.getNode('text-1');

      expect(node!.marks).toEqual([
        { 
          stype: 'link', 
          range: [0, 8], 
          attrs: { 
            href: 'http://example.com',
            target: '_blank',
            class: 'external-link'
          } 
        }
      ]);
    });
  });
});
