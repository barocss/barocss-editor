# Event Tests

This directory tests DOM event handling and browser interaction.

## Test Files

### `browser-event-simulation.test.ts`
- Browser native event simulation
- Event tests for `input`, `beforeinput`, `keydown`, `paste`, `drop`, etc.
- Complex event scenario validation
- IME and composition event handling

### `event-integration.test.ts`
- Event handler integration tests
- Event → command conversion validation
- Event chaining and propagation tests
- Selection change event handling

### `mutation-observer-integration.test.ts`
- MutationObserver and Smart Text Analyzer integration tests
- DOM change detection and analysis
- Text change tracking
- Change event emission validation

## How to Run

```bash
# Run all event tests
pnpm test test/events

# Run specific test file
pnpm test test/events/event-integration.test.ts
```

## Notes

- Some tests may be limited due to JSDOM environment constraints
- Includes tests considering browser-specific event behavior differences
