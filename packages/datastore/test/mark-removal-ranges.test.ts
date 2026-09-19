import { expect, it } from 'vitest';
import { DataStore } from '../src/data-store';

for (const route of ['single', 'range'] as const) {
  for (const [from, to, remaining] of [
    [2, 4, [[0, 2], [4, 6]]], [0, 2, [[2, 6]]], [4, 6, [[0, 4]]], [0, 6, []]
  ] as const) {
    it(`${route} removal subtracts [${from}, ${to}) and preserves other mark kinds`, () => {
      const store = new DataStore();
      store.setNode({ sid: 'run', stype: 'inline-text', text: 'ABCDEF', marks: [
        { stype: 'link', attrs: { href: 'https://example.com' }, range: [0, 6] },
        { stype: 'bold', range: [1, 5] }
      ] }, false);
      if (route === 'single') expect(store.marks.removeMark('run', 'link', [from, to]).valid).toBe(true);
      else expect(store.range.removeMark({ type: 'range', startNodeId: 'run', endNodeId: 'run', startOffset: from, endOffset: to }, 'link')).toBe(1);
      expect(store.getNode('run')?.marks?.filter(mark => mark.stype === 'link').map(mark => mark.range)).toEqual(remaining);
      expect(store.getNode('run')?.marks?.filter(mark => mark.stype === 'bold')).toEqual([{ stype: 'bold', range: [1, 5] }]);
    });
  }
}

it('removes only selected bold from several runs, including whole-run marks without a range', () => {
  const store = new DataStore();
  store.setNode({ sid: 'p', stype: 'paragraph', content: ['a', 'b'] }, false);
  for (const sid of ['a', 'b']) store.setNode({ sid, parentId: 'p', stype: 'inline-text', text: 'ABCDEF', marks: [{ stype: 'bold' }] }, false);
  store.range.removeMark({ type: 'range', startNodeId: 'a', startOffset: 2, endNodeId: 'b', endOffset: 3 }, 'bold');
  expect(store.getNode('a')?.marks).toEqual([{ stype: 'bold', range: [0, 2] }]);
  expect(store.getNode('b')?.marks).toEqual([{ stype: 'bold', range: [3, 6] }]);
});
