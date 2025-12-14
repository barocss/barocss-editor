# @barocss/devtool

Development tools for Barocss Editor - visualize editor structure and events in real-time.

## Purpose

Provides development tools for debugging and understanding editor behavior:
- Model tree visualization
- Event logging and filtering
- Node inspection
- DOM highlighting

## Key Exports

- `Devtool` - Main devtool class
- `ModelTreeViewer` - Model tree visualization
- `EventMonitor` - Event logging

## Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';
import { Devtool } from '@barocss/devtool';

const editor = new Editor({ /* ... */ });

// Create devtool
const devtool = new Devtool(editor);

// Show devtool panel
devtool.show();
```

## Features

### Model Tree Visualization

View the complete document structure as a tree:

```typescript
// Model tree is automatically displayed
// - Expand/collapse nodes
// - Search for nodes
// - Click to highlight in DOM
```

### Event Logging

Monitor all editor events in real-time:

```typescript
// Events are automatically logged
// - Filter by event type
// - Search events
// - Inspect event data
```

### Node Selection

Click on nodes in the tree to highlight them in the DOM:

```typescript
// Click node in tree
// → Node is highlighted in editor
// → DOM element is highlighted
```

## Configuration

```typescript
const devtool = new Devtool(editor, {
  autoRefresh: true,        // Auto-refresh model tree
  refreshInterval: 1000,    // Refresh interval (ms)
  eventFilter: ['command', 'selection'],  // Filter events
  showDOMHighlight: true    // Show DOM highlights
});
```

## When to Use

- **Development**: Debug editor behavior
- **Understanding**: Learn editor structure
- **Troubleshooting**: Diagnose issues
- **Testing**: Verify editor state

## Related

- [Editor Core](./editor-core) - Devtool monitors editor
- [DataStore](./datastore) - Devtool visualizes DataStore structure
