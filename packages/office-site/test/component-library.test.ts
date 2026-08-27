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
