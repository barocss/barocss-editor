import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../src/data-store';
import { Schema } from '@barocss/schema';

describe('DataStore.marks.setMarks', () => {
  let dataStore: DataStore;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        'inline-text': { name: 'inline-text', content: 'text*', marks: ['bold', 'italic'] },
        paragraph: { name: 'paragraph', content: 'inline-text*' }
      },
      marks: { bold: { name: 'bold' }, italic: { name: 'italic' } }
    });
    dataStore = new DataStore(undefined, schema);
  });

  it('sets marks on existing node (simple)', () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'Hello World' });
    const result = dataStore.marks.setMarks('t1', [ { stype: 'bold', range: [0, 5] } ]);
    expect(result.valid).toBe(true);
    const n = dataStore.getNode('t1');
    expect(n?.marks).toEqual([{ stype: 'bold', range: [0, 5] }]);
  });

  it('fills missing ranges with full text when normalize=true (default)', () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABC' });
    const result = dataStore.marks.setMarks('t1', [ { stype: 'italic' } ]);
    expect(result.valid).toBe(true);
    const n = dataStore.getNode('t1');
    expect(n?.marks).toEqual([{ stype: 'italic', range: [0, 3] }]);
  });

  it('clamps out-of-range and removes empty ranges', () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABCDE' });
    const result = dataStore.marks.setMarks('t1', [
      { stype: 'bold', range: [-5, 2] },     // clamp to [0,2]
      { stype: 'italic', range: [3, 3] },    // empty -> removed
      { stype: 'italic', range: [2, 10] }    // clamp to [2,5]
    ]);
    expect(result.valid).toBe(true);
    const n = dataStore.getNode('t1');
    expect(n?.marks).toEqual([
      { stype: 'bold', range: [0, 2] },
      { stype: 'italic', range: [2, 5] }
    ]);
  });

  it('merges overlapping marks of same type/attrs and removes duplicates', () => {
    dataStore.setNode({ sid: 't1', stype: 'inline-text', text: 'ABCDEFG' });
    const result = dataStore.marks.setMarks('t1', [
      { stype: 'bold', range: [0, 3] },
      { stype: 'bold', range: [2, 5] },      // overlap -> merged to [0,5]
      { stype: 'bold', range: [0, 5] },      // duplicate -> removed
      { stype: 'italic', attrs: { a: 1 }, range: [5, 7] }
    ]);
    expect(result.valid).toBe(true);
    const n = dataStore.getNode('t1');
    expect(n?.marks).toEqual([
      { stype: 'bold', range: [0, 5] },
      { stype: 'italic', attrs: { a: 1 }, range: [5, 7] }
    ]);
  });

  it('returns error when node does not exist', () => {
    const result = dataStore.marks.setMarks('nope', [ { stype: 'bold', range: [0, 1] } ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Node not found');
  });
});


