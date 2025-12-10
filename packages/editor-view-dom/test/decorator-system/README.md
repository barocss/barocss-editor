# Decorator System Tests

This directory tests Decorator system functionality.

## Test Files

### `decorator-system.test.ts`
- DecoratorRegistry functionality tests
- DecoratorManager CRUD operation tests
- Decorator type registration and validation
- Custom renderer registration tests
- Event emission and handling validation

## Decorator Types

### Layer Decorator
- Expressed as CSS overlay without DOM structure changes
- Highlights, comments, annotations, etc.
- Included in diff

### Inline Decorator
- Inserts actual DOM widgets within text
- Link buttons, mentions, custom widgets, etc.
- Excluded from diff via `data-bc-decorator="inline"` attribute

### Block Decorator
- Inserts actual DOM widgets at block level
- Toolbars, context menus, custom panels, etc.
- Excluded from diff via `data-bc-decorator="block"` attribute

## Core Classes

### DecoratorRegistry
- Manages decorator type and renderer registration
- Schema validation functionality
- Type safety

### DecoratorManager
- CRUD operations for decorator instances
- Event emission (`decorator:added`, `decorator:updated`, `decorator:removed`)
- Query and filtering functionality

## How to Run

```bash
# Run Decorator system tests
pnpm test test/decorator-system

# Run specific test file
pnpm test test/decorator-system/decorator-system.test.ts
```
