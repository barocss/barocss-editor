---
title: Integrate Slides
sidebar_label: Slides integration
---

`@barocss/office-slides` provides a deck model, editing commands, coordinate helpers, and playback rules. Its `/ui` entry provides React surfaces. A host connects these parts to a DOM view, persistence, navigation, and assets.

This guide reviews source commit `558714a8` (2026-09-20). The [Slides README](/packages/office-slides) is the canonical API contract and owns the complete examples. The reviewed implementation may be newer than an installed npm archive.

## Choose the integration boundary

| Layer | Package provides | Host connects |
| --- | --- | --- |
| Document | Schema, editor kit, slide/design/object commands, templates | Load a starter or saved tree; track unsaved work |
| View | Renderers, deck format environment, connector pass, Stage | DOM view, styles, viewport, active slide and selection |
| Controls | Sidebar, ribbon, properties, timeline, notes, dialogs | Callbacks and one consistent editor/view state |
| Presentation | Navigation/clock calculations, audience and presenter components | Playback state, timers, media, windows, assets |
| Persistence | Native codec, local library/session helpers, workspace entry | Save policy, failure recovery, remote services if needed |

See the [implemented feature inventory](/packages/office-slides#implemented-feature-surfaces) before selecting components. An exported control is not a complete hosted service. The reviewed package does not expose PPTX exchange or a server PDF API.

## Keep the document and viewport distinct

A starter has one title slide plus theme/master/layout definitions. Empty title placeholders contain empty paragraphs; prompts are shown by the view. Do not load sample content over an existing saved deck.

`deckSlides` reads presentation order from the document. Moving slides around the free canvas does not change that order. Hidden slides remain saved and are filtered for presentation.

The [coordinate contract and complete example](/packages/office-slides#document-and-coordinate-contracts) explain the important unit boundary: slide/object geometry is in twips, while board placement and `Stage.boards` use unscaled CSS pixels. Convert dimensions before passing them to the stage. Camera zoom changes the view, not saved shape sizes.

## Assemble a working editor

Follow the [host assembly sequence](/packages/office-slides#connect-the-editor-stage-and-controls). The source hosts are [main.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/slide/src/main.tsx) and [app.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/slide/src/app.tsx).

Register the Slides renderers and use the matching registry in `EditorViewDOM`. Supply `createDeckEnv(doc)` through `WORD_ENV_KEY` from the shared text package, so theme/master/layout text formatting resolves. The name of this environment does not mean Slides uses Word's pagination loop. Install the connector pass for derived routes.

Mount `Stage` around the DOM view's host and connect selection overlays and controls to the same session. After opening a deck or adding a slide, active slide, sidebar, selected objects, caret, and property panel must agree. `useDeck` observes data; it does not own focus.

Load [Office styles](/docs/guides/office-styling) and product CSS. Register the motion custom-property CSS through `trackPropertyCss()` where animated content is drawn. Keep document access live after reload, and release listeners, views, editors, and auxiliary windows when closing.

## Make save outcomes explicit

The [native-file contract](/packages/office-slides#native-files-and-persistence) covers the `barocss-slides` envelope and `.slides.json` files. Format version `1` is separate from package versions. Session IDs are removed; references that must survive reload use document-owned identity.

The [complete save/reopen example](/packages/office-slides#complete-save-and-reopen-example) changes slide metadata and workspace position through a public command, awaits a host write, and opens the result in a fresh model session. It also explains why a failed write must leave a real application's active work available for retry.

The factory does not start autosave. `useSlidePersistence` is an opt-in local session hook. Its document/recovery storage is distinct from the named deck library helpers. Both are browser-local mechanisms, not cross-device backup. Native JSON also does not package external media/font bytes.

Handle `readDeckFile` errors before loading. Successful envelope parsing is not complete schema validation. A candidate editor can report structural findings through `documentFaults`; keep validation findings and the decision to replace unsaved work visible to the host.

## Own presentation state once

The [playback contract and complete example](/packages/office-slides#playback-is-separate-from-document-editing) separate stored motion definitions from current playback state. `advanceShow` calculates a navigation result. `showing` calculates whether a build runs or is held. Neither starts a show on its own.

Forward navigation consumes builds before moving to another slide. Back navigation can enter a slide at its completed build count. Scrubbing and scroll playback hold a time and do not restart media. Links-only mode stops ordinary slide traversal; jump targets are resolved separately.

`PresenterWindow` displays the opener's React state in another window. It is not a hosted audience URL. Wire its callbacks and closure state; account for popup and media browser behavior. Supply assets and styles to every display context.

## Define what output means

The [print contract](/packages/office-slides#print-and-verification-limits) describes static browser print pages for visible slides. PDF is a browser print destination. These helpers do not return a portable interactive deck or server-generated PDF bytes.

There are known product checks outside this documentation. [#298](https://github.com/barocss/barocss-editor/issues/298) concerns new-slide input targeting; its separate [PR #310](https://github.com/barocss/barocss-editor/pull/310) was unmerged at the reviewed revision. [#301](https://github.com/barocss/barocss-editor/issues/301) and [#302](https://github.com/barocss/barocss-editor/issues/302) concern outdated UI test entry points/selectors. Do not report their blocked later assertions as verified by these examples.

The [documentation audit](https://github.com/barocss/barocss-editor/blob/main/docs/specs/slides-documentation-audit.md) records source/test evidence and validation scope. Continue with [Product integration](/docs/guides/office-products) for the shared host boundary.
