import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

describe('copied diagram identity', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let other: string;
  const rootId = () => {
    const sid = editor.getRootId();
    if (!sid) throw new Error('Missing copy fixture root');
    return sid;
  };
  const node = (sid: string) => store.getNode(sid)!;
  const children = (sid: string) => node(sid).content as string[];
  const attrs = (sid: string) => node(sid).attributes!;
  const run = (name: string, payload?: unknown) => editor.executeCommand(name, payload);
  const select = (ids: string[]) => editor.setNode({ nodeIds: ids });
  const diagram = (container: string) => {
    const [a, b, line] = children(container);
    expect(attrs(line).startNodeId).toBe(a);
    expect(attrs(line).endNodeId).toBe(b);
    return [a, b, line];
  };

  beforeEach(() => {
    const schema = createSchema('copy-identity', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument({ stype: 'document', content: [
      { stype: 'surface', attributes: { kind: 'slide', id: 'source-slide', name: 'Same slide' }, content: [
        { sid: 'original:a', stype: 'rectangle', attributes: { goTo: 'source-slide', objectId: '11111111-1111-4111-8111-111111111111', name: 'Same shape', x: 0, y: 0, width: 1000, height: 1000 } },
        { sid: 'original:b', stype: 'ellipse', attributes: { goTo: 'external-slide', objectId: '22222222-2222-4222-8222-222222222222', name: 'Same shape', x: 3000, y: 0, width: 1000, height: 1000 } },
        { sid: 'original:line', stype: 'connector', attributes: { objectId: '33333333-3333-4333-8333-333333333333', startNodeId: 'original:a', endNodeId: 'original:b', startSide: 'e', endSide: 'w', kind: 'elbow' } }
      ] },
      { stype: 'surface', attributes: { kind: 'slide', id: 'external-slide', name: 'Same slide' }, content: [] }
    ] } as never, 'copies');
    [slide, other] = children(rootId());
  });
  afterEach(() => editor.destroy());

  it('duplicates a whole slide with endpoints bound to the copied targets', async () => {
    const original = diagram(slide);
    expect(await run('duplicateSlide', { slideId: slide })).toBe(true);
    const copySlide = children(rootId())[1];
    const copy = diagram(copySlide);
    const copySlideId = attrs(copySlide).id;
    expect(copySlideId).not.toBe(attrs(slide).id);
    expect(attrs(copy[0]).goTo).toBe(copySlideId);
    expect(attrs(copy[1]).goTo).toBe('external-slide');
    expect(attrs(original[0]).goTo).toBe('source-slide');
    const copyIds = copy.map(sid => attrs(sid).objectId);
    expect(copy.every(sid => !original.includes(sid))).toBe(true);
    expect(copy.map(sid => attrs(sid).objectId).every(id => !original.map(sid => attrs(sid).objectId).includes(id))).toBe(true);
    expect(attrs(copy[0]).name).toBe(attrs(original[0]).name);
    expect(attrs(copy[2])).toMatchObject({ startSide: 'e', endSide: 'w' });
    expect(diagram(slide)).toEqual(original);
    await editor.undo();
    expect(children(rootId())).toEqual([slide, other]);
    await editor.redo();
    expect(children(rootId())[1]).toBe(copySlide);
    expect(diagram(copySlide)).toEqual(copy);
    expect(copy.map(sid => attrs(sid).objectId)).toEqual(copyIds);
    expect(attrs(copySlide).id).toBe(copySlideId);
    expect(attrs(copy[0]).goTo).toBe(copySlideId);
  });

  it('duplicates grouped diagrams without changing original target identities', async () => {
    const original = diagram(slide);
    select(original);
    expect(await run('groupBoxes')).toBe(true);
    const group = children(slide)[0];
    expect(diagram(group)).toEqual(original);
    select([group]);
    expect(await run('duplicateBoxes')).toBe(true);
    const copyGroup = children(slide)[1];
    const copy = diagram(copyGroup);
    expect(copy.every(sid => !original.includes(sid))).toBe(true);
    expect(copy.map(sid => attrs(sid).objectId).every(id => !original.map(sid => attrs(sid).objectId).includes(id))).toBe(true);
    expect(diagram(group)).toEqual(original);
    await editor.undo();
    expect(children(slide)).toEqual([group]);
    await editor.redo();
    expect(diagram(copyGroup)).toEqual(copy);
  });

  it('makes independent repeated clipboard pastes and restores the same IDs on redo', async () => {
    const original = diagram(slide);
    select(original);
    expect(await run('copyBoxes')).toBe(true);
    expect(await run('pasteBoxes', { parentId: other })).toBe(true);
    const first = diagram(other);
    const originalIds = original.map(sid => attrs(sid).objectId);
    const firstIds = first.map(sid => attrs(sid).objectId);
    expect(firstIds.every(id => !originalIds.includes(id))).toBe(true);
    expect(await run('pasteBoxes', { parentId: other })).toBe(true);
    const second = children(other).slice(3);
    const secondIds = second.map(sid => attrs(sid).objectId);
    expect(new Set([...originalIds, ...firstIds, ...secondIds]).size).toBe(9);
    expect(attrs(second[2]).startNodeId).toBe(second[0]);
    expect(attrs(second[2]).endNodeId).toBe(second[1]);
    expect(second.every(sid => !first.includes(sid) && !original.includes(sid))).toBe(true);
    await editor.undo();
    expect(children(other)).toEqual(first);
    await editor.redo();
    expect(children(other).slice(3)).toEqual(second);
    expect(second.map(sid => attrs(sid).objectId)).toEqual(secondIds);
    expect(original.map(sid => attrs(sid).objectId)).toEqual(originalIds);
    expect(diagram(slide)).toEqual(original);
  });
  it('keeps an endpoint outside the copied set on its original target', async () => {
    const original = diagram(slide);
    const originalIds = original.map(sid => attrs(sid).objectId);
    select([original[2]]);
    expect(await run('duplicateBoxes')).toBe(true);
    const line = children(slide).at(-1)!;
    expect(attrs(line).startNodeId).toBe(original[0]);
    expect(attrs(line).endNodeId).toBe(original[1]);
    expect(attrs(line).objectId).not.toBe(originalIds[2]);
    expect(original.map(sid => attrs(sid).objectId)).toEqual(originalIds);
  });

  it('keeps persistent target IDs through grouping and ungrouping with undo and redo', async () => {
    const original = diagram(slide);
    const originalIds = original.map(sid => attrs(sid).objectId);
    select(original);
    expect(await run('groupBoxes')).toBe(true);
    const group = children(slide)[0];
    select([group]);
    expect(await run('ungroupBoxes')).toBe(true);
    expect(original.map(sid => attrs(sid).objectId)).toEqual(originalIds);
    expect(diagram(slide)).toEqual(original);
    await editor.undo();
    expect(diagram(group)).toEqual(original);
    expect(original.map(sid => attrs(sid).objectId)).toEqual(originalIds);
    await editor.redo();
    expect(diagram(slide)).toEqual(original);
    expect(original.map(sid => attrs(sid).objectId)).toEqual(originalIds);
  });

  it('copies a diagram to another slide with new IDs and preserves line-target parameters', async () => {
    const original = diagram(slide);
    expect(await run('insertConnector', { startNodeId: original[0], endNodeId: original[2], endT: 0.4 })).toBe(true);
    const branch = children(slide).at(-1)!;
    const all = [...original, branch];
    expect(await run('copyBoxesToSlide', { slideId: other, positions: all.map(nodeId => ({ nodeId, x: 400, y: 500 })) })).toBe(true);
    const copies = children(other);
    expect(attrs(copies[2]).startNodeId).toBe(copies[0]);
    expect(attrs(copies[2]).endNodeId).toBe(copies[1]);
    expect(attrs(copies[3]).startNodeId).toBe(copies[0]);
    expect(attrs(copies[3]).endNodeId).toBe(copies[2]);
    expect(attrs(copies[3]).endT).toBe(attrs(branch).endT);
    expect(attrs(branch).endNodeId).toBe(original[2]);
    const ids = [...all, ...copies].map(sid => attrs(sid).objectId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

});
