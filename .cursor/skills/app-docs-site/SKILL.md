---
name: app-docs-site
description: Docusaurus documentation site with embedded editor demo. Use when changing docs content, doc structure, or the editor demo used in the docs (initEditorDemo, EditorDemo component).
---

# apps/docs-site

## Scope

- **Purpose**: Developer documentation for Barocss Editor. Docusaurus site; content in `docs/`, API/architecture docs. Includes an embeddable editor demo via `src/editor-demo.ts` and `src/components/EditorDemo.tsx`.
- **Editor demo**: `src/editor-demo.ts` exports `initEditorDemo(container: HTMLElement)`. It creates a minimal schema (document, heading, paragraph, inline-text), defines templates (define, defineMark), instantiates DataStore, Editor (with createCoreExtensions, createBasicExtensions), EditorViewDOM, loads initial content, and renders into the given container. Used by the docs UI to show a live editor.
- **Structure**: `docs/` (getting-started, concepts, api, architecture, examples, guides), `sidebars.ts`, `docusaurus.config.ts`, `src/pages/index.tsx`, `src/components/` (EditorDemo, ArchitectureDiagram, etc.), `static/`.
- **Scripts**: `pnpm dev` (docusaurus start), `pnpm build`, `pnpm serve`, `pnpm deploy`. CI: `.github/workflows/docs.yml` for build/deploy.

## Rules

1. **Editor demo**: Keep `initEditorDemo` self-contained (schema + templates + Editor + EditorViewDOM in one place). Do not depend on editor-test or editor-decorator-test; docs-site should work with workspace packages only.
2. **Docs**: Markdown in `docs/`; sidebars and slugs are configured in `sidebars.ts` and `docusaurus.config.ts`. API docs often reference package names (e.g. @barocss/datastore).
3. **Assets**: Images in `static/img/`; CNAME in `static/` for custom domain if used.
4. **References**: `apps/docs-site/`; deps: multiple @barocss/* packages, @docusaurus/core, React. Build output: `build/` (Docusaurus).

## Quick reference

- App path: `apps/docs-site/`
- Editor demo: `src/editor-demo.ts` (initEditorDemo), `src/components/EditorDemo.tsx`
- Docs: `docs/`, `sidebars.ts`
- Dev: `pnpm dev` (Docusaurus); build: `pnpm build`
