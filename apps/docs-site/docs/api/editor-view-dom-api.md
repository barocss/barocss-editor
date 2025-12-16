# Editor View DOM API

The Editor View DOM API provides the `EditorViewDOM` class that connects the `Editor` to the DOM, handling rendering, event handling, and decorator management.

## EditorViewDOM Class

The main class that manages the DOM layer of the editor.

### Constructor

```typescript
new EditorViewDOM(editor: Editor, options: EditorViewDOMOptions)
```

**Parameters:**
- `editor: Editor` - Editor instance
- `options: EditorViewDOMOptions` - Configuration options

**Options:**
```typescript
interface EditorViewDOMOptions {
  container: HTMLElement;              // Container element
  layers?: LayerConfiguration;         // Layer configuration
  keymaps?: KeymapConfig[];            // Custom keymap handlers
  inputHandlers?: InputHandlerConfig[]; // Custom input handlers
  mutationObserver?: MutationObserverConfig; // MutationObserver config
  registry?: RendererRegistry;          // Renderer registry
  initialTree?: ModelData | any;       // Initial content (ModelData format)
  autoRender?: boolean;                 // Auto-render on init (default: true)
}
```

**Example:**
```typescript
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { Editor } from '@barocss/editor-core';

const editor = new Editor();
const container = document.getElementById('editor');

const view = new EditorViewDOM(editor, {
  container,
  autoRender: true,
  initialTree: {
    sid: 'doc-1',
    stype: 'document',
    content: ['p-1']
  }
});
```

### Properties

#### `editor: Editor`
Editor instance (read-only).

#### `container: HTMLElement`
Container element (read-only).

#### `contentEditableElement: HTMLElement`
ContentEditable element (read-only). Always references `layers.content`.

#### `layers: { content, decorator, selection, context, custom }`
Layer elements (read-only).

```typescript
{
  content: HTMLElement;    // Content layer (contentEditable)
  decorator: HTMLElement;  // Decorator layer
  selection: HTMLElement;  // Selection layer
  context: HTMLElement;    // Context layer
  custom: HTMLElement;     // Custom layer
}
```

#### `decoratorRegistry: DecoratorRegistry`
Decorator registry instance.

#### `decoratorManager: DecoratorManager`
Decorator manager instance.

#### `remoteDecoratorManager: RemoteDecoratorManager`
Remote decorator manager instance.

#### `patternDecoratorConfigManager: PatternDecoratorConfigManager`
Pattern decorator configuration manager.

#### `decoratorGeneratorManager: DecoratorGeneratorManager`
Decorator generator manager.

### Methods

#### `render(tree?: ModelData | any, options?: { sync?: boolean }): void`

Renders the editor content.

**Parameters:**
- `tree?: ModelData | any` - Model data to render (uses current document if not provided)
- `options?: { sync?: boolean }` - Render options (sync: synchronous rendering for tests)

**Behavior:**
- Renders content layer
- Renders decorator layer
- Renders selection layer
- Renders context layer
- Renders custom layer

**Example:**
```typescript
// Render current document
view.render();

// Render specific content
view.render({
  sid: 'doc-1',
  stype: 'document',
  content: ['p-1']
});

// Synchronous rendering (for tests)
view.render(tree, { sync: true });
```

#### `handleInput(event: InputEvent): void`

Handles input events.

**Parameters:**
- `event: InputEvent` - Input event

**Behavior:**
- Analyzes text changes
- Converts to model operations
- Executes transactions

#### `handleBeforeInput(event: InputEvent): void`

Handles beforeinput events.

**Parameters:**
- `event: InputEvent` - BeforeInput event

#### `handleKeydown(event: KeyboardEvent): void`

Handles keyboard events.

**Parameters:**
- `event: KeyboardEvent` - Keyboard event

**Behavior:**
- Resolves keybindings
- Executes commands
- Handles special keys (Backspace, Delete, etc.)

#### `handlePaste(event: ClipboardEvent): void`

Handles paste events.

**Parameters:**
- `event: ClipboardEvent` - Clipboard event

**Behavior:**
- Extracts clipboard data
- Converts to model format
- Inserts at selection

#### `handleDrop(event: DragEvent): void`

Handles drop events.

**Parameters:**
- `event: DragEvent` - Drag event

#### `handleSelectionChange(): void`

Handles selection change events.

**Behavior:**
- Converts DOM selection to model selection
- Updates editor selection
- Emits selection events

#### `convertModelSelectionToDOM(sel: ModelSelection): void`

Converts model selection to DOM selection.

**Parameters:**
- `sel: ModelSelection` - Model selection

**Behavior:**
- Finds DOM nodes from model IDs
- Sets DOM selection

#### `convertDOMSelectionToModel(sel: Selection): ModelSelection`

Converts DOM selection to model selection.

**Parameters:**
- `sel: Selection` - DOM selection

