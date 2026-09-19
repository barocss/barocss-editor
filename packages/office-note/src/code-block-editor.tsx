import { useEffect, useState, type RefObject } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { DOMSelectionHandler } from '@barocss/editor-view-dom';
import { transaction, replaceText } from '@barocss/model';
import { ownsEditorSelection, useEditorRevision, useNodeRect } from '@barocss/office-editor-ui';
import { Choice, FloatingSurface } from '@barocss/office-ui';

function codeAncestor(editor: Editor, sid: string): string | undefined {
  for (let node = editor.dataStore.getNode(sid); node; node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined) {
    if (node.stype === 'codeBlock') return node.sid;
  }
}
function runsIn(editor: Editor, sid: string): { sid: string; text: string }[] {
  const node = editor.dataStore.getNode(sid);
  if (!node) return [];
  if (typeof node.text === 'string') return [{ sid, text: node.text }];
  return (node.content ?? []).flatMap(child => typeof child === 'string' ? runsIn(editor, child) : []);
}

/** Native code text uses the same transaction/history as prose; only line and tab semantics differ. */
export async function editCodeText(editor: Editor, range: ModelSelection, action: 'newline' | 'indent' | 'outdent' | 'paste', text = '') {
  if (range.type !== 'range') return false;
  const sid = codeAncestor(editor, range.startNodeId);
  if (!sid || sid !== codeAncestor(editor, range.endNodeId)) return false;
  editor.selectionManager.setSelection(range);
  if (action === 'newline' || action === 'paste' || action === 'indent' && range.collapsed) {
    return editor.executeCommand('replaceText', { range, text: action === 'newline' ? '\n' : action === 'indent' ? '\t' : text.replace(/\r\n?/g, '\n') });
  }
  const runs = runsIn(editor, sid);
  if (!runs.length) return false;
  let start = 0, end = 0, count = 0;
  for (const run of runs) {
    if (run.sid === range.startNodeId) start = count + range.startOffset;
    if (run.sid === range.endNodeId) end = count + range.endOffset;
    count += run.text.length;
  }
  const original = runs.map(run => run.text).join('');
  const firstLine = original.slice(0, start).lastIndexOf('\n') + 1;
  // A selection ending at the next line's start does not indent that unselected line.
  const lastLine = original.slice(0, end - (end > start ? 1 : 0)).lastIndexOf('\n') + 1;
  const changes: { at: number; removed: number; insert: string }[] = [];
  for (let at = firstLine; at <= lastLine;) {
    const prefix = original.slice(at).match(/^(?:\t| {1,4})/)?.[0] ?? '';
    if (action === 'indent') changes.push({ at, removed: 0, insert: '\t' });
    else if (prefix) changes.push({ at, removed: prefix.length, insert: '' });
    const next = original.indexOf('\n', at); if (next < 0) break; at = next + 1;
  }
  if (!changes.length) return false;
  let updated = original;
  for (const change of [...changes].reverse()) updated = updated.slice(0, change.at) + change.insert + updated.slice(change.at + change.removed);
  const map = (offset: number) => changes.reduce((value, change) => value + (change.at <= offset ? change.insert.length - Math.min(change.removed, offset - change.at) : 0), offset);
  const first = runs[0], last = runs[runs.length - 1];
  const result = await transaction(editor, [
    replaceText(first.sid, 0, last.sid, last.text.length, updated)
  ]).commit();
  if (!result || result.success === false) return false;
  editor.updateSelection({ type: 'range', startNodeId: first.sid, endNodeId: first.sid, startOffset: map(start), endOffset: map(end), collapsed: range.collapsed });
  return true;
}

/** Adds language chrome and native code keystrokes to the shared editable pre renderer. */
export function CodeBlockEditor({ editor, scope, sid, active = true }: {
  editor: Editor; scope: RefObject<HTMLElement | null>; sid?: string; active?: boolean;
}) {
  const revision = useEditorRevision(editor);
  const [current, setCurrent] = useState<string | undefined>(sid);
  const at = useNodeRect(editor, scope, current);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setCurrent(sid); setDismissed(false); }, [sid]);
  useEffect(() => {
    const host = scope.current; if (!host) return;
    const doc = host.ownerDocument;
    const converter = new DOMSelectionHandler(editor, { contentEditableElement: host });
    const selection = () => {
      const dom = doc.getSelection();
      if (!ownsEditorSelection(editor, dom, host) || !dom) return null;
      const range = converter.convertDOMSelectionToModel(dom) as ModelSelection;
      if (range.type !== 'range') return null;
      const code = codeAncestor(editor, range.startNodeId);
      return code && code === codeAncestor(editor, range.endNodeId) ? { range, code } : null;
    };
    const update = () => { const picked = selection(); setCurrent(picked?.code); if (picked) setDismissed(false); };
    const inputTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="false"]');
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || inputTarget(event.target)) return;
      if (event.key !== 'Enter' && event.key !== 'Tab') return;
      const picked = selection(); if (!picked) return;
      event.preventDefault(); event.stopPropagation();
      void editCodeText(editor, picked.range, event.key === 'Enter' ? 'newline' : event.shiftKey ? 'outdent' : 'indent');
    };
    const before = (event: InputEvent) => {
      if (event.isComposing || !['insertParagraph', 'insertLineBreak'].includes(event.inputType) || inputTarget(event.target)) return;
      const picked = selection(); if (!picked) return;
      event.preventDefault(); event.stopPropagation(); void editCodeText(editor, picked.range, 'newline');
    };
    const paste = (event: ClipboardEvent) => {
      if (inputTarget(event.target)) return;
      const picked = selection(); if (!picked || !event.clipboardData) return;
      event.preventDefault(); event.stopPropagation();
      void editCodeText(editor, picked.range, 'paste', event.clipboardData.getData('text/plain'));
    };
    host.addEventListener('keydown', key, true); host.addEventListener('beforeinput', before, true); host.addEventListener('paste', paste, true);
    doc.addEventListener('selectionchange', update);
    return () => { host.removeEventListener('keydown', key, true); host.removeEventListener('beforeinput', before, true); host.removeEventListener('paste', paste, true); doc.removeEventListener('selectionchange', update); };
  }, [editor, scope]);
  const node = editor.dataStore.getNode(current ?? '');
  const language = String(node?.attributes?.language ?? 'text');
  void revision;
  const languages = [['text', '일반 텍스트'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['html', 'HTML'], ['css', 'CSS'], ['json', 'JSON'], ['sql', 'SQL'], ['bash', 'Shell'], ['markdown', 'Markdown']];
  return <FloatingSurface open={active && node?.stype === 'codeBlock' && !dismissed} at={at} prefer="above" align="end"
    aria-label="코드 블록 편집" data-note-code-context portalRoot={scope.current} ownedElements={[scope]} onDismiss={() => setDismissed(true)}>
    <Choice ariaLabel="코드 언어" value={language} onChange={value => { void editor.executeCommand('setNoteAttrs', { nodeId: current, attrs: { language: value } }); }}>
      {!languages.some(([value]) => value === language) && <option value={language}>{language}</option>}
      {languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Choice>
  </FloatingSurface>;
}
