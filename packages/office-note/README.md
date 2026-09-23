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

## Implemented feature surfaces

The following inventory is based on source commit `558714a8` (2026-09-20). It describes available model and UI surfaces, not full Notion parity or a guarantee that an older npm release contains every change.

| Surface | Included in the Note kit/view | Host responsibility or limit |
| --- | --- | --- |
| Writing | Paragraphs, headings, lists, tasks, quotes, callouts, toggles, code, inline formatting, and paragraph alignment | Use the matching Note schema, kit, and renderers together |
| Insertion and selection | Slash menu, block menu, contextual formatting, block actions | #279 (insert-menu pointer path) and #281 (non-text node selection) remain open as of 2026-09-23; a visible control is not proof of every interaction |
| Tables | Table commands, cell tools, headers, colors, sizing, and cell-range operations | A document table is distinct from a Note database |
| Databases | Property editing, item bodies, views, relations, formulas, rollups, and range operations | These operate on document data; they do not provision a server database or permissions |
| Writing columns | Two, three, and four columns, resizing, block movement, and flattening | A prose layout, not Word page columns or a Slides canvas |
| Mathematics | Inline/block LaTeX, rendering, and in-place structured editing | Nested drafts must be delivered before a host snapshot; Markdown has preservation limits |
| Media | Picture, video, and embed blocks | The host supplies asset storage and any required URL resolution |
| Page references | `@` and `[[` page search/navigation when `pageReferences` is supplied | The host supplies the page list, current page ID, and navigation; this is not a directory of people |

`NOTE_BLOCKS`, `NOTE_CONTENT`, `noteSlashItems()`, and the toolbar/block models are public declarations for integration. Import them from the package root. A file under `src/` is not automatically a supported import path. For example, `readNoteCSV` exists internally but is not a root export; use `importNoteExchange` for public CSV import.

## Session and save contract

| API or option | Behavior |
| --- | --- |
| `openNoteTree(tree, options)` | Opens a nested tree in a new store, editor, selection, and history |
| `openNote(source, sid, options)` | Copies the children of a stored body whose content contains node IDs |
| `noteTreeOf(source, sid)` | Reads stored children into a `note` tree without temporary node IDs; returns `undefined` if the root is missing |
| `options.session` | Sets the node-ID namespace; otherwise a new one is minted |
| `options.onChange` | Receives a snapshot of body blocks after a content-change pause |
| `options.after` | Sets that pause in milliseconds; default `350` |
| `session.flush()` | Synchronously delivers a pending callback; does nothing if no delivery is pending |
| `session.close()` | Flushes pending delivery and destroys the editor; repeated calls are safe |

Opening an unchanged Note does not emit `onChange`. Repeated `flush()` calls do not repeat an already delivered change. `flush()` and `close()` return `void`: neither awaits an asynchronous upload or database write started by the host. Keep host save ordering, failure handling, and navigation blocking explicit.

`onChange` and `noteTreeOf` deliver the body, not the root title/page identity or a complete workspace backup. Keep `NoteDocument.attributes.title` and optional `pageId` in host document state. A stable `session` is a namespace, not a durable anchor contract across arbitrary structural edits. Use `pageId` for page references; do not store a temporary editor node ID as a page ID.

### Complete explicit-save example

This browser-side example edits one run, flushes the pending body snapshot, writes the native Note format to a host callback, and reopens it. The callback stands in for storage; the example itself does not persist data or provide autosave. It deliberately uses a simple body without nested UI drafts.

```ts
import {
  openNoteTree, noteTreeOf, noteFileText, readNoteFile,
  type NoteDocument,
} from '@barocss/office-note';

export async function saveAndReopenNote(write: (text: string) => Promise<void>) {
  const initial: NoteDocument = {
    stype: 'note',
    attributes: { title: 'Meeting', pageId: 'meeting-42' },
    content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Draft' }] }],
  };
  let latest = initial.content;
  let deliveries = 0;
  const session = openNoteTree(initial, {
    session: 'meeting-42-body',
    onChange(blocks) { latest = blocks; deliveries++; },
  });
  try {
    const store = session.editor.dataStore;
    const paragraphId = store.getNode(session.rootId)?.content?.[0];
    if (typeof paragraphId !== 'string') throw new Error('Missing paragraph');
    const textId = store.getNode(paragraphId)?.content?.[0];
    if (typeof textId !== 'string') throw new Error('Missing text');
    const edited = await session.editor.executeCommand('replaceText', {
      range: {
        type: 'range', startNodeId: textId, endNodeId: textId,
        startOffset: 0, endOffset: 5, collapsed: false,
      },
      text: 'Decision recorded',
    });
    if (!edited) throw new Error('Edit was rejected');
    session.flush();
    session.flush(); // No duplicate delivery.
    const text = noteFileText({ ...initial, content: latest });
    await write(text); // The host decides what counts as a successful save.
    const read = readNoteFile(text);
    if ('error' in read) throw new Error(read.error);
    const reopened = openNoteTree(read.document);
    try {
      return {
        deliveries,
        title: read.document.attributes.title,
        pageId: read.document.attributes.pageId,
        blocks: noteTreeOf(reopened.editor.dataStore, reopened.rootId)?.content,
      };
    } finally {
      reopened.close();
    }
  } finally {
    session.close();
  }
}
```

