import { createRoot } from 'react-dom/client';
import { Editor } from '@barocss/editor-core';
import { FragmentEditor } from '../../../../packages/model/src';
import { createSchema } from '@barocss/schema';
import { define, defineMark, element, data, slot, getGlobalRegistry } from '@barocss/dsl';
import { createCoreExtensions } from '@barocss/extensions';
import { EditorView } from '@barocss/editor-view-react';
import { EditorViewDOM } from '../../../../packages/editor-view-dom/src';

declare global { interface Window { clipboardEditor: Editor; } }
define('document', element('div', {}, [slot('content')]));
define('paragraph', element('p', { 'data-bc-stype': 'paragraph' }, [slot('content')]));
define('inline-text', element('span', {}, [data('text')]));
defineMark('bold', element('strong', {}, [data('text')]));
const editor = new Editor({ schema: createSchema('clipboard-browser', { topNode: 'document', nodes: {
  document: { name: 'document', content: 'paragraph+' }, paragraph: { name: 'paragraph', group: 'block', content: 'inline*' }, 'inline-text': { name: 'inline-text', group: 'inline' },
}, marks: { bold: { name: 'bold' } } }), extensions: createCoreExtensions() });
editor.loadDocument({ stype: 'document', content: [
  { sid: 'a', stype: 'paragraph', content: [{ sid: 'a1', stype: 'inline-text', text: 'ABCD', marks: [{ stype: 'bold', range: [1, 3] }] }] },
  { sid: 'b', stype: 'paragraph', content: [{ sid: 'b1', stype: 'inline-text', text: 'xy' }] },
] });
if (new URLSearchParams(location.search).has('denyJoin')) {
  new FragmentEditor(editor, { rules: [{
    id: 'keep-boundary', match: { sourceType: 'paragraph', targetType: 'paragraph', boundary: 'open', attributes: 'any' },
    effect: 'reject', reason: 'Keep this boundary',
  }] });
}
window.clipboardEditor = editor;
const container = document.getElementById('editor')!;
if (new URLSearchParams(location.search).get('view') === 'dom') {
  const view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() }); view.render();
} else createRoot(container).render(<EditorView editor={editor} options={{ registry: getGlobalRegistry() }} />);
