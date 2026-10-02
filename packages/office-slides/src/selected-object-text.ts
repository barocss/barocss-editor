import { readSelectionSummary, selectedNodeIds, type Editor, type SelectionSummary } from '@barocss/editor-core';
import { applyMark, removeMark, transaction, type TransactionOperation } from '@barocss/model';
import { blockStyleLayers, createStyleResolver, type EffectiveFormat } from '@barocss/office-text';
import type { INode } from '@barocss/datastore';

export type SelectedObjectTextMark = 'bold' | 'italic' | 'underline' | 'strikethrough';
export type SelectedObjectTextFormat = 'fontFamily' | 'fontSize' | 'fontColor' | 'bgColor' | 'highlight';
export interface SelectedObjectTextTarget {
  nodeIds?: readonly string[];
  /** The contextual toolbar can further restrict the captured native intent. */
  canApply?: () => boolean;
}
export interface SelectedObjectTextMarkPayload extends SelectedObjectTextTarget { mark: SelectedObjectTextMark }
export interface SelectedObjectTextFormatPayload extends SelectedObjectTextTarget { mark: SelectedObjectTextFormat; value: string }
export interface SelectedObjectTextClearPayload extends SelectedObjectTextTarget { mark: SelectedObjectTextFormat }
export type SelectedObjectTextReason = 'selection' | 'readonly' | 'locked' | 'foreign-tree' | 'bound-text' | 'no-owned-text';
export interface SelectedObjectTextState {
  available: boolean;
  reason?: SelectedObjectTextReason;
  nodeIds: string[];
  textIds: string[];
  /** Instance formatting affects only native slot content, never projected definition text. */
  scope: 'object-text' | 'instance-slot';
  summary: SelectionSummary;
}

const TOGGLES: readonly SelectedObjectTextMark[] = ['bold', 'italic', 'underline', 'strikethrough'];
const FORMATS = { fontFamily: ['family', 'fontFamily'], fontSize: ['size', 'fontSize'], fontColor: ['color', 'color'], bgColor: ['bgColor', 'highlight'], highlight: ['color', 'highlight'] } as const;
const OFF = { bold: ['bold', false], italic: ['italic', false], underline: ['underline', 'none'], strikethrough: ['strike', false] } as const;
const ROOT_TYPES = new Set(['textFrame', 'sticky', 'group', 'frame', 'instance', 'paragraph', 'heading', 'list', 'listItem', 'blockQuote', 'bTable']);
const EXCLUDED = new Set(['resources', 'component', 'componentValue', 'componentVar', 'componentBind', 'variables', 'variable', 'surfaceNote']);
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockQuote']);
type Run = { node: INode; block: INode; inherited: EffectiveFormat };
type Target = { state: SelectedObjectTextState; runs: Run[]; owned: Map<string, INode> };
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

function collect(editor: Editor, requested?: readonly string[]): Target {
  const selected = selectedNodeIds(editor.selection);
  const ids = requested ? [...requested] : selected;
  const state: SelectedObjectTextState = { available: false, nodeIds: ids, textIds: [], scope: 'object-text', summary: readSelectionSummary(editor.dataStore, null) };
  const owned = new Map<string, INode>(), runs: Run[] = [];
  const result = { state, owned, runs };
  const reject = (reason: SelectedObjectTextReason) => { state.reason = reason; return result; };
  if (!ids.length || !sameIds(ids, selected) || new Set(ids).size !== ids.length) return reject('selection');
  const store = editor.dataStore, rootId = editor.getRootId();
  if (!rootId) return reject('foreign-tree');
  const doc = { rootId, getNode: (id: string) => store.getNode(id) };
  const styles = createStyleResolver(doc);
  let reason: SelectedObjectTextReason | undefined;
  const visit = (id: string, parent?: string) => {
    if (owned.has(id) || reason) return;
    const node = store.getNode(id);
    if (!node || id.includes('~') || (parent && node.parentId !== parent)) { reason = 'foreign-tree'; return; }
    if (EXCLUDED.has(node.stype)) return;
    if (node.attributes?.locked === true) { reason = 'locked'; return; }
    if (Array.isArray(node.attributes?.varBinds) && node.attributes.varBinds.some(binding => binding?.attr === 'text')) { reason = 'bound-text'; return; }
    owned.set(id, node);
    if (node.stype === 'instance') state.scope = 'instance-slot';
    if (node.stype === 'inline-text' && typeof node.text === 'string' && node.text.length > 0) {
      let block = node.parentId ? owned.get(node.parentId) : undefined;
      while (block && !BLOCKS.has(block.stype)) block = block.parentId ? owned.get(block.parentId) : undefined;
      // Only complete native paragraphs owned by the selected subtree can receive inherited-off overrides.
      if (!block) { reason = 'foreign-tree'; return; }
      const inherited = styles.resolveNodeWith(block, 'character', blockStyleLayers(doc, styles, block));
      if (block.stype === 'heading' && inherited.bold === undefined) inherited.bold = true;
      runs.push({ node, block, inherited });
    }
    for (const child of node.content ?? []) {
      if (typeof child !== 'string') { reason = 'foreign-tree'; return; }
      visit(child, id);
    }
  };
  for (const id of ids) {
    const node = store.getNode(id);
    if (!node || !ROOT_TYPES.has(node.stype)) return reject('selection');
    let at: INode | undefined = node, surface = false;
    const seen = new Set<string>();
    while (at?.sid && !seen.has(at.sid)) {
      seen.add(at.sid);
      if (at.attributes?.locked === true) return reject('locked');
      if (EXCLUDED.has(at.stype)) return reject('foreign-tree');
      if (at.stype === 'surface') {
        if (at.attributes?.kind !== 'slide') return reject('foreign-tree');
        surface = true;
      }
      if (at.sid === rootId) break;
      at = at.parentId ? store.getNode(at.parentId) : undefined;
    }
    if (at?.sid !== rootId || !surface) return reject('foreign-tree');
    visit(id);
  }
  if (reason) return reject(reason);
  if (!runs.length) return reject('no-owned-text');
  state.textIds = runs.map(run => run.node.sid!);
  state.summary = summarize(editor, runs);
  if (!editor.isEditable) return reject('readonly');
  state.available = true;
  return result;
}

