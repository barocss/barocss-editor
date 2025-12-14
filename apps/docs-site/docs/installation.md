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

# For data management
pnpm add @barocss/datastore @barocss/model

# For extensions
pnpm add @barocss/extensions

# For format conversion
pnpm add @barocss/converter
```

## Package Overview

### Core Packages

- **@barocss/schema** - Schema definition and validation
- **@barocss/editor-core** - Core editor logic
- **@barocss/editor-view-dom** - DOM integration

### Rendering Packages

- **@barocss/dsl** - Declarative template DSL
- **@barocss/renderer-dom** - DOM renderer

### Data Packages

- **@barocss/datastore** - Node storage and transactions
- **@barocss/model** - Model operations

### Extension Packages

- **@barocss/extensions** - Extension system

### Utility Packages

- **@barocss/converter** - Format conversion (HTML, Markdown, etc.)

## TypeScript Support

All packages include TypeScript definitions. No additional type packages needed.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Next Steps

- [Basic Usage](basic-usage)
