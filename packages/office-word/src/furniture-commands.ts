import type { Editor, Extension } from '@barocss/editor-core';
import type { INode } from '@barocss/datastore';
import { transaction } from '@barocss/model';
import { surfaceFor } from './page-setup-commands';

export type FurnitureRole = 'header' | 'footer';
export type FurnitureVariant = 'default' | 'first' | 'even';
export interface FurnitureTarget { rootId: string; surfaceId: string }
export interface FurniturePayload extends Partial<FurnitureTarget> {
  role: FurnitureRole;
  variant?: FurnitureVariant;
  action: 'create' | 'edit' | 'remove' | 'number';
  text?: string;
  alignment?: 'left' | 'center' | 'right';
  format?: string;
  start?: number;
}
export const PAGE_NUMBER_FORMATS = ['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter'] as const;
export function captureFurnitureTarget(editor: Editor): FurnitureTarget | undefined {
  let surfaceId = surfaceFor(editor, editor.selection);
  const rootId = editor.getRootId();
  // Resource text has no surface ancestor. Find the section that uses this resource.
  let node = editor.selection?.startNodeId ? editor.dataStore.getNode(editor.selection.startNodeId) : undefined;
  while (node) {
    if (node.stype === 'docHeader' || node.stype === 'docFooter') {
      const role = node.stype === 'docHeader' ? 'header' : 'footer';
      const id = node.attributes?.id;
      const root = rootId ? editor.dataStore.getNode(rootId) : undefined;
      surfaceId = root?.content?.map(String).find(sid => {
        const surface = editor.dataStore.getNode(sid);
        return surface?.stype === 'surface' && ['default', 'first', 'even'].some(variant =>
          surface.attributes?.[furnitureKey(role, variant as FurnitureVariant)] === id);
      });
      break;
    }
    node = node.parentId ? editor.dataStore.getNode(String(node.parentId)) : undefined;
  }
  return rootId && surfaceId ? { rootId, surfaceId } : undefined;
}
export function furnitureKey(role: FurnitureRole, variant: FurnitureVariant = 'default'): string {
  return variant === 'default' ? `${role}Id` : `${variant}Page${role === 'header' ? 'Header' : 'Footer'}Id`;
}
export function furnitureNode(editor: Editor, target: FurnitureTarget, role: FurnitureRole, variant: FurnitureVariant = 'default'): INode | undefined {
  const root = editor.dataStore.getNode(target.rootId);
  if (editor.getRootId() !== target.rootId || !root?.content?.includes(target.surfaceId)) return undefined;
  const id = editor.dataStore.getNode(target.surfaceId)?.attributes?.[furnitureKey(role, variant)];
  const resources = root.content.map(sid => editor.dataStore.getNode(String(sid))).find(node => node?.stype === 'resources');
  return resources?.content?.map(sid => editor.dataStore.getNode(String(sid)))
    .find(node => node?.stype === (role === 'header' ? 'docHeader' : 'docFooter') && node.attributes?.id === id);
}
function operations(editor: Editor, payload?: FurniturePayload): unknown[] | undefined {
  if (!payload || !['header', 'footer'].includes(payload.role) || !['create', 'edit', 'remove', 'number'].includes(payload.action)) return;
  if (!!payload.rootId !== !!payload.surfaceId) return;
  const target = payload.surfaceId && payload.rootId ? { surfaceId: payload.surfaceId, rootId: payload.rootId } : captureFurnitureTarget(editor);
  if (!target || target.rootId !== editor.getRootId()) return;
  const root = editor.dataStore.getNode(target.rootId);
  const surface = editor.dataStore.getNode(target.surfaceId);
  if (surface?.stype !== 'surface' || !root?.content?.includes(target.surfaceId)) return;
  const variant = payload.variant ?? 'default';
  if (!['default', 'first', 'even'].includes(variant)) return;
  const key = furnitureKey(payload.role, variant);
  const existing = furnitureNode(editor, target, payload.role, variant);
  const patch = (attrs: Record<string, unknown>) => ({ type: 'setAttrs', payload: { nodeId: target.surfaceId, attrs } });
  if (payload.action === 'remove') return surface.attributes?.[key] ? [patch({ [key]: undefined })] : undefined;
  if (payload.action === 'create' && existing) return;
  if (payload.action === 'edit' && !existing) return;
  const alignment = payload.alignment ?? 'center';
  if (!['left', 'center', 'right'].includes(alignment)) return;
  const ops: unknown[] = [];
  const attrs: Record<string, unknown> = {};
  if (variant === 'first' && surface.attributes?.titlePage !== true) attrs.titlePage = true;
  if (variant === 'even' && surface.attributes?.differentOddEven !== true) attrs.differentOddEven = true;
  const paragraph = { stype: 'paragraph', attributes: { alignment }, content: payload.action === 'number'
    ? [{ stype: 'fieldPageNumber' }] : [{ stype: 'inline-text', text: payload.text ?? '' }] };
  if (payload.action === 'number') {
    const format = payload.format ?? 'decimal';
    const start = payload.start ?? 1;
    if (!(PAGE_NUMBER_FORMATS as readonly string[]).includes(format) || !Number.isInteger(start) || start < 1 || start > 9999) return;
    attrs.pageNumberFormat = format; attrs.pageNumberStart = start;
    if (existing) {
      // Keep authored text, tabs and page-count fields. Update an existing number in place.
      const parents: string[] = [];
      const walk = (sid: string) => {
        const node = editor.dataStore.getNode(sid);
        if (node?.stype === 'paragraph' && node.content?.some(child => editor.dataStore.getNode(String(child))?.stype === 'fieldPageNumber')) parents.push(sid);
        node?.content?.forEach(child => walk(String(child)));
      };
      walk(String(existing.sid));
      if (parents.length) parents.forEach(nodeId => ops.push({ type: 'setAttrs', payload: { nodeId, attrs: { alignment } } }));
      else ops.push({ type: 'addChild', payload: { parentId: existing.sid, child: paragraph } });
    }
  }
  if (!existing) {
    const resources = root.content?.map(sid => editor.dataStore.getNode(String(sid))).find(node => node?.stype === 'resources');
    if (!resources?.sid) return;
    const id = `${payload.role}-${crypto.randomUUID()}`;
    attrs[key] = id;
    ops.push({ type: 'addChild', payload: { parentId: resources.sid, child: {
      stype: payload.role === 'header' ? 'docHeader' : 'docFooter', attributes: { id }, content: [paragraph]
    } } });
  }
  if (Object.keys(attrs).length) ops.push(patch(attrs));
  return ops;
}
export function createWordFurniture(): Extension {
  return { name: 'wordFurniture', onCreate(editor) {
    editor.registerCommand({ name: 'setPageFurniture',
      canExecute: (ed, payload?: FurniturePayload) => !!operations(ed, payload),
      execute: async (ed, payload?: FurniturePayload) => {
        const ops = operations(ed, payload);
        return ops ? (ops.length ? (await transaction(ed, ops as never).commit()).success : true) : false;
      }
    });
  } };
}
