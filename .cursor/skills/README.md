# Barocss Editor – Package Skills

Skills in this directory are **per-package**. The agent uses them when working on the corresponding package.

| Skill directory | Target package | Purpose |
|-----------------|----------------|---------|
| `package-collaboration` | @barocss/collaboration | Collaboration interfaces, BaseAdapter |
| `package-collaboration-yjs` | @barocss/collaboration-yjs | Yjs adapter |
| `package-collaboration-liveblocks` | @barocss/collaboration-liveblocks | Liveblocks adapter |
| `package-converter` | @barocss/converter | HTML/Markdown/LaTeX conversion, etc. |
| `package-datastore` | @barocss/datastore | Node store, transactions, lock |
| `package-devtool` | @barocss/devtool | DevTools UI |
| `package-dom-observer` | @barocss/dom-observer | DOM MutationObserver |
| `package-dsl` | @barocss/dsl | Template DSL (element, data, slot) |
| `package-editor-core` | @barocss/editor-core | Editor core, commands, extensions |
| `package-editor-view-dom` | @barocss/editor-view-dom | DOM view, decorators, input |
| `package-extensions` | @barocss/extensions | Extension interface, command registration |
| `package-model` | @barocss/model | Transaction DSL, document operations |
| `package-renderer-dom` | @barocss/renderer-dom | DSL → DOM rendering |
| `package-schema` | @barocss/schema | Document schema definition |
| `package-shared` | @barocss/shared | Platform, key string, i18n |
| `package-text-analyzer` | @barocss/text-analyzer | Text change analysis (LCP/LCS) |

Each skill’s `description` includes **when to use it (WHEN)** so the agent can select the right skill when working on that package.

---

## App skills (editor test apps)

These skills apply to the apps in `apps/` that run and test the editor in the browser.

| Skill directory | App | Purpose |
|-----------------|-----|---------|
| `app-editor-test` | apps/editor-test | Full editor integration, Playwright E2E, bootstrap, Devtool |
| `app-editor-decorator-test` | apps/editor-decorator-test | Decorator system (layer/inline/block, pattern, defineDecorator) |
| `app-docs-site` | apps/docs-site | Docusaurus docs, embedded editor demo (initEditorDemo) |
