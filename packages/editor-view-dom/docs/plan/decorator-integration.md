# Decorator Integration Guide

## Overview

This document explains how to use the Decorator system in AI-integrated and collaborative environments. The tone assumes a top computer science expert explaining to people who do not know much about programming but want to build an editor: clear, detailed, and approachable.

## Core Principles

### Decorators are general UI tools, not AI-specific

- Decorators are ordinary UI display tools.
- AI is just an editor user; it reuses the same decorators.
- AI can show work-in-progress states using existing decorators.
- When AI finishes, it updates the model and removes the decorator.
- There is no special AI-only capability inside decorators themselves.

### AI workflow pattern

1) Start: add a decorator with `addDecorator()` (use any standard decorator type).  
2) In progress: update the decorator via `updateDecorator(id, updates)`.  
3) Finish: update the model, then remove the decorator with `removeDecorator(id)`.

## AI Integration

### Basic scenario: AI generates text

```typescript
// AI generates a new paragraph

// Step 1: before work starts, add a decorator
// Use a normal comment decorator to show "generating"
const workingDecorator: Decorator = {
  sid: 'work-indicator-1',
  stype: 'comment',  // normal comment decorator
  category: 'block',
  target: {
    sid: 'paragraph-1'
  },
  position: 'after',  // will be placed after paragraph-1
  data: {
    text: 'AI is generating a new paragraph...'
  }
};

// Add decorator and get ID
const decoratorId = view.addDecorator(workingDecorator);

// Step 2: run AI task (async)
// You can update while it runs
view.updateDecorator(decoratorId, {
  data: {
    text: 'AI generating... 50%'
  }
});

const newParagraph = await aiGenerateParagraph();

// Step 3: finish work
// - Update the model (insert the real content)
editor.transaction([
  insertContent('paragraph-1', 'after', {
    sid: 'paragraph-2',
    stype: 'paragraph',
    content: [
      {
        sid: 'text-1',
        stype: 'inline-text',
        text: newParagraph
      }
    ]
  })
]).commit();

// - Remove the decorator
view.removeDecorator(decoratorId);
```

### AI edits existing text

```typescript
// AI improves an existing text snippet

// Step 1: add a decorator to the area to edit
// Use a normal highlight decorator to show "editing"
const editingDecorator: Decorator = {
  sid: 'work-indicator-2',
  stype: 'highlight',  // normal highlight decorator
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 10,
    endOffset: 30
  },
  data: {
    message: 'AI is improving this part...'
  }
};

const decoratorId = view.addDecorator(editingDecorator);

// Step 2: run AI task
// You can update progress
view.updateDecorator(decoratorId, {
  data: {
    message: 'AI improving... 80%'
  }
});

const improvedText = await aiImproveText('text-1', 10, 30);

// Step 3: finish work
// - Update the model (replace text)
editor.transaction([
  updateText('text-1', 10, 30, improvedText)
]).commit();

// - Remove the decorator
view.removeDecorator(decoratorId);
```

### Block decorator position options

```typescript
// Position options for block decorators

// 1. 'before': insert as a sibling before the target
const beforeDecorator: Decorator = {
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'before'  // inserted before paragraph-1
};

// 2. 'after': insert as a sibling after the target
const afterDecorator: Decorator = {
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'after'  // inserted after paragraph-1
};

// 3. 'inside-start': insert as the first child of the target
const insideStartDecorator: Decorator = {
  category: 'block',
  target: { sid: 'section-1' },
  position: 'inside-start'  // first child of section-1
};

// 4. 'inside-end': insert as the last child of the target
const insideEndDecorator: Decorator = {
  category: 'block',
  target: { sid: 'section-1' },
  position: 'inside-end'  // last child of section-1
};

// Example: AI creates a paragraph under a section
const aiWorkDecorator: Decorator = {
  sid: 'ai-work-1',
  stype: 'comment',
  category: 'block',
  target: { sid: 'section-1' },
  position: 'inside-end',  // appended to the end of section-1
  data: { text: 'AI is generating...' }
};
```

### AI work helper

