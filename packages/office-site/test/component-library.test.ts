import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { type Editor } from '@barocss/editor-core';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { definitionsOf } from '../src/components';

/**
 * The component library, which could be **added to and never cleaned out**.
 *
 * `createComponentFrom` has existed since components did; nothing has ever renamed one or removed
 * one. A reader who made a card, called it what they were thinking at the time, and made three more
 * had a list that only grew and a name that was wrong forever.
 *
 * Measured against the other two lists the rail draws: a page can be made, renamed, duplicated and
 * removed; a dataset can be made, renamed and removed; a component could only be made. One shape,
 * three answers — which is the kind of gap nothing reports, because every part of it works.
 */
describe('the component library', () => {
  let editor: Editor;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const can = (command: string, payload?: unknown) => editor.canExecuteCommand(command, payload);
  const library = () =>
    definitionsOf({ rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) } as never);
  const named = (id: string) => library().find((one) => one.id === id);

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite() as never, 'site');
  });

  it('renames a definition, and every placement goes on following it', async () => {
    const before = named('cta')!;
    expect(before.uses).toBeGreaterThan(0);

    expect(await run('setComponentInfo', { componentId: 'cta', name: '주 버튼' })).toBe(true);

    const after = named('cta')!;
    expect(after.name).toBe('주 버튼');
    /*
     * The **name** and not the id. A placement points at `componentId`, so renaming the id would be
     * the same rewrite across every placement that a variable rename is — for no gain, since an id
     * nobody sees is not a thing a reader is dissatisfied with.
     */
    expect(after.uses).toBe(before.uses);
    expect(after.sid).toBe(before.sid);
  });

  it('refuses a name that is nothing at all', () => {
    expect(can('setComponentInfo', { componentId: 'cta', name: '   ' })).toBe(false);
    expect(can('setComponentInfo', { componentId: 'cta' })).toBe(false);
    expect(can('setComponentInfo', { componentId: '없는것', name: '무엇' })).toBe(false);
  });

  it('refuses to remove a definition anything places', () => {
    /*
     * `removeDataset`'s rule for `removeDataset`'s reason: a placement whose definition has gone
     * draws **nothing**, and nothing is exactly what a reader would be looking at while wondering
     * what they broke. Refusing while it is still a gesture beats letting them make a document that
     * cannot be drawn.
     */
    expect(named('cta')!.uses).toBeGreaterThan(0);
    expect(can('removeComponent', { componentId: 'cta' })).toBe(false);
  });

  it('removes one nothing places, and leaves the rest of the library', async () => {
    /*
     * The sample places every definition it has, so the way to get one nothing places is to delete
     * the **last placement** of one — which is exactly the situation this command exists for. A
     * reader takes the one blog row off the one page that had it, and the definition is now dead
     * weight in a list they cannot clean.
     */
    const placementsOf = (id: string): string[] => {
      const found: string[] = [];
      const walk = (sid: string) => {
        const node = store.getNode(sid) as any;
        if (!node) return;
        if (node.stype === 'instance' && node.attributes?.componentId === id) found.push(sid);
        for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
      };
      walk(editor.getRootId() as string);
      return found;
    };

    /*
     * Every placement, not one: `uses` is a **walk**, so a definition is unused only when the last of
     * them is gone. And not `post-row`, whose single placement is a data list's *template* — that
     * instance is the thing the list draws rather than something on a page, and it is refused for
     * the same reason `detachComponent` refuses it.
     */
    const spare = library().find((one) => one.id === 'ghost')!;
    expect(spare, 'a definition placed on pages').toBeTruthy();
    await run('removeBlocks', { nodeIds: placementsOf(spare.id) });
    expect(library().find((one) => one.id === spare.id)!.uses).toBe(0);

    const gone = library().find((one) => one.uses === 0);
    expect(gone, 'a definition nothing places').toBeTruthy();
    const before = library().length;

    expect(await run('removeComponent', { componentId: gone!.id })).toBe(true);
    expect(library()).toHaveLength(before - 1);
    expect(named(gone!.id)).toBeUndefined();
  });

  it('is one entry in the history, both ways', async () => {
    await run('setComponentInfo', { componentId: 'cta', name: '주 버튼' });
    await run('undo');
    expect(named('cta')!.name).not.toBe('주 버튼');
  });
});

/**
 * And the fourth act a **dataset** could not do.
 *
 * The same comparison that found the component library's missing two: a page can be made, renamed,
 * duplicated and removed, and a dataset could do three of those. Worth having for the reason a
 * page's duplicate is — the second one is nearly the first, and the alternative is typing the
 * columns again and getting one slightly wrong, which is the fault that makes a `field:` reference
 * draw nothing.
 */
describe('copying a dataset', () => {
  let editor: Editor;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const datasets = () => {
    const found: any[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.stype === 'dataset') found.push({ sid, ...node.attributes });
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId() as string);
    return found;
  };

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite() as never, 'site');
  });

  it('copies the columns and the rows, and takes a name of its own', async () => {
    const first = datasets()[0];
    expect(await run('duplicateDataset', { nodeId: first.sid })).toBe(true);

    const copy = datasets().find((one) => one.sid !== first.sid && one.name.startsWith(first.name))!;
    expect(copy).toBeTruthy();
    expect(copy.fields).toEqual(first.fields);
    expect(copy.records).toEqual(first.records);

    /*
     * A name nothing else has, because a **name is what a collection points at**: two datasets
     * called 상품 is a list drawing one of them and nobody able to say which.
     */
    expect(copy.name).not.toBe(first.name);
    expect(datasets().map((one) => one.name)).toHaveLength(new Set(datasets().map((one) => one.name)).size);
  });

  it('does not share its rows with the one it came from', async () => {
    const first = datasets()[0];
    await run('duplicateDataset', { nodeId: first.sid });
    const copy = datasets().find((one) => one.sid !== first.sid && one.name.startsWith(first.name))!;

    await run('setDatasetCell', { nodeId: copy.sid, row: 0, field: first.fields[0], value: '바뀐 값' });

    // Two datasets sharing one records array is one document with two names for the same rows, which
    // the next edit proves — so the copy is a copy all the way down.
    const now = datasets();
    expect(now.find((one) => one.sid === copy.sid)!.records[0][first.fields[0]]).toBe('바뀐 값');
    expect(now.find((one) => one.sid === first.sid)!.records[0][first.fields[0]]).toBe(
      first.records[0][first.fields[0]]
    );
  });

  it('refuses anything that is not a dataset', () => {
    expect(editor.canExecuteCommand('duplicateDataset', { nodeId: editor.getRootId() })).toBe(false);
    expect(editor.canExecuteCommand('duplicateDataset')).toBe(false);
  });
});
