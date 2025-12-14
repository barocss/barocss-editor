# Barocss Editor Documentation Site

This is the documentation site for Barocss Editor, built with Docsify.

## Structure

- `index.html` - Main Docsify entry point
- `src/editor-demo.ts` - Editor demo initialization code
- `vite.config.ts` - Vite config for building editor demo bundle
- `*.md` - Documentation markdown files

## Development

### Local Development

1. Install dependencies:
```bash
pnpm install
```

2. Build editor demo bundle:
```bash
pnpm build:demo
```

3. Start local server:
```bash
pnpm dev
```

The site will be available at `http://localhost:8000`

## Building for GitHub Pages

1. Build the editor demo bundle:
```bash
pnpm build:demo
```

This creates `editor-demo.iife.js` in the root directory.

2. Commit and push:
```bash
git add editor-demo.iife.js
git commit -m "Update editor demo bundle"
git push
```

3. Configure GitHub Pages:
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` (or your default branch)
   - Folder: `/apps/docs-site` (or root if you deploy from root)

## How It Works

1. **Docsify** renders markdown files as documentation
2. **Editor Demo Bundle** (`editor-demo.iife.js`) contains the editor code bundled into a single file
3. When Docsify finds `.editor-demo` containers in markdown, it initializes the editor

The editor demo is automatically loaded in any markdown file that contains:
```html
<div class="editor-demo"></div>
```

## File Structure

```
apps/docs-site/
├── index.html          # Docsify entry point
├── src/
│   └── editor-demo.ts  # Editor demo code
├── vite.config.ts      # Build configuration
├── editor-demo.iife.js # Built bundle (generated)
└── *.md                # Documentation files
```
