import type { Editor, Extension, ModelSelection } from '@barocss/editor-core';
import { defineOperation, resolveCaret, splitBlockAtCaret, transaction, type TransactionContext } from '@barocss/model';
import { blockAt } from './block-placement';

function sectionCaret(store: any, schema: any, selection: ModelSelection | null | undefined) {
  if (!selection || selection.type !== 'range' || selection.startNodeId !== selection.endNodeId || selection.startOffset !== selection.endOffset) return;
  const where = resolveCaret(store, schema, selection);
  if (!where || !['paragraph', 'heading'].includes(store.getNode(where.block.sid)?.stype)) return;
  const surface = store.getNode(store.getNode(where.block.sid)?.parentId);
  const root = surface?.parentId && store.getNode(surface.parentId);
  return surface?.stype === 'surface' && root?.stype === 'document' ? { where, surface, root } : undefined;
}

defineOperation('wordSectionBreakAtCaret', async (_op: unknown, context: TransactionContext) => {
  const store = context.dataStore;
  const here = sectionCaret(store, context.schema, context.selection.current);
  if (!here) throw new Error('A section break requires a body paragraph caret.');
  const { where, surface, root } = here;
  const cut = splitBlockAtCaret(store, where, 'wordSectionBreakAtCaret');
  const inverse: unknown[] = [];
  let nextBlock: string;
  let caret: string;
  if (cut.at === 'inside') {
    nextBlock = cut.newBlockId; caret = cut.firstTextNodeId!;
    inverse.push({ type: 'mergeBlockNodes', payload: { leftNodeId: where.block.sid, rightNodeId: nextBlock, tidySeam: cut.cutSomething } });
  } else if (cut.at === 'start') {
    nextBlock = where.block.sid; caret = where.textNodeId;
  } else {
    const index = store.getNode(surface.sid)!.content!.indexOf(where.block.sid);
    nextBlock = store.content.addChild(surface.sid, { stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] } as never, index + 1);
    caret = String(store.getNode(nextBlock)!.content![0]);
    inverse.push({ type: 'removeChild', payload: { parentId: surface.sid, childId: nextBlock } });
  }
  const children = [...store.getNode(surface.sid)!.content!].map(String);
  const start = children.indexOf(nextBlock);
  const moved = children.slice(start);
  const attrs = { ...surface.attributes, sectionStart: 'nextPage' };
  const next = store.content.addChild(root.sid, { stype: 'surface', attributes: attrs, content: [] } as never, root.content.indexOf(surface.sid) + 1);
  moved.forEach((sid, index) => store.content.moveNode(sid, next, index));
  // A section must always retain a place to type, including a break at its first character.
  let placeholder: string | undefined;
  if (start === 0) placeholder = store.content.addChild(surface.sid, { stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] } as never);
  return { ok: true, selectionAfter: { nodeId: caret, offset: 0 }, inverse: { type: 'batch', payload: { operations: [
    ...(placeholder ? [{ type: 'removeChild', payload: { parentId: surface.sid, childId: placeholder } }] : []),
    ...moved.map((nodeId, index) => ({ type: 'moveNode', payload: { nodeId, newParentId: surface.sid, position: start + index } })),
    { type: 'removeChild', payload: { parentId: root.sid, childId: next } }, ...inverse
  ] } } };
});

export interface TocSession { rootId: string; surfaceId: string; blockId: string; tocId?: string }
export interface TocSettings { levels: string; scope: 'document' | 'section'; showPageNumbers: boolean; useHyperlinks: boolean; leader: 'dot' | 'none'; caption?: string }
export function captureTocSession(editor: Editor, kind: 'headings' | 'captions' = 'headings'): TocSession | undefined {
  const rootId = editor.getRootId();
  const block = blockAt(editor.dataStore, editor.selection);
  if (!rootId || !block || editor.dataStore.getNode(block.parentId)?.stype !== 'surface') return;
  const content = editor.dataStore.getNode(block.parentId)?.content ?? [];
  const tocId = content.map(String).find(id => {
    const node = editor.dataStore.getNode(id);
    return node?.stype === 'tableOfContents' && Boolean(node.attributes?.caption) === (kind === 'captions');
  });
  return { rootId, surfaceId: block.parentId, blockId: block.sid, tocId };
}
function tocOperations(editor: Editor, payload?: TocSession & { settings: TocSettings; action?: 'insert' | 'update' | 'remove' }) {
  if (!payload || editor.getRootId() !== payload.rootId) return;
  const { settings, surfaceId, blockId, tocId } = payload;
  const root = editor.dataStore.getNode(payload.rootId);
  const surface = editor.dataStore.getNode(surfaceId);
  if (!root?.content?.includes(surfaceId) || surface?.stype !== 'surface' || !surface.content?.includes(blockId)) return;
  const action = payload.action ?? 'insert';
  if (action !== 'insert' && (!tocId || !surface.content.includes(tocId) || editor.dataStore.getNode(tocId)?.stype !== 'tableOfContents')) return;
  if (action === 'remove') return [{ type: 'removeChild', payload: { parentId: surfaceId, childId: tocId } }];
  if (!settings || !/^1-[1-6]$/.test(settings.levels) || !['document', 'section'].includes(settings.scope) || !['dot', 'none'].includes(settings.leader) || typeof settings.showPageNumbers !== 'boolean' || typeof settings.useHyperlinks !== 'boolean') return;
  if (settings.caption !== undefined && !['Figure', 'Table', 'Equation'].includes(settings.caption)) return;
  const attrs = { levels: settings.levels, scope: settings.scope, showPageNumbers: settings.showPageNumbers, useHyperlinks: settings.useHyperlinks, leader: settings.leader, caption: settings.caption ?? null };
  if (action === 'update') return [{ type: 'setAttrs', payload: { nodeId: tocId, attrs } }];
  if (action !== 'insert') return;
  return [{ type: 'addChild', payload: { parentId: surfaceId, position: surface.content.indexOf(blockId), child: { stype: 'tableOfContents', attributes: attrs, content: [] } } }];
}
export function createWordStructure(): Extension {
  return { name: 'wordStructure', onCreate(editor) {
    editor.registerCommand({ name: 'insertSectionBreak',
      canExecute: ed => !!sectionCaret(ed.dataStore, ed.dataStore.getActiveSchema(), ed.selection),
      execute: async ed => {
        if (!sectionCaret(ed.dataStore, ed.dataStore.getActiveSchema(), ed.selection)) return false;
        return (await transaction(ed, [{ type: 'wordSectionBreakAtCaret', payload: {} }] as never, { applySelectionToView: true }).commit()).success;
      }
    });
    editor.registerCommand({ name: 'setTableOfContents', canExecute: (ed, payload) => !!tocOperations(ed, payload as never),
      execute: async (ed, payload) => { const ops = tocOperations(ed, payload as never); return ops ? (await transaction(ed, ops as never).commit()).success : false; }
    });
  } };
}
