import type { Editor, ModelSelection } from '@barocss/editor-core';
import { addChild, removeChild } from '@barocss/model';
import { deleteRangeOperations } from './range-delete';

/** Enter finishes the unique title and continues in the callout's body. */
export function enterCalloutTitle(editor: Editor, selection: ModelSelection): unknown[] | undefined {
  if (selection.type !== 'range') return;
  const store = editor.dataStore;
  const start = store.getNode(selection.startNodeId);
  const end = store.getNode(selection.endNodeId);
  const title = start?.parentId ? store.getNode(start.parentId) : undefined;
  if (title?.stype !== 'calloutTitle' || !title.parentId) return;
  const callout = store.getNode(title.parentId);
  if (callout?.stype !== 'callout') return;
  if (end?.parentId !== title.sid) {
    // Replacing a selection across the title/body boundary must preserve both
    // structural roles and continue at the remaining body text.
    let ancestor = end;
    const visited = new Set<string>();
    while (ancestor?.parentId && ancestor.parentId !== callout.sid) {
      if (visited.has(ancestor.parentId)) return;
      visited.add(ancestor.parentId);
      ancestor = store.getNode(ancestor.parentId);
    }
    if (!selection.collapsed && ancestor?.parentId === callout.sid && typeof end?.text === 'string') {
      return [...deleteRangeOperations(selection, editor), {
        type: 'setSelection', payload: {
          anchor: { nodeId: end.sid, offset: 0 }, head: { nodeId: end.sid, offset: 0 }
        }
      }];
    }
    return;
  }
  const ids = (title.content ?? []).filter((id): id is string => typeof id === 'string');
  const startIndex = ids.indexOf(selection.startNodeId);
  const endIndex = ids.indexOf(selection.endNodeId);
  if (startIndex < 0 || endIndex < startIndex || typeof start?.text !== 'string' || typeof end?.text !== 'string') return;

  const clone = (id: string): Record<string, unknown> => {
    const node = store.getNode(id)!;
    return {
      stype: node.stype,
      ...(node.text !== undefined ? { text: node.text } : {}),
      ...(node.attributes ? { attributes: { ...node.attributes } } : {}),
      ...(node.marks ? { marks: JSON.parse(JSON.stringify(node.marks)) } : {}),
      ...(node.content?.length ? { content: node.content.filter((child): child is string => typeof child === 'string').map(clone) } : {})
    };
  };
  const tail = end.text.slice(selection.endOffset ?? 0);
  const tailNode: Record<string, unknown> = { ...clone(selection.endNodeId), text: tail };
  if (Array.isArray(tailNode.marks)) {
    const offset = selection.endOffset ?? 0;
    tailNode.marks = tailNode.marks.flatMap((mark: Record<string, unknown>) => {
      if (!Array.isArray(mark.range)) return [mark];
      const from = Math.max(0, Number(mark.range[0]) - offset);
      const to = Math.min(tail.length, Number(mark.range[1]) - offset);
      return to > from ? [{ ...mark, range: [from, to] }] : [];
    });
  }
  const suffix = [
    ...(tail ? [tailNode] : []),
    ...ids.slice(endIndex + 1).map(clone)
  ];
  const firstText = (id: string): string | undefined => {
    const node = store.getNode(id);
    if (typeof node?.text === 'string') return id;
    for (const child of node?.content ?? []) {
      if (typeof child !== 'string') continue;
      const found = firstText(child);
      if (found) return found;
    }
  };
  const body = (callout.content ?? []).find(id => typeof id === 'string' && id !== title.sid);
  const bodyText = typeof body === 'string' ? firstText(body) : undefined;
  const ops: unknown[] = [];
  if (!selection.collapsed || suffix.length) {
    // Trim the title in place and copy only the suffix into a paragraph. Each
    // operation retains its inverse, so undo restores marks and original runs.
    if ((selection.startOffset ?? 0) < start.text.length) ops.push({
      type: 'deleteTextRange', payload: { nodeId: start.sid, start: selection.startOffset ?? 0, end: start.text.length }
    });
    for (const id of ids.slice(startIndex + 1)) ops.push(removeChild(title.sid!, id));
  }
  if (suffix.length || !bodyText) {
    // Inline atoms are valid content, but the editor needs a text run for typing.
    if (suffix.length && typeof suffix[0].text !== 'string') suffix.unshift({ stype: 'inline-text', text: '' });
    ops.push(addChild(callout.sid!, {
      stype: 'paragraph', content: suffix.length ? suffix : [{ stype: 'inline-text', text: '' }]
    } as never, 1));
  } else {
    ops.push({ type: 'setSelection', payload: { anchor: { nodeId: bodyText, offset: 0 }, head: { nodeId: bodyText, offset: 0 } } });
  }
  return ops;
}
