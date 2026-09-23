# @barocss/office-controls

Data contracts for editor controls, property rows, keyboard labels, and selection state.

## Purpose

Describe commands and properties as data shared by products, UI adapters, and conformance checks. This package does not render React components.

## Install

```sh
npm install @barocss/office-controls
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-controls` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/office-controls/src/...` are not part of the published API.

## Usage

```ts
import { controlId, controlsIn, stateOfMark, type Control } from '@barocss/office-controls';

const controls: Control[] = [{
  label: 'Bold', icon: 'bold', command: 'toggleBold', group: 'text',
  mark: 'bold', state: stateOfMark('bold'),
}];
console.log(controlsIn(controls, 'text').map(controlId));
// Pass the declarations to Controls from @barocss/office-editor-ui with your Editor.
```

## Declaration ownership

| Contract | What it describes | What it does not do |
| --- | --- | --- |
| `Control` | Command, payload, label, icon and optional state reader | Register or execute the command |
| `ChoiceControl`, `PaletteControl` | Choices, mark attributes and color values | Render a select or color picker |
| `MenuModel`, `KeyModel` | Menu structure, command links and keyboard labels | Mount menus or bind DOM keyboard events |
| Property panel declarations | Rows, groups, visibility and property metadata | Apply model mutations or unit conversion |

This layer uses editor selection summaries but has no React rendering or DOM interaction. Products supply declarations and behavior. `office-editor-ui` adapts those declarations to an Editor; `office-ui` draws their controls.

### Identity and selection state

`controlId` uses an explicit `id` when present. Otherwise it uses the command and sorted payload keys. Give distinct actions stable IDs, especially when several controls run the same command with different payloads. `controlsIn` filters a list; it does not install that list on an editor.

State readers return `on`, `off` or `mixed`. Mixed means the selection does not agree; a UI should not silently convert it to off. `stateOfMark` and `stateOfAttribute` create readers. `currentChoice` can consult an inherited value when the selection has no direct mark attribute.

**The consumer decides which reader it uses.** The default `Controls`/`controlRows` adapter in `office-editor-ui` uses `control.mark`. It does not automatically call `control.state`. To use a custom state reader, call `useControls` or `controlRows` with their `state` option and render the returned rows. Merely adding a `state` function to a declaration does not wire a pressed button.

### Complete identity example

```ts
import { controlId, controlsIn, type Control } from '@barocss/office-controls';

const alignment: Control[] = [
  { id: 'align-left', label: 'Align left', command: 'setAlign',
    payload: { align: 'left' }, group: 'paragraph' },
  { id: 'align-center', label: 'Align center', command: 'setAlign',
    payload: { align: 'center' }, group: 'paragraph' },
];
const ids = controlsIn(alignment, 'paragraph').map(controlId);
if (ids.join(',') !== 'align-left,align-center') {
  throw new Error('Control identity did not match the declared actions');
}
console.log('Control declarations passed', ids);
```

`setAlign` here is an illustrative host command. This example checks declarations only. Your product must register a command with the payload contract used by its controls.

## Key hints and inventory checks

`keyLabel` formats a keyboard label for the platform; `matchesKey` tests a key model. Neither function installs a binding. Keep displayed shortcuts tied to the keymap that the product actually registers. A menu label is not evidence that the command can execute in the current selection.

`commandsIn`, `iconsIn`, `menuFaults` and `keyFaults` support inventory checks. A valid inventory can still contain a command whose behavior is incorrect. Verify the resulting document edit separately. Font catalogues and helpers describe font choices; the host still loads permitted fonts.

## Integration notes

A control declaration does not register its command. The product kit owns command behavior; office-editor-ui reads these declarations and executes commands on an Editor.

## Documentation

- [Shared UI integration](https://editor.barocss.com/docs/guides/shared-office-ui)
- [Package guide](https://editor.barocss.com/packages/office-controls)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-controls)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
