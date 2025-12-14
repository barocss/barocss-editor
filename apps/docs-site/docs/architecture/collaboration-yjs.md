# @barocss/collaboration-yjs

Yjs adapter for Barocss Editor collaboration.

## Purpose

Integrates Barocss Editor with Yjs CRDT library for real-time collaborative editing.

## Key Exports

- `YjsAdapter` - Yjs collaboration adapter

## Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';
import { YjsAdapter } from '@barocss/collaboration-yjs';
import * as Y from 'yjs';

// Create Yjs document
const ydoc = new Y.Doc();

// Create adapter
const adapter = new YjsAdapter({
  dataStore: editor.dataStore,
  ydoc: ydoc
});

// Connect to Yjs provider (e.g., y-websocket)
const provider = new WebsocketProvider('ws://localhost:1234', 'room-name', ydoc);
```

## Yjs Integration

The adapter:
- Converts Barocss operations to Yjs updates
- Converts Yjs updates to Barocss operations
- Handles Yjs document synchronization
- Manages conflict resolution

## Related

- [Collaboration](./collaboration) - Base collaboration system
- [Yjs Documentation](https://docs.yjs.dev/) - Yjs library documentation
