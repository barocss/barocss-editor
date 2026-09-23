# @barocss/office-editor-ui

React bindings between Editor state, control declarations, and shared Office UI.

## Purpose

Use this package for command controls, contextual toolbars, selection tools, math editing, file actions, and editor-aware hooks.

## Install

```sh
npm install @barocss/office-editor-ui @barocss/editor-core @barocss/office-controls @barocss/office-ui react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-editor-ui` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/office-editor-ui/src/...` are not part of the published API.

## Usage

```tsx
import type { Editor } from '@barocss/editor-core';
import { type Control } from '@barocss/office-controls';
import { Controls } from '@barocss/office-editor-ui';
import { Toolbar, TipProvider } from '@barocss/office-ui';
import '@barocss/office-ui/tokens.css';

const controls: Control[] = [{
  label: 'Bold', icon: 'bold', command: 'toggleBold', mark: 'bold',
}];
export function Formatting({ editor }: { editor: Editor }) {
  return <TipProvider><Toolbar aria-label="Formatting">
    <Controls editor={editor} controls={controls} />
  </Toolbar></TipProvider>;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Command binding

The host supplies a live Editor with the required commands already registered. The Formatting example above adds controls to that editor; it does not create an editable document or install `toggleBold`.

| API | Contract |
| --- | --- |
| `controlRows` | Reads one current selection summary and returns renderable rows; no subscription |
| `useControls` | Recomputes rows when editor answers change |
| `Controls` | Renders shared controls as a fragment; the host owns the surrounding layout |
| `useEditorRevision` | Subscribes to selection/document answers |
| `useDocumentRevision` | Subscribes to document changes for document-derived UI |

Rows include a stable key, label, shortcut, state, disabled flag and a `run()` callback. By default, enabled state comes from `canExecuteCommand`, execution calls `executeCommand`, and pressed state comes from `control.mark`.

`control.state` is not evaluated by the default adapter. Use `useControls(..., { state })` for custom state resolution, then render the rows yourself. The `can` and `onRun` options **replace** the defaults. They must preserve any product-specific target or command checks. Calling a row's `run()` directly does not enforce its `disabled` flag.

`run()` returns `void`; it is not a save-completion promise. For asynchronous commands that need busy, failure and retry UI, use an explicit host callback or the property/settings hooks below. The default icon controls preserve focus on pointer activation. The host must still keep a valid selection and editor scope.

### Complete custom-state toolbar

This component uses each declaration's state reader, including `mixed`, while keeping rendering in the host. It deliberately uses the default command execution path; add your own failure handling for commands with asynchronous delivery requirements.

```tsx
import type { Editor } from '@barocss/editor-core';
import type { Control } from '@barocss/office-controls';
import { useControls } from '@barocss/office-editor-ui';
import { IconButton, TipProvider } from '@barocss/office-ui';
import '@barocss/office-ui/tokens.css';

export function DeclaredActions({ editor, controls }: {
  editor: Editor; controls: readonly Control[];
}) {
  const rows = useControls(editor, controls, {
    state: (control, summary) => control.state?.(summary) ?? 'off',
  });
  return <TipProvider><div role="group" aria-label="Declared actions">
    {rows.map(row => <IconButton key={row.key} label={row.says}
      disabled={row.disabled} preserveFocus onClick={row.run}
      pressed={row.state === 'mixed' ? 'mixed' : row.state === 'on'}>
      {row.label}
    </IconButton>)}
  </div></TipProvider>;
}
```

## Settings and property edits

`useEditorSettings` captures a draft and selection when a settings session opens. It keeps the draft while selection moves. Change its `context` when editing a different target. Editor/root/context changes retire the old session, so its completion cannot close a new dialog.

The hook exposes `busy` and `problem`. It blocks duplicate apply and close while busy. A rejected promise or `false` command result retains the draft. Default unchanged detection is `Object.is`; supply `isEqual` for value comparison. Closing the UI does not cancel a model transaction that already started. Products supply validation, units, payloads and the transaction that defines one undo step.

`usePropertyCommand(editor, context)` serializes command requests and exposes `busy`, `failed` and `retry`. Use a context key that identifies the current property target. It skips stale queued requests after the editor, document or target changes, but cannot undo an already running command. A queue is not an atomic multi-command transaction.

## Selection tools and focus

| Responsibility | Owner |
| --- | --- |
| Draw a floating panel, handle appearance, readout and motion | `office-ui` |
| Match an Editor selection to DOM and retain input ownership | `office-editor-ui` |
| Calculate a rotated shape, table boundary or page/canvas coordinate | Product package |
| Resize, move or format the document with undo | Product command/model transaction |

`ContextToolbar` connects a noncollapsed text selection to shared controls. Supply a `scope` ref when several editors share the page, and set `active` to false while an inner input owns editing. A node selection and a text range need different tools; the text toolbar does not implement shape resizing.

`useEditorContextVisibility` gates a target on editor focus, editability and input ownership. It hides for an external field, window blur or a `data-editor-input-owner` subtree. `retainWithin` lets a toolbar's own inputs keep the context. Call `dismiss` from the surface's Escape/outside handler. Dismissal survives temporary anchor loss for the same target; a different key or explicit `reopen` can show it again. Use a stable key or provide `sameKey`.

`useNodeAnchor` maps a node ID in the current document to its DOM element and viewport rectangle. A missing or fully clipped node returns null. A partly visible node retains its full rectangle so resize calculations do not use a clipped width. Shared anchor observers track scroll, resize and relevant DOM changes; they are not arbitrary CSS-animation or clip-path trackers. Text-range anchoring is separate from product model geometry.

## Additional integrations

- `SelectionLinkControl` and `SelectionColorControl` connect text selection to shared link/color UI. Products still choose supported marks and commands.
- `FileActions` and `DocumentSaveStatus` need host file/persistence contracts. They do not supply cloud storage or permissions.
- `MathSourceEditor` and `MathInlineInput` wrap math input. Products own insertion, selection, commit/cancel, display scale and their rendered result.
- `SlashMenu` draws editor extension state. Its presence does not establish that all product menu interactions pass acceptance; open Note issues remain separate.

## Integration notes

Load office-ui tokens and configure Tailwind source scanning for both packages. The host owns the editor, enabled extensions, storage, and command declarations. Use office-ui directly for UI that has no editor dependency.

## Documentation

- [Shared UI integration](https://editor.barocss.com/docs/guides/shared-office-ui)
- [Package guide](https://editor.barocss.com/packages/office-editor-ui)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-editor-ui)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
