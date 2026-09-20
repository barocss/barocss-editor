# @barocss/office-icons

Shared named icons for Office controls and product interfaces.

## Purpose

Use Icon instead of importing a separate icon library in each product. Named icons can also be checked by conformance tooling.

## Install

```sh
npm install @barocss/office-icons react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-icons` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/office-icons/src/...` are not part of the published API.

## Usage

```tsx
import { Icon } from '@barocss/office-icons';

export function BoldButton() {
  return <button type="button" aria-label="Bold">
    <Icon name="bold" size={16} />
  </button>;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Integration notes

Icons are decorative SVGs. Give the parent button or control an accessible name. Use names exported by the icon catalogue; an unknown name is not a substitute for a defined product action.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-icons)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-icons)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
