# Installation

All public libraries use the `@barocss` npm scope and ship ES modules with TypeScript declarations. Choose only the layer your host needs.

## Product packages

```sh
npm install @barocss/office-note react react-dom
# Or choose another product:
npm install @barocss/office-word react react-dom
npm install @barocss/office-slides react react-dom
npm install @barocss/office-site react react-dom
```

These are integration kits. Note provides an embeddable `NoteEditor` at `/view`; Word, Slides, and Site expose composable UI at `/ui`. See [Office integration](guides/office-products.md) before mounting them.

## Custom editor foundations

```sh
npm install @barocss/editor-core @barocss/schema @barocss/datastore @barocss/dsl @barocss/extensions @barocss/editor-view-dom
```

For a React view, also install:

```sh
npm install @barocss/editor-view-react react react-dom
```

Install every package your application imports directly. Transitive dependencies are not a substitute for declaring your own imports, especially with pnpm.

## UI and styles

Office UI requires React, its exported CSS, and Tailwind 4 source scanning. Read the [Office styling guide](guides/office-styling.md). The low-level DOM quick start uses its own simple templates and does not require Office styling.

Do not import repository paths such as `@barocss/office-note/src/note-view`. Use the public paths listed in the [package catalogue](/packages).

## Environments

Use a modern ESM-aware bundler such as Vite. Browser views, local workspace storage, and UI components require browser APIs; mount them on the client in frameworks with server rendering. The repository itself is built and checked with the Node version in `.nvmrc` and the pnpm version in `package.json`.

Package versions are independent of the Wonffice product version. A README update in GitHub does not update an already-published npm version; npm receives the new README when that package is published again.
