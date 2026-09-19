import { expect, it } from 'vitest';
import { DataStore } from '../src/data-store';

function setup() {
  const store = new DataStore();
  store.setNode({ sid: 'p', stype: 'paragraph', content: ['a', 'b'] } as any, false);
  store.setNode({ sid: 'a', stype: 'inline-text', text: 'A', parentId: 'p' } as any, false);
  store.setNode({ sid: 'b', stype: 'emoji', parentId: 'p' } as any, false);
  store.setNode({ sid: 'q', stype: 'paragraph', content: [] } as any, false);
  return store;
}

it('commit preserves the final overlay order when an insertion follows a move', () => {
  const store = setup();
  store.begin();
  store.content.moveNode('a', 'q', 0);
  store.content.addChild('q', { sid: 'c', stype: 'emoji' } as any, 0);
  expect(store.getNode('q')?.content).toEqual(['c', 'a']);
  store.commit();
  expect(store.getNode('q')?.content).toEqual(['c', 'a']);
  expect(store.getNode('p')?.content).toEqual(['b']);
  expect(store.getNode('a')?.parentId).toBe('q');
});

it('commit does not reattach an atom removed after moving it', () => {
  const store = setup();
  store.begin();
  store.content.moveNode('b', 'q', 0);
  store.content.removeChild('q', 'b');
  store.commit();
  expect(store.getNode('q')?.content).toEqual([]);
  expect(store.getNode('p')?.content).toEqual(['a']);
  expect(store.getNode('b')?.parentId).toBeUndefined();
});

it('deleting a sibling keeps children moved into that parent in the same transaction', () => {
  const store = setup();
  store.begin();
  store.content.moveNode('a', 'q', 0);
  store.deleteNode('b');
  store.content.moveNode('a', 'p', 0);
  store.content.addChild('p', { sid: 'c', stype: 'inline-text', text: 'C' } as any);
  store.deleteNode('a');
  expect(store.getNode('p')?.content).toEqual(['c']);
  store.commit();
  expect(store.getNode('p')?.content).toEqual(['c']);
  expect(store.getNode('c')?.parentId).toBe('p');
});

it('rollback of a deletion does not mutate the committed parent array', () => {
  const store = setup();
  store.begin(); store.deleteNode('b');
  expect(store.getNode('p')?.content).toEqual(['a']);
  store.rollback();
  expect(store.getNode('p')?.content).toEqual(['a', 'b']);
  expect(store.getNode('b')?.parentId).toBe('p');
});
