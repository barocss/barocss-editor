# Office styling in an npm consumer

Office UI uses two style layers: exported component/document CSS and Tailwind 4 utilities. Loading only `tokens.css` leaves some controls unstyled.

## Install the build integration

For a Vite React host:

```sh
npm install @barocss/office-ui @barocss/office-editor-ui @barocss/office-note @barocss/office-text react react-dom
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite
```

Use this `vite.config.mjs`, or add the two plugins to your existing configuration:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [react(), tailwindcss()] });
```

See the [Tailwind Vite instructions](https://tailwindcss.com/docs/installation/using-vite) for other host setups.

## Configure the host stylesheet

For a stylesheet at `src/styles.css` with packages installed in the project's `node_modules`, use:

```css
@import "tailwindcss";
@import "@barocss/office-ui/tokens.css";
@import "@barocss/office-text/text.css";
@import "@barocss/office-note/note.css";

@source "../node_modules/@barocss/office-ui/dist";
@source "../node_modules/@barocss/office-editor-ui/dist";
@source "../node_modules/@barocss/office-note/dist";
```

Paths in `@source` are relative to this stylesheet. Adjust them if the host stylesheet or install layout differs. The repository apps scan `packages/*/src`; published npm packages contain `dist`, so do not copy those source paths unchanged.

Import `src/styles.css` once from the host entry. Mount Office views on the client. Avoid importing the same product stylesheet repeatedly from unrelated components.

## Product styles

| Surface | Additional public stylesheets |
| --- | --- |
| Note | `@barocss/office-note/note.css` |
| Word | `@barocss/office-word/ui.css` |
| Slides | `@barocss/office-slides/slides.css`, `@barocss/office-slides/ui.css` |
| Site | `@barocss/office-site/ui.css`; include Note styles when embedding its rich-text editor |
| Local workspace | `@barocss/office-workspace/style.css` |
| Structured search | `@barocss/query-editor/style.css` |

Text-bearing products also need `@barocss/office-text/text.css`. Shared Office controls need `@barocss/office-ui/tokens.css`. Scan the `dist` directory of each Office UI/product package whose utility classes your host uses.

The query editor has its own stylesheet and does not require Office UI or Tailwind. CSS extracted from a library's JavaScript entry is linked by that entry; the explicit public styles above are still part of the host contract.

## Match the product theme

Override the `--ou-*` custom properties on the host surface instead of changing each button. Keep editor content styles separate from surrounding app chrome. Use the package's common controls so hover, selected, disabled, focus, and motion behavior stay consistent.