Expected: one change delivery; title `Meeting`; page ID `meeting-42`; reopened text `Decision recorded`. A rejected `write` rejects the example. A production host should retain its editable session and unsaved snapshot when saving fails, so the user can retry; this disposable example closes its sessions in `finally`.

### Saving a mounted view

`NoteEditor` can contain nested database item bodies and a math draft. Supply `registerBeforeSnapshot(flush)` to collect their async delivery callbacks, and return an unsubscribe function from that registration. Before saving, run registered child callbacks deepest first, await them, and stop if a callback returns `false`. Then call the outer session's `flush()`, build the document with host-owned metadata, and await durable storage. Do not read the outer snapshot first.

The callback registry, save button, saving/error status, retry policy, and route guard belong to the host. The [reference app](https://github.com/barocss/barocss-editor/tree/main/apps/note) shows that assembly. Unmount cleanup releases the editor; it is not an async save-completion signal.

## Optional view integrations

The props below are in addition to the required `editor` and `rootId`. The view lives at `@barocss/office-note/view`.

| Prop | Integration |
| --- | --- |
| `toolbar` | `contextual` by default; `always` keeps the toolbar visible |
| `className` | Host layout/styling hook; load the package and shared styles too |
| `onFile(file)` | Resolves to the stored asset reference; without it the file path falls back to a data URI, increasing document size |
| `pageReferences` | Supplies `pages`, `currentPageId`, and `onNavigate`; optional `registerBeforeNavigate` and `revealItem` connect pending nested edits and item navigation |
| `registerBeforeSnapshot` | Registers pending nested-body/math delivery before export or save |
| `navigationRequest` | Supplies a document-navigation request; use the view's inferred prop type instead of an internal source import |

The host must make its returned asset references renderable. A custom `asset:` scheme is not an upload service or a URL resolver by itself. Page navigation can return `false` (or resolve to it) to decline navigation. A page-reference list is supplied by the host, not fetched from a cloud service by this component.

## Native files and interchange

Use `noteFileText` and `readNoteFile` for the native `.note.json` format. `readNoteFile` returns `{ document }` or `{ error }`; handle the error before opening a session. `noteLibrary` is a browser-local document library, not a remote repository. `/workspace` provides the product codec for the shared local workspace.

`importNoteExchange(source, filename)` selects Markdown, HTML, or CSV from the filename extension and throws for unsupported or invalid input. Native JSON uses `readNoteFile`, not this exchange function. `exportNoteExchange(document, format)` returns `{ text, extension, mime }` or throws. Neither function opens a file chooser or downloads a file.

| Format | Intended use and preservation limits |
| --- | --- |
| Note JSON | Native structured document and metadata; keep this when exchange would lose product structure |
| Markdown | Supported prose and `$…$` / `$$…$$` math; rejects unsupported blocks/marks, custom alignment/math sizes, and ambiguous math boundaries |
| HTML | A supported prose subset; not a complete Note/database/math export |
| CSV | Exactly one ordinary, unmerged table; not an export of an entire Note database or mixed document |

Markdown and HTML import use browser DOM APIs. Markdown raw HTML is disabled; HTML import removes active elements/attributes. This is not a general security guarantee for arbitrary host content or asset URLs. Retain the host's input and authorization checks.

```ts
import { importNoteExchange, exportNoteExchange } from '@barocss/office-note';

export function exchangeNoteMarkdown() {
  const original = importNoteExchange('# Review\n\nBefore $x^2$ after.', 'review.md');
  const exported = exportNoteExchange(original, 'markdown');
  const reopened = importNoteExchange(exported.text, `reopened.${exported.extension}`);
  return {
    extension: exported.extension,
    sameBody: JSON.stringify(reopened.content) === JSON.stringify(original.content),
  };
}
```

Expected: `{ extension: 'md', sameBody: true }` for this supported subset. Interchange imports derive a title from the filename; they do not preserve native page identity or prove a lossless conversion for every Note document. Show export errors and offer the native format instead of silently dropping content.
## Customization boundary

`openNoteTree(tree, options)` and `openNote(store, nodeId, options)` are the convenience path. Their options are `session`, `onChange`, and `after` (change-delivery delay, 350 ms by default). They construct the standard Note schema and kit internally. They do not accept `extensions`, `kit`, or a custom schema.

For lower-level composition, use `createNoteEditor({ dataStore, schema, extensions, kit, keybindings })`. Supply a schema and store; keep the Note schema vocabulary when using Note commands and renderers. `extensions` appends behavior to the default kit. `kit` replaces that kit. Additional keybindings are registered after the Note bindings.

With the lower-level factory, the host must load the document, connect change delivery, and destroy the editor. It does not receive the convenience session's `flush()` or `close()` wrapper. `NoteEditor` is the React surface; creating the model editor alone does not mount it.

For a new block type, provide its schema, commands, rendering, and controls. A new renderer alone is not a complete editing feature. See the [extension guide](https://editor.barocss.com/docs/guides/editor-extensibility).

## Documentation

- [Note integration guide](https://editor.barocss.com/docs/guides/note-integration)
- [Package guide](https://editor.barocss.com/packages/office-note)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-note)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