const inheritedToggle = (run: Run, mark: SelectedObjectTextMark) => {
  const value = run.inherited[OFF[mark][0]];
  return mark === 'underline' ? typeof value === 'string' && value !== 'none' && value !== '' : value === true;
};

/** Read each actual run separately: a range spanning two objects can include unselected siblings. */
function summarize(editor: Editor, runs: Run[]): SelectionSummary {
  const summary: SelectionSummary = { ...readSelectionSummary(editor.dataStore, null), empty: false, collapsed: false, marks: [], mixedMarks: [], markAttributes: {}, blocks: [] };
  const leaves = runs.map(run => readSelectionSummary(editor.dataStore, { type: 'range', startNodeId: run.node.sid!, endNodeId: run.node.sid!, startOffset: 0, endOffset: run.node.text!.length }));
  for (const leaf of leaves) for (const block of leaf.blocks) if (!summary.blocks.some(item => item.sid === block.sid)) summary.blocks.push(block);
  for (const mark of TOGGLES) {
    const states = runs.map((run, index) => inheritedToggle(run, mark) || leaves[index].marks.includes(mark) ? 'on' : leaves[index].mixedMarks.includes(mark) ? 'mixed' : 'off');
    if (states.every(state => state === 'on')) summary.marks.push(mark);
    else if (states.some(state => state !== 'off')) summary.mixedMarks.push(mark);
  }
  for (const [mark, [attribute, inheritedKey]] of Object.entries(FORMATS)) {
    const values: unknown[] = [];
    for (const run of runs) {
      const marks = (run.node.marks ?? []).filter(item => item.stype === mark);
      const length = run.node.text!.length;
      const boundaries = [...new Set([0, length, ...marks.flatMap(item => item.range ?? [0, length])])].filter(at => at >= 0 && at <= length).sort((a, b) => a - b);
      for (let i = 0; i < boundaries.length - 1; i += 1) {
        const at = boundaries[i];
        const direct = marks.find(item => !item.range || item.range[0] <= at && item.range[1] > at);
        const value = direct?.attrs?.[attribute] ?? run.inherited[inheritedKey];
        values.push(value === undefined ? undefined : String(value));
      }
    }
    if (values.length && values[0] !== undefined && values.every(value => value === values[0])) {
      summary.marks.push(mark); summary.markAttributes[mark] = { [attribute]: values[0] };
    } else if (values.some(value => value !== undefined)) summary.mixedMarks.push(mark);
  }
  return summary;
}

export function readSelectedObjectText(editor: Editor, nodeIds?: readonly string[]): SelectedObjectTextState {
  return collect(editor, nodeIds).state;
}

function validTarget(editor: Editor, payload?: SelectedObjectTextTarget): Target | undefined {
  if (payload?.canApply !== undefined && typeof payload.canApply !== 'function' || payload?.canApply?.() === false) return;
  if (payload?.nodeIds !== undefined && (!Array.isArray(payload.nodeIds) || payload.nodeIds.some(id => typeof id !== 'string'))) return;
  const target = collect(editor, payload?.nodeIds);
  return target.state.available ? target : undefined;
}

function validFormat(payload?: SelectedObjectTextFormatPayload) {
  return !!payload && Object.hasOwn(FORMATS, payload.mark) && typeof payload.value === 'string' && payload.value.trim().length > 0 &&
    (payload.mark !== 'fontSize' || /^\d+(?:\.\d+)?(?:px|pt)?$/.test(payload.value) && Number.parseFloat(payload.value) > 0);
}

