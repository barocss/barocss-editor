---
title: Collaboration API
---

# Collaboration API

Core interfaces for building and using collaboration adapters, plus base behaviors shared by Yjs/Liveblocks adapters.

## Interfaces

### CollaborationAdapter

```ts
interface CollaborationAdapter {
  connect(dataStore: DataStore): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendOperation(operation: AtomicOperation): Promise<void>;
  receiveOperation(operation: AtomicOperation): Promise<void>;
  getDocumentState(): Promise<INode | null>;
  setDocumentState(rootNode: INode): Promise<void>;
}
```

### AdapterConfig

```ts
interface AdapterConfig {
  clientId?: string;
  user?: {
    id: string;
    name?: string;
    color?: string;
    avatar?: string;
  };
  debug?: boolean;
  transformOperation?: (op: AtomicOperation) => AtomicOperation;
}
```

## BaseAdapter (for implementers)

Extend `BaseAdapter` to create a backend-specific adapter.

### Protected lifecycle

- `doConnect(): Promise<void>`
- `doDisconnect(): Promise<void>`
- `doSendOperation(op: AtomicOperation): Promise<void>`
- `doReceiveOperation(op: AtomicOperation): Promise<void>`
- `doGetDocumentState(): Promise<INode | null>`
- `doSetDocumentState(root: INode): Promise<void>`

### Helpers

- `applyOperationToDataStore(op)`: Applies a remote op while suppressing operation event loops.
- `isRemoteOperation(op)`: Override to mark remote ops (default checks metadata flag).
- `handleLocalOperation(op)`: Called when `DataStore` emits an operation; override to customize.

## Yjs Adapter (summary)

```ts
import { YjsAdapter } from '@barocss/collaboration-yjs';

const adapter = new YjsAdapter({
  ydoc,               // Y.Doc (required)
  ymap,               // optional Y.Map (default: ydoc.getMap('barocss-document'))
  config,             // AdapterConfig
});
await adapter.connect(dataStore);
```

## Liveblocks Adapter (summary)

```ts
import { LiveblocksAdapter } from '@barocss/collaboration-liveblocks';
import { createClient } from '@liveblocks/client';

const room = createClient({ publicApiKey }).enter('room-id');
const adapter = new LiveblocksAdapter({ room, config });
await adapter.connect(dataStore);
```

## Custom Adapter Example (outline)

```ts
class CustomAdapter extends BaseAdapter {
  constructor(private backend: Backend, config?: AdapterConfig) { super(config); }

  protected async doConnect() {
    await this.backend.connect();
    this.backend.on('remote-op', (op) => this.receiveOperation(op));
  }

  protected async doSendOperation(op) {
    await this.backend.send(op);
  }

  protected async doReceiveOperation(op) {
    await this.applyOperationToDataStore(op);
  }

  protected async doGetDocumentState() {
    return this.backend.loadAsINode();
  }

  protected async doSetDocumentState(root: INode) {
    await this.backend.saveFromINode(root);
  }
}
```

## AwarenessManager

Manages presence state and cursor positions for collaborative editing.

### `DefaultAwarenessManager`

```ts
import { DefaultAwarenessManager } from '@barocss/collaboration';

const awareness = new DefaultAwarenessManager({ staleThresholdMs: 30000 });
```

**Methods:**
- `setLocalState(state: Partial<AwarenessState>): void` - Sets local presence
- `setLocalCursor(anchor, head): void` - Sets local cursor position
- `clearLocalCursor(): void` - Clears local cursor
- `getLocalState(): AwarenessState | null` - Gets local state
- `getRemoteStates(): Map<string, AwarenessState>` - Gets all remote states
- `applyRemoteState(clientId, state): void` - Applies remote state update
- `removeRemoteState(clientId): void` - Removes a remote client
- `onRemoteChange(callback): () => void` - Subscribes to remote changes
- `destroy(): void` - Cleanup

## ConflictResolver

Resolves conflicts between concurrent operations.

### Strategies

- `last-writer-wins` (default) - Latest timestamp wins
- `first-writer-wins` - Earliest timestamp wins
- `merge` - Merges update data from both operations
- `custom` - Uses provided `customResolver` function

```ts
import { ConflictResolver } from '@barocss/collaboration';

const resolver = new ConflictResolver({ strategy: 'last-writer-wins' });
const result = resolver.resolve(localOp, remoteOp);
```

## Related

- Architecture: `architecture/collaboration`, `architecture/collaboration-yjs`, `architecture/collaboration-liveblocks`
- Data model: `api/datastore-api`, `api/model-api`
