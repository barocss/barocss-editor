# JavaScript / DOM quick start

This example mounts a small editor with paragraph, bold, italic, underline, and strikethrough support. It uses current public exports and is also the live demo on this site.

## Install

```sh
npm install @barocss/editor-core @barocss/datastore @barocss/schema @barocss/extensions @barocss/dsl @barocss/editor-view-dom
```

## Mount and clean up

Put an element such as `<div id="editor"></div>` in your page. Call `mountEditor` after that element exists. Keep the returned cleanup function and call it before removing the host element.

```ts
import { Editor, readSelectionSummary, markState, watchAnswers } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, BoldExtension, ItalicExtension, UnderlineExtension, StrikeThroughExtension } from '@barocss/extensions';
import { RendererRegistry, intoRegistry, define, defineMark, element, data, slot } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';

export function mountEditor(container: HTMLElement) {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, () => {
    define('document', element('div', { style: { whiteSpace: 'pre-wrap' } }, [slot('content')]));
    define('paragraph', element('p', {}, [slot('content')]));
    define('inline-text', element('span', {}, [data('text', '')]));
    defineMark('bold', element('strong', {}, [data('text')]));
    defineMark('italic', element('em', {}, [data('text')]));
    defineMark('underline', element('u', {}, [data('text')]));
    defineMark('strikethrough', element('s', {}, [data('text')]));
  });
  const definition = getMinimalSchemaDefinition();
  const schema = createSchema('quick-start', {
    ...definition, marks: { ...definition.marks,
      underline: { name: 'underline', group: 'text-style' },
      strikethrough: { name: 'strikethrough', group: 'text-style' },
    },
  });
  const editor = new Editor({
    schema, dataStore: new DataStore(undefined, schema), editable: true,
    extensions: [...createCoreExtensions(), new BoldExtension(), new ItalicExtension(), new UnderlineExtension(), new StrikeThroughExtension()],
  });
  editor.loadDocument({ stype: 'document', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Start writing here.' }] },
  ]});
  const toolbar = document.createElement('div');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Text formatting');
  toolbar.style.cssText = 'display:flex;gap:4px;margin-bottom:16px';
  const surface = document.createElement('div');
  container.replaceChildren(toolbar, surface);
  const tools = [
    { label: 'Bold', text: 'B', mark: 'bold', command: 'toggleBold' },
    { label: 'Italic', text: 'I', mark: 'italic', command: 'toggleItalic' },
    { label: 'Underline', text: 'U', mark: 'underline', command: 'toggleUnderline' },
    { label: 'Strikethrough', text: 'S', mark: 'strikethrough', command: 'toggleStrikeThrough' },
  ];
  const buttons = tools.map(tool => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tool.text;
    button.title = tool.label;
    button.setAttribute('aria-label', tool.label);
    button.style.cssText = 'width:34px;height:32px;border:1px solid #cbd5e1;border-radius:6px;font:600 14px system-ui';
    if (tool.mark === 'italic') button.style.fontStyle = 'italic';
    if (tool.mark === 'underline') button.style.textDecoration = 'underline';
    if (tool.mark === 'strikethrough') button.style.textDecoration = 'line-through';
    // Keep the browser's text selection when the pointer presses a button.
    button.onpointerdown = event => { if (event.button === 0) event.preventDefault(); };
    button.onclick = () => { void editor.executeCommand(tool.command); };
    toolbar.append(button);
    return button;
  });
  const stopWatching = watchAnswers(editor, () => {
    const summary = readSelectionSummary(editor.dataStore, editor.selection);
    tools.forEach((tool, index) => {
      const button = buttons[index];
      const state = markState(summary, tool.mark);
      button.disabled = summary.empty || summary.collapsed || !editor.canExecuteCommand(tool.command);
      button.setAttribute('aria-pressed', state === 'mixed' ? 'mixed' : String(state === 'on'));
      button.style.background = state === 'off' ? '#fff' : '#dbeafe';
      button.style.color = button.disabled ? '#94a3b8' : state === 'off' ? '#172033' : '#1d4ed8';
    });
  });
  const view = new EditorViewDOM(editor, { container: surface, registry });
  view.render();
  return () => {
    stopWatching();
    view.destroy();
    editor.destroy();
    toolbar.remove();
    surface.remove();
  };
}
```

The constructor accepts `{ container, registry }`. Use `view.render()`, not `view.mount()`. The schema, command set, and registered templates must describe the same content. The example registers templates in a scoped registry so it does not overwrite another editor's templates.

Keep `whiteSpace: 'pre-wrap'` on the document renderer. It preserves repeated and trailing spaces while allowing line wrapping. The default HTML whitespace rule collapses spaces, so displayed text and caret positions can differ from the document text.

## Test text formatting

Select text, then press **B**, **I**, **U**, or **S**. Press the same button again to remove that format. A blue button marks an active or mixed format; `aria-pressed` distinguishes those states. Buttons are disabled until you select text. Undo and redo use the editor’s normal keyboard shortcuts.

The toolbar subscribes with `watchAnswers`, so it also updates after keyboard commands, selection changes, and undo. Its cleanup removes that subscription.

## Connect the host

Call `mountEditor(document.getElementById('editor'))` after checking that the element exists. In a framework, create the editor in a client lifecycle hook and return the cleanup callback from that hook.

The host still owns saving, file selection, document routing, and application UI. Use [Note](/packages/office-note) if you want a richer embeddable prose editor, or follow the [React integration guide](guides/react-editor.md).
