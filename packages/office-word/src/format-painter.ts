import type { Editor, Extension, ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { characterFormatAttrs, createStyleResolver } from '@barocss/office-text';
import { recordFormatChange, type RunMark } from './revision-record';
import type { CommentAuthor } from './comment-commands';
import { isWordTracking } from './word-commands';
import { selectedBlocks } from './selected-blocks';

type PaintMark = { stype: string; attrs?: Record<string, unknown> };
export type WordFormatSample = { format: Record<string, unknown>; marks: PaintMark[];
  paragraph?: Record<string, unknown>; includeParagraph?: boolean };
const PARAGRAPH_DEFAULTS = { alignment: 'left', indentLeft: 0, indentRight: 0, indentFirstLine: 0, indentHanging: 0,
  mirrorIndents: false, spacingBefore: 0, spacingAfter: 0, spacingLine: 240, spacingLineRule: 'auto', contextualSpacing: false };
const PARAGRAPH_KEYS = new Set(Object.keys(PARAGRAPH_DEFAULTS));
const PAINT_MARKS = new Set(['bold', 'italic', 'underline', 'strikethrough', 'strikeThrough', 'subscript', 'superscript',
  'smallCaps', 'highlight', 'code', 'fontFamily', 'fontSize', 'fontColor', 'bgColor', 'charStyle']);
const FORMAT_KEYS = new Set(Object.keys(characterFormatAttrs()).filter(key => key !== 'styleId'));
const RESET = { bold: false, italic: false, underline: 'none', strike: false, doubleStrike: false,
  smallCaps: false, allCaps: false, color: '000000', highlight: 'transparent', spacing: 0, position: 0 };

export function captureWordFormat(editor: Editor, at = editor.selection): WordFormatSample | undefined {
  if (at?.type !== 'range') return;
  const node = editor.dataStore.getNode(at.startNodeId);
  if (!node || typeof node.text !== 'string' || !node.text.length) return;
  const styles = createStyleResolver({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
  const block = selectedBlocks(editor, { ...at, endNodeId: at.startNodeId, endOffset: at.startOffset })[0];
  const format: Record<string, unknown> = { ...RESET, ...(block ? styles.resolveNode(block, 'character') : {}) };
  for (const [key, value] of Object.entries(node.attributes ?? {})) if (FORMAT_KEYS.has(key) && value !== undefined) format[key] = value;
  const offset = Math.min(at.startOffset, node.text.length - 1);
  const marks = (node.marks ?? []).filter(mark => {
    const [start, end] = mark.range ?? [0, node.text!.length];
    return PAINT_MARKS.has(mark.stype) && start <= offset && offset < end;
  });
  for (const mark of marks) if (mark.stype === 'charStyle' && typeof mark.attrs?.styleId === 'string') {
    Object.assign(format, styles.resolveStyle(mark.attrs.styleId, 'character'));
  }
  const resolved = block ? styles.resolveNode(block, 'paragraph') : {};
  const paragraph = Object.fromEntries(Object.entries({ ...PARAGRAPH_DEFAULTS, ...resolved }).filter(([key]) => PARAGRAPH_KEYS.has(key)));
  return structuredClone({ format, paragraph, marks: marks.filter(mark => mark.stype !== 'charStyle').map(({ stype, attrs }) => ({ stype, attrs })) });
}

export function createWordFormatPainter(author: CommentAuthor): Extension {
  return {
    name: 'wordFormatPainter', priority: 50,
    onCreate(editor) {
      const valid = (ed: Editor, payload?: { sample?: WordFormatSample; selection?: ModelSelection }) => {
        const at = payload?.selection ?? ed.selection;
        return ed.isEditable && !!payload?.sample?.format && typeof payload.sample.format === 'object' && Array.isArray(payload.sample.marks) && !!at && at.type === 'range' &&
          (at.startNodeId !== at.endNodeId || at.startOffset !== at.endOffset || !!(payload.sample.includeParagraph && payload.sample.paragraph)) &&
          typeof ed.dataStore.getNode(at.startNodeId)?.text === 'string' && typeof ed.dataStore.getNode(at.endNodeId)?.text === 'string';
      };
      editor.registerCommand({
        name: 'applyCopiedFormat', canExecute: valid,
        execute: async (ed, payload?: { sample?: WordFormatSample; selection?: ModelSelection }) => {
          if (!valid(ed, payload)) return false;
          const at = payload?.selection ?? ed.selection!;
          const sample = payload!.sample!;
          const collapsed = at.startNodeId === at.endNodeId && at.startOffset === at.endOffset;
          const root = ed.dataStore.getNode(ed.getRootId()!);
          const resources = root?.content?.map(id => ed.dataStore.getNode(String(id))).find(node => node?.stype === 'resources');
          if (!resources?.sid) return false;
          const format = Object.fromEntries(Object.entries(sample.format).filter(([key]) => FORMAT_KEYS.has(key)));
          const styleId = `Paint-${crypto.randomUUID()}`;
          const operations: unknown[] = collapsed ? [] : [{ type: 'addChild', payload: { parentId: resources.sid,
            child: { stype: 'styleDef', attributes: { ...format, id: styleId, name: 'Copied character format', type: 'character' } } } }];
          const paragraphChanges: { sid: string; attributes: Record<string, unknown>; runId: string }[] = [];
          if (sample.includeParagraph && sample.paragraph) {
            const attrs = Object.fromEntries(Object.entries(sample.paragraph).filter(([key]) => PARAGRAPH_KEYS.has(key)));
            const endBlock = selectedBlocks(ed, { ...at, startNodeId: at.endNodeId, startOffset: at.endOffset })[0];
            const blocks = selectedBlocks(ed, at).filter(block => ['paragraph', 'heading'].includes(block.stype ?? ''));
            for (const block of blocks) {
              if (blocks.length > 1 && at.endOffset === 0 && block.sid === endBlock?.sid) continue;
              const changed = Object.entries(attrs).some(([key, value]) => block.attributes?.[key] !== value);
              if (!changed) continue;
              const firstText = (id: string, depth = 0): string | undefined => {
                if (depth > 64) return;
                const node = ed.dataStore.getNode(id);
                if (typeof node?.text === 'string' && node.text.length > 0) return id;
                for (const child of node?.content ?? []) {
                  const found = firstText(String(child), depth + 1);
                  if (found) return found;
                }
              };
              const runId = firstText(block.sid!);
              // A tracked paragraph change needs text to anchor its review item.
              if (isWordTracking(ed) && !runId) return false;
              operations.push({ type: 'setAttrs', payload: { nodeId: block.sid, attrs } });
              if (isWordTracking(ed)) paragraphChanges.push({ sid: block.sid!, runId: runId!,
                attributes: Object.fromEntries(Object.keys(attrs).map(key => [key, block.attributes?.[key] ?? null])) });
            }
          }
          for (const id of ed.dataStore.createRangeIterator(at.startNodeId, at.endNodeId, { includeStart: true, includeEnd: true })) {
            const node = ed.dataStore.getNode(id);
            if (typeof node?.text !== 'string') continue;
            const start = id === at.startNodeId ? at.startOffset : 0;
            const end = id === at.endNodeId ? at.endOffset : node.text.length;
            if (start >= end) continue;
            const before = structuredClone(node.marks ?? []);
            const marks: RunMark[] = before.flatMap(mark => {
              if (!PAINT_MARKS.has(mark.stype)) return [{ ...mark, range: mark.range ?? [0, node.text!.length] } as RunMark];
              const [from, to] = mark.range ?? [0, node.text!.length];
              if (to <= start || from >= end) return [{ ...mark, range: [from, to] } as RunMark];
              const kept: RunMark[] = [];
              if (from < start) kept.push({ ...mark, range: [from, start] } as RunMark);
              if (to > end) kept.push({ ...mark, range: [end, to] } as RunMark);
              return kept;
            });
            marks.push({ stype: 'charStyle', attrs: { styleId }, range: [start, end] });
            for (const mark of sample.marks) if (PAINT_MARKS.has(mark.stype) && mark.stype !== 'charStyle') {
              marks.push({ ...structuredClone(mark), attrs: structuredClone(mark.attrs ?? {}), range: [start, end] });
            }
            const revision = isWordTracking(ed) ? recordFormatChange({ sid: id, start, end, marks },
              { attributes: node.attributes, marks: before as RunMark[] },
              { author: author.name, date: author.date(), nextId: () => `format-${crypto.randomUUID()}` }) : [];
            operations.push(...(revision.length ? revision : [{ type: 'setMarks', payload: { nodeId: id, marks } }]));
          }
          for (const change of paragraphChanges) {
            const node = ed.dataStore.getNode(change.runId)!;
            const prior = [...operations].reverse().find((op: any) => op.type === 'setMarks' && op.payload.nodeId === change.runId) as any;
            const marks = structuredClone(prior?.payload.marks ?? node.marks ?? []);
            marks.push({ stype: 'formatChange', range: [0, node.text!.length], attrs: {
              id: `paragraph-format-${crypto.randomUUID()}`, author: author.name, date: author.date(),
              before: JSON.stringify({ paragraph: { sid: change.sid, attributes: change.attributes } }),
            } });
            operations.push({ type: 'setMarks', payload: { nodeId: change.runId, marks } });
          }
          return operations.length > 0 && (await transaction(ed, operations as never).commit()).success;
        }
      });
    }
  };
}
