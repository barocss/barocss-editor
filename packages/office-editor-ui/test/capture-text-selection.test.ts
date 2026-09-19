// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import { captureTextSelection } from '../src/capture-text-selection';

afterEach(() => { document.body.replaceChildren(); getSelection()?.removeAllRanges(); });

function fixture() {
  document.body.innerHTML = '<div contenteditable="true" tabindex="0"><span data-bc-sid="run">Selected text</span></div><button>Paint</button>';
  const scope = document.querySelector('div')!;
  const selection = { type: 'range', startNodeId: 'run', endNodeId: 'run', startOffset: 1, endOffset: 5 };
  const editor = { selection, dataStore: { getNode: (sid: string) => sid === 'run' ? { sid } : undefined } } as unknown as Editor;
  const view = { contentEditableElement: scope, convertDOMSelectionToModel: vi.fn(() => selection) } as any;
  document.querySelector('button')!.focus();
  const range = document.createRange(); range.setStart(scope.firstElementChild!.firstChild!, 1); range.setEnd(scope.firstElementChild!.firstChild!, 5);
  getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  return { editor, view, scope, selection };
}

describe('capturing selection for an explicit toolbar action', () => {
  it('requires document focus by default but can retain the document range after a toolbar receives focus', () => {
    const f = fixture();
    expect(captureTextSelection(f.editor, f.view)).toBeUndefined();
    expect(captureTextSelection(f.editor, f.view, { allowBlurred: true })).toEqual(f.selection);
  });
  it('does not capture an embedded editor or an external selection', () => {
    const f = fixture(); const button = document.querySelector('button')!;
    button.dataset.editorInputOwner = 'math'; button.focus();
    expect(captureTextSelection(f.editor, f.view, { allowBlurred: true })).toBeUndefined();
    delete button.dataset.editorInputOwner;
    const range = document.createRange(); range.selectNodeContents(button);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
    expect(captureTextSelection(f.editor, f.view, { allowBlurred: true })).toBeUndefined();
  });
});
