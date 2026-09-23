# @barocss/office-word

Word-processing schema, editor kit, pagination, formatting, and document UI components.

## Purpose

Use the root entry for document behavior and the /ui entry for React controls. The complete application assembly is in apps/word.

## Install

```sh
npm install @barocss/office-word react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-word` | Public JavaScript and TypeScript API |
| `@barocss/office-word/ui` | React UI components |
| `@barocss/office-word/ui.css` | Stylesheet |
| `@barocss/office-word/workspace` | Workspace file codec |

Import only these public paths. Source paths such as `@barocss/office-word/src/...` are not part of the published API.

## Usage

```ts
import { createWordEditor, getWordSchemaDefinition } from '@barocss/office-word';

const editor = createWordEditor();
console.log(getWordSchemaDefinition().topNode);
console.log(editor.getRootId());
// Keep this editor for the host's view, layout, and controls.
// When the host closes the document:
editor.destroy();
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. Load `@barocss/office-text/text.css` for shared document content. This package also exposes `@barocss/office-word/ui.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Host integration

Register `registerWordRenderers` in the registry passed to `EditorViewDOM`. The host also coordinates measurement and pagination. `Ribbon`, `Ruler`, `DrawingOverlay`, `OutlinePane`, and dialogs are available from `/ui`. See [the Word host](https://github.com/barocss/barocss-editor/tree/main/apps/word) for the full composition; the example above intentionally creates only the editor session.

## Integration notes

createWordEditor creates a session, not a ready-mounted word processor. A host must connect the DOM view, page measurement/layout, selection overlays, storage, and UI. Importing the package does not provide a cloud document service.

## Implemented feature surfaces

This inventory describes source commit `558714a8` (2026-09-20). It is not a claim of full Microsoft Word compatibility or identical support in every previously published npm version.

| Surface | Package implementation | Integration boundary |
| --- | --- | --- |
| Writing and styles | Character/paragraph formatting, named styles, lists, borders, spacing, format painting, find/replace | Commands, selection, render environment, and controls must use the same editor |
| Page layout | Flow sections, paper/margins, pagination, paragraph/table splitting, headers/footers, page and line numbering | Requires measured DOM content and host layout callbacks; a factory call does not paginate |
| Tables and objects | Table commands/resizing, object positioning/resizing, drawing shapes/connectors | Pointer tools and overlays must be mounted by the host |
| References | Outline, contents, bookmarks, captions, cross references, fields, and notes | Page-dependent results require current layout; not every field survives DOCX exchange |
| Review | Comments and tracked-change recording/review | Local document structures and commands; identity, permissions, and real-time transport remain host services |
| Mathematics | Structured Word math, KaTeX display, dialog and in-place math-editor integration | The public dialog is `WordMathEditor` from `/ui`; in-place wiring is composed by `Ribbon`, not a separate root export |
| Storage and exchange | Native Word JSON, local library helpers, bounded DOCX import/export, print-page construction | No cloud storage, sharing service, or server PDF endpoint is created |

`WORD_TOOLBAR`, `WORD_MENUS`, `WORD_KEYBINDINGS`, and other root exports expose product declarations for hosts. `/ui` exposes React controls, not one ready-mounted application component. Internal helpers under `src/` are not public import paths.

## Document and display contracts

Use `createStarterDocument()` for a blank styled document. It contains metadata, a flow `surface`, and a paragraph, with Letter paper and one-inch margins. `createSampleDocument()` is a richer demonstration document, not the default content to load over a user's saved work.

The root is `document`. A flow `surface` represents a section, not a printed sheet. A section can produce many pages. `surfaceCount()` counts flow sections; do not use it as the page count in a status bar. Title text is in `docMeta` / `docTitle`, separate from the first body heading. `wordTitle()` reads that metadata from a document access object.

Page dimensions, margins, and paragraph distances use the relevant Word-format units, commonly twips (1/1440 inch); character font sizes use half-points where specified by the format attributes. Use the exported conversion and formatting helpers. Viewport zoom is view state and must not rewrite document geometry or font sizes.

### Connect a view and layout

1. Create the editor, then load a starter or checked saved document.
2. Register `registerWordRenderers` in the registry used by `EditorViewDOM`.
3. Supply a document access object whose `rootId` reads `editor.getRootId()` each time. Loading another document replaces the root.
4. Supply `createWordEnv` through `WORD_ENV_KEY`, then register a `createWordLayoutPass` with the view. Its `revision` callback must change with content so style/numbering/field caches refresh even if page geometry is unchanged.
5. Connect the pass's layout and paragraph/table break callbacks to the matching widgets and page UI. Enabling `splitBlocks` alone does not install the widgets.
6. Mount selection overlays, cell selection and table resize handlers, ruler, and the chosen `/ui` controls. Keep their editor, view, document access, and zoom consistent.
7. Load the shared/product styles and font resources. Rerender and remeasure when fonts become ready. Release views, listeners, print hooks, and the editor when the host closes the document.

The full composition is in [apps/word/src/main.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/word/src/main.tsx) and [apps/word/src/app.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/word/src/app.tsx). The steps above describe that assembly; they are not a replacement for the complete host.

`createFontLoader().ensure(family)` can fetch catalogued web fonts through Google Fonts. An offline or internally hosted product must choose how to provide its fonts. A resolved request can still use a fallback if loading failed; it does not prove a particular font is available on every machine.

### Printing

`createPrintPages(rootGetter, document, options)` works from already rendered `.w-sheet` elements. `build()` returns the number of print copies; it returns zero if there is no rendered root or sheet. `clear()` removes the copies. `attach()` connects browser print events and returns a disposer that removes its listeners and copies.

Provide the matching print CSS/page setup and finish layout/font loading before printing. The `prepare` option can temporarily leave header/footer editing mode while making the copies, then restore the UI. These are DOM print helpers; they do not return PDF bytes or validate physical printer output. The host decides how to present the browser print dialog.

## Native files and save lifecycle

| API | Result |
| --- | --- |
| `wordFileText(tree, savedAt?)` | A JSON string in the `barocss-word` envelope; removes temporary `sid`/`parentId` from tree nodes |
| `readWordFile(text)` | `{ document, version }` or `{ error }`; handle the error before loading |
| `wordFileName(title)` | A sanitized `.word.json` filename, without writing or downloading it |
| `WORD_FILE_VERSION` | Native format version, currently `1`; independent of the npm package version |
| `wordLibraryRows`, `wordLibraryDocument`, `keepWordDocument` | Browser-local library integration; not remote storage |
| `/workspace` | Native codec used by the shared workspace, without mounting the editing UI |

`readWordFile` checks the envelope and basic document shape. It does not fully validate the Word schema. Loading reports structural findings in `editor.documentFaults`; an empty findings list is not a general security, formatting-fidelity, or mark-validation guarantee. Decide how to present findings before replacing the user's active work. A temporary editor can load a candidate first.

The factory does not start autosave. Subscribe to content changes if your host needs it, export the current tree, await durable storage, and keep dirty/error state until that write succeeds. Keep unsaved work when storage fails. Apply or cancel any open UI draft before taking the snapshot; an unapplied math dialog draft is not in the document yet.

### Complete native-file example

This example uses a model session and a host storage callback. It does not mount a Word screen, provide autosave, or write to a server by itself.

```ts
import {
  createWordEditor, createStarterDocument, wordFileText, readWordFile,
  wordFileName, WORD_FILE_VERSION,
} from '@barocss/office-word';

export async function saveAndReopenWord(write: (text: string) => Promise<void>) {
  const editor = createWordEditor();
  const reopened = createWordEditor();
  try {
    editor.loadDocument(createStarterDocument());
    const store = editor.dataStore;
    const paragraph = store.getAllNodes().find(node => node.stype === 'paragraph');
    const textId = paragraph?.content?.[0];
    if (typeof textId !== 'string') throw new Error('Missing starter text');
    const edited = await editor.executeCommand('replaceText', {
      range: {
        type: 'range', startNodeId: textId, endNodeId: textId,
        startOffset: 0, endOffset: 0, collapsed: true,
      },
      text: 'Decision recorded',
    });
    if (!edited) throw new Error('Edit was rejected');
    const text = wordFileText(editor.exportDocument());
    await write(text);
    const read = readWordFile(text);
    if ('error' in read) throw new Error(read.error);
    reopened.loadDocument(read.document);
    if (reopened.documentFaults.length) throw new Error('Reopened document has schema findings');
    return {
      version: read.version,
      currentFormatVersion: WORD_FILE_VERSION,
      filename: wordFileName('Review'),
      restoredText: reopened.dataStore.getAllNodes()
        .find(node => node.text === 'Decision recorded')?.text,
      hasTemporaryIds: /"(?:sid|parentId)"\s*:/.test(text),
    };
  } finally {
    reopened.destroy();
    editor.destroy();
  }
}
```

Expected: both versions are `1`, filename `Review.word.json`, restored text `Decision recorded`, and no temporary IDs in the file. A failed `write` rejects the example. The disposable example always destroys its editors; a real application should keep its active editor and snapshot for retry after a save failure.

## DOCX is bounded interchange

`exportWordDocx(tree)` returns `{ bytes: Uint8Array, warnings: string[] }`. `readWordDocx(bytes, title?)` returns `{ document, warnings }` and uses browser XML APIs. Invalid/unsupported input can throw. These functions do not modify an active editor, ask for confirmation, or download files. Decode first, present warnings, preserve the original, and load the candidate only after the host's save/navigation policy permits it.

| Data | Reviewed exchange boundary |
| --- | --- |
| Text and direct formatting | Selected run/paragraph formatting, spaces, breaks, and page setup |
| Styles | Supported named paragraph/character styles, inheritance, next-style and direct overrides; invalid definitions can warn or reject |
| Bookmarks and references | Supported within-paragraph anchors and REF fields; multi-paragraph ranges and advanced fields are outside preservation scope |
| Tables | Basic grid and horizontal merges; export warns about theme, shading, vertical merges, and individual widths |
| Vertical merges / nested tables on import | Rejected rather than treated as preserved |
| Images, structured math, lists, headers/footers, notes, comments, tracked changes | Not an original-form preservation contract; keep native JSON and the original DOCX |

The importer limits input ZIP bytes to 10 MiB, main document XML to 10 MiB, and supported styles/relationship parts to 2 MiB each. It rejects declared XML entities and external style relationships. These limits are not a promise to accept every smaller DOCX or to serve as a general Office-file security scanner.

Both paths include baseline warnings even for simple documents. An empty warning list is not the normal success criterion. Export's warnings also cannot be treated as an exhaustive machine-readable loss report for every possible attribute. Do not label a file “fully compatible” merely because it opened.

```ts
import { createStarterDocument, exportWordDocx, readWordDocx } from '@barocss/office-word';

export function exchangeStarterDocx() {
  const source = createStarterDocument();
  const before = JSON.stringify(source);
  const exported = exportWordDocx(source);
  const imported = readWordDocx(exported.bytes, 'Imported review');
  return {
    byteLength: exported.bytes.byteLength,
    sourceUnchanged: JSON.stringify(source) === before,
    rootType: imported.document.stype,
    warnings: { export: exported.warnings, import: imported.warnings },
  };
}
```

Expected: nonempty bytes, `sourceUnchanged: true`, root type `document`, and nonempty warning arrays. This checks a supported starter, not arbitrary DOCX fidelity. Store native `.word.json` for the product document; DOCX is an exchange copy.

## Verification boundaries

The public examples above are compiled against locally packed libraries and executed separately from the full Word UI. Existing source/tests cover individual features, but that does not mean every app flow has passed. [Issue #300](https://github.com/barocss/barocss-editor/issues/300) tracks UI scenarios that need the current compact-to-detailed ribbon path; [#303](https://github.com/barocss/barocss-editor/issues/303) tracks broader product scenarios. Their pending status is not resolved by this documentation.

## Customization boundary

`createWordEditor(options)` accepts these composition options:

| Option | Behavior |
| --- | --- |
| `extensions` | Append extension instances after the default product kit |
| `kit` | Replace the default product extension kit, including when set to an empty array |
| `schema` | Replace the default product schema; it is not merged automatically |
| `keybindings` | Register additional bindings without clearing the existing registry |

Keep the product's schema, commands, and renderers compatible. An arbitrary schema accepted by the factory does not make every product control work with that schema. A custom extension does not automatically add a toolbar or inspector control.

The `author` option supplies the identity used by document features such as comments. It is not authentication. The factory adds Word keybindings before caller keybindings. Keep pagination and measurement in the host; changing a renderer can change page geometry.

See [extension boundaries and product customization](https://editor.barocss.com/docs/guides/editor-extensibility) before replacing a kit or adding a node type.

## Documentation

- [Word integration guide](https://editor.barocss.com/docs/guides/word-integration)
- [Package guide](https://editor.barocss.com/packages/office-word)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-word)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
