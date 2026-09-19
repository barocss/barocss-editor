import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/data-store';
import type { INode } from '../src/types';

describe('SerializationOperations', () => {
  it('serializeRange: single-node text range', () => {
    const ds = new DataStore();
    const rootId = ds.generateId();
    const textId = ds.generateId();
    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [textId]
    } as any);
    ds.setNodeInternal({
      sid: textId,
      stype: 'inline-text',
      text: 'Hello World',
      parentId: rootId
    } as any);

    const selection = {
      type: 'range',
      startNodeId: textId,
      startOffset: 6,
      endNodeId: textId,
      endOffset: 11,
      collapsed: false,
      direction: 'forward'
    } as any;

    const json = ds.serializeRange(selection);
    expect(json.length).toBe(1);
    expect(json[0].text).toBe('World');
  });

  it('serializeRange: multi-node range copies nodes between start and end', () => {
    const ds = new DataStore();

    const rootId = ds.generateId();
    const p1 = ds.generateId();
    const p2 = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [p1, p2]
    } as any);
    ds.setNodeInternal({ sid: p1, stype: 'inline-text', text: 'AAA', parentId: rootId } as any);
    ds.setNodeInternal({ sid: p2, stype: 'inline-text', text: 'BBB', parentId: rootId } as any);

    const selection = {
      type: 'range',
      startNodeId: p1,
      startOffset: 0,
      endNodeId: p2,
      endOffset: 3,
      collapsed: false,
      direction: 'forward'
    } as any;

    const json = ds.serializeRange(selection);
    expect(json.map(n => n.text)).toEqual(['AAA', 'BBB']);
  });

  it('serializeRange: includes selected inline atoms in document order', () => {
    const ds = new DataStore();

    const rootId = ds.generateId();
    const t1 = ds.generateId();
    const img = ds.generateId();
    const t2 = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [t1, img, t2]
    } as any);
    ds.setNodeInternal({ sid: t1, stype: 'inline-text', text: 'AAA', parentId: rootId } as any);
    ds.setNodeInternal({ sid: img, stype: 'inline-image', parentId: rootId } as any);
    ds.setNodeInternal({ sid: t2, stype: 'inline-text', text: 'BBB', parentId: rootId } as any);

    const selection = {
      type: 'range',
      startNodeId: t1,
      startOffset: 0,
      endNodeId: t2,
      endOffset: 3,
      collapsed: false,
      direction: 'forward'
    } as any;

    const json = ds.serializeRange(selection);
    expect(json.map(n => n.stype)).toEqual(['inline-text', 'inline-image', 'inline-text']);
  });

  it('deserializeNodes: inserts nodes under target parent', () => {
    const ds = new DataStore();

    const rootId = ds.generateId();
    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: []
    } as any);

    const nodes: INode[] = [
      { stype: 'inline-text', text: 'AAA' } as any,
      { stype: 'inline-text', text: 'BBB' } as any
    ];

    const createdIds = ds.deserializeNodes(nodes, rootId);
    expect(createdIds.length).toBe(2);

    const root = ds.getNode(rootId)!;
    expect(root.content).toHaveLength(2);
    const first = ds.getNode(createdIds[0])!;
    const second = ds.getNode(createdIds[1])!;
    expect(first.text).toBe('AAA');
    expect(second.text).toBe('BBB');
  });

  it('deserializeNodes: inserts at middle position of parent content', () => {
    const ds = new DataStore();

    const rootId = ds.generateId();
    const aId = ds.generateId();
    const cId = ds.generateId();

    ds.setNodeInternal({
      sid: rootId,
      stype: 'paragraph',
      content: [aId, cId]
    } as any);
    ds.setNodeInternal({ sid: aId, stype: 'inline-text', text: 'A', parentId: rootId } as any);
    ds.setNodeInternal({ sid: cId, stype: 'inline-text', text: 'C', parentId: rootId } as any);

    const nodes: INode[] = [
      { stype: 'inline-text', text: 'B1' } as any,
      { stype: 'inline-text', text: 'B2' } as any
    ];

    const createdIds = ds.deserializeNodes(nodes, rootId, 1);
    const root = ds.getNode(rootId)!;
    expect(root.content).toHaveLength(4);
    const ids = root.content as string[];
    expect(ids[0]).toBe(aId);
    expect(ids[1]).toBe(createdIds[0]);
    expect(ids[2]).toBe(createdIds[1]);
    expect(ids[3]).toBe(cId);
  });

  it('serializeRange + deserializeNodes: simple round-trip of inline texts', () => {
    const ds = new DataStore();

    const srcRootId = ds.generateId();
    const t1 = ds.generateId();
    const t2 = ds.generateId();

    ds.setNodeInternal({
      sid: srcRootId,
      stype: 'paragraph',
      content: [t1, t2]
    } as any);
    ds.setNodeInternal({ sid: t1, stype: 'inline-text', text: 'Hello ', parentId: srcRootId } as any);
    ds.setNodeInternal({ sid: t2, stype: 'inline-text', text: 'World', parentId: srcRootId } as any);

    const selection = {
      type: 'range',
      startNodeId: t1,
      startOffset: 0,
      endNodeId: t2,
      endOffset: 5,
      collapsed: false,
      direction: 'forward'
    } as any;

    const serialized = ds.serializeRange(selection);

    const destRootId = ds.generateId();
    ds.setNodeInternal({
      sid: destRootId,
      stype: 'paragraph',
      content: []
    } as any);

    const createdIds = ds.deserializeNodes(serialized, destRootId);
    const destRoot = ds.getNode(destRootId)!;
    const createdTexts = (destRoot.content as string[]).map(id => ds.getNode(id)!.text);
    expect(createdIds.length).toBe(2);
    expect(createdTexts).toEqual(['Hello ', 'World']);
  });
});



