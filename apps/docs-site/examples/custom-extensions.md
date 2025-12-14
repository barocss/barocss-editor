# Custom Extensions Example

Learn how to create custom extensions for Barocss Editor.

<div class="editor-demo"></div>

## Creating an Extension

```typescript
import { Extension } from '@barocss/extensions'

class MyCustomExtension implements Extension {
  name = 'my-custom-extension'
  
  onCreate(editor: Editor) {
    // Initialize your extension
  }
  
  onDestroy(editor: Editor) {
    // Cleanup
  }
}

// Register extension
const editor = new Editor({
  schema,
  extensions: [new MyCustomExtension()]
})
```

See the [Extension Design Guide](../guides/extension-design.md) for more details.
