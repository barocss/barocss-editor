import { parseMathDocument, toLatex } from '@barocss/math-editor/core';
import type { Editor } from '@barocss/editor-core';
import { transaction, setAttrs, replaceText } from '@barocss/model';
import { define, element } from '@barocss/dsl';

/** LaTeX atoms are distinct from Word's editable OMML structure. */
export function registerLatexRenderers() {
  for (const type of ['mathInline', 'mathBlock'])
    define(
      type,
      element(
        type === 'mathInline' ? 'span' : 'div',
        {
          'data-latex-node': (node: any) => node.sid,
          'data-latex-display': type === 'mathBlock' ? 'block' : 'inline',
          contenteditable: 'false',
          style: (node: any) => ({
            display: type === 'mathInline' ? 'inline-block' : 'block',
            verticalAlign: 'middle',
            minWidth: '24px',
            ...(type === 'mathBlock' ? { textAlign: node.attributes?.alignment ?? 'center' } : {}),
          }),
        },
        [],
      ),
    );
}
export function registerLatexCommands(editor: Editor) {
  for (const block of [false, true]) {
    const prepare = (payload?: { tex?: string; stripSlash?: boolean }) => {
      const range = editor.selection;
      if (
        !editor.isEditable ||
        !range ||
        range.type !== 'range' ||
        range.startNodeId !== range.endNodeId ||
        typeof (payload?.tex ?? '') !== 'string' ||
        (payload?.tex?.length ?? 0) > 10000
      )
        return;
      const run = editor.dataStore.getNode(range.startNodeId);
      if (!run?.parentId || typeof run.text !== 'string') return;
      let from = Math.min(range.startOffset, range.endOffset);
      const to = Math.max(range.startOffset, range.endOffset);
      if (payload?.stripSlash && from === to) {
        const trigger = run.text.slice(0, from).match(/(?:^|\s)(\/[^\s/]*)$/);
        if (trigger) from -= trigger[1].length;
      }
      if (from < 0 || to > run.text.length) return;
      let parent = editor.dataStore.getNode(run.parentId);
      const schema = editor.dataStore.getActiveSchema();
      if (!schema?.getNodeType(block ? 'mathBlock' : 'mathInline')) return;
      if (block) {
        let ancestor = run;
        while (ancestor.parentId && schema.getNodeType(ancestor.stype)?.group !== 'block')
          ancestor = editor.dataStore.getNode(ancestor.parentId)!;
        parent = ancestor?.parentId ? editor.dataStore.getNode(ancestor.parentId) : undefined;
        if (
          !parent ||
          !schema.validateContent(parent.stype, [
            ...(parent.content ?? []).map((id) => editor.dataStore.getNode(id as string)!),
            { stype: 'mathBlock' },
          ] as never).valid
        )
          return;
        return { parent, at: parent.content!.indexOf(ancestor.sid!) + 1, run, from, to };
      }
      if (
        !parent ||
        !schema.validateContent(parent.stype, [
          ...(parent.content ?? []).map((id) => editor.dataStore.getNode(id as string)!),
          { stype: 'mathInline' },
        ] as never).valid
      )
        return;
      return { parent, at: parent.content!.indexOf(run.sid!), run, from, to };
    };
    editor.registerCommand({
      name: block ? 'insertMathBlock' : 'insertMathInline',
      canExecute: (_ed, payload) => !!prepare(payload as never),
      execute: async (_ed, payload?: { tex?: string; stripSlash?: boolean }) => {
        const target = prepare(payload);
        if (!target) return false;
        const { parent, at, run, from, to } = target,
          store = editor.dataStore;
        const math = {
          sid: store.generateId(),
          stype: block ? 'mathBlock' : 'mathInline',
          attributes: { tex: payload?.tex ?? '', engine: 'katex' },
        };
        const caret = store.generateId(),
          ops: any[] = [];
        if (block && payload?.stripSlash && from !== to)
          ops.push(replaceText(run.sid!, from, run.sid!, to, ''));
        if (block)
          ops.push({
            type: 'addChild',
            payload: {
              parentId: parent.sid,
              position: at,
              children: [
                math,
                { stype: 'paragraph', content: [{ sid: caret, stype: 'inline-text', text: '' }] },
              ],
            },
          });
        else {
          if (from !== to) ops.push(replaceText(run.sid!, from, run.sid!, to, ''));
          const remaining = run.text!.length - (to - from);
          if (from === 0) {
            ops.push({
              type: 'addChild',
              payload: {
                parentId: parent.sid,
                position: at,
                children: [{ stype: 'inline-text', text: '', marks: [] }, math],
              },
            });
            ops.push({
              type: 'setSelection',
              payload: {
                anchor: { nodeId: run.sid, offset: 0 },
                head: { nodeId: run.sid, offset: 0 },
              },
            });
            return (await transaction(editor, ops).commit()).success;
          }
          if (from === remaining)
            ops.push({
              type: 'addChild',
              payload: {
                parentId: parent.sid,
                position: at + 1,
                children: [math, { sid: caret, stype: 'inline-text', text: '', marks: [] }],
              },
            });
          else {
            ops.push({
              type: 'splitTextNode',
              payload: { nodeId: run.sid, splitPosition: from, newNodeId: caret },
            });
            ops.push({
              type: 'addChild',
              payload: { parentId: parent.sid, position: at + 1, children: [math] },
            });
          }
        }
        ops.push({
          type: 'setSelection',
          payload: { anchor: { nodeId: caret, offset: 0 }, head: { nodeId: caret, offset: 0 } },
        });
        return (await transaction(editor, ops).commit()).success;
      },
    });
  }
  // Structured payloads must match the display source; direct source edits clear stale structure.
  const validMathDocument = (payload: any) => {
    if (!payload) return false;
    if (payload.mathDocument === undefined || payload.mathDocument === '') return true;
    if (typeof payload.mathDocument !== 'string') return false;
    const document = parseMathDocument(payload.mathDocument);
    return (
      !!document &&
      toLatex(document) === payload.tex &&
      (editor.dataStore.getNode(payload.nodeId)?.stype !== 'mathInline' ||
        !document.additionalLines?.length)
    );
  };
  editor.registerCommand({
    name: 'setMathSource',
    canExecute: (_ed, payload: any) =>
      editor.isEditable &&
      validMathDocument(payload) &&
      ['mathInline', 'mathBlock'].includes(
        editor.dataStore.getNode(payload?.nodeId)?.stype ?? '',
      ) &&
      typeof payload?.tex === 'string' &&
      payload.tex.length <= 10000 &&
      (payload.fontSize === undefined ||
        (Number.isInteger(payload.fontSize) && payload.fontSize >= 12 && payload.fontSize <= 72)) &&
      (payload.alignment === undefined ||
        (editor.dataStore.getNode(payload.nodeId)?.stype === 'mathBlock' &&
          ['left', 'center', 'right'].includes(payload.alignment))),
    execute: async (_ed, payload: any) => {
      if (!editor.canExecuteCommand('setMathSource', payload)) return false;
      return (
        await transaction(
          editor,
          [
            setAttrs(payload.nodeId, {
              tex: payload.tex,
              ...(payload.mathDocument !== undefined
                ? { mathDocument: payload.mathDocument }
                : editor.dataStore.getNode(payload.nodeId)?.attributes?.mathDocument &&
                  editor.dataStore.getNode(payload.nodeId)?.attributes?.tex !== payload.tex
                ? { mathDocument: '' }
                : {}),
              ...(payload.alignment === undefined ? {} : { alignment: payload.alignment }),
              ...(payload.fontSize === undefined ? {} : { fontSize: payload.fontSize }),
            } as never),
          ],
          { applySelectionToView: false },
        ).commit()
      ).success;
    },
  });
}
