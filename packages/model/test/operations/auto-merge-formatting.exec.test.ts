import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * What survives when two runs are joined.
 *
 * A paragraph is divided into runs by formatting, so joining two of them is
 * only safe when they carry the same formatting — otherwise the join has to
 * decide which side's formatting the merged run has, and one of them is wrong.
 *
 * `autoMergeTextNodes` walks outwards from a run joining every text node it
 * touches. What it checks before joining is the question: if it checks nothing,
 * running it on an ordinary paragraph destroys the formatting in it, and it is
 * a public operation anything may call.
 */
describe('joining runs, and what they carry', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('t', {
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold'] }
      },
      marks: { bold: { name: 'bold' } }
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  const run = async (type: string, payload: Record<string, unknown>) => {
    const op = globalOperationRegistry.get(type);
    return await op!.execute({ type, payload } as any, context);
  };

  const runsIn = (blockId: string) =>
    ((dataStore.getNode(blockId) as INode).content ?? []).map((id) => {
      const node = dataStore.getNode(id) as INode;
      return { text: node.text, marks: node.marks, attributes: node.attributes };
    });

  /** 'plain' + 'bold' + 'plain', bold carried as a mark. */
  function markedParagraph(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a', 'b', 'c'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'plain ', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'bold', parentId: 'p-1', marks: [{ stype: 'bold', range: [0, 4] }] } as any);
    dataStore.setNode({ sid: 'c', stype: 'inline-text', text: ' plain', parentId: 'p-1' } as INode);
  }

  /** The same paragraph, with the formatting carried as attributes instead. */
  function attributedParagraph(): void {
    dataStore.setNode({ sid: 'doc-1', stype: 'document', content: ['p-1'] } as INode);
    dataStore.setNode({ sid: 'p-1', stype: 'paragraph', content: ['a', 'b', 'c'], parentId: 'doc-1' } as INode);
    dataStore.setNode({ sid: 'a', stype: 'inline-text', text: 'plain ', parentId: 'p-1' } as INode);
    dataStore.setNode({ sid: 'b', stype: 'inline-text', text: 'bold', parentId: 'p-1', attributes: { bold: true } } as INode);
    dataStore.setNode({ sid: 'c', stype: 'inline-text', text: ' plain', parentId: 'p-1' } as INode);
  }

  it('carries a mark across a join, over the characters it was on', async () => {
    markedParagraph();
    await run('mergeTextNodes', { leftNodeId: 'a', rightNodeId: 'b' });

    const runs = runsIn('p-1');
    expect(runs[0].text).toBe('plain bold');
    const bold = (runs[0].marks ?? []).find((mark: any) => (mark.stype ?? mark.type) === 'bold');
    expect(bold, '굵게 표시가 사라졌습니다').toBeTruthy();
    // 'plain ' is six characters, so the bold now covers 6..10.
    expect(bold.range, '굵게 범위가 글자를 따라가지 않았습니다').toEqual([6, 10]);
  });

  it('refuses to join runs that disagree about their attributes', async () => {
    attributedParagraph();
    // Attributes belong to the node, not to a range of characters, so a join
    // has to keep one side's and drop the other's. It used to do that quietly:
    // the text still read correctly and the formatting simply was not what it
    // had been.
    await expect(run('mergeTextNodes', { leftNodeId: 'a', rightNodeId: 'b' })).rejects.toThrow(
      /different attributes/
    );
    expect(runsIn('p-1').map((r) => r.text), '거부했는데 문단이 바뀌었습니다').toEqual(['plain ', 'bold', ' plain']);
  });

  it('auto-merge sweeps a whole paragraph into one run', async () => {
    markedParagraph();
    await run('autoMergeTextNodes', { nodeId: 'b' });

    const runs = runsIn('p-1');
    expect(runs.length, '문단이 하나의 런으로 합쳐지지 않았습니다').toBe(1);
    expect(runs[0].text).toBe('plain bold plain');
    const bold = (runs[0].marks ?? []).find((mark: any) => (mark.stype ?? mark.type) === 'bold');
    expect(bold?.range, '전체를 합쳤는데 굵게가 원래 글자에 남아 있지 않습니다').toEqual([6, 10]);
  });

  it('auto-merge stops where the attributes change', async () => {
    attributedParagraph();
    await run('autoMergeTextNodes', { nodeId: 'b' });

    const runs = runsIn('p-1');
    // Three runs still: the bold one is a boundary, not a difference to be
    // quietly resolved by sweeping through it.
    expect(runs.map((r) => r.text), 'auto-merge가 서식 경계를 지나쳤습니다').toEqual(['plain ', 'bold', ' plain']);
    expect(runs[1].attributes?.bold, '서식이 사라졌습니다').toBe(true);
  });
});
