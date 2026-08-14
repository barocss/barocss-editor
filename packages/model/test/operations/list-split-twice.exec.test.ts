import { describe, it, expect } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Enter pressed twice in the same bullet, and undone twice.
 *
 * A single split is exact and so is a single undo, which is what the roster and
 * the sequences prove. What they cannot see is what the *second* split does to
 * the first one's inverse — and the answer was that undoing a split at the end
 * of an item folded a blank item back in rather than taking it away, leaving its
 * empty run behind. The item read the same and had one child more than it began
 * with, which moved the seam the next undo counts to, and 'bullet' split twice
 * came back as 'bu' and 'llet': two runs saying what one had said.
 *
 * Both offsets of each pair matter, so all five are here: a cut then a cut, in
 * either order, two cuts at the same place, and the two ends of the item, which
 * are the positions that open a blank one.
 */
describe('a bullet split twice', () => {
  const build = () => {
    const schema = new Schema('t', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        list: { name: 'list', group: 'block', content: 'listItem+' },
        listItem: { name: 'listItem', group: 'block', content: 'block+' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      },
      marks: {}
    });
    const dataStore = new DataStore(undefined, schema);
    const context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['list-1'] } as INode);
    dataStore.setNode({ sid: 'list-1', stype: 'list', content: ['li-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'li-1', stype: 'listItem', content: ['lp-1'], parentId: 'list-1' } as INode);
    dataStore.setNode({ sid: 'lp-1', stype: 'paragraph', content: ['lr-1'], parentId: 'li-1' } as INode);
    dataStore.setNode({ sid: 'lr-1', stype: 'inline-text', text: 'bullet', parentId: 'lp-1' } as INode);
    return { dataStore, context };
  };
  const shape = (dataStore: DataStore, id = 'doc-1'): any => {
    const n = dataStore.getNode(id) as INode;
    if (!n) return null;
    const o: any = { stype: n.stype };
    if (typeof n.text === 'string') o.text = n.text;
    if (Array.isArray(n.content) && n.content.length) o.content = n.content.map((c) => shape(dataStore, c as string));
    return o;
  };
  const items = (dataStore: DataStore) => {
    const t = (id: string): string => {
      const n = dataStore.getNode(id) as INode;
      if (!n) return '';
      if (typeof n.text === 'string') return n.text;
      return (n.content ?? []).map((c) => t(c as string)).join('');
    };
    return ((dataStore.getNode('list-1') as INode).content ?? []).map(t);
  };

  for (const pair of [[3, 1], [1, 3], [2, 2], [0, 3], [6, 2]] as const) {
    it(`splits at ${pair[0]} then ${pair[1]} and undoes both`, async () => {
      const { dataStore, context } = build();
      const op = globalOperationRegistry.get('splitListItem')!;
      const before = JSON.stringify(shape(dataStore));
      const invs: any[] = [];

      for (const offset of pair) {
        const runs = (() => {
          const found: string[] = [];
          const walk = (id: string) => {
            const n = dataStore.getNode(id) as INode;
            if (!n) return;
            if (typeof n.text === 'string') { found.push(id); return; }
            (n.content ?? []).forEach((c) => walk(c as string));
          };
          walk('list-1');
          return found;
        })();
        const target = runs.find((r) => ((dataStore.getNode(r) as INode).text ?? '').length >= offset) ?? runs[0];
        context.selection.setCaret(target, Math.min(offset, ((dataStore.getNode(target) as INode).text ?? '').length));
        const r: any = await op.execute({ type: 'splitListItem', payload: {} } as any, context);
          if (r.inverse) invs.unshift(r.inverse);
      }

      for (const inv of invs) {
        try {
          await globalOperationRegistry.get(inv.type)!.execute({ type: inv.type, payload: inv.payload } as any, context);
        } catch (error) {
          throw new Error(`되돌리기 ${inv.type} 이(가) 던졌습니다: ${(error as Error).message}`);
        }
      }
      const after = JSON.stringify(shape(dataStore), null, 1);
      const bf = JSON.stringify(JSON.parse(before), null, 1);
      expect(after, `두 번 쪼갠 뒤 되돌렸는데 원래 문서가 아닙니다\n항목: ${JSON.stringify(items(dataStore))}`).toBe(bf);
    });
  }
});
