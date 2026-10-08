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
| `@barocss/office-note/file` | Note file reader and clock-free serializer for server snapshots |

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

The `/file` entry reads Note files without loading workspace storage. `serializeNoteFile(document, { savedAt })` produces stable bytes for the same inputs. Omit `savedAt` to leave it out of the file. `readNoteSnapshotFile(text)` rejects an empty or non-string `savedAt` while the local `readNoteFile` remains compatible with existing files. For a server-issued page ID, `copyNoteSnapshotFile(text, newPageId)` validates and normalizes the source, changes the root ID and its own page references, then returns the stored file text. The caller still owns authorization, ID generation, idempotency, hashing, and persistence.

## Integration notes

openNoteTree creates its own store, selection, history, and unique session. close flushes pending onChange delivery and releases the editor. The host must await its own asynchronous storage work. NoteEditor manages its renderer registry.

## Customization boundary

`openNoteTree(tree, options)` and `openNote(store, nodeId, options)` are the convenience path. Their options are `session`, `onChange`, and `after` (change-delivery delay, 350 ms by default). They construct the standard Note schema and kit internally. They do not accept `extensions`, `kit`, or a custom schema.

For lower-level composition, use `createNoteEditor({ dataStore, schema, extensions, kit, keybindings })`. Supply a schema and store; keep the Note schema vocabulary when using Note commands and renderers. `extensions` appends behavior to the default kit. `kit` replaces that kit. Additional keybindings are registered after the Note bindings.

With the lower-level factory, the host must load the document, connect change delivery, and destroy the editor. It does not receive the convenience session's `flush()` or `close()` wrapper. `NoteEditor` is the React surface; creating the model editor alone does not mount it.

For a new block type, provide its schema, commands, rendering, and controls. A new renderer alone is not a complete editing feature. See the [extension guide](https://editor.barocss.com/docs/guides/editor-extensibility).

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-note)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-note)

## License

MIT. The published archive includes the license in `dist/LICENSE`.

## Explicit native2 local sessions

`createNoteNative2Context(rawSnapshotText)` validates a full version2 envelope and retains its original bytes, savedAt and complete immutable schema bundle. `openNoteNativeSnapshot(context)` is read-only by default. A file or bundle does not grant editing rights. A trusted local host can supply its existing `authority` editor. Parent editability, document epoch, root and session constrain local commands and pending delivery. This is local lifetime control, not authenticated server authorization.

```ts
const context = createNoteNative2Context(snapshotText);
const session = openNoteNativeSnapshot(context, {
  authority: hostEditor,
  onSnapshotChange: text => saveLocalSnapshot(text),
});
// First await NoteEditor's registerBeforeSnapshot delivery, then settle child
// sessions and the host's own asynchronous storage work.
session.flush();
const wholeSnapshot = session.exportSnapshot();
```

`exportNativeDocument()` extracts the whole live model. `exportSnapshot()` validates that model with the fixed context. Only an unchanged whole document can reuse original bytes. Supported attributes and metadata preserve unknown JSON, authored loadedAt, nulls, omitted keys, empty mark arrays, resources and page references. Undo/redo retains source shape by owned node identity. A bare `editor.loadDocument()` is refused; reopen with a new explicit context after settling input. A failed local delivery retains the dirty model and reports failure.

The first bridge accepts the existing trusted Note, heading, paragraph, inline-text, codeBlock, bTable/body/row/cell, pageReference, resources, richText and dataset vocabulary, with bold, italic, underline and literal `strike` marks. Explicit native2 factories and descendants use the trusted Note-only strike schema and command selector. Default v1 editors and shared schemas keep canonical `strikethrough`. Source names are never rewritten. Dataset fields remain passive text, number, boolean and choice data. It does not install a schema or renderer from imported JSON. Arbitrary extra root/descendant **node** keys remain codec-valid retained contexts but are refused before editor creation. Their original raw data is preserved. Unknown JSON **inside attributes or metadata** is supported. Other vocabulary is closed until its runtime behavior is separately verified.

For an authored richText resource, `openChildResource(resourceId)` creates a child bound to that exact resource, parent and document generation. Await the child's view input delivery, flush it, then await `commitChildResource(resourceId, child)` before parent export. Delivery uses one existing guarded engine transaction and local history, with full native and schema validation. Unrelated, reloaded, revoked or detached child/resource instances refuse delivery. The existing nonempty block schema rejects an empty body; no placeholder body is fabricated. Close child sessions before the parent. A retired dirty child remains a recoverable draft, not a successful save.

The local desktop diagnostic is `apps/note/scenarios.html?case=native2-A` (also A2, B and C). It does not activate native2 in the product workspace, public client, authenticated storage or backup. Full B local strike editing is supported. Server schema adoption, OIDC/product integration, pending lineage and external release remain separate work. The `/file` codec and Node facade remain independent of the browser editor entry.

Native text-range undo captures every affected text SID and restores exact mark omission, whole-run ranges, attributes and order through existing transactions. Local native extraction omits only known engine-created optional `attrs: undefined` on supported marks; other non-JSON values still refuse export. Interior collapsed formatting targets the next glyph. At the end of a text run, it refuses without changing the document or history. This is not sticky typing formatting. Synthetic desktop keyboard checks do not establish physical OS IME support.

The private app diagnostic `apps/note/scenarios.html?case=native2-transport-A` (also A2, B and C) exercises an explicitly imported GET-only reader. Its caller supplies the captured fetch/current-owner guard. It verifies the original document ID, native page ID, revision, UTF-8 raw hash and complete ordered immutable schema bundle before the trusted read-only session is installed. A raced, foreign, revoked or unrepresentable result keeps the previous model and retains refused native raw data. It neither grants editing rights nor installs a JSON renderer.