**Returns:**
- `ModelSelection` - Model selection

#### `insertParagraph(): void`

Inserts a paragraph at the current selection.

#### `insertText(text: string): void`

Inserts text at the current selection.

**Parameters:**
- `text: string` - Text to insert

#### `deleteSelection(): void`

Deletes the current selection.

#### `historyUndo(): void`

Performs undo operation.

#### `historyRedo(): void`

Performs redo operation.

#### `toggleBold(): void`

Toggles bold formatting.

#### `toggleItalic(): void`

Toggles italic formatting.

#### `toggleUnderline(): void`

Toggles underline formatting.

#### `toggleStrikeThrough(): void`

Toggles strikethrough formatting.

#### `blur(): void`

Blurs the editor.

#### `restoreLastSelection(): void`

Restores the last selection.

#### `destroy(): void`

Destroys the editor view.

**Behavior:**
- Cleans up event listeners
- Removes layers
- Disconnects MutationObserver

---

## Layer Configuration

Editor View DOM uses a layered architecture for rendering.

### Layer Structure

```typescript
interface LayerConfiguration {
  contentEditable?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  decorator?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  selection?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  context?: {
    className?: string;
    attributes?: Record<string, string>;
  };
  custom?: {
    className?: string;
    attributes?: Record<string, string>;
  };
}
```

### Layer Order (z-index)

1. **Content Layer** (z-index: 1) - ContentEditable element
2. **Decorator Layer** (z-index: 10) - Decorators overlay
3. **Selection Layer** (z-index: 100) - Selection overlay
4. **Context Layer** (z-index: 200) - Context menu, tooltips
5. **Custom Layer** (z-index: 1000) - Custom overlays

**Example:**
```typescript
const view = new EditorViewDOM(editor, {
  container,
  layers: {
    contentEditable: {
      className: 'my-editor-content',
      attributes: { 'data-testid': 'editor-content' }
    },
    decorator: {
      className: 'my-decorators',
      attributes: { 'data-testid': 'decorators' }
    }
  }
});
```

---

## Decorator Management

Decorators are visual overlays that can be added to the editor.

### DecoratorManager

Manages decorator CRUD operations.

#### `add(decorator: Decorator): void`

Adds a decorator.

**Parameters:**
- `decorator: Decorator` - Decorator to add

**Example:**
```typescript
view.decoratorManager.add({
  sid: 'comment-1',
  stype: 'comment',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: {
    text: 'This is a comment'
  }
});
```

#### `update(id: string, updates: Partial<Decorator>, options?: DecoratorUpdateOptions): void`

Updates a decorator.

**Parameters:**
- `id: string` - Decorator ID
- `updates: Partial<Decorator>` - Updates to apply
- `options?: DecoratorUpdateOptions` - Update options

**Example:**
```typescript
view.decoratorManager.update('comment-1', {
  data: { text: 'Updated comment' }
}, { partial: true });
```

#### `remove(id: string): void`

Removes a decorator.

**Parameters:**
- `id: string` - Decorator ID

**Example:**
```typescript
view.decoratorManager.remove('comment-1');
```

#### `get(id: string): Decorator | undefined`

Gets a decorator by ID.

**Parameters:**
- `id: string` - Decorator ID

**Returns:**
- `Decorator | undefined` - Decorator or `undefined`

#### `query(options?: DecoratorQueryOptions): Decorator[]`

Queries decorators.

**Parameters:**
```typescript
interface DecoratorQueryOptions {
  type?: string;                    // Filter by type
  category?: 'layer' | 'inline' | 'block'; // Filter by category
  nodeId?: string;                  // Filter by node ID
  sortBy?: 'id' | 'type' | 'category'; // Sort field
  sortOrder?: 'asc' | 'desc';       // Sort order
  enabledOnly?: boolean;             // Only enabled decorators (default: true)
}
```

**Returns:**
- `Decorator[]` - Array of matching decorators

**Example:**
```typescript
// Get all inline decorators
const inlineDecorators = view.decoratorManager.query({
  category: 'inline',
  enabledOnly: true
});

// Get decorators for a specific node
const nodeDecorators = view.decoratorManager.query({
  nodeId: 'text-1'
});
```

#### `setEnabled(id: string, enabled: boolean): boolean`

Enables or disables a decorator.

**Parameters:**
- `id: string` - Decorator ID
- `enabled: boolean` - Enabled state

**Returns:**
- `boolean` - `true` if successful

#### `isEnabled(id: string): boolean`

Checks if a decorator is enabled.

**Parameters:**
- `id: string` - Decorator ID

**Returns:**
- `boolean` - `true` if enabled

### Decorator Types

#### Layer Decorator

Overlay decorator (position: absolute).

```typescript
interface LayerDecorator extends Decorator {
  category: 'layer';
  target?: DecoratorTarget; // Optional (for overlays like cursor, selection)
}
```

