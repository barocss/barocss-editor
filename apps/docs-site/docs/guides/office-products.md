# Integrate an Office product

The Office packages are reusable product kits. The complete applications in `apps/` show how the kits, views, storage, and shared UI fit together.

| Product | Session and document API | React UI | Reference host |
| --- | --- | --- | --- |
| Note | `@barocss/office-note` | `@barocss/office-note/view` | [apps/note](https://github.com/barocss/barocss-editor/tree/main/apps/note) |
| Word | `@barocss/office-word` | `@barocss/office-word/ui` | [apps/word](https://github.com/barocss/barocss-editor/tree/main/apps/word) |
| Slides | `@barocss/office-slides` | `@barocss/office-slides/ui` | [apps/slide](https://github.com/barocss/barocss-editor/tree/main/apps/slide) |
| Site | `@barocss/office-site` | `@barocss/office-site/ui` | [apps/site](https://github.com/barocss/barocss-editor/tree/main/apps/site) |

## Start with Note for an embedded body

[The Note README](/packages/office-note) includes a complete React component with session creation, change delivery, styles, and cleanup. Each Note session has its own store and history. Do not attach a second editor to the host's existing store to edit an embedded body.

## Assemble Word, Slides, and Site deliberately

1. Create the product editor with its factory.
2. Load a compatible document through the product's native file/session API.
3. Register the product's renderers in the registry used by its view.
4. Connect the view and product-specific layout: Word pagination, Slides viewport/stage, or Site page frames.
5. Add shared and product UI components. Keep selection ownership and document geometry with the editor; keep viewport zoom with the host.
6. Load required styles and configure [Tailwind source scanning](office-styling.md).
7. Flush nested edits and durable storage before navigation. Destroy views and editor sessions on unmount.

The `createWordEditor`, `createSlidesEditor`, and `createSiteEditor` functions do not mount a complete application. Their README examples are model-session examples. The reference hosts above contain the remaining assembly.

## Customize a product

Read [extension boundaries](editor-extensibility.md) before changing a kit or schema. `extensions` appends behavior; `kit` replaces the default bundle. Note's convenience session API has a narrower option contract than its lower-level factory.

## Workspace and files

[office-workspace](/packages/office-workspace) coordinates a local catalogue and product navigation. Each product's `/workspace` entry provides its native file codec without mounting an editor.

The current workspace uses browser-local storage and routes shaped like `/products/word/index.html`. It is not a backend, permission system, public sharing service, or synchronization server. Supply these services in your host.

## Mathematics

Shared text rendering is in `office-text`; editor-aware math controls are in `office-editor-ui`. The external `@barocss/math-editor` package is maintained in the separate [barocss/math repository](https://github.com/barocss/math). It is not another package in this repository's release inventory.
