import { describe, it, expect } from 'vitest';
import { insideLockedRegion } from '../src/locked-region';

/**
 * A region the document says may not be edited, and why the **model** is the one asked.
 *
 * A locked region is drawn `contenteditable="false"`, and both typing gates already refused a caret
 * the DOM put inside one. That was not enough, and the gap is the reason the second gate exists at
 * all: the DOM selection and the model selection disagree while a render is in flight, so a key is
 * let through when *either* can name somewhere for it to go — and `beforeinput` then writes at the
 * **model** selection.
 *
 * Measured in a browser: every character typed at a locked content control landed in it, while the
 * element around it said `contenteditable="false"` the whole time. A browser will not put a caret
 * inside one, so it leaves the DOM selection outside while the model's still points in, and a
 * `closest()` on the DOM cannot see what the model can.
 *
 * `lockContent` as a convention rather than a node name: the engine does not know what a content
 * control is and must not. Any product can say it about any node.
 */
describe('a region the document locked', () => {
  const store = (nodes: Record<string, { parentId?: string; attributes?: Record<string, unknown> }>) => ({
    getNode: (sid: string) => nodes[sid]
  });

  const document_ = store({
    doc: {},
    surface: { parentId: 'doc' },
    open: { parentId: 'surface' },
    'open-run': { parentId: 'open' },
    control: { parentId: 'surface', attributes: { lockContent: true } },
    'control-block': { parentId: 'control' },
    'control-run': { parentId: 'control-block' }
  });

  it('finds the lock from a run buried inside it', () => {
    expect(insideLockedRegion(document_, 'control-run')).toBe(true);
    expect(insideLockedRegion(document_, 'control-block')).toBe(true);
    expect(insideLockedRegion(document_, 'control')).toBe(true);
  });

  it('leaves the rest of the document alone', () => {
    expect(insideLockedRegion(document_, 'open-run')).toBe(false);
    expect(insideLockedRegion(document_, 'surface')).toBe(false);
  });

  /*
   * `lockContent: false` is a control that says out loud that it is *not* locked, which is what a
   * schema default writes — and reading it as a lock would freeze every control in the document.
   */
  it('reads only a lock that is on', () => {
    const said = store({ a: { attributes: { lockContent: false } }, b: { attributes: {} } });

    expect(insideLockedRegion(said, 'a')).toBe(false);
    expect(insideLockedRegion(said, 'b')).toBe(false);
  });

  it('says no rather than looping on a tree that points at itself', () => {
    const bad = store({ a: { parentId: 'b' }, b: { parentId: 'a' } });

    expect(insideLockedRegion(bad, 'a')).toBe(false);
  });

  it('says no when there is nothing to ask', () => {
    expect(insideLockedRegion(undefined, 'a')).toBe(false);
    expect(insideLockedRegion(document_, undefined)).toBe(false);
    expect(insideLockedRegion(document_, 'nobody')).toBe(false);
  });

  /**
   * And the **other** lock, which is why this takes which one to ask about.
   *
   * Word's content control has two and keeps them apart on purpose: a form's instructions may be
   * read and not edited *and* not thrown away, while a field a reader fills in is the first without
   * the second. `lockContent` guards typing, `lockDelete` guards `deleteNode` — and without the
   * second a reader could not type in a protected region and could delete the whole of it.
   */
  describe('the two locks are two questions', () => {
    const both = store({
      'edit-only': { attributes: { lockContent: true } },
      'delete-only': { attributes: { lockDelete: true } },
      'edit-child': { parentId: 'edit-only' },
      'delete-child': { parentId: 'delete-only' }
    });

    it('answers about the lock it was asked about', () => {
      expect(insideLockedRegion(both, 'edit-child', 'lockContent')).toBe(true);
      expect(insideLockedRegion(both, 'edit-child', 'lockDelete')).toBe(false);

      expect(insideLockedRegion(both, 'delete-child', 'lockDelete')).toBe(true);
      expect(insideLockedRegion(both, 'delete-child', 'lockContent')).toBe(false);
    });

    /* Editing is the one a typing gate asks about, so it is the one asked when nobody says. */
    it('asks about editing when nobody says which', () => {
      expect(insideLockedRegion(both, 'edit-child')).toBe(true);
      expect(insideLockedRegion(both, 'delete-child')).toBe(false);
    });
  });
});
