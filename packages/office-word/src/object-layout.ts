import { selectedNodeIds, type Editor, type Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { columnsOf, tableRowsOf, gridOf, tableDimensionGrid, equalColumnWidths, cellOf, childrenOf } from '@barocss/office-text';

export interface WordObjectTarget { rootId: string; nodeId: string; kind: 'table' | 'image' }
export type WordObjectChange = { width?: number; height?: number; alignment?: 'left' | 'center' | 'right'; fit?: 'content' | 'page'; placement?: 'inline' | 'left' | 'right' | 'topAndBottom';
  column?: { index: number; width: number }; distributeColumns?: boolean; measuredColumns?: number[];
  crop?: 'reset' | 'square' | 'landscape' | 'portrait'; cropPositionX?: number; cropPositionY?: number;
  alt?: string; cellMargins?: Partial<Record<'Top' | 'Bottom' | 'Left' | 'Right', number | null>>; marginScope?: 'selection' | 'table'; marginCellIds?: string[] };

export function wordMarginCells(editor: Editor, target: WordObjectTarget, scope: 'selection' | 'table') {
  const doc = { rootId: target.rootId, getNode: (id: string) => editor.dataStore.getNode(id) };
  const table = doc.getNode(target.nodeId);
  if (!table || target.kind !== 'table') return [];
  const all = tableRowsOf(doc, table).flatMap(row => childrenOf(doc, row)).filter(node => node.stype === 'bTableCell' || node.stype === 'bTableHeaderCell');
  if (scope === 'table') return all;
  const selection = editor.selection;
  const ids = selection?.type === 'range' ? [selection.startNodeId, selection.endNodeId] : selection?.type === 'cell' ? selectedNodeIds(selection) : [];
  const cells = [...new Set(ids.map(id => cellOf(doc, doc.getNode(id))?.sid).filter(Boolean))];
  if (selection?.type === 'range' && cells.length !== 1) return [];
  return all.filter(cell => cells.includes(cell.sid));
}
function marginTargets(editor: Editor, payload: WordObjectTarget & WordObjectChange) {
  const all = wordMarginCells(editor, payload, 'table');
  if (!payload.marginCellIds) return wordMarginCells(editor, payload, payload.marginScope!);
  const ids = payload.marginCellIds;
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !all.some(cell => cell.sid === id))) return [];
  if (payload.marginScope === 'table' && ids.length !== all.length) return [];
  return all.filter(cell => ids.includes(cell.sid!));
}
/** Width and height use centimetres at this UI/API boundary, twips in the document. */
export const TWIPS_PER_CM = 1440 / 2.54;

/** Shared by the selection-based controls and the independent boundary drag. */
export function wordTableGridAttributes(grid: number[]): Record<string, unknown> {
  return { grid: grid.join(','), width: grid.reduce((sum, width) => sum + width, 0), widthType: 'dxa', layout: 'fixed' };
}
export function selectedWordObject(editor: Editor): WordObjectTarget | undefined {
  const rootId = editor.getRootId();
  const sel = editor.selection;
  if (!rootId || !sel) return;
  const ids = sel.type === 'range' ? [sel.startNodeId, sel.endNodeId] : selectedNodeIds(sel);
  const targets = ids.map(id => {
    let node = editor.dataStore.getNode(id);
    for (let depth = 0; node && depth < 64; depth++) {
      if (node.sid && (node.stype === 'inline-image' || node.stype === 'bTable')) return {
        rootId, nodeId: node.sid, kind: node.stype === 'bTable' ? 'table' as const : 'image' as const
      };
      node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
    }
  });
  return targets.length && targets.every(t => t?.nodeId === targets[0]?.nodeId) ? targets[0] : undefined;
}