This diagnostic uses controlled HTTP fixtures. Supplied A2 and C files prove read preservation, not new server adoption or create-copy. It has no writes, receipts, pin-CAS digest, automatic retry, pending migration or ordinary workspace activation. The default v1 client remains native2 closed. Genuine two-account product UI, PostgreSQL/API, native2 writable recovery, backup and release require separate integration evidence.

## Experimental preserve-existing diagnostic

`apps/note/scenarios.html?case=native2-preserve-A` (also A2, B and C) adds an app-private writer and recovery journal. It uses the actual native editor, guarded root/child input delivery and browser Storage. Its HTTP store and issuer/subject/authority are controlled test fixtures. The diagnostic requires the test fixture routes; opening the URL alone does not provide a server or authenticated account.

Use **Save fixed request** to flush and protect the whole native draft, freeze its exact update request and verify durable read-back before PUT. The request uses only the existing experimental `/v1/tenants/{tenant}/note-native2/documents/{document}/snapshot` namespace with `schemaAction: preserve`. It retains the original document/page identity and the entire ordered schema bundle. Revision, raw snapshot hash and the experimental prior-pin CAS prevent implicit adoption or rebasing. Imported A2 and C remain supplied inputs; this diagnostic does not adopt a schema or create a copy.

**Check receipt** sends GET only. A lookup after total response loss cannot prove request correlation from an opaque `requestHash`, so it remains unconfirmed. **Retry fixed request** explicitly resends only the same durable key and exact six-key body. A direct response supplies the observed opaque hash; confirmation also requires a full same-owner current read with matching head, raw snapshot and bundle. Historical receipts and retired owners cannot confirm the fixed generation. A later draft remains dirty and cannot replace the attempted request. The private journal permits an explicit subsequent freeze only from that owner's verified fixed confirmation and retains prior fixed requests as lineage; the diagnostic itself does not expose that subsequent-freeze control.

Recovery records use the isolated `wonffice.note.experimental-native2-preserve.v1:` prefix and the exact issuer, subject, tenant, workspace and document scope. Records keep the verified base, immutable fixed attempt, latest whole draft and observed receipt lineage separately. Reload recovers the same bytes without sending. Corrupt records are retained and refused. Quota or read-back failure does not report successful protection. **Leave after protecting input** flushes and verifies protection before retiring the owner; failure blocks a clean leave. Abrupt revocation retains unresolved input and never claims unflushed DOM input was durably saved. Exit never sends or retries.

This prefix provides functional discovery separation, not encryption, cross-account confidentiality or complete logout retirement. The recovery journal is not a second authoritative content store. Ordinary v1 workspace/client/pending paths remain native2 closed. Genuine OIDC users, PostgreSQL/API/product UI persistence, shared account retirement, adoption/copy/backup, agent transport and external release remain separate gates. Desktop synthetic input and controlled role revocation do not prove physical OS IME or genuine server authorization.

## Experimental exact-version adoption prerequisite

`apps/note/scenarios.html?case=native2-adopt-A` is a controlled client diagnostic. **Prepare exact schema 111 v2** protects the whole source input, captures the actual dataset node/path and reads the chosen exact registered version and complete parent/dependency closure. **Adopt fixed target** freezes a separate update/adopt request and verifies recovery read-back before PUT to the existing experimental snapshot namespace. Registration or a schema file does not grant adoption rights. The caller and server must still enforce current authority.

The first supported target replaces the selected v1 tuple with that schema's explicit v2 tuple, retains all old definition texts and their order, and appends the exact registered v2 definition. It separately appends the passive `Owner` text field labelled `\uB2F4\uB2F9\uC790` (the original authored Korean label) to the captured dataset. The four old field declarations, all records, omitted values, authored metadata, native IDs, resources, page references, marks and `savedAt` remain. A pure pin swap fails the existing codec's same-name field check. Ambiguous paths, renamed/removed/retyped fields, changed old options, unknown kinds or executable renderer requirements refuse. This is a closed first prerequisite, not arbitrary schema installation or a public SDK.

The isolated `wonffice.note.experimental-native2-adopt.v1:` journal retains the old source base, fixed whole target/action/key/body and latest whole original-context source draft separately. Unresolved legacy or preserve recovery blocks a new adoption and is not rewritten or removed. **Check receipt** is GET-only. A lookup after total reply loss stays unconfirmed until an explicit **Retry fixed request** returns correlation for exactly the durable action/key/body. `requestHash` remains opaque. Confirmation also requires matching whole current target head, raw data and full bundle under the same captured writable owner. Origin lifetime is checked again across awaited Storage validation and immediately before effects/read-back.

Fixed target confirmation never installs a new schema into the live editor. The original A1 context, model SIDs, local history, selection and focus remain; later root/last-child input stays a separate dirty source draft. **Leave after protecting input** settles input and verifies recovery before retiring the owner. Failure blocks a clean leave, and abrupt revocation does not claim unflushed DOM input is durable. Exit never sends or retries. **Leave protected and open target read-only** performs that protected exit first, then opens the existing separate read-only transport diagnostic. It does not demonstrate an editable in-place v2 context transition or cross-context history migration.

The diagnostic uses actual native editing and browser Storage with controlled HTTP, issuer/subject and authority fixtures. It requires the fixture routes; the URL alone supplies no server or genuine account. Scoped prefixes provide functional separation, not encryption, confidentiality or complete account retirement. Ordinary v1/product routes and pending storage stay closed to native2. Genuine OIDC users, API/PostgreSQL/product UI, current locked permissions, live schema/context transition, adoption concurrency/restart, backup, agent transport, installation and release need their own integration evidence. Synthetic desktop input does not establish physical OS IME support.
