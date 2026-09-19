import type { Editor, Extension, ModelSelection } from '@barocss/editor-core';
import { transaction, setAttrs } from '@barocss/model';
import { createStyleResolver } from '@barocss/office-text';
import { selectedBlocks } from './selected-blocks';
import { isWordTracking } from './word-commands';

export const STYLE_FORMAT_DEFAULTS = { fontFamily: 'Arial, sans-serif', fontSize: 22, color: '000000',
  bold: false, italic: false, alignment: 'left', indentLeft: 0, indentRight: 0,
  indentFirstLine: 0, indentHanging: 0, spacingBefore: 0, spacingAfter: 160,
  spacingLine: 276, spacingLineRule: 'auto' };
export type ParagraphStyleFormat = typeof STYLE_FORMAT_DEFAULTS;
export type StyleSession = { rootId: string; selection: ModelSelection; format: ParagraphStyleFormat; styleId?: string };
const formatKeys = Object.keys(STYLE_FORMAT_DEFAULTS);
const resourcesOf = (ed: Editor) => ed.dataStore.getNode(ed.getRootId()!)?.content
  ?.map(id => ed.dataStore.getNode(String(id))).find(node => node?.stype === 'resources');
export function paragraphStylesOf(ed: Editor) {
  return (resourcesOf(ed)?.content ?? []).map(id => ed.dataStore.getNode(String(id)))
    .filter(node => node?.stype === 'styleDef' && node.attributes?.type === 'paragraph')
    .map(node => ({ sid: node!.sid!, id: String(node!.attributes!.id),
      name: String(node!.attributes!.name ?? node!.attributes!.id) }));
}
const resolverOf = (ed: Editor) => createStyleResolver({ rootId: ed.getRootId()!, getNode: id => ed.dataStore.getNode(id) });
function pickFormat(value: Record<string, unknown>): ParagraphStyleFormat {
  return Object.fromEntries(formatKeys.map(key => [key, value[key] ?? STYLE_FORMAT_DEFAULTS[key as keyof ParagraphStyleFormat]])) as ParagraphStyleFormat;
}
export function paragraphStyleFormat(ed: Editor, id: string): ParagraphStyleFormat {
  const resolver = resolverOf(ed);
  return pickFormat({ ...resolver.resolveStyle(id, 'paragraph'), ...resolver.resolveStyle(id, 'character') });
}
export function captureStyleSession(ed: Editor): StyleSession | undefined {
  const at = ed.selection;
  if (at?.type !== 'range') return;
  const block = selectedBlocks(ed, { ...at, endNodeId: at.startNodeId, endOffset: at.startOffset })[0];
  if (!block || !['paragraph', 'heading'].includes(block.stype ?? '')) return;
  const resolver = resolverOf(ed);
  return { rootId: ed.getRootId()!, selection: structuredClone(at), styleId: block.attributes?.styleId as string | undefined,
    format: pickFormat({ ...resolver.resolveNode(block, 'paragraph'), ...resolver.resolveNode(block, 'character') }) };
}
export const canManageParagraphStyles = (ed: Editor) => ed.isEditable && !isWordTracking(ed);
function validFormat(value: ParagraphStyleFormat | undefined): value is ParagraphStyleFormat {
  if (!value) return false;
  return typeof value.fontFamily === 'string' && value.fontFamily.trim().length > 0 && value.fontFamily.length <= 200 &&
    /^[0-9a-f]{6}$/i.test(value.color) && typeof value.bold === 'boolean' && typeof value.italic === 'boolean' &&
    ['left', 'center', 'right', 'justify'].includes(value.alignment) && ['auto', 'exact', 'atLeast'].includes(value.spacingLineRule) &&
    ['fontSize','indentLeft','indentRight','indentFirstLine','indentHanging','spacingBefore','spacingAfter','spacingLine'].every(key =>
      typeof value[key as keyof ParagraphStyleFormat] === 'number' && Number.isFinite(value[key as keyof ParagraphStyleFormat]) &&
      Number(value[key as keyof ParagraphStyleFormat]) >= 0 && Number(value[key as keyof ParagraphStyleFormat]) <= 31680) &&
    value.fontSize >= 2 && value.fontSize <= 400 && value.spacingLine > 0;
}
type Payload = { rootId?: string; selection?: ModelSelection; id?: string; name?: string; format?: ParagraphStyleFormat };
function targets(ed: Editor, at?: ModelSelection | null) {
  if (at?.type !== 'range') return [];
  const blocks = selectedBlocks(ed, at).filter(node => ['paragraph', 'heading'].includes(node.stype ?? ''));
  const end = selectedBlocks(ed, { ...at, startNodeId: at.endNodeId, startOffset: at.endOffset })[0];
  return blocks.filter(node => !(blocks.length > 1 && at.endOffset === 0 && node.sid === end?.sid));
}
function applyOperations(ed: Editor, at: ModelSelection | null | undefined, id: string) {
  // Paragraph-level direct formatting is replaced. Inline emphasis and links remain.
  return targets(ed, at).map(node => setAttrs(node.sid!, {
    ...Object.fromEntries(formatKeys.map(key => [key, null])), styleId: id,
  }));
}
export function createParagraphStyleManagement(): Extension {
  return { name: 'wordParagraphStyleManagement', onCreate(editor) {
    for (const action of ['create', 'update', 'apply'] as const) {
      const valid = (ed: Editor, payload?: Payload) => {
        if (!payload || !canManageParagraphStyles(ed) || (payload.rootId && payload.rootId !== ed.getRootId())) return false;
        const entries = paragraphStylesOf(ed);
        if (action !== 'create' && !entries.some(entry => entry.id === payload.id)) return false;
        if (action !== 'update' && !targets(ed, payload.selection ?? ed.selection).length) return false;
        if (action === 'apply') return true;
        const name = payload.name?.trim();
        return !!name && name.length <= 80 && validFormat(payload.format) &&
          !entries.some(entry => entry.id !== (action === 'update' ? payload.id : undefined) && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      };
      editor.registerCommand({ name: `${action}ParagraphStyle`, canExecute: valid,
        execute: async (ed, payload?: Payload) => {
          if (!valid(ed, payload)) return false;
          const p = payload!;
          const id = action === 'create' ? `User-${crypto.randomUUID()}` : p.id!;
          const operations: unknown[] = [];
          if (action === 'create') {
            const resources = resourcesOf(ed); if (!resources?.sid) return false;
            operations.push({ type: 'addChild', payload: { parentId: resources.sid, child: { stype: 'styleDef',
              attributes: { ...pickFormat(p.format!), id, name: p.name!.trim(), type: 'paragraph', basedOn: 'Normal', next: id } } } });
          } else if (action === 'update') {
            const entry = paragraphStylesOf(ed).find(entry => entry.id === id)!;
            operations.push(setAttrs(entry.sid, { ...pickFormat(p.format!), name: p.name!.trim() }));
          }
          if (action !== 'update') operations.push(...applyOperations(ed, p.selection ?? ed.selection, id));
          ed.historyManager.closeGroup();
          const result = await transaction(ed, operations as never).commit();
          ed.historyManager.closeGroup();
          return result.success;
        } });
    }
  } };
}
