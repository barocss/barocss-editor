import type { Editor } from '@barocss/editor-core';
import { transaction, moveNode, setAttrs, replaceText } from '@barocss/model';
import { define, element, slot } from '@barocss/dsl';

export function proseColumnDefinitions(blocks: string) {
  return {
    proseColumns: { name: 'proseColumns', group: 'block', content: 'proseColumn{2,4}' },
    proseColumn: { name: 'proseColumn', content: `(${blocks})+`, attrs: { weight: { type: 'number', default: 1, validator: (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0.2 && v <= 5 } } }
  };
}
export function registerColumnRenderers() {
  define('proseColumns', element('div', { className: 'ot-columns', 'data-prose-columns': (n: any) => n.sid }, [slot('content')]));
  define('proseColumn', element('div', { className: 'ot-column', 'data-prose-column': (n: any) => n.sid, style: (n: any) => ({ flex: `${n.attributes?.weight ?? 1} 1 0%`, minWidth: '0' }) }, [slot('content'), element('span', { 'data-column-resize': 'true', 'data-bc-chrome': 'true', contenteditable: 'false', role: 'separator', 'aria-label': '컬럼 너비 조절', 'aria-orientation': 'vertical' }, [])]));
}
export function registerColumnCommands(editor: Editor) {
  const store = editor.dataStore;
  const empty = () => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] });
  const add = (parentId: string, children: unknown[], position?: number) => ({ type: 'addChild', payload: { parentId, children, position } });
  const remove = (parentId: string, childId: string) => ({ type: 'removeChild', payload: { parentId, childId } });
  const group = (id?: string) => { const n = id ? store.getNode(id) : undefined; return n?.stype === 'proseColumns' ? n : undefined; };
  const register = (name: string, plan: (p: any) => any[] | undefined) => editor.registerCommand({ name,
    canExecute: (_ed, p) => editor.isEditable && !!plan(p ?? {}),
    execute: async (_ed, p) => { if (!editor.isEditable) return false; const ops = plan(p ?? {}); return !!ops && (await transaction(editor, ops).commit()).success; }
  });
  for (const count of [2, 3, 4]) register(`insertColumns${count}`, p => {
    const range = editor.selection;
    if (!range || range.type !== 'range' || range.startNodeId !== range.endNodeId) return;
    const run = store.getNode(range.startNodeId); let block = run;
    while (block?.parentId && !['note', 'richText'].includes(String(store.getNode(block.parentId)?.stype))) block = store.getNode(block.parentId);
    if (!block?.parentId || !run || typeof run.text !== 'string') return;
    // No layouts inside existing columns or other nested block containers.
    if (block.stype === 'proseColumns' || run.parentId !== block.sid) return;
    const caret = store.generateId();
    const columns = Array.from({ length: count }, (_, i) => ({ stype: 'proseColumn', content: [{ stype: 'paragraph', content: [{ ...(i === 0 ? { sid: caret } : {}), stype: 'inline-text', text: '' }] }] }));
    const ops: any[] = [];
    const trigger = p.stripSlash && run.text.slice(0, range.startOffset).match(/\/[^\s/]*$/);
    if (trigger) ops.push(replaceText(run.sid!, range.startOffset - trigger[0].length, run.sid!, range.startOffset, ''));
    ops.push(add(block.parentId, [{ stype: 'proseColumns', content: columns }], store.getNode(block.parentId)!.content!.indexOf(block.sid!) + 1));
    ops.push({ type: 'setSelection', payload: { anchor: { nodeId: caret, offset: 0 }, head: { nodeId: caret, offset: 0 } } });
    return ops;
  });
  register('setColumnCount', p => {
    const n = group(p.nodeId); if (!n || !Number.isInteger(p.count) || p.count < 2 || p.count > 4) return;
    const ids = n.content as string[]; const ops: any[] = [];
    if (p.count > ids.length) ops.push(add(n.sid!, Array.from({ length: p.count - ids.length }, () => ({ stype: 'proseColumn', content: [empty()] }))));
    for (let i = p.count; i < ids.length; i++) {
      for (const child of store.getNode(ids[i])!.content as string[]) ops.push(moveNode(child, ids[p.count - 1]));
      ops.push(add(ids[i], [empty()]));
      ops.push(remove(n.sid!, ids[i]));
    }
    return ops.length ? ops : undefined;
  });
  register('flattenColumns', p => {
    const n = group(p.nodeId); if (!n?.parentId) return;
    let at = store.getNode(n.parentId)!.content!.indexOf(n.sid!);
    const ops: any[] = [];
    for (const col of n.content as string[]) {
      for (const child of store.getNode(col)!.content as string[]) ops.push(moveNode(child, n.parentId, at++));
      ops.push(add(col, [empty()]));
    }
    ops.push(remove(n.parentId, n.sid!)); return ops;
  });
  register('setColumnWeight', p => {
    if (store.getNode(p.nodeId)?.stype !== 'proseColumn' || typeof p.weight !== 'number' || !Number.isFinite(p.weight) || p.weight < 0.2 || p.weight > 5) return;
    return [setAttrs(p.nodeId, { weight: p.weight } as never)];
  });
  register('moveToColumn', p => {
    const block = store.getNode(p.nodeId), target = store.getNode(p.columnId);
    const parent = block?.parentId ? store.getNode(block.parentId) : undefined;
    if (!block || !parent || target?.stype !== 'proseColumn' || parent.sid === target.sid || !['note', 'richText', 'proseColumn'].includes(String(parent.stype)) || ['proseColumns', 'resources'].includes(String(block.stype))) return;
    if (!store.getActiveSchema()?.validateContent('proseColumn', [block] as never).valid) return;
    const ops: any[] = [];
    if (parent.stype === 'proseColumn' && parent.content?.length === 1) ops.push(add(parent.sid!, [empty()]));
    ops.push(moveNode(block.sid!, target.sid!)); return ops;
  });
}
