# Editor View DOM Tests

Test suite for the `@barocss/editor-view-dom` package.

## 📁 Test Structure

### [`core/`](./core/)
Core functionality tests
- EditorViewDOM class basic behavior
- Container-based API and layer system
- Model-view synchronization

### [`events/`](./events/)
Event handling tests
- Browser event simulation
- Event handler integration
- MutationObserver integration

### [`text-analysis/`](./text-analysis/)
Text analysis algorithm tests
- Smart Text Analyzer core logic
- Unicode and composite character handling
- Change detection and classification

### [`decorator-system/`](./decorator-system/)
Decorator system tests
- DecoratorRegistry and DecoratorManager
- Layer/Inline/Block Decorator types
- Custom renderer registration

### [`integration/`](./integration/)
Integration tests
- Inter-system interactions
- Real usage scenarios
- Selection mapping and handling

## 🚀 How to Run

### Run All Tests
```bash
pnpm test
```

### Run Specific Group
```bash
pnpm test test/core           # Core functionality tests
pnpm test test/events         # Event tests
pnpm test test/text-analysis  # Text analysis tests
pnpm test test/decorator-system # Decorator system tests
pnpm test test/integration    # Integration tests
```

### Run Specific Test File
```bash
pnpm test test/core/layered-api.test.ts
pnpm test test/events/event-integration.test.ts
```

### Test Execution Options
```bash
pnpm test:run                 # Single run (no watch mode)
pnpm test:coverage           # Run with coverage
pnpm test:ui                 # Run in UI mode
```

## 🔧 Test Environment

- **Test runner**: Vitest
- **DOM environment**: JSDOM
- **Mocking**: vi (built-in Vitest)
- **Config file**: `vitest.config.ts`

## 📝 Test Writing Guide

### Basic Structure
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Test Group Name', () => {
  beforeEach(() => {
    // Setup before each test
  });
  
  afterEach(() => {
    // Cleanup after each test
  });
  
  it('should test content', () => {
    // Test code
    expect(actual).toBe(expected);
  });
});
```

### Mocking Examples
```typescript
// Mock editor-core
const mockEditor = {
  emit: vi.fn(),
  on: vi.fn(),
  executeCommand: vi.fn()
} as any;

// Mock DOM API
Object.defineProperty(window, 'getSelection', {
  value: vi.fn(() => ({
    getRangeAt: vi.fn(),
    removeAllRanges: vi.fn()
  }))
});
```

## 🐛 Known Limitations

- **JSDOM limitations**: some browser native APIs not fully supported
- **Event simulation**: event behavior may differ from actual browser
- **Selection API**: limited Selection object support in JSDOM

## 📊 Coverage Goals

- **Overall coverage**: 90%+
- **Core logic**: 95%+
- **Error handling**: 85%+