**Example:**
```typescript
view.decoratorManager.add({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  data: {
    position: { x: 100, y: 200 }
  }
});
```

#### Inline Decorator

Text range decorator.

```typescript
interface InlineDecorator extends Decorator {
  category: 'inline';
  target: DecoratorTarget; // Required
}
```

**Example:**
```typescript
view.decoratorManager.add({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    color: 'yellow'
  }
});
```

#### Block Decorator

Block node decorator.

```typescript
interface BlockDecorator extends Decorator {
  category: 'block';
  target: DecoratorTarget; // Required
}
```

**Example:**
```typescript
view.decoratorManager.add({
  sid: 'border-1',
  stype: 'border',
  category: 'block',
  target: {
    sid: 'paragraph-1'
  },
  data: {
    style: 'dashed',
    color: 'blue'
  }
});
```

### Decorator Events

DecoratorManager emits events for decorator changes.

```typescript
// Subscribe to decorator events
view.decoratorManager.on('decorator:added', (decorator) => {
  console.log('Decorator added:', decorator);
});

view.decoratorManager.on('decorator:updated', (decorator) => {
  console.log('Decorator updated:', decorator);
});

view.decoratorManager.on('decorator:removed', (id) => {
  console.log('Decorator removed:', id);
});
```

### Pattern Decorators

Pattern decorators are automatically applied based on content patterns.

#### `setPatternDecoratorConfigs(configs: PatternDecoratorConfig[]): void`

Sets pattern decorator configurations.

**Parameters:**
- `configs: PatternDecoratorConfig[]` - Pattern configurations

**Example:**
```typescript
view.setPatternDecoratorConfigs([
  {
    sid: 'url-pattern',
    stype: 'link',
    category: 'inline',
    pattern: {
      type: 'regex',
      regex: /https?:\/\/[^\s]+/g
    },
    enabled: true
  }
]);
```

#### `addPatternDecoratorConfig(config: PatternDecoratorConfig): void`

Adds a pattern decorator configuration.

#### `removePatternDecoratorConfig(sid: string): boolean`

Removes a pattern decorator configuration.

#### `getPatternDecoratorConfigs(): PatternDecoratorConfig[]`

Gets all pattern decorator configurations.

#### `setPatternDecoratorEnabled(id: string, enabled: boolean): boolean`

Enables or disables a pattern decorator.

#### `isPatternDecoratorEnabled(sid: string): boolean`

Checks if a pattern decorator is enabled.

### Decorator Type Definition

#### `defineDecoratorType(type: string, category: 'layer' | 'inline' | 'block', schema: DecoratorTypeSchema): void`

Defines a decorator type schema.

**Parameters:**
- `type: string` - Decorator type name
- `category: 'layer' | 'inline' | 'block'` - Decorator category
- `schema: DecoratorTypeSchema` - Type schema

**Example:**
```typescript
view.defineDecoratorType('comment', 'inline', {
  description: 'Comment decorator',
  dataSchema: {
    text: {
      type: 'string',
      required: true
    },
    author: {
      type: 'string',
      required: false,
      default: 'Anonymous'
    }
  }
});
```

---

## Input Handler

Handles input events and converts them to model operations.

### InputHandler Interface

```typescript
interface InputHandler {
  handleInput(event: InputEvent): void;
  handleBeforeInput(event: InputEvent): void;
  handleKeyDown?(event: KeyboardEvent): void;
  handleDomMutations?(mutations: MutationRecord[]): void;
  handleTextContentChange?(oldValue: string | null, newValue: string | null, target: Node): void;
}
```

**Access:**
```typescript
const inputHandler = view.inputHandler;
```

---

## Selection Handler

Handles DOM selection and converts it to model selection.

### DOMSelectionHandler Interface

```typescript
interface DOMSelectionHandler {
  handleSelectionChange(): void;
  convertDOMSelectionToModel(selection: Selection): any;
  convertModelSelectionToDOM(modelSelection: any): void;
}
```

**Access:**
```typescript
const selectionHandler = view.selectionHandler;
```

---

## Mutation Observer Manager

Manages DOM mutation observation.

### MutationObserverManager Interface

```typescript
interface MutationObserverManager {
  setup(contentEditableElement: HTMLElement): void;
  disconnect(): void;
  handleMutation(mutation: MutationRecord): void;
}
```

**Access:**
```typescript
const mutationObserver = view.mutationObserverManager;
```

**Configuration:**
```typescript
const view = new EditorViewDOM(editor, {
  container,
  mutationObserver: {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-bc-id']
  }
});
```

---

## Related

- [Editor Core API](./editor-core-api) - Core editor API
- [Decorators Guide](../concepts/decorators) - Decorator concepts
- [Renderer DOM API](./renderer-dom-api) - Renderer API
- [DSL API](./dsl-api) - Template DSL
