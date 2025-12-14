# Basic Usage

This guide shows you how to create a basic editor with Barocss.

## Quick Example

<div class="editor-demo"></div>

## Step-by-Step

### 1. Define Schema

```typescript
import { Schema } from '@barocss/schema'

const schema = new Schema('my-schema', {
  nodes: {
    'paragraph': {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0]
    },
    'text': {
      group: 'inline'
    }
  },
  marks: {
    'bold': {
      parseDOM: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0]
    },
    'italic': {
      parseDOM: [{ tag: 'em' }],
      toDOM: () => ['em', 0]
    }
  }
})
```

### 2. Create Editor

```typescript
import { Editor } from '@barocss/editor-core'

const editor = new Editor({
  schema,
  extensions: [] // Add extensions here
})
```

### 3. Create View

```typescript
import { EditorViewDOM } from '@barocss/editor-view-dom'

const container = document.getElementById('editor')
const editorView = new EditorViewDOM(container, {
  editor
})
```

### 4. Complete Example

```typescript
import { Editor } from '@barocss/editor-core'
import { EditorViewDOM } from '@barocss/editor-view-dom'
import { Schema } from '@barocss/schema'

// Define schema
const schema = new Schema('my-schema', {
  nodes: {
    'paragraph': {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0]
    },
    'text': { group: 'inline' }
  },
  marks: {
    'bold': {
      parseDOM: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0]
    }
  }
})

// Create editor
const editor = new Editor({ schema })

// Create view
const container = document.getElementById('editor')
const editorView = new EditorViewDOM(container, { editor })
```

## Next Steps

- Learn about [Extensions](../guides/extension-design.md)
- Explore [Architecture](../architecture/overview.md)
- See [Examples](../examples/basic-editor.md)
