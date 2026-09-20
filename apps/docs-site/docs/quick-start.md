# JavaScript / DOM quick start

This example mounts a small editor with paragraph, bold, and italic support. It uses current public exports and is also the live demo on this site.

## Install

```sh
npm install @barocss/editor-core @barocss/datastore @barocss/schema @barocss/extensions @barocss/dsl @barocss/editor-view-dom
```

## Mount and clean up

Put an element such as `<div id="editor"></div>` in your page. Call `mountEditor` after that element exists. Keep the returned cleanup function and call it before removing the host element.

```ts
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, BoldExtension, ItalicExtension } from '@barocss/extensions';
import { RendererRegistry, intoRegistry, define, defineMark, element, data, slot } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';

export function mountEditor(container: HTMLElement) {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, () => {
    define('document', element('div', {}, [slot('content')]));
    define('paragraph', element('p', {}, [slot('content')]));
    define('inline-text', element('span', {}, [data('text', '')]));
    defineMark('bold', element('strong', {}, [data('text')]));
    defineMark('italic', element('em', {}, [data('text')]));
  });
  const schema = createSchema('quick-start', getMinimalSchemaDefinition());
  const editor = new Editor({
    schema, dataStore: new DataStore(undefined, schema), editable: true,
    extensions: [...createCoreExtensions(), BoldExtension, ItalicExtension],
  });
  editor.loadDocument({ stype: 'document', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Start writing here.' }] },
  ]});
  const view = new EditorViewDOM(editor, { container, registry });
  view.render();
  return () => {
    view.destroy();
    editor.destroy();
  };
}
```

The constructor accepts `{ container, registry }`. Use `view.render()`, not `view.mount()`. The schema, command set, and registered templates must describe the same content. The example registers templates in a scoped registry so it does not overwrite another editor's templates.

## Connect the host

Call `mountEditor(document.getElementById('editor'))` after checking that the element exists. In a framework, create the editor in a client lifecycle hook and return the cleanup callback from that hook.

The host still owns saving, file selection, document routing, and application UI. Use [Note](/packages/office-note) if you want a richer embeddable prose editor, or follow the [React integration guide](guides/react-editor.md).
