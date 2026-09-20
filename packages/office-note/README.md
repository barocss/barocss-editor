# @barocss/office-note

Note and embedded rich-text editing sessions, schema, commands, and a React editing surface.

## Purpose

Use Note for an independent body of prose, including an embedded CMS field. The host owns document storage and file uploads.

## Install

```sh
npm install @barocss/office-note react react-dom @barocss/office-ui @barocss/office-text
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-note` | Public JavaScript and TypeScript API |
| `@barocss/office-note/view` | React editing surface |
| `@barocss/office-note/note.css` | Stylesheet |
| `@barocss/office-note/workspace` | Workspace file codec |

Import only these public paths. Source paths such as `@barocss/office-note/src/...` are not part of the published API.

## Usage

```tsx
import { useEffect, useState } from 'react';
import { openNoteTree, type NoteSession } from '@barocss/office-note';
import { NoteEditor } from '@barocss/office-note/view';
import '@barocss/office-ui/tokens.css';
import '@barocss/office-text/text.css';
import '@barocss/office-note/note.css';

export function Note() {
  const [session, setSession] = useState<NoteSession | null>(null);
  useEffect(() => {
    const opened = openNoteTree({ stype: 'note', content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello, Note.' }] },
    ]}, {
      onChange: (blocks) => console.log('Save these blocks in your host', blocks),
    });
    setSession(opened);
    return () => opened.close();
  }, []);
  return session ? <NoteEditor editor={session.editor} rootId={session.rootId} /> : null;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. Load `@barocss/office-text/text.css` for shared document content. This package also exposes `@barocss/office-note/note.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Embedding and persistence

The example opens a new note on mount. For an existing document, pass its stored tree to `openNoteTree`. Supply a stable `session` value when your host has a durable body identity. Call `flush()` before an explicit save or export. The callback receives body blocks, not an entire workspace backup.

The `/workspace` entry supplies the native file codec used by the local workspace. It does not mount the editor.

## Integration notes

openNoteTree creates its own store, selection, history, and unique session. close flushes pending onChange delivery and releases the editor. The host must await its own asynchronous storage work. NoteEditor manages its renderer registry.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-note)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-note)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
