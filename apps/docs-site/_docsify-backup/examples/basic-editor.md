# Basic Editor Example

A simple editor with paragraph and text formatting.

<div class="editor-demo"></div>

## Code

```typescript
import { Editor } from '@barocss/editor-core'
import { EditorViewDOM } from '@barocss/editor-view-dom'
import { Schema } from '@barocss/schema'

const schema = new Schema('basic-schema', {
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

const editor = new Editor({ schema })
const container = document.getElementById('editor')
const editorView = new EditorViewDOM(container, { editor })
```
