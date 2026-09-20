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
import { Editor, readSelectionSummary, markState, watchAnswers } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, BoldExtension, ItalicExtension, UnderlineExtension, StrikeThroughExtension } from '@barocss/extensions';
import { RendererRegistry, intoRegistry, define, defineMark, element, data, slot } from '@barocss/dsl';
import { EditorView } from '@barocss/editor-view-react';

function TextFormatting({ editor }: { editor: Editor }) {
  const [summary, setSummary] = useState(() => readSelectionSummary(editor.dataStore, editor.selection));
  useEffect(() => watchAnswers(editor, () => {
    setSummary(readSelectionSummary(editor.dataStore, editor.selection));
  }), [editor]);
  const tools = [
    { label: 'Bold', text: 'B', mark: 'bold', command: 'toggleBold' },
    { label: 'Italic', text: 'I', mark: 'italic', command: 'toggleItalic' },
    { label: 'Underline', text: 'U', mark: 'underline', command: 'toggleUnderline' },
    { label: 'Strikethrough', text: 'S', mark: 'strikethrough', command: 'toggleStrikeThrough' },
  ];
  return <div role="group" aria-label="Text formatting" style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
    {tools.map(tool => {
      const state = markState(summary, tool.mark);
      const disabled = summary.empty || summary.collapsed || !editor.canExecuteCommand(tool.command);
      return <button key={tool.mark} type="button" title={tool.label} aria-label={tool.label}
        disabled={disabled} aria-pressed={state === 'mixed' ? 'mixed' : state === 'on'}
        onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
        onClick={() => { void editor.executeCommand(tool.command); }}
        style={{ width: 34, height: 32, border: '1px solid #cbd5e1', borderRadius: 6,
          font: '600 14px system-ui', fontStyle: tool.mark === 'italic' ? 'italic' : 'normal',
          textDecoration: tool.mark === 'underline' ? 'underline' : tool.mark === 'strikethrough' ? 'line-through' : 'none',
          background: state === 'off' ? '#fff' : '#dbeafe',
          color: disabled ? '#94a3b8' : state === 'off' ? '#172033' : '#1d4ed8',
        }}>{tool.text}</button>;
    })}
  </div>;
}

export function DocumentEditor() {
  const [session, setSession] = useState<{ editor: Editor; registry: RendererRegistry } | null>(null);
  useEffect(() => {
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
    const editor = new Editor({
      schema: createSchema('react-example', {
        ...definition, marks: { ...definition.marks,
          underline: { name: 'underline', group: 'text-style' },
          strikethrough: { name: 'strikethrough', group: 'text-style' },
        },
      }),
      extensions: [...createCoreExtensions(), new BoldExtension(), new ItalicExtension(), new UnderlineExtension(), new StrikeThroughExtension()], editable: true,
    });
    editor.loadDocument({ stype: 'document', content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello from React.' }] },
    ]});
    setSession({ editor, registry });
    return () => editor.destroy();
  }, []);
  return session ? <>
    <TextFormatting editor={session.editor} />
    <EditorView editor={session.editor} options={{ registry: session.registry }} />
  </> : null;
}
```

Select text and press **B**, **I**, **U**, or **S** to apply or remove formatting. The schema, extensions, and mark renderers all include those four formats. `watchAnswers` updates active, mixed, and disabled states after selection changes, formatting, and undo. Preventing the pointer-down default keeps the text selection while a button is pressed.

The document renderer uses `whiteSpace: 'pre-wrap'` to preserve repeated and trailing spaces while allowing line wrapping, just like the DOM quick start.

## Choose the right integration

- **Custom React editor:** use `EditorView`, its content/overlay layers, and your registry.
- **Embedded Note:** use `openNoteTree` and `NoteEditor` from [office-note](/packages/office-note). The Note component uses a DOM editing view internally.
- **Word, Slides, or Site:** use the product factories and their `/ui` components. Read [Office integration](office-products.md).

In a server-rendered application, keep editor creation and browser views in a client component. Pure data preparation can be separate, but do not assume every package root is safe to execute on a server simply because it has no visible UI.
