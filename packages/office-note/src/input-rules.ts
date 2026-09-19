import { inlineMathAt } from './markdown-math';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { addChild, removeChild, transaction } from '@barocss/model';
import { validateTree } from '@barocss/schema';

type Tree = { sid?: string; stype: string; text?: string; marks?: any[]; attributes?: Record<string, unknown>; content?: Tree[] };
/** A literal-input rule is planned synchronously so unsupported text keeps its native input path. */
export function planNoteInputRule(editor: Editor, range: ModelSelection, input: string) {
  if (!editor.isEditable || range.type !== 'range' || !range.collapsed || range.startNodeId !== range.endNodeId) return;
  const store = editor.dataStore, run = store.getNode(range.startNodeId);
  if (!run || typeof run.text !== 'string' || !run.parentId) return;
  const block = store.getNode(run.parentId);
  if (!block || !['paragraph', 'heading', 'taskItem', 'calloutTitle', 'bSummary'].includes(String(block.stype))) return;
  // Inline rules stay literal in formatted runs; whole-paragraph prefixes may carry visual marks.
  if (!Number.isInteger(range.startOffset) || range.startOffset < 0 || range.startOffset > run.text.length) return;
  const offset = range.startOffset, before = run.text.slice(0, offset), after = run.text.slice(offset);
  let replacement: Tree | undefined, caret: Tree | undefined;
  const text = (value: string): Tree => ({ stype: 'inline-text', text: value, marks: [] });
  const runs = (block.content ?? []).map(id => store.getNode(String(id)));
  const runIndex = runs.findIndex(node => node?.sid === run.sid);
  const plainTextBlock = runs.every(node => node?.stype === 'inline-text' && typeof node.text === 'string'
    && !node.marks?.some(mark => mark.stype === 'code' || mark.stype === 'link'));
  const prefix = runs.slice(0, runIndex).map(node => node!.text).join('') + before;
  const suffix = after + runs.slice(runIndex + 1).map(node => node?.text ?? '').join('');
  if ((input === ' ' || input === '\n') && block.stype === 'paragraph' && plainTextBlock && !suffix) {
    let kind: string | undefined, attributes: Record<string, unknown> = {};
    const heading = input === ' ' && prefix.match(/^(#{1,6})$/);
    const code = prefix.match(/^```([a-zA-Z0-9_+-]*)$/);
    if (heading) { kind = 'heading'; attributes.level = heading[1].length; }
    else if (code) { kind = 'codeBlock'; attributes.language = code[1] || 'text'; }
    else if (input === ' ' && prefix === '>') kind = 'blockQuote';
    else if (input === ' ' && /^(?:\[ ?\]|\[[xX]\]|- \[ ?\]|- \[[xX]\])$/.test(prefix)) { kind = 'taskItem'; attributes.checked = /[xX]/.test(prefix); }
    else if (input === ' ' && /^(?:[-+*]|1\.)$/.test(prefix)) { kind = 'list'; attributes.type = prefix === '1.' ? 'ordered' : 'bullet'; }
    if (kind) {
      caret = text('');
      replacement = { stype: kind, attributes, content: kind === 'blockQuote'
        ? [{ stype: 'paragraph', content: [caret] }]
        : kind === 'list' ? [{ stype: 'listItem', content: [{ stype: 'paragraph', content: [caret] }] }] : [caret] };
    }
  }
  if (!replacement && !run.marks?.length && ['`', '*', '~', '$'].includes(input)) {
    const candidate = before + input;
    const expressions = [
      { expression: /(^|[^\\$])\$([^$\n]+)\$$/, stype: 'mathInline' },
      { expression: /(^|[^\\`])`([^`\n]+)`$/, stype: 'code' },
      { expression: /(^|[^\\*])\*\*([^*\n]+)\*\*$/, stype: 'bold' },
      { expression: /(^|[^\\~])~~([^~\n]+)~~$/, stype: 'strikethrough' },
      { expression: /(^|[^\\*])\*([^*\n]+)\*$/, stype: 'italic' }
    ];
    for (const rule of expressions) {
      const match = candidate.match(rule.expression);
      if (!match || /^\s|\s$/.test(match[2])) continue;
      const start = match.index! + match[1].length;
      if (rule.stype === 'mathInline' && (input !== '$' || !inlineMathAt(candidate + after, start))) continue;
      const marked: Tree = rule.stype === 'mathInline' ? { stype: 'mathInline', attributes: { tex: match[2], engine: 'katex' } } : { ...text(match[2]), marks: [{ stype: rule.stype, range: [0, match[2].length] }] };
      // A separate unmarked tail is the insertion point, so following text does not inherit the mark.
      caret = text(after);
      const replacementRuns = [...(start || rule.stype === 'mathInline' ? [text(candidate.slice(0, start))] : []), marked, caret];
      const clone = (id: string): Tree => {
        const node = store.getNode(id)!;
        return { stype: String(node.stype), ...(typeof node.text === 'string' ? { text: node.text } : {}),
          ...(node.attributes ? { attributes: structuredClone(node.attributes) } : {}), ...(node.marks ? { marks: structuredClone(node.marks) } : {}),
          ...(node.content ? { content: node.content.map(child => clone(String(child))) } : {}) };
      };
      replacement = { stype: String(block.stype), attributes: structuredClone(block.attributes ?? {}), content: block.content!.flatMap(child => child === run.sid ? replacementRuns : [clone(String(child))]) };
      break;
    }
  }
  if (!replacement || !caret || !block.parentId || !block.sid) return;
  const parent = store.getNode(block.parentId), schema = store.getActiveSchema();
  if (!parent?.content || !schema || validateTree(schema, replacement).length) return;
  const siblings = parent.content.map(child => child === block.sid ? replacement : store.getNode(String(child)));
  if (!schema.validateContent(String(parent.stype), siblings).valid) return;
  const mint = (node: Tree) => { node.sid = store.generateId(); node.content?.forEach(mint); };
  mint(replacement);
  const position = { nodeId: caret.sid!, offset: 0 };
  const operations = [removeChild(block.parentId, block.sid), addChild(block.parentId, replacement as never, parent.content.indexOf(block.sid)),
    { type: 'setSelection', payload: { anchor: position, head: position } }];
  return async () => {
    editor.selectionManager.setSelection(range);
    return (await transaction(editor, operations as never).commit()).success;
  };
}
