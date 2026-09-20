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
  state: stateOfMark('bold'),
}];
console.log(controlsIn(controls, 'text').map(controlId));
// Pass the declarations to Controls from @barocss/office-editor-ui with your Editor.
```

## Integration notes

A control declaration does not register its command. The product kit owns command behavior; office-editor-ui reads these declarations and executes commands on an Editor.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-controls)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-controls)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
