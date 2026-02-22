# Installation

## Package Manager

Barocss Editor is available as npm packages. We recommend using pnpm.

### Install Core Packages

```bash
pnpm add @barocss/editor-core @barocss/editor-view-dom @barocss/schema
```

### Install Additional Packages (Optional)

```bash
# For rendering
pnpm add @barocss/renderer-dom @barocss/dsl

# For React rendering (instead of or alongside DOM)
pnpm add @barocss/editor-view-react @barocss/renderer-react

# For data management
pnpm add @barocss/datastore @barocss/model

# For extensions (55+ built-in extensions)
pnpm add @barocss/extensions

# For format conversion
pnpm add @barocss/converter

# For collaboration
pnpm add @barocss/collaboration @barocss/collaboration-yjs
# or
pnpm add @barocss/collaboration @barocss/collaboration-liveblocks
```

## Package Overview

### Core Packages

- **@barocss/schema** - Schema definition and validation
- **@barocss/editor-core** - Core editor logic
- **@barocss/editor-view-dom** - DOM integration

### Rendering Packages

- **@barocss/dsl** - Declarative template DSL
- **@barocss/renderer-dom** - DOM renderer
- **@barocss/renderer-react** - React renderer
- **@barocss/editor-view-react** - React view integration

### Data Packages

- **@barocss/datastore** - Node storage and transactions
- **@barocss/model** - Model operations

### Extension Packages

- **@barocss/extensions** - 55+ built-in extensions with 100% schema coverage

### Collaboration Packages

- **@barocss/collaboration** - Base adapter interface
- **@barocss/collaboration-yjs** - Yjs CRDT adapter
- **@barocss/collaboration-liveblocks** - Liveblocks adapter

### Utility Packages

- **@barocss/converter** - Format conversion (HTML, Markdown, LaTeX)
- **@barocss/devtool** - Development tools (model tree viewer, event log)

## TypeScript Support

All packages include TypeScript definitions. No additional type packages needed.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Next Steps

- [Basic Usage](basic-usage)
