# @barocss/office-slides

Presentation schema, editing commands, slide geometry, playback, and React workspace components.

## Purpose

Use the root entry for deck behavior and the /ui entry for Stage, filmstrip, properties, presentation, and other React surfaces.

## Install

```sh
npm install @barocss/office-slides react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-slides` | Public JavaScript and TypeScript API |
| `@barocss/office-slides/ui` | React UI components |
| `@barocss/office-slides/slides.css` | Stylesheet |
| `@barocss/office-slides/ui.css` | Stylesheet |
| `@barocss/office-slides/workspace` | Workspace file codec |

Import only these public paths. Source paths such as `@barocss/office-slides/src/...` are not part of the published API.

## Usage

```ts
import { createSlidesEditor, createStarterDeck } from '@barocss/office-slides';

const editor = createSlidesEditor();
editor.loadDocument(createStarterDeck(), 'deck-session');
console.log(editor.getRootId());
// Hand the session to your Stage and workspace UI.
// When the host closes the deck:
editor.destroy();
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. Load `@barocss/office-text/text.css` for shared document content. This package also exposes `@barocss/office-slides/slides.css`, `@barocss/office-slides/ui.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Host integration

Register `registerSlidesRenderers` for the deck view. Compose `Stage`, `SlideSidebar`, `Properties`, and presentation surfaces from `/ui`. Keep the viewport scale separate from document geometry. See [the Slides host](https://github.com/barocss/barocss-editor/tree/main/apps/slide) for the complete assembly.

## Integration notes

createSlidesEditor and createStarterDeck prepare a deck session. The complete UI assembly, viewport ownership, and persistence wiring are in apps/slide. A deck uses shared text and canvas behavior; it does not use the Word page layout loop.

## Implemented feature surfaces

This inventory reviews source commit `558714a8` (2026-09-20). It describes implemented surfaces, not full PowerPoint compatibility or support in every older npm archive.

| Surface | Package implementation | Host responsibility |
| --- | --- | --- |
| Deck and design | Slide creation/order/visibility, templates, themes, masters, layouts, placeholder inheritance | Mount controls, select the active slide, protect unsaved work when replacing a deck |
| Canvas editing | Placed text/shapes/images/tables, groups/frames, alignment, snapping, guides, connectors, paint/effect stacks | Connect the DOM view, selection overlay, pointer gestures, and viewport |
| Reusable content | Component definitions/instances, variables, bindings, and import plans | Supply source documents and decide when to apply an import/update |
| Text and review tools | Shared text editing, find/replace, notes, model-based deck audit | Keep caret, selected objects, active slide, and property controls consistent |
| Motion and presentation | Timelines, transitions/builds, paths, text/media timing, jump links, scroll playback, presenter surfaces | Own playback state and timers; connect stage input, media, and window lifecycle |
| Files and print | Native deck JSON, local library/persistence helpers, workspace codec, browser print pages | Storage policy, save errors, fonts/assets, sharing, authorization, and downloads |

The root entry provides model helpers and renderer registration. `/ui` contains React components and hooks. A factory call does not mount an application. The reviewed public exports do not provide a PPTX importer/exporter, a server PDF service, or a hosted share URL.

## Document and coordinate contracts

`createStarterDeck()` creates one title slide with empty title/subtitle paragraphs, metadata, a theme, a master, and layouts. Placeholder prompts are display text, not stored title words. Use `createSampleDeck()` only for demonstration content.

The root is a `document`. `deckSlides(doc)` returns top-level `surface` nodes in document order. Starter surfaces carry `kind: 'slide'`; enumeration itself checks `stype`, not that attribute. Metadata/resources are also root children; a slide's displayed number is not its root-child index. Hidden slides remain in the document. Filter them for a presentation instead of deleting them.

| Value | Meaning |
| --- | --- |
| Slide width/height and object x/y/width/height | Twips: 1/1440 inch; 15 twips = 1 CSS pixel at natural scale |
| `SLIDE_16_9` | 19200 × 10800 twips, or 1280 × 720 natural CSS pixels |
| `canvasX` / `canvasY` on a slide | Workspace board position in unscaled CSS pixels; separate from objects inside the slide |
| `Stage.boards` | Board bounds in unscaled CSS pixels; convert slide dimensions before supplying them |
| Zoom, pan, active slide, playback position | View/host state; zoom must not rewrite slide dimensions or object geometry |
| `sid` / `parentId` | Temporary session identity; not durable cross-file references |

Moving a board does not reorder presentation slides. Object positions may be relative to a containing frame; use `toSurface` / `fromSurface` to translate x/y through container origins. These helpers do not apply a general rotation/scale matrix. Do not mix workspace board positions with a shape's twip coordinates.

### Complete geometry example

```ts
import { SLIDE_16_9, fitScale, placementCss, twipToPx } from '@barocss/office-slides';

export function fitDeckViewport() {
  const shape = { x: 1440, y: 720, width: 2880, height: 1440 };
  const before = JSON.stringify(shape);
  const scale = fitScale(SLIDE_16_9, { width: 800, height: 500 }, { padding: 40 });
  return {
    scale,
    naturalWidth: twipToPx(SLIDE_16_9.width),
    css: placementCss(shape),
    screenWidth: twipToPx(shape.width) * scale,
    geometryUnchanged: JSON.stringify(shape) === before,
  };
}
```

Expected: scale `0.5625`, natural width `1280`, shape CSS width `192px`, and displayed width `108px`. The shape remains unchanged. `fitScale` uses CSS-pixel viewport dimensions, defaults to a maximum scale of `1`, and does not account for a frame's position on screen. Apply the result through the host viewport; it does not resize the document.

## Connect the editor, stage, and controls

The complete assembly is [apps/slide/src/main.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/slide/src/main.tsx) and [apps/slide/src/app.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/slide/src/app.tsx).

1. Create an editor and load a starter or checked native file. Keep the editor and its store together.
2. Call `registerSlidesRenderers()`. The supplied host uses the global registry for `EditorViewDOM`.
3. Supply a document access object with a live `rootId` getter. A later `loadDocument` replaces the root ID.
4. Pass `createDeckEnv(doc)` under `WORD_ENV_KEY` from `@barocss/office-text`. Slides reuses the text-format environment for theme/master/layout inheritance. Its positioned surfaces do not use Word pagination.
5. Register `createConnectorPass({ doc })` on the view. Connector routes depend on other shapes; registering renderers alone does not install that pass.
6. Mount `Stage` with the host element used by the DOM view. Connect `SelectionOverlay`, `SlideSidebar`/`Filmstrip`, `Properties`, `Ribbon`, and the chosen panes to the same editor and active slide. `Stage` does not create an editor from a document prop.
7. Supply board positions, zoom callbacks, and actual scale to the relevant controls. Distinguish selecting an object from editing text inside it. Cell selection is installed by the host with the shared text tools.
8. Connect presentation state and native persistence separately. Load Office/product styles and register `trackPropertyCss()` for animated custom properties, including a second presenter document.
9. On close, release view/editor, subscriptions, persistence, print hooks, and auxiliary windows.

`useDeck`, `useRevision`, and `useNote` from `/ui` subscribe to content changes. These hooks do not choose a slide or synchronize DOM focus for the application. The host must reconcile active slide, object selection, caret, and sidebar state after a new deck or slide is opened.

## Native files and persistence

| API | Contract |
| --- | --- |
| `deckFile(tree, savedAt?)` / `deckFileText(tree, savedAt?)` | Envelope/object or JSON string with `format: 'barocss-slides'`; removes temporary IDs from tree nodes |
| `readDeckFile(text)` | `{ document, version }` or `{ error }`; inspect before replacing active work |
| `DECK_FILE_VERSION` | Data format version, currently `1`; independent of npm package version |
| `deckFileName(title)` | Sanitized `.slides.json` filename; no write/download |
| `deckTitle(doc)` | Reads the opening slide's title-role content, not the slide label or document metadata |
| `libraryRows`, `libraryDeck`, `keepInLibrary`, `dropFromLibrary` | Named deck library in browser-local storage |
| `useSlidePersistence` from `/ui` | Opt-in local document session with status and `beforeReplace`; started by the hook, not by the editor factory |
| `/workspace` | Public `create`, `schema`, `read`, and `text` codec entry; no editing screen |

Native parsing checks the file envelope and basic document shape. It is not full schema validation. Loading into a temporary editor and checking `documentFaults` can report structural findings, but does not prove every mark, asset, or rendered feature is valid.

Keep document-owned layout/master/component names intact. Reload assigns fresh session IDs. A native JSON file carries data and asset references; it does not fetch and bundle every external font, image, or video. An expired asset URL is not repaired by saving the tree.

The named library and local document session are distinct stores. The supplied persistence session has document/recovery storage and prefers metadata for its display title before falling back to `deckTitle`. Do not treat either store as cloud backup or cross-device collaboration. Await the save result, retain unsaved work on failure, and use `beforeReplace` before navigating to another document. Handle the rejected/false path in the host.

### Complete save and reopen example

```ts
import {
  createSlidesEditor, createStarterDeck, deckSlides, deckFileText,
  readDeckFile, deckFileName, DECK_FILE_VERSION,
} from '@barocss/office-slides';

export async function saveAndReopenDeck(write: (text: string) => Promise<void>) {
  const editor = createSlidesEditor();
  const reopened = createSlidesEditor();
  try {
    editor.loadDocument(createStarterDeck(), 'draft');
    const doc = {
      get rootId() { return editor.getRootId()!; },
      getNode: (id: string) => editor.dataStore.getNode(id),
    };
    const first = deckSlides(doc)[0];
    if (!first) throw new Error('Missing starter slide');
    const changed = await editor.executeCommand('setSlideInfo', {
      slideId: first.sid, name: 'Overview', canvasX: -320, canvasY: 840,
    });
    if (!changed) throw new Error('Slide edit was rejected');
    const text = deckFileText(editor.exportDocument());
    await write(text);
    const read = readDeckFile(text);
    if ('error' in read) throw new Error(read.error);
    reopened.loadDocument(read.document, 'reopened');
    if (reopened.documentFaults.length) throw new Error('Reopened deck has schema findings');
    const restored = deckSlides({
      rootId: reopened.getRootId()!,
      getNode: (id: string) => reopened.dataStore.getNode(id),
    });
    const attrs = reopened.dataStore.getNode(restored[0].sid)?.attributes;
    return {
      version: read.version, currentFormatVersion: DECK_FILE_VERSION,
      filename: deckFileName('Review'), count: restored.length,
      name: restored[0].name, canvasX: attrs?.canvasX, canvasY: attrs?.canvasY,
      freshSessionId: restored[0].sid !== first.sid,
      hasTemporaryIds: /"(?:sid|parentId)"\s*:/.test(text),
    };
  } finally {
    reopened.destroy();
    editor.destroy();
  }
}
```

Expected: version `1`, filename `Review.slides.json`, one slide named `Overview`, board position `(-320, 840)`, fresh session identity, and no temporary IDs in the file. A failed `write` rejects the example. This disposable model example always closes its editors; a live application must keep its active editor and unsaved snapshot available for retry. It does not mount a UI or implement autosave.

## Playback is separate from document editing

Motion definitions and named jump targets are document data. Current slide, played build count, preview run, and playhead are host state. `advanceShow(1 | -1, state)` returns the next state fragment or `null`; it does not change the editor or start an animation. Supply visible slides in presentation order and build counts from your timeline. Apply returned `slide`, `played`, and `back` values in the host.

`showing(where)` resolves that state for the stage: normal editing returns `undefined`; live playback runs; stepping back holds the end without restarting media; scrubbing/scrolling holds a moment. `linksOnly` stops ordinary navigation after the current slide's builds. Jump-link resolution is a separate path.

### Complete playback example

```ts
import { advanceShow, showing, type Where } from '@barocss/office-slides';

export function previewDeckNavigation() {
  const shown = [{ sid: 'first' }, { sid: 'second' }];
  const base: Where = {
    presenting: false, played: 0, settled: false,
    run: 0, playing: 0, shown: 1, moment: 0,
  };
  return {
    editing: showing(base),
    nextBuild: advanceShow(1, { shown, at: 0, played: 0, builds: 2 }),
    nextSlide: advanceShow(1, { shown, at: 0, played: 2, builds: 2 }),
    previousSlide: advanceShow(-1, {
      shown, at: 1, played: 0, builds: 0, pressesOf: () => 2,
    }),
    linksOnlyEnd: advanceShow(1, {
      shown, at: 0, played: 2, builds: 2, linksOnly: true,
    }),
    scrub: showing({ ...base, shown: 2, moment: 400 }),
  };
}
```

Expected: editing is `undefined`; forward plays build `1`, then moves to `second` at build `0`; back enters `first` at build `2`; links-only returns `null`. Scrubbing holds `400ms` on press `2`, with only one press completed and `plays: false`. The two IDs are synthetic inputs for a pure calculation; use current session slide IDs in a real host. This example tests state rules, not a projector or media browser policy.

`Present`, `Presenter`, `PresenterWindow`, and `TimelinePane` are `/ui` components. The presenter window uses a React portal and callbacks to share the opener's state. It is not a remote viewer or synchronization service. The host must handle window closure or a blocked popup. Media/fonts/assets must be available in the environment where the deck is shown.

## Print and verification limits

`createSlidePrint(editor, owner?)` is exported from `/ui`. `build()` constructs DOM print pages for non-hidden slides. `print()` prepares fonts/images and opens the browser print UI; `clear()` removes the pages. `attach()` installs print event handlers and returns cleanup. Load renderers and styles first. `SlidePrintDialog` exposes this workflow; PDF is a destination in the browser print dialog, not returned PDF bytes. Print output is static and does not preserve interactive motion/media playback.

The public examples are model/geometry/playback checks, not certification of the complete editing application. At this source revision, [#298](https://github.com/barocss/barocss-editor/issues/298) records a new-slide input target defect; its fix in [#310](https://github.com/barocss/barocss-editor/pull/310) is separate and unmerged. [#301](https://github.com/barocss/barocss-editor/issues/301) and [#302](https://github.com/barocss/barocss-editor/issues/302) track UI test entry/selector repairs, not proof that every later feature assertion failed. [#303](https://github.com/barocss/barocss-editor/issues/303) tracks wider product verification. This documentation does not close those issues.

## Documentation

- [Slides integration guide](https://editor.barocss.com/docs/guides/slides-integration)

- [Package guide](https://editor.barocss.com/packages/office-slides)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-slides)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
