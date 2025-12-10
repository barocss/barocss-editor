# Integration Tests

This directory tests integration between multiple components and overall system behavior.

## Test Files

### `correct-test-cases.test.ts`
- Validates correct behavior of entire system
- Tests based on real usage scenarios
- Edge cases and exception handling
- System stability validation

### `selection-mapping-test.test.ts`
- Tests mapping between Selection and DOM
- Cursor position tracking and conversion
- Range object handling
- Selection state synchronization

### `simple-selection-test.test.ts`
- Basic Selection behavior tests
- Simple selection scenario validation
- Selection event handling
- Basic Selection API tests

## Integration Test Scope

### Inter-system Interactions
- `editor-core` ↔ `editor-view-dom` communication
- DOM events → model update flow
- Model changes → DOM rendering flow

### Real Usage Scenarios
- User input → text analysis → model update
- Keyboard shortcuts → command execution → DOM changes
- Copy/paste → data processing → rendering

### Performance and Stability
- Large text processing
- Continuous input handling
- Memory leak prevention
- Error recovery mechanisms

## How to Run

```bash
# Run all integration tests
pnpm test test/integration

# Run specific test file
pnpm test test/integration/correct-test-cases.test.ts
```

## Notes

- Integration tests may take longer to run
- Additional tests in actual browser environment may be needed
