# Barocss Editor Documentation Site

This is the documentation site for Barocss Editor, built with Docusaurus.

## Structure

- `docs/` - Markdown documentation files
- `src/components/` - React components (EditorDemo)
- `src/css/` - Custom styles
- `docusaurus.config.ts` - Docusaurus configuration
- `sidebars.ts` - Sidebar navigation structure

## Development

### Local Development

1. Install dependencies:
```bash
pnpm install
```

2. Start development server:
```bash
pnpm dev
```

The site will be available at `http://localhost:3000`

## Building for GitHub Pages

1. Build the site:
```bash
pnpm build
```

This creates a `build/` directory with static files.

2. Configure GitHub Pages:
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` (or your preferred branch)
   - Folder: `/build` (or `/` if deploying from root)

3. Deploy:
```bash
pnpm deploy
```

Or manually:
```bash
git checkout --orphan gh-pages
git --work-tree build add --all
git --work-tree build commit -m "Deploy to GitHub Pages"
git push origin HEAD:gh-pages --force
```

## How It Works

1. **Docusaurus** renders markdown files as documentation
2. **EditorDemo React Component** (`src/components/EditorDemo.tsx`) can be imported in MDX files
3. Use the component in any markdown file:
   ```mdx
   import EditorDemo from '@site/src/components/EditorDemo';
   
   <EditorDemo />
   ```

## File Structure

```
apps/docs-site/
├── docs/                    # Documentation markdown files
├── src/
│   ├── components/         # React components
│   │   └── EditorDemo.tsx  # Editor demo component
│   └── css/                # Custom styles
├── static/                 # Static assets
├── docusaurus.config.ts    # Docusaurus configuration
└── sidebars.ts            # Sidebar navigation
```
