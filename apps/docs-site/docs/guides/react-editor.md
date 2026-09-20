# React integration

The current component is `EditorView` from `@barocss/editor-view-react`. It receives an Editor and renders the document with the React renderer. This is different from mounting a DOM-backed product component such as `NoteEditor`.

## Install

```sh
npm install @barocss/editor-core @barocss/schema @barocss/extensions @barocss/dsl @barocss/editor-view-react react react-dom
```

## Own the session lifecycle

Create the session in an effect, load the document, and destroy it in cleanup. Do not create a new editor on every render. This example starts a new session after a mount; production hosts should load and save their durable document separately.

```tsx
import { useEffect, useState } from 'react';
import { Editor } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';
import { RendererRegistry, intoRegistry, define, element, data, slot } from '@barocss/dsl';
import { EditorView } from '@barocss/editor-view-react';

export function DocumentEditor() {
  const [session, setSession] = useState<{ editor: Editor; registry: RendererRegistry } | null>(null);
  useEffect(() => {
    const registry = new RendererRegistry({ global: false });
    intoRegistry(registry, () => {
      define('document', element('div', {}, [slot('content')]));
      define('paragraph', element('p', {}, [slot('content')]));
      define('inline-text', element('span', {}, [data('text', '')]));
    });
    const editor = new Editor({
      schema: createSchema('react-example', getMinimalSchemaDefinition()),
      extensions: createCoreExtensions(), editable: true,
    });
    editor.loadDocument({ stype: 'document', content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello from React.' }] },
    ]});
    setSession({ editor, registry });
    return () => editor.destroy();
  }, []);
  return session ? <EditorView editor={session.editor} options={{ registry: session.registry }} /> : null;
}
```

This minimal example installs core editing commands. To add formatting, install the matching extensions and mark renderers together.

## Choose the right integration

- **Custom React editor:** use `EditorView`, its content/overlay layers, and your registry.
- **Embedded Note:** use `openNoteTree` and `NoteEditor` from [office-note](/packages/office-note). The Note component uses a DOM editing view internally.
- **Word, Slides, or Site:** use the product factories and their `/ui` components. Read [Office integration](office-products.md).

In a server-rendered application, keep editor creation and browser views in a client component. Pure data preparation can be separate, but do not assume every package root is safe to execute on a server simply because it has no visible UI.
