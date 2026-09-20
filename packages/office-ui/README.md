# @barocss/office-ui

Shared React controls, design tokens, floating surfaces, panels, menus, and workspace layout primitives.

## Purpose

Use this package for UI that does not need to know about an Editor. Pass values and callbacks from the host.

## Install

```sh
npm install @barocss/office-ui react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-ui` | Public JavaScript and TypeScript API |
| `@barocss/office-ui/tokens.css` | Stylesheet |

Import only these public paths. Source paths such as `@barocss/office-ui/src/...` are not part of the published API.

## Usage

```tsx
import { useState } from 'react';
import { Button, TextField, TipProvider } from '@barocss/office-ui';
import '@barocss/office-ui/tokens.css';

export function RenameDocument() {
  const [title, setTitle] = useState('Weekly report');
  return <TipProvider>
    <TextField ariaLabel="Document title" value={title} onChange={setTitle} />
    <Button onClick={() => console.log('Save', title)}>Save</Button>
  </TipProvider>;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Component families

| Need | Public building blocks |
| --- | --- |
| Actions and fields | `Button`, `IconButton`, `TextField`, `TextAreaField`, `NumberField`, `Choice` |
| Toolbars and navigation | `Toolbar`, `ToolbarToggle`, `MenuBar`, `CommandSearch`, `DocumentNavigation` |
| Properties | `PropertyPanel`, `PropertyGroup`, `PropertyRow`, `PropertySheet` |
| Overlays | `FloatingSurface`, `Dialog`, `Drawer`, `SidePeek`, `Tip` |
| Feedback and resources | `StatusNotice`, `TaskStatus`, `EmptyState`, `FileDropZone`, `MediaSelect` |
| Editor-adjacent geometry | `observeElementAnchor`, `observeRangeAnchor`, `selectionResizeHandles`, `SelectionReadout` |

These components accept values and callbacks. They do not register editor commands, persist documents, or apply schema operations. Icons live in `@barocss/office-icons`; this package re-exports `Icon` for convenience.

## Field commit contracts

| Component/mode | When the host receives a value | Failure handling |
| --- | --- | --- |
| `TextField` with `onChange` | Each input change; host controls `value` | Host validates and reports errors |
| `TextField` with `onCommit` only | Blur or Enter; trims surrounding whitespace and skips unchanged values | Synchronous callback contract; host owns async status |
| `TextAreaField` with `onChange` | Each input change | Host owns persistence |
| `TextAreaField` with `onCommit` only | Blur or Ctrl/Command+Enter; preserves whitespace and line breaks | Awaits a promise; `false` or rejection keeps the draft and shows failure |
| `NumberField` | Commits a number, with configured limits/precision/unit display | Host owns the document operation and its result |

For committed text fields, Escape restores the accepted value. Ordinary Enter inserts a newline in `TextAreaField`. Its pending commit makes the field read-only and blocks duplicate commits. With `onChange`, the field is live: do not combine it with `onCommit` expecting both commit modes.

`invalid`, `readOnly` and `disabled` describe UI state, not authorization. IME guards prevent candidate-confirmation Enter from being treated as a field-submit shortcut. Do not use a trimming single-line field as a document text editor.

### Complete multiline commit example

This component keeps the accepted value in React state. Empty drafts fail validation and remain available to edit. Replace the in-memory acceptance callback with your service call and update the accepted value only after success.

```tsx
import { useState } from 'react';
import { TextAreaField } from '@barocss/office-ui';
import '@barocss/office-ui/tokens.css';

export function DescriptionField() {
  const [description, setDescription] = useState('Working agreements');
  return <section aria-label="Description example">
    <TextAreaField ariaLabel="Description draft" value={description}
      onCommit={async next => {
        if (!next.trim()) return false;
        setDescription(next);
        return true;
      }} />
    <p>Accepted value:</p>
    <output aria-label="Accepted description">{description}</output>
  </section>;
}
```

## Floating surfaces and motion

`FloatingSurface` takes a viewport rectangle in `at` and a controlled `open` value. It normally portals to `document.body`; a supplied `portalRoot` changes the destination. The host supplies `onDismiss` and updates its state. List separately portalled controls or triggers in `ownedElements` so their interaction is not treated as an outside click.

Provide an accessible name and choose whether the surface should take focus. An editor toolbar should preserve the text selection; a dialog with an input has different focus needs. Use `TipProvider` around tooltip consumers. A tooltip is supplementary text, not a substitute for a button label.

`tokens.css` contains shared popup, tooltip, dialog and drawer motion, including reduced-motion rules. Use the components' open/close lifecycle rather than adding a second transform animation to their positioned container. Motion is not a document operation. Not every surface retains a closing animation: a component unmounted by its host can disappear immediately.

## Color and selection UI

`ColorPicker` provides HEX, RGB(A), HSL, HSB and OKHSL input modes with a separate alpha value. The selected format is local picker state; `onChange` emits a color string, not a persistent format object. Theme/variable swatches need values and resolved colors from the host. Blend mode belongs to the product's fill/layer state and is not a `ColorPicker` prop.

DOM anchor helpers measure browser elements or ranges. `selectionResizeHandles` and `SelectionReadout` describe the shared selection UI. They do not hit-test document objects, resize nodes, manage pointer transactions or convert canvas coordinates. Use `office-editor-ui` to connect a document node/selection to these primitives; keep product geometry with the product.

## Integration notes

Load tokens.css once and configure Tailwind 4 to scan the installed dist files. Tokens and component CSS alone do not generate utility classes. Use office-editor-ui for controls that subscribe to editor state or execute commands.

## Documentation

- [Shared UI integration](https://editor.barocss.com/docs/guides/shared-office-ui)
- [Package guide](https://editor.barocss.com/packages/office-ui)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-ui)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
