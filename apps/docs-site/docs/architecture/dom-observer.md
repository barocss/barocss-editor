# @barocss/dom-observer

DOM mutation observer with text change detection and collaborative editing support.

## Purpose

Observes DOM changes and detects meaningful mutations:
- Structure changes (node addition/removal)
- Text content changes
- Attribute changes
- Filters changes using `data-bc-*` attributes

## Key Exports

- `MutationObserverManager` - DOM mutation observer manager

## Basic Usage

```typescript
import { MutationObserverManager } from '@barocss/dom-observer';

const observer = new MutationObserverManager({
  target: contentEditableElement,
  onStructureChange: (event) => {
    console.log('Structure changed:', event);
  },
  onTextChange: (event) => {
    console.log('Text changed:', event);
  },
  onNodeUpdate: (event) => {
    console.log('Node updated:', event);
  }
});

// Start observing
observer.start();

// Stop observing
observer.stop();
```

## Change Detection

### Structure Changes

Detects node addition, removal, and movement:

```typescript
observer.onStructureChange = (event) => {
  if (event.type === 'add') {
    // Node added
  } else if (event.type === 'remove') {
    // Node removed
  } else if (event.type === 'move') {
    // Node moved
  }
};
```

### Text Changes

Detects text content modifications:

```typescript
observer.onTextChange = (event) => {
  console.log('Old text:', event.oldText);
  console.log('New text:', event.newText);
  console.log('Position:', event.startOffset, event.endOffset);
};
```

### Attribute Changes

Detects attribute modifications:

```typescript
observer.onNodeUpdate = (event) => {
  console.log('Attribute:', event.attributeName);
  console.log('Old value:', event.oldValue);
  console.log('New value:', event.newValue);
};
```

## Data Attribute Filtering

Filter changes using `data-bc-*` attributes:

```typescript
const observer = new MutationObserverManager({
  target: element,
  filterByDataAttributes: true  // Only track nodes with data-bc-* attributes
});
```

This ensures only meaningful changes are tracked, ignoring decorators and other non-content elements.

## Integration

DOM observer is used by:
- **Editor View DOM**: Detects DOM changes for model synchronization
- **Collaboration**: Tracks changes for sync
- **Text Analyzer**: Provides text change data

## When to Use

- **DOM Change Detection**: Monitor DOM mutations
- **Model Synchronization**: Sync DOM changes to model
- **Collaborative Editing**: Track changes for sync
- **Change Tracking**: Monitor document modifications

## Related

- [Editor View DOM](./editor-view-dom) - Uses DOM observer for change detection
- [Text Analyzer](./text-analyzer) - Analyzes text changes from observer