```typescript
/**
 * Simple helper to manage AI work
 * Decorators are just ordinary tools here
 */
export class AIWorkManager {
  constructor(private view: EditorViewDOM) {}
  
  /**
   * Start AI work
   * - Use a normal decorator to show working state
   * @returns decorator ID
   */
  startWork(
    workType: 'generate' | 'edit' | 'analyze',
    target: DecoratorTarget,
    position?: DecoratorPosition,
    message: string = 'AI is working...'
  ): string {
    // Pick decorator type and category
    const decoratorType = this.getDecoratorTypeForWork(workType);
    const category = this.getCategoryForWork(workType);
    
    // Create a normal decorator
    const decorator: Decorator = {
      sid: `ai-work-${Date.now()}`,
      stype: decoratorType,
      category,
      target,
      position,
      data: {
        message,
        workType,
        startTime: Date.now()
      }
    };
    
    // Add decorator and return ID
    return this.view.addDecorator(decorator);
  }
  
  /**
   * Update AI work in progress
   */
  updateWork(decoratorId: string, updates: Partial<Decorator>): void {
    this.view.updateDecorator(decoratorId, updates);
  }
  
  /**
   * Complete AI work
   * - Update the model
   * - Remove the decorator
   */
  completeWork(
    decoratorId: string,
    modelUpdate: (model: ModelData) => ModelData
  ): void {
    const decorator = this.view.decoratorManager.get(decoratorId);
    if (!decorator) return;
    
    // Update model
    const updatedModel = modelUpdate(this.getModel(decorator.target));
    this.updateModel(decorator.target, updatedModel);
    
    // Remove decorator
    this.view.removeDecorator(decoratorId);
  }
  
  /**
   * Cancel AI work (remove decorator only)
   */
  cancelWork(decoratorId: string): void {
    this.view.removeDecorator(decoratorId);
  }
  
  private getDecoratorTypeForWork(workType: string): string {
    switch (workType) {
      case 'generate':
        return 'comment';  // show generating
      case 'edit':
        return 'highlight'; // show editing
      case 'analyze':
        return 'overlay';   // show analyzing
      default:
        return 'comment';
    }
  }
  
  private getCategoryForWork(workType: string): 'inline' | 'block' | 'layer' {
    switch (workType) {
      case 'generate':
        return 'block';
      case 'edit':
        return 'inline';
      case 'analyze':
        return 'layer';
      default:
        return 'block';
    }
  }
}
```

## Collaboration

### Key principle: same pattern as selection

Decorators are managed on a separate lightweight channel just like selection.

### Separation of DocumentModel vs EditorModel

```typescript
// DocumentModel (shareable)
- Document content (text, structure)
- Marks (formatting)
- Synced over the network
- Stored in persistence

// EditorModel (local + separate channel)
- Selection (cursor/range)
- Decorators (comments, highlights, overlays, etc.)
- Delivered via a lightweight channel
- Local state and remote state managed separately
```

### Channel separation structure

```
┌─────────────────────────────────────┐
│     DocumentModel (OT/CRDT)        │
│  - Text, structure, Marks          │
│  - Heavier data                    │
│  - Needs conflict resolution       │
└─────────────────────────────────────┘
              ↓
        [Network sync]

┌─────────────────────────────────────┐
│  EditorModel (Presence/Session)     │
│  - Selection (separate channel)     │
│  - Decorators (separate channel)    │
│  - Lightweight data                 │
│  - Real-time sync                   │
└─────────────────────────────────────┘
```

### Managing remote decorators

Handle decorators from other users or AI agents.

```typescript
// Add a remote decorator
view.remoteDecoratorManager.setRemoteDecorator(
  {
    sid: 'remote-1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 't1', startOffset: 0, endOffset: 5 },
    data: { color: 'blue' }
  },
  { userId: 'user-2', sessionId: 'session-2' }
);

// Remove decorators of a specific user
view.remoteDecoratorManager.removeByOwner('user-2');

// Get all remote decorators
const remoteDecorators = view.remoteDecoratorManager.getAll();
```

### Collaboration system integration

```typescript
/**
 * Integrate decorators with a collaboration system
 */
export class CollaborativeDecoratorManager {
  private editorView: EditorViewDOM;
  private collaborationClient: CollaborationClient;
  
  constructor(editorView: EditorViewDOM) {
    this.editorView = editorView;
    this.collaborationClient = new CollaborationClient();
    
    // Listen for broadcast messages
    this.collaborationClient.on('message', (message: CollaborationMessage) => {
      this.handleRemoteMessage(message);
    });
  }
  
  /**
   * Add local decorator (and broadcast)
   */
  addLocalDecorator(decorator: Decorator): string {
    const sid = this.editorView.addDecorator(decorator);
    
    this.collaborationClient.broadcast({
      type: 'decorator-add',
      decorator,
      owner: {
        userId: this.getCurrentUserId(),
        sessionId: this.getCurrentSessionId()
      }
    });
    
    return sid;
  }
  
  /**
   * Handle incoming messages
   */
  private handleRemoteMessage(message: CollaborationMessage): void {
    switch (message.type) {
      case 'decorator-add':
        this.editorView.remoteDecoratorManager.setRemoteDecorator(
          message.decorator,
          message.owner
        );
        this.editorView.render();
        break;
        
      case 'decorator-update':
        const existing = this.editorView.remoteDecoratorManager
          .get(message.sid);
        if (existing && existing.owner?.userId === message.owner.userId) {
          this.editorView.remoteDecoratorManager.setRemoteDecorator(
            { ...existing, ...message.updates },
            message.owner
          );
          this.editorView.render();
        }
        break;
        
      case 'decorator-remove':
        this.editorView.remoteDecoratorManager.removeRemoteDecorator(
          message.sid
        );
        this.editorView.render();
        break;
        
      case 'user-disconnect':
        this.editorView.remoteDecoratorManager.removeByOwner(
          message.userId
        );
        this.editorView.render();
        break;
    }
  }
}
```

