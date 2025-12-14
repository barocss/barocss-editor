# Docs Site Migration Plan

## Current Issues
- Docsify + Vite bundle setup is complex
- Build process not working properly
- Editor demo not loading

## Options

### Option 1: Fix Docsify (Simpler)
- Simplify the build process
- Use a simpler editor demo approach
- Keep HTML-based Docsify

### Option 2: Migrate to Docusaurus (Recommended)
- React-based, easier component integration
- Better TypeScript support
- Built-in features (search, dark mode, etc.)
- Easier GitHub Pages deployment
- Can directly use React components for editor demos

## Recommendation: Docusaurus

**Pros:**
- React components can be directly embedded
- Editor demo as a React component
- Better developer experience
- More features out of the box

**Cons:**
- Need to learn Docusaurus structure
- Requires React knowledge (but you already have the editor working)

## Next Steps

If choosing Docusaurus:
1. Initialize Docusaurus in `apps/docs-site`
2. Migrate existing markdown files
3. Create EditorDemo React component
4. Configure for GitHub Pages
5. Test and deploy