describe('clipboard fragment boundaries', () => {
  it('uses document child order after moves and clips the endpoints and overlapping marks', () => {
    const ds = new DataStore();
    ds.setNodeInternal({ sid: 'root', stype: 'paragraph', content: ['a', 'emoji', 'b'] } as INode);
    // Creation order differs from the displayed order, as it does after moving blocks.
    ds.setNodeInternal({ sid: 'b', parentId: 'root', stype: 'inline-text', text: 'WXYZ', marks: [{ stype: 'italic', range: [1, 4] }] } as INode);
    ds.setNodeInternal({ sid: 'emoji', parentId: 'root', stype: 'emoji', attributes: { unicode: '🙂' } } as INode);
    ds.setNodeInternal({ sid: 'a', parentId: 'root', stype: 'inline-text', text: 'ABCD', marks: [{ stype: 'bold', range: [1, 3] }] } as INode);
    const range = { type: 'range' as const, startNodeId: 'a', startOffset: 2, endNodeId: 'b', endOffset: 2, collapsed: false };
    const copied = ds.serializeRange(range);
    expect(copied.map(node => node.text ?? node.attributes?.unicode)).toEqual(['CD', '🙂', 'WX']);
    expect(copied[0].marks?.[0].range).toEqual([0, 1]);
    expect(copied[2].marks?.[0].range).toEqual([1, 2]);
    expect(copied.every(node => !node.sid && !node.parentId)).toBe(true);
    expect(ds.getNode('a')?.marks?.[0].range).toEqual([1, 3]);
  });
  it('retains paragraph boundaries, including a selection containing only the break', () => {
    const ds = new DataStore();
    ds.setNodeInternal({ sid: 'root', stype: 'document', content: ['p1', 'p2'] } as INode);
    ds.setNodeInternal({ sid: 'p1', parentId: 'root', stype: 'paragraph', content: ['a'] } as INode);
    ds.setNodeInternal({ sid: 'p2', parentId: 'root', stype: 'paragraph', content: ['b'] } as INode);
    ds.setNodeInternal({ sid: 'a', parentId: 'p1', stype: 'inline-text', text: 'AB' } as INode);
    ds.setNodeInternal({ sid: 'b', parentId: 'p2', stype: 'inline-text', text: 'CD' } as INode);
    const copied = ds.serializeRange({ type: 'range', startNodeId: 'a', startOffset: 2, endNodeId: 'b', endOffset: 0, collapsed: false });
    expect(copied.map(node => node.stype)).toEqual(['paragraph', 'paragraph']);
    expect(copied.map(node => (node.content![0] as INode).text)).toEqual(['', '']);
  });
});
