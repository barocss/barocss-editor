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

## Integration notes

Load tokens.css once and configure Tailwind 4 to scan the installed dist files. Tokens and component CSS alone do not generate utility classes. Use office-editor-ui for controls that subscribe to editor state or execute commands.

## Compact editing composition

Define the shared controls in the UI gallery before connecting them to a product. The default gallery's `#compact-editing` section demonstrates the same components as the complete catalogue. Gallery values are local examples, not document storage or permission checks.

| Surface | Shared presentation | Host responsibility |
| --- | --- | --- |
| `EditorHeader` / `DocumentBar` with `compact` | One 48px header; document identity and grouped menu at the left; status and relevant actions at the right | Supply the complete title, real commands, actual save/recovery state and allowed actions |
| `DocumentMenu` | One named trigger; preserve command groups, IDs, shortcuts and disabled states | Supply existing `MenuBarMenu` entries and their command callback |
| `Toolbar` with `variant="compact"` | One 40px row, maximum 480px wide; 32px targets, 2px control gaps, 12px horizontal edge inset, 20px surface radius and 10px control radius | Choose the actual primary text, object or table commands; put secondary commands in an explicit popup |
| `FloatingSurface` with `compact` | Distinct temporary surface outside document flow, preferably 8px above the selected content | Supply a visible actual element/range rectangle and an untransformed themed portal; track scroll/resize and retire hidden or detached targets |
| `SecondaryPopup` | Visible-ready focus, nested dismissal, trigger return and optional hidden/inert retained content | Own the current subject, captured editor selection, command validity and account/document lifetime |

Use menu semantics for action lists and panel semantics for controls with editing fields. `keepMounted` preserves an unfinished field only while its host subject remains current. Retire or remount the popup when that subject changes. Retained DOM does not preserve edit authority.

Committed TextField, NumberField and TextAreaField cancel their own draft on the first Escape before the containing popup or dialog closes. Live search fields keep their normal Escape dismissal. Folding a retained SecondaryPopup does not commit its unfinished fields; Enter and ordinary field blur retain their existing commit behavior.

Make the canvas, document content and selected phrase/cell/object distinguishable. A compact Toolbar alone is an inline row; compose it inside FloatingSurface for selection tools. Keep one primary More entry and distinguish document details from selection formatting. Opening tools must not move the document. The gallery uses observeElementAnchor and DOM targets to demonstrate this contract without an editor model; product adapters retain their existing native selection and commands.

For persistent canvas tools, compose separate content-width compact Toolbars with `surface="floating"`. The host positions insert tools at the left and document utilities at the right. Use `shape="pill"` for the small page-navigation cluster. Secondary popups and compact menus use an 18px rounded rectangle. Compact toolbar ChoiceSelect triggers use quiet text and chevron paint, subtle hover/open fill and an explicit 2px focus-visible outline. Default form and dialog fields retain their existing paint. These props only affect compact presentation. The default EditorHeader retains its existing navigation/title/command/view structure.

Check idle, selected, secondary, detail, viewer, busy and recovery states in both themes. All commands must remain reachable with pointer and keyboard input. Do not meet the compact budget by cropping controls, shrinking targets or hiding overflow. Normal ribbon and inspector density remain outside this opt-in scope.

The gallery verifies shared presentation and input behavior. Each product must also verify its native document, history, current authority and persistence after integration.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-ui)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-ui)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
