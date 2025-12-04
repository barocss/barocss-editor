# @barocss/dom-observer

DOM mutation observer with text change detection and collaborative editing support.

## Overview

`@barocss/dom-observer` provides:

- **DOM Structure Change Detection**: Detect node addition/removal
- **Text Content Change Detection**: Detect text changes with position tracking
- **Attribute Change Detection**: Detect attribute modifications
- **Filtering**: Filter meaningful changes using `data-bc-*` attributes
- **Event-Driven Architecture**: Flexible integration with event system

## Installation

```bash
pnpm add @barocss/dom-observer
```

## Usage

### Basic Usage

```typescript
import { MutationObserverManagerImpl } from '@barocss/dom-observer';

const observer = new MutationObserverManagerImpl({
  target: document.body,
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

### Configuration Options

```typescript
import { MutationObserverManagerImpl } from '@barocss/dom-observer';

const observer = new MutationObserverManagerImpl({
  target: document.body,
  
  // Filter changes using data-bc-* attributes
  filterByDataAttributes: true,
  
  // Ignore specific node types
  ignoreNodeTypes: ['SCRIPT', 'STYLE'],
  
  // Custom filter function
  filter: (mutation) => {
    return mutation.type !== 'attributes' || 
           mutation.attributeName !== 'class';
  },
  
  // Event handlers
  onStructureChange: (event) => {
    // Handle structure changes
  },
  onTextChange: (event) => {
    // Handle text changes
  },
  onNodeUpdate: (event) => {
    // Handle node updates
  }
});
```

## API Reference

### MutationObserverManagerImpl

#### Constructor
```typescript
new MutationObserverManagerImpl(options: MutationObserverOptions)
```

#### Methods

- `start(): void` - Start observing
- `stop(): void` - Stop observing
- `disconnect(): void` - Disconnect observer

### Types

#### MutationObserverOptions
```typescript
interface MutationObserverOptions {
  target: Node;
  filterByDataAttributes?: boolean;
  ignoreNodeTypes?: string[];
  filter?: (mutation: MutationRecord) => boolean;
  onStructureChange?: (event: DOMStructureChangeEvent) => void;
  onTextChange?: (event: TextChangeEvent) => void;
  onNodeUpdate?: (event: NodeUpdateEvent) => void;
}
```

#### DOMStructureChangeEvent
```typescript
interface DOMStructureChangeEvent {
  type: 'add' | 'remove' | 'move';
  node: Node;
  parent: Node;
  previousSibling?: Node;
  nextSibling?: Node;
}
```

#### TextChangeEvent
```typescript
interface TextChangeEvent {
  node: Node;
  oldText: string;
  newText: string;
  startOffset: number;
  endOffset: number;
}
```

#### NodeUpdateEvent
```typescript
interface NodeUpdateEvent {
  node: Node;
  attributeName: string;
  oldValue: string | null;
  newValue: string | null;
}
```

## Features

### Data Attribute Filtering

The observer can filter changes based on `data-bc-*` attributes to only track meaningful changes:

```typescript
const observer = new MutationObserverManagerImpl({
  target: element,
  filterByDataAttributes: true  // Only track nodes with data-bc-* attributes
});
```

### Collaborative Editing Support

The observer is designed to work with collaborative editing scenarios where multiple users can edit the same document simultaneously.

## Examples

### Text Change Tracking

```typescript
import { MutationObserverManagerImpl } from '@barocss/dom-observer';

const observer = new MutationObserverManagerImpl({
  target: editorElement,
  onTextChange: (event) => {
    // Track text changes for collaborative editing
    const change = {
      nodeId: event.node.getAttribute('data-bc-sid'),
      oldText: event.oldText,
      newText: event.newText,
      startOffset: event.startOffset,
      endOffset: event.endOffset
    };
    
    // Send to server or apply to model
    applyTextChange(change);
  }
});

observer.start();
```

### Structure Change Tracking

```typescript
const observer = new MutationObserverManagerImpl({
  target: editorElement,
  onStructureChange: (event) => {
    if (event.type === 'add') {
      console.log('Node added:', event.node);
    } else if (event.type === 'remove') {
      console.log('Node removed:', event.node);
    } else if (event.type === 'move') {
      console.log('Node moved:', event.node);
    }
  }
});
```

## License

MIT

