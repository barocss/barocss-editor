# @barocss/collaboration-liveblocks

Liveblocks adapter for Barocss Editor collaboration.

## Purpose

Integrates Barocss Editor with Liveblocks for real-time collaborative editing.

## Key Exports

- `LiveblocksAdapter` - Liveblocks collaboration adapter

## Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';
import { LiveblocksAdapter } from '@barocss/collaboration-liveblocks';
import { createClient } from '@liveblocks/client';

// Create Liveblocks client
const client = createClient({
  publicApiKey: 'your-api-key'
});

// Enter room
const room = client.enter('room-name');

// Create adapter
const adapter = new LiveblocksAdapter({
  dataStore: editor.dataStore,
  room: room
});
```

## Liveblocks Integration

The adapter:
- Converts Barocss operations to Liveblocks updates
- Converts Liveblocks updates to Barocss operations
- Handles Liveblocks room synchronization
- Manages presence and awareness

## Related

- [Collaboration](./collaboration) - Base collaboration system
- [Liveblocks Documentation](https://liveblocks.io/docs) - Liveblocks documentation
