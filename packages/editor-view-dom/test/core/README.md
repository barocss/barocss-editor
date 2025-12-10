# Core Tests

This directory tests core functionality of `editor-view-dom`.

## Test Files

### `editor-view-dom.test.ts`
- Basic constructor and initialization tests for EditorViewDOM class
- Basic API behavior validation
- Lifecycle management tests

### `layered-api.test.ts`
- Container-based API tests
- 5-layer structure creation and management tests
- Layer-specific attribute and style validation
- Layer customization tests

### `model-application.test.ts`
- Model data and DOM synchronization tests
- DOM update validation on data changes
- Model-view binding tests

## How to Run

```bash
# Run all core tests
pnpm test test/core

# Run specific test file
pnpm test test/core/layered-api.test.ts
```
