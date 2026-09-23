---
title: Editor extension boundaries
---

# Editor extension boundaries

Barocss separates document data, editing operations, browser views, and product UI. You can use the foundations for a custom editor or start from a Note, Word, Slides, or Site kit. A product factory creates an editing session. It does not create a complete hosted application.

This guide describes the implementation reviewed for issue [#285](https://github.com/barocss/barocss-editor/issues/285). Use the package guide for the version in this checkout. An unreleased source change is not a feature of an older npm package.

## Choose your starting point

| Goal | Start here | You still supply |
| --- | --- | --- |
| Custom browser text editor | [DOM guide](../quick-start.md) or [React guide](react-editor.md) | Schema, supported commands, renderers, application UI, storage |
| Embedded prose field | [Note session](/packages/office-note) and `NoteEditor` | Initial body, change persistence, host lifecycle |
| Paged document editor | [Word](/packages/office-word) | View, page measurement/layout, UI assembly, storage |
| Presentation editor | [Slides](/packages/office-slides) | Stage/workspace assembly, viewport, storage |
| Site builder | [Site](/packages/office-site) | Page-frame/inspector assembly, assets, storage, publication |
| Render-only preview | [DOM renderer](/packages/renderer-dom) or [React renderer](/packages/renderer-react) | Compatible tree, templates, updates and lifecycle |

The lower layers can share behavior without sharing the whole application shell. `office-text` owns reusable prose features. `office-canvas` owns reusable canvas behavior. Product packages add their own document vocabulary and editing rules. See [package boundaries](package-boundaries.md) for UI ownership.

## Five parts of an editing feature

A visible button is only one part of a feature. For a new callout, customer-specific block, or structured field, define each applicable part:

| Part | Public surface | What to verify |
| --- | --- | --- |
| Document vocabulary | `createSchema` and node/mark definitions | Valid children, attributes, persisted representation |
| Edit behavior | `Extension`, registered commands, model operations | Valid target, selection behavior, failure result, Undo/Redo |
| Rendering | DSL templates and a `RendererRegistry` | Every inserted node is visible; text and object boundaries remain editable |
| Interaction UI | Shared controls and product UI | Command availability, active state, focus, keyboard behavior |
| Host integration | Session callbacks, file codecs, application services | Save/restore, asset references, cleanup, supported export formats |

Adding a schema node does not supply a renderer. Adding a command does not supply a toolbar button. Some extensions register fallback renderers, but this does not establish the full product integration.

Start from an existing schema definition when extending a product. Keep the node and mark types used by its commands. Passing `schema` to a factory replaces its default schema; the factory does not merge an arbitrary custom schema with the product schema.

## Add a command without replacing the product

The [editor-core README](/packages/editor-core#extend-an-editor) contains a complete example that registers a command, inserts a paragraph through a transaction, checks the result, and runs Undo. Its target is a minimal prose document. Do not copy its root insertion rule into a deck or site document without adapting it.

Use the `extensions` option to append extension **instances** to a product's default kit. For example, `new BoldExtension()` is an instance; `BoldExtension` is a constructor. Registering a constructor can fail to install its instance lifecycle and commands even when a permissive type accepts it.

Use unique extension names and namespaced host command names. `editor.use` ignores a duplicate extension name. `registerCommand` replaces an existing command with the same name. Removing an extension does not restore a command that it previously replaced. Replacing commands is an explicit integration decision, not an automatic override stack.

## Understand factory options

| API | Default setup | Customization |
| --- | --- | --- |
| `new Editor(options)` | Engine/session setup | Supply schema, extensions, and the view separately |
| `createNoteEditor(options)` | Note extension kit and keybindings | Supply `dataStore` and `schema`; append `extensions` or replace `kit` |
| `createWordEditor(options)` | Word schema, kit, and keybindings | Append `extensions`; replace `kit` or `schema`; supply `author` |
| `createSlidesEditor(options)` | Slides schema, kit, component/variable resolution | Append `extensions`; replace `kit` or `schema` |
| `createSiteEditor(options)` | Site schema, kit, reusable-content/collection resolution | Append `extensions`; replace `kit` or `schema` |

Across these product factories, `extensions` is appended after the chosen kit. `kit: []` removes the default product extension bundle. It does not mean “use defaults.” It also does not remove engine commands or other work performed by the factory, such as content resolution.

Additional `keybindings` are registered without clearing the existing registry. Note and Word install their product bindings before caller bindings. Test conflicts in the intended editor context; clearing the registry can remove basic Enter, Backspace, and arrow behavior.

### Note's convenience API is a separate contract

`openNoteTree` and `openNote` construct their own schema, store, and editor. Their options are `session`, `onChange`, and `after`. They do not forward arbitrary factory options. Use `createNoteEditor` for a custom schema or kit and supply the lifecycle/change-delivery integration yourself.

Each convenience session has independent selection and history. `onChange` receives body blocks. `flush()` delivers pending changes synchronously; it does not await an asynchronous host save. `close()` flushes and releases the editor. The host remains responsible for awaiting durable storage before navigation.

## Operations, hooks, and lifecycle

Apply user edits through commands and model transactions. Await the transaction result before reporting success. Directly changing the DOM does not update the document model. Direct store writes are not a substitute for an undoable edit.

The `transaction(editor, operations)` builder invokes `onBeforeTransaction` in priority order. A hook can return modified operations through a transaction object, return `null` to cancel, or return nothing to leave the request unchanged. Do not assume this hook intercepts every path: direct store writes and other APIs do not necessarily use the builder.

Use `onCreate` and `onDestroy` for extension-owned resources. Pair `editor.on(event, callback)` with `editor.off(event, callback)`; `on` does not return an unsubscribe function. Prefer a fresh extension instance per editor when it holds state.

`editor.unuse(extension)` calls its destroy hook and removes the commands listed in its `commands` array. Commands registered separately during `onCreate` are not automatically listed there. Treat dynamic replacement as a separate lifecycle problem and test cleanup explicitly.

## Rendering and framework boundaries

The DOM and React renderers consume DSL templates. The editor-view packages add browser editing integration. Rendering a tree alone does not provide text input, selection mapping, or history controls.

Use a scoped `RendererRegistry` for independent custom editors. Register templates into the registry passed to the view. Keep whitespace preservation on editable prose; otherwise repeated or trailing spaces can disappear visually while remaining in the model. The DOM guide uses `whiteSpace: 'pre-wrap'` for this reason.

The Office UI components are React components. A root API import does not prove that a package is suitable for a DOM-free server runtime. Check the documented entry point and its dependencies. For product UI, load the required styles and [Tailwind source configuration](office-styling.md).

## What the host owns

The packages do not, by themselves, provide tenant accounts, server authorization, cloud synchronization, public share URLs, or deployment. A document export helper is not a hosted publishing service. A disabled command or a client-side hook is not a server permission check.

For customer-specific features, compose compatible extensions and UI in the host. Keep a versioned document contract and plan how older readers handle new nodes. The factory options do not provide automatic migrations or guarantee round-trip export of custom types.

## Validate an extension before documenting it as supported

1. Check the public package exports and installed version.
2. Check that the schema, command, and renderer support the same node or mark.
3. Compile a complete example against packed packages, without source aliases.
4. Exercise the command and verify model output, selection, Undo/Redo, and cleanup.
5. Exercise the visible UI in a desktop browser, including keyboard input.
6. Record unsupported imports, formats, and host responsibilities.

A type check proves API compatibility. It does not prove visible behavior or complete product readiness. Pending fixes and roadmap items must remain separate from the current usage contract.
