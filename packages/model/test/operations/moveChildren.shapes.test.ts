import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * Moving children from one parent to another, in the shapes a caller reaches for.
 *
 * The payload names the parent they are being taken from, and that was believed
 * rather than checked. Naming a parent they are not in moved them anyway — and
 * the inverse, built from the name, sent them back to a parent they had never
 * been in, so undo put the document somewhere it had never been.
 *
 * Every character is accounted for in all eight shapes, which is the claim that
 * matters most; the undo is the one that was wrong.
 */
describe('moving children about', () => {
  let dataStore: DataStore; let context: any; let schema: Schema;
  beforeEach(() => {
    schema = new Schema('t', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        link: { name: 'link', group: 'inline', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: [] }
      }, marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    context = createTransactionContext(dataStore, new SelectionManager({ dataStore }), schema);
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1', 'p-2'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a', 'b', 'l-1'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'aa', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'bb', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'l-1', stype: 'link', content: ['lt'], parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'lt', stype: 'inline-text', text: 'LL', parentId: 'l-1' } as INode);
    dataStore.setNode({ sid: 'p-2', stype: 'paragraph', content: ['c'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'c', stype: 'inline-text', text: 'cc', parentId: 'doc-1' } as INode);
  });
  const run = (payload: any) =>
    globalOperationRegistry.get('moveChildren')!.execute({ type: 'moveChildren', payload } as any, context);
  const chars = () => {
    const t = (id: string): string => {
      const n = dataStore.getNode(id) as INode;
      if (!n) return '';
      if (typeof n.text === 'string') return n.text;
      return (n.content ?? []).map((c) => t(c as string)).join('');
    };
    return [...t('doc-1')].sort().join('');
  };

  const cases: [string, any][] = [
    ['one run to another paragraph', { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['a'], position: 0 }],
    ['two runs at once', { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['a', 'b'], position: 0 }],
    ['a link, which holds text', { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['l-1'], position: 0 }],
    ['into the same parent', { fromParentId: 'p-1', toParentId: 'p-1', childIds: ['a'], position: 2 }],
    ['past the end of the target', { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['a'], position: 99 }],
    ['no position given', { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['b'] }],
    ['a child that is not in the named parent', { fromParentId: 'p-2', toParentId: 'p-1', childIds: ['a'], position: 0 }],
    ['all of a parent\'s children', { fromParentId: 'p-1', toParentId: 'p-2', childIds: ['a', 'b', 'l-1'], position: 0 }]
  ];

  for (const [what, payload] of cases) {
    it(`keeps every character: ${what}`, async () => {
      const before = chars();
      try { await run(payload); } catch { return; } // a refusal is fine
      expect(chars(), `${what}: 글자가 달라졌습니다`).toBe(before);
    });
  }

  for (const [what, payload] of cases) {
    it(`undoes: ${what}`, async () => {
      const shape = (id = 'doc-1'): any => {
        const n = dataStore.getNode(id) as INode;
        if (!n) return null;
        const o: any = { stype: n.stype };
        if (typeof n.text === 'string') o.text = n.text;
        if (Array.isArray(n.content) && n.content.length) o.content = n.content.map((c) => shape(c as string));
        return o;
      };
      const before = JSON.stringify(shape());
      let result: any;
      try { result = await run(payload); } catch { return; }
      if (!result?.inverse) return;
      await globalOperationRegistry.get(result.inverse.type)!
        .execute({ type: result.inverse.type, payload: result.inverse.payload } as any, context);
      expect(JSON.stringify(shape()), `${what}: 되돌렸는데 원래대로가 아닙니다`).toBe(before);
    });
  }
});