function attributes(editor: Editor, payload?: WordObjectTarget & WordObjectChange): Record<string, unknown> | undefined {
  if (!payload || !editor.isEditable || editor.getRootId() !== payload.rootId) return;
  const selected = selectedWordObject(editor);
  const capturedMargins = payload.cellMargins !== undefined && payload.marginCellIds !== undefined;
  if (!capturedMargins && (!selected || selected.nodeId !== payload.nodeId || selected.kind !== payload.kind)) return;
  const node = editor.dataStore.getNode(payload.nodeId)!;
  if (!node || (payload.kind === 'table' ? node.stype !== 'bTable' : node.stype !== 'inline-image')) return;
  if (capturedMargins) {
    let ancestor: typeof node | undefined = node;
    for (let depth = 0; ancestor && ancestor.sid !== payload.rootId && depth < 128; depth++) ancestor = ancestor.parentId ? editor.dataStore.getNode(ancestor.parentId) : undefined;
    if (ancestor?.sid !== payload.rootId) return;
  }
  const out: Record<string, unknown> = {};
  if (payload.cellMargins !== undefined) {
    if (payload.kind !== 'table' || !['selection', 'table'].includes(payload.marginScope ?? '')
      || !marginTargets(editor, payload).length
      || ['width', 'height', 'alignment', 'fit', 'placement', 'column', 'distributeColumns', 'crop', 'cropPositionX', 'cropPositionY', 'alt'].some(key => payload[key as keyof WordObjectChange] !== undefined)) return;
    for (const [side, value] of Object.entries(payload.cellMargins)) {
      if (!['Top', 'Bottom', 'Left', 'Right'].includes(side) || (value !== null && (!Number.isFinite(value) || value < 0 || value > 5))) return;
      out[`margin${side}`] = value === null ? null : Math.round(value * TWIPS_PER_CM);
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (payload.marginScope !== undefined || payload.marginCellIds !== undefined) return;
  for (const key of ['width', 'height'] as const) {
    const value = payload[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0.1 || value > 55 || (key === 'height' && payload.kind === 'table')) return;
    out[key] = Math.round(value * TWIPS_PER_CM);
  }
  if (payload.kind === 'table') {
    if (payload.alt !== undefined) return;
    if (payload.placement !== undefined || payload.crop !== undefined || payload.cropPositionX !== undefined || payload.cropPositionY !== undefined) return;
    if (payload.column || payload.distributeColumns) {
      if (payload.width !== undefined || payload.fit !== undefined || (payload.column && payload.distributeColumns)) return;
      const doc = { rootId: payload.rootId, getNode: (id: string) => editor.dataStore.getNode(id) };
      const count = columnsOf(doc, tableRowsOf(doc, node));
      const measured = (payload.measuredColumns ?? []).map(n => n * TWIPS_PER_CM);
      let grid = tableDimensionGrid(count, gridOf(node.attributes ?? {}), measured,
        node.attributes?.widthType === 'dxa' ? Number(node.attributes.width) : count * 1800);
      if (!grid.length) return;
      if (payload.column) {
        const { index, width } = payload.column;
        if (!Number.isInteger(index) || index < 0 || index >= count || !Number.isFinite(width) || width < 0.1 || width > 55) return;
        grid[index] = Math.round(width * TWIPS_PER_CM);
      } else grid = equalColumnWidths(grid.reduce((a, b) => a + b, 0), count);
      Object.assign(out, wordTableGridAttributes(grid));
    }
    if (payload.alignment !== undefined) {
      if (!['left', 'center', 'right'].includes(payload.alignment)) return;
      out.alignment = payload.alignment;
      // A left indent would override centred/right margins. Null clears it.
      out.indent = null;
    }
    if (payload.fit !== undefined) {
      if (!['content', 'page'].includes(payload.fit) || payload.width !== undefined) return;
      Object.assign(out, { width: payload.fit === 'page' ? 5000 : null,
        widthType: payload.fit === 'page' ? 'pct' : 'auto', layout: 'auto', grid: '' });
    } else if (payload.width !== undefined) {
      Object.assign(out, { widthType: 'dxa', layout: 'fixed' });
      const grid = String(node.attributes?.grid ?? '').split(',').map(Number);
      if (grid.length && grid.every(n => Number.isFinite(n) && n > 0)) {
        const total = grid.reduce((a, b) => a + b, 0);
        out.grid = grid.map(n => Math.max(1, Math.round(n / total * Number(out.width)))).join(',');
      }
    }
  } else {
    if (payload.alt !== undefined) {
      if (typeof payload.alt !== 'string' || payload.alt.length > 4000) return;
      out.alt = payload.alt;
    }
    if (payload.alignment !== undefined || payload.fit !== undefined || payload.column || payload.distributeColumns) return;
    for (const key of ['cropPositionX', 'cropPositionY'] as const) {
      if (payload[key] === undefined) continue;
      if (!Number.isFinite(payload[key]) || payload[key]! < 0 || payload[key]! > 100 || (node.attributes?.cropMode !== 'cover' && !payload.crop)) return;
      out[key] = payload[key];
    }
    if (payload.crop !== undefined) {
      if (!['reset', 'square', 'landscape', 'portrait'].includes(payload.crop)) return;
      const a = node.attributes ?? {};
      const w = Number(a.cropOriginalWidth ?? a.width ?? out.width);
      const h = Number(a.cropOriginalHeight ?? a.height ?? out.height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
      if (payload.crop === 'reset') Object.assign(out, { width: w, height: h, cropMode: null, cropOriginalWidth: null, cropOriginalHeight: null, cropPositionX: null, cropPositionY: null });
      else {
        const ratio = payload.crop === 'square' ? 1 : payload.crop === 'landscape' ? 16 / 9 : 3 / 4;
        Object.assign(out, { width: Math.round(Math.min(w, h * ratio)), height: Math.round(Math.min(h, w / ratio)),
          cropMode: 'cover', cropOriginalWidth: w, cropOriginalHeight: h,
          cropPositionX: payload.cropPositionX ?? 50, cropPositionY: payload.cropPositionY ?? 50 });
      }
    }
    if (payload.placement !== undefined) {
      if (!['inline', 'left', 'right', 'topAndBottom'].includes(payload.placement)) return;
      Object.assign(out, { wrap: ['left', 'right'].includes(payload.placement) ? 'square' : payload.placement,
        side: payload.placement === 'left' ? 'left' : 'right' });
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function createWordObjectLayout(): Extension {
  return { name: 'wordObjectLayout', onCreate(editor) {
    editor.registerCommand({ name: 'setWordObjectLayout',
      canExecute: (ed, payload) => !!attributes(ed, payload as never),
      execute: async (ed, payload) => {
        const attrs = attributes(ed, payload as never);
        if (!attrs) return false;
        const change = payload as WordObjectTarget & WordObjectChange;
        const ids = change.cellMargins ? marginTargets(ed, change).map(cell => cell.sid) : [change.nodeId];
        const result = await transaction(ed, ids.map(nodeId => ({ type: 'setAttrs', payload: { nodeId, attrs } })) as never).commit();
        return result.success;
      }
    });
  } };
}