### Broadcast message types

```typescript
/**
 * Lightweight collaboration messages (same channel pattern as selection)
 */
type CollaborationMessage = 
  // Selection message (reference)
  | {
      type: 'selection-update';
      userId: string;
      selection: ModelSelection;
      timestamp: number;
    }
  // Decorator messages (same pattern)
  | {
      type: 'decorator-add';
      decorator: Decorator;
      owner: DecoratorOwner;
      timestamp: number;
    }
  | {
      type: 'decorator-update';
      sid: string;
      updates: Partial<Decorator>;
      owner: DecoratorOwner;
      timestamp: number;
    }
  | {
      type: 'decorator-remove';
      sid: string;
      owner: DecoratorOwner;
      timestamp: number;
    }
  | {
      type: 'user-disconnect';
      userId: string;
    };
```

## Visual differentiation

### Visualizing external decorators

External users or AI decorators should be visually distinct.

```typescript
/**
 * Render decorator with owner info
 */
function renderDecorator(decorator: Decorator): VNode {
  const isRemote = decorator.source === 'remote';
  const owner = decorator.owner;
  
  return {
    tag: 'div',
    attrs: {
      'data-decorator-sid': decorator.sid,
      'data-decorator-source': decorator.source,
      'data-owner-id': owner?.userId,
      'data-agent-id': owner?.agentId,
      class: [
        'decorator',
        isRemote ? 'decorator-remote' : 'decorator-local',
        owner?.agentId ? 'decorator-ai' : 'decorator-user'
      ].join(' ')
    },
    children: [
      renderDecoratorContent(decorator),
      isRemote ? {
        tag: 'span',
        attrs: { class: 'decorator-owner-badge' },
        text: owner?.agentId 
          ? `AI: ${owner.agentId}`
          : `User: ${owner?.userId}`
      } : null
    ].filter(Boolean)
  };
}
```

### CSS styling

```css
/* Remote decorator style */
.decorator-remote {
  opacity: 0.8;
  border-left: 3px solid #2196F3; /* blue for remote */
}

/* AI decorator style */
.decorator-ai {
  border-left-color: #FF9800; /* orange for AI */
}

/* Owner badge */
.decorator-owner-badge {
  font-size: 10px;
  color: #666;
  margin-left: 4px;
}
```

## Example scenarios

### Scenario 1: External user adds a decorator

```typescript
// External user A adds a decorator
// → Broadcast message received
{
  type: 'decorator-add',
  decorator: {
    sid: 'comment-remote-1',
    stype: 'comment',
    category: 'inline',
    target: { sid: 'text-1', startOffset: 0, endOffset: 10 },
    data: { text: 'Comment from external user A' }
  },
  owner: {
    userId: 'user-a',
    sessionId: 'session-a-123'
  }
}

// → Added to RemoteDecoratorManager
view.remoteDecoratorManager.setRemoteDecorator(
  decorator,
  owner
);

// → Re-render
view.render();
// → External decorator shows with blue border
```

### Scenario 2: External AI adds a decorator

```typescript
// External user B's AI adds a decorator
{
  type: 'decorator-add',
  decorator: {
    sid: 'ai-work-remote-1',
    stype: 'comment',
    category: 'block',
    target: { sid: 'paragraph-1' },
    position: 'after',
    data: { text: 'External AI is working...' }
  },
  owner: {
    userId: 'user-b',
    agentId: 'ai-writer',
    sessionId: 'session-b-456'
  }
}

// → External AI decorator shows with orange border
// → Badge text: "AI: ai-writer"
```

### Scenario 3: User disconnects

```typescript
// User A disconnects
{
  type: 'user-disconnect',
  userId: 'user-a'
}

// → Remove all decorators owned by user A
view.remoteDecoratorManager.removeByOwner('user-a');

// → Re-render
view.render();
```

## Summary

### Key points

1. Same pattern as selection: decorators live on a separate channel.  
2. Separate from DocumentModel: OT/CRDT data vs Presence/Session data.  
3. Local vs remote separation: manage decorator ownership like selection.  
4. Unified rendering: merge all decorators at render time.  
5. Owner info: attach owner metadata to each decorator.  
6. Visual cues: distinguish remote (and AI) decorators visibly.  
7. Auto-sync: broadcast changes immediately.

### Channel structure

```
DocumentModel (OT/CRDT channel)
  ↓
  Text, structure, Marks changes
  (heavier data, needs conflict resolution)

EditorModel (Presence/Session channel)
  ├─ Selection changes
  │   (lightweight, real-time)
  └─ Decorator changes
      (lightweight, real-time)
```

### Implementation principles

1. Send separately: do not include decorators in operation payloads.  
2. Lightweight channel: use Presence/Session (same as selection).  
3. Real-time sync: broadcast immediately.  
4. Local-first: apply locally right away; manage remote separately.

## Related docs

- `./decorator-guide.md` — basic usage and examples.  
- `./decorator-architecture.md` — system architecture and design principles.
