# Docusaurus Migration Guide

## Why Docusaurus?

1. **React Components**: Can directly use React components for editor demos
2. **TypeScript**: Full TypeScript support
3. **Better DX**: Better developer experience
4. **GitHub Pages**: Easy deployment
5. **Features**: Search, dark mode, etc. built-in

## Setup Steps

1. **Backup current Docsify files** (optional)
2. **Initialize Docusaurus** in a new directory or replace current
3. **Migrate markdown files**
4. **Create EditorDemo React component**
5. **Configure for GitHub Pages**

## Quick Start

```bash
# In apps/docs-site directory
npx create-docusaurus@latest . classic --typescript --skip-install

# Install dependencies
pnpm install

# Add editor packages
pnpm add @barocss/editor-core @barocss/editor-view-dom @barocss/schema @barocss/dsl @barocss/extensions @barocss/datastore @barocss/renderer-dom @barocss/model @barocss/shared @barocss/dom-observer @barocss/text-analyzer

# Start dev server
pnpm start
```

## Structure

```
apps/docs-site/
├── docs/              # Markdown files
├── src/
│   ├── components/   # React components (EditorDemo)
│   └── css/          # Custom styles
├── static/           # Static assets
└── docusaurus.config.ts
```

## Editor Demo Component

Create `src/components/EditorDemo.tsx` that uses the editor packages directly.
