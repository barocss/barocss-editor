import { describe, expect, it } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore, type INode } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { getStandardSchemaDefinition, Schema } from '@barocss/schema';
import { createTransactionContext } from '../../src/create-transaction-context';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('Enter continues a checklist with an unfinished item', () => {
  it.each([0, 2, 4])('creates an unchecked item at offset %i and undo restores the completed task', async offset => {
    const schema = new Schema('task-enter', getStandardSchemaDefinition());
    const store = new DataStore(undefined, schema);
    const selection = new SelectionManager({ dataStore: store });
    const context = createTransactionContext(store, selection, schema);
    store.setNode({ sid: 'doc', stype: 'document', content: ['task'] } as INode);
    store.setNode({ sid: 'task', stype: 'taskItem', attributes: { checked: true }, parentId: 'doc', content: ['text'] } as INode);
    store.setNode({ sid: 'text', stype: 'inline-text', text: 'Ship', parentId: 'task' } as INode);
    context.selection.setCaret('text', offset);

    const result = await globalOperationRegistry.get('insertParagraph')!.execute(
      { type: 'insertParagraph', payload: {} } as never, context
    );
    if (!result || !('ok' in result)) throw new Error('Expected an operation outcome');
    expect(result.ok).toBe(true);
    const children = store.getNode('doc')!.content!;
    expect(children).toHaveLength(2);
    const createdId = children.find(id => id !== 'task');
    if (typeof createdId !== 'string') throw new Error('Expected a stored checklist item');
    const created = store.getNode(createdId)!;
    expect(created.stype).toBe('taskItem');
    expect(created.attributes?.checked).toBe(false);
    expect(store.getNode('task')!.attributes?.checked).toBe(true);
    const caret = result.selectionAfter!;
    expect(store.getNode(caret.nodeId)?.text).toBe(offset === 0 ? 'Ship' : offset === 2 ? 'ip' : '');
    expect(caret.offset).toBe(0);

    const inverse = result.inverse! as { type: string; payload: unknown };
    const undone = await globalOperationRegistry.get(inverse.type)!.execute(inverse as never, context);
    if (!undone || !('ok' in undone)) throw new Error('Expected an undo outcome');
    expect(undone.ok).toBe(true);
    expect(store.getNode('doc')!.content).toEqual(['task']);
    expect(store.getNode('task')!.attributes?.checked).toBe(true);
    expect(store.getNode('task')!.content!.map(id => typeof id === 'string' ? store.getNode(id)!.text : id.text).join('')).toBe('Ship');
  });
});
