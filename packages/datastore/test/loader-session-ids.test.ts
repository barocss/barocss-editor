import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import { DataStoreLoader } from '../src/loader';

/**
 * One document, one series of ids.
 *
 * The loader used to keep a counter of its own, so a document loaded under the
 * name `word` came in as `word:1 … word:80` and everything typed into it
 * afterwards was minted by the store as `0:81` onwards. Nothing collided —
 * `word:5` and `0:5` are different strings — but an id no longer said which
 * session had made it, which is the whole of what a session-prefixed id is for,
 * and re-importing renumbered the document into a third namespace.
 */
describe('the ids a loaded document is given', () => {
  const document = {
    stype: 'document',
    content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello' }] },
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'World' }] }
    ]
  } as never;

  it('carry the session the document was loaded under', () => {
    const store = new DataStore();
    const rootId = new DataStoreLoader(store, 'word').loadDocument(document);

    const seen: string[] = [];
    const walk = (sid: string) => {
      seen.push(sid);
      for (const child of ((store.getNode(sid)?.content ?? []) as string[])) walk(child);
    };
    walk(rootId);

    expect(seen.length).toBe(5);
    for (const sid of seen) expect(sid.startsWith('word:')).toBe(true);
  });

  it('are the same series the store keeps minting from', () => {
    const store = new DataStore();
    new DataStoreLoader(store, 'word').loadDocument(document);

    // What typing into the document would be given
    const next = store.generateId();
    expect(next.startsWith('word:')).toBe(true);
    expect(store.getNode(next)).toBeUndefined();
  });

  it('never repeats one the document already holds', () => {
    const store = new DataStore();
    const rootId = new DataStoreLoader(store, 'word').loadDocument(document);
    const taken = new Set<string>();
    const walk = (sid: string) => {
      taken.add(sid);
      for (const child of ((store.getNode(sid)?.content ?? []) as string[])) walk(child);
    };
    walk(rootId);

    for (let i = 0; i < 20; i += 1) {
      const id = store.generateId();
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
  });
});