async function commit(editor: Editor, target: Target, operations: TransactionOperation[], canApply?: () => boolean) {
  if (!operations.length) return false;
  const store = editor.dataStore, rootId = editor.getRootId(), epoch = store.getDocumentEpoch(), session = store.getSessionId();
  const root = rootId ? store.getNodes().get(rootId) : undefined;
  const selection = JSON.stringify(editor.selection);
  const nodes = [...target.owned].map(([id, node]) => ({ id, node, bytes: JSON.stringify(node) }));
  let retired = false;
  const retire = () => { retired = true; };
  const selectionChanged = () => { if (JSON.stringify(editor.selection) !== selection) retired = true; };
  editor.on('editor:editable.change', retire); editor.on('editor:content.change', retire);
  editor.on('editor:selection.model', selectionChanged); editor.on('editor:selection.change', selectionChanged);
  const validateIntent = () => {
    if (retired || !editor.isEditable || editor.getRootId() !== rootId || store.getRootNodeId() !== rootId ||
      store.getDocumentEpoch() !== epoch || store.getSessionId() !== session || !rootId || store.getNodes().get(rootId) !== root ||
      JSON.stringify(editor.selection) !== selection || canApply?.() === false || !collect(editor, target.state.nodeIds).state.available ||
      nodes.some(({ id, node, bytes }) => store.getNodes().get(id) !== node || JSON.stringify(store.getNodes().get(id)) !== bytes)) {
      return 'The selected object text intent is no longer current';
    }
  };
  try { return (await transaction(editor, operations, { validateIntent, applySelectionToView: false }).commit()).success; }
  finally {
    editor.off('editor:editable.change', retire); editor.off('editor:content.change', retire);
    editor.off('editor:selection.model', selectionChanged); editor.off('editor:selection.change', selectionChanged);
  }
}

/** Native commands keep object selection and batch only owned text runs into one history entry. */
export function registerSelectedObjectTextCommands(editor: Editor): void {
  editor.registerCommand({
    name: 'toggleSelectedObjectTextMark',
    canExecute: (_editor, payload?: SelectedObjectTextMarkPayload) => !!payload && TOGGLES.includes(payload.mark) && !!validTarget(editor, payload),
    execute: async (_editor, payload?: SelectedObjectTextMarkPayload) => {
      if (!payload || !TOGGLES.includes(payload.mark)) return false;
      const target = validTarget(editor, payload); if (!target) return false;
      const off = target.state.summary.marks.includes(payload.mark);
      const operations: TransactionOperation[] = [];
      const overridden = new Set<string>();
      for (const run of target.runs) {
        const id = run.node.sid!, length = run.node.text!.length;
        if (off) {
          if (run.node.marks?.some(mark => mark.stype === payload.mark)) operations.push(removeMark(id, payload.mark, [0, length]));
          if (inheritedToggle(run, payload.mark) && !overridden.has(run.block.sid!)) {
            const [key, value] = OFF[payload.mark];
            operations.push({ type: 'setAttrs', payload: { nodeId: run.block.sid, attrs: { [key]: value } } });
            overridden.add(run.block.sid!);
          }
        } else {
          // Replace partial coverage before adding full coverage. This avoids
          // asking the store to merge an existing interval with its own copy.
          if (run.node.marks?.some(mark => mark.stype === payload.mark)) operations.push(removeMark(id, payload.mark, [0, length]));
          operations.push(applyMark(id, 0, length, payload.mark));
        }
      }
      return commit(editor, target, operations, payload.canApply);
    }
  });
  editor.registerCommand({
    name: 'setSelectedObjectTextFormat',
    canExecute: (_editor, payload?: SelectedObjectTextFormatPayload) => validFormat(payload) && !!validTarget(editor, payload),
    execute: async (_editor, payload?: SelectedObjectTextFormatPayload) => {
      if (!validFormat(payload)) return false;
      const target = validTarget(editor, payload); if (!target || !payload) return false;
      const key = FORMATS[payload.mark][0];
      // Font presets are native half-points. Only explicit CSS units stay strings;
      // an unqualified string would be emitted as an invalid CSS font-size.
      const value = payload.mark === 'fontSize' && /^\d+(?:\.\d+)?$/.test(payload.value) ? Number(payload.value) : payload.value;
      return commit(editor, target, target.runs.map(run => applyMark(run.node.sid!, 0, run.node.text!.length, payload.mark, { [key]: value })), payload.canApply);
    }
  });
  editor.registerCommand({
    name: 'clearSelectedObjectTextFormat',
    canExecute: (_editor, payload?: SelectedObjectTextClearPayload) => !!payload && Object.hasOwn(FORMATS, payload.mark) && !!validTarget(editor, payload)?.runs.some(run => run.node.marks?.some(mark => mark.stype === payload.mark)),
    execute: async (_editor, payload?: SelectedObjectTextClearPayload) => {
      if (!payload || !Object.hasOwn(FORMATS, payload.mark)) return false;
      const target = validTarget(editor, payload); if (!target) return false;
      const operations = target.runs.filter(run => run.node.marks?.some(mark => mark.stype === payload.mark)).map(run => removeMark(run.node.sid!, payload.mark, [0, run.node.text!.length]));
      return commit(editor, target, operations, payload.canApply);
    }
  });
}
