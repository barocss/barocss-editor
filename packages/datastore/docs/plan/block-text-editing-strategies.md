# Block Node Internal Text Editing Strategies

## Overview

This document covers editing methods for nodes that have a `.text` field but are `group: 'block'`, such as `codeBlock`, `mathBlock` (formula), and `formula`. It analyzes approaches from other editors and presents solutions for Barocss Editor.

---

## 1. Problem Situation

### 1.1 Special Block Nodes

The following nodes have special editing requirements:

- **codeBlock**: Code editing (syntax highlighting, autocomplete, etc.)
- **mathBlock**: Formula editing (LaTeX, MathML, etc.)
- **formula**: Formula editing (Excel style)
- **table**: Table editing (cell editing)
- **canvas**: Canvas editing (drawing tools)

**Common characteristics:**
- `group: 'block'` (block node)
- Contains `.text` field or internal text
- **Requires different editing method than general text editing**

### 1.2 Current Barocss Editor Behavior

**Current state:**
- `_isEditableNode` returns `false` if `group: 'block'`
- Skipped in `getPreviousEditableNode` / `getNextEditableNode`
- **Cannot navigate with cursor**

**Problems:**
- How to edit text inside codeBlock?
- How to edit formula block?
- Do we need to provide a different editor?

---

## 2. Approaches from Other Editors

### 2.1 ProseMirror

**Approach:**
- **Allow editing inside code block**: Maintain `contentEditable` but provide special input handler
- **Syntax highlighting**: Integrate with separate highlighter (CodeMirror, etc.)
- **Formula**: Separate formula editor component (KaTeX, MathQuill, etc.)

**Characteristics:**
- Can enter cursor inside Block node
- But special input processing needed
- Extensible with plugin system

**Example:**
```typescript
// ProseMirror code block
{
  type: 'code_block',
  content: [
    { type: 'text', text: 'const x = 1;' }
  ]
}
// Internal text can be edited, but special input processing needed
```

### 2.2 Notion

**Approach:**
- **Hybrid approach**: 
  - Click to select entire block (Node Selection)
  - Double click or Enter to switch to internal edit mode
  - Provide separate editor UI in edit mode

**Characteristics:**
- Code block: CodeMirror integration
- Formula block: LaTeX editor integration
- Table: Cell-by-cell edit mode

**Example:**
```
1. Click code block → Full selection
2. Double click or Enter → Edit mode
3. CodeMirror editor displayed
4. Esc or click outside block → Exit edit mode
```

### 2.3 Google Docs

**Approach:**
- **Inline editing**: Can directly enter cursor inside code block
- **Special formatting**: Code block is simply styled text
- **Formula**: Separate formula editor (Equation Editor)

**Characteristics:**
- Edit Block node internal text like general text
- Special features (syntax highlighting, etc.) are limited

### 2.4 Slate.js

**Approach:**
- **Custom editor component**: Connect custom renderer to Block node
- **Separate editor instance**: Integrate CodeMirror, Monaco Editor, etc.
- **Event delegation**: Activate custom editor when Block node is clicked

**Characteristics:**
- Block node itself is not editable
- Display separate editor UI when clicked
- Need to synchronize editor and model

### 2.5 Draft.js

**Approach:**
- **Custom block renderer**: Custom component for each Block node
- **Separate editor**: CodeMirror for code block, MathQuill for formula
- **State management**: Manage Block internal state separately

**Characteristics:**
- Block nodes treated as "atomic"
- Internal editing handled in separate editor
- Need synchronization between model and editor

---

## 3. Barocss Editor Solutions

### 3.1 Option 1: Support Editable Block Nodes (Recommended)

**Concept:**
- If `group: 'block'` but has `.text` field, classify as "Editable Block"
- Internal text can be edited, but special input processing needed

**Implementation:**
```typescript
// Modify _isEditableNode
private _isEditableNode(nodeId: string): boolean {
  const node = this.dataStore.getNode(nodeId);
  if (!node) return false;

  const schema = this.dataStore.getActiveSchema();
  if (schema) {
    const nodeType = schema.getNodeType(node.stype);
    if (nodeType) {
      const group = nodeType.group;
      
      // Editable Block: editable if block but editable=true
      if (group === 'block' && nodeType.editable === true) {
        // Must have .text field to be editable
        if (node.text !== undefined && typeof node.text === 'string') {
          return true; // Editable block
        }
        return false;
      }
      
      if (group === 'block' || group === 'document') {
        return false; // Regular blocks are not editable
      }
      if (group === 'inline') {
        return true;
      }
    }
  }
  
  // ... rest of logic
}
```

**Schema definition:**
```typescript
{
  'codeBlock': {
    name: 'codeBlock',
    group: 'block',
    editable: true, // Internal text can be edited
    content: 'text*',
    attrs: {
      language: { type: 'string', default: 'text' }
    }
  },
  'mathBlock': {
    name: 'mathBlock',
    group: 'block',
    editable: true,
    attrs: {
      tex: { type: 'string' },
      engine: { type: 'string', default: 'katex' }
    }
  }
}
```

**Advantages:**
- Can navigate with cursor
- Reuse existing `getPreviousEditableNode` logic
- Special input processing handled in separate Extension

**Disadvantages:**
- Need special input processing when editing inside Block node
- Need separate implementation for syntax highlighting, autocomplete, etc.

### 3.2 Option 2: Separate Editor Component (Notion Style)

**Concept:**
- Block nodes are not editable (same as current)
- Display separate editor UI on click/double click
- Utilize External Component system

**Implementation:**
```typescript
// codeBlock renderer
define('codeBlock', (model) => {
  const isEditing = model.metadata?.isEditing || false;
  
  if (isEditing) {
    // Edit mode: Display CodeMirror editor
    return element('div', { 
      className: 'code-block-editor',
      'data-bc-component': 'codeMirror',
      'data-bc-props': JSON.stringify({
        value: model.text,
        language: model.attributes.language,
        onChange: (newText) => {
          // Update model
          editor.executeCommand('updateNode', {
            nodeId: model.sid,
            updates: { text: newText }
          });
        }
      })
    });
  } else {
    // Display mode: Show highlighted code
    return element('pre', { className: 'code-block' }, [
      element('code', { 'data-language': model.attributes.language }, [
        text(model.text)
      ])
    ]);
  }
});
```

**User interaction:**
1. Click code block → Full selection (Node Selection)
2. Double click or Enter → Set `isEditing: true`
3. Display CodeMirror editor
4. Esc or click outside → Set `isEditing: false`

**Advantages:**
- Powerful editor features (syntax highlighting, autocomplete, etc.)
- Can reuse existing editor libraries
- Maintain Block node structure

**Disadvantages:**
- Need synchronization between model and editor
- Need edit mode switching logic
- Need to utilize External Component system

### 3.3 Option 3: Hybrid Approach (Recommended)

**Concept:**
- **General editing**: Can navigate with cursor (Option 1)
- **Advanced editing**: Display separate editor on double click (Option 2)
- User can choose

**Implementation:**
```typescript
// Schema definition
{
  'codeBlock': {
    name: 'codeBlock',
    group: 'block',
    editable: true,        // Basic editing possible
    advancedEditor: 'codeMirror', // Advanced editor type
    attrs: {
      language: { type: 'string', default: 'text' }
    }
  }
}

// Edit mode switching
editor.registerCommand({
  name: 'toggleBlockEditor',
  execute: (editor, payload: { nodeId: string }) => {
    const node = editor.dataStore.getNode(payload.nodeId);
    if (!node) return false;
    
    const nodeType = editor.schema.getNodeType(node.stype);
    if (nodeType?.advancedEditor) {
      // Switch to advanced editor mode
      editor.setNodeMetadata(payload.nodeId, { 
        isEditing: true,
        editorType: nodeType.advancedEditor
      });
      return true;
    }
    return false;
  }
});
```

**User experience:**
1. **Basic mode**: Can navigate with cursor, general text editing
2. **Double click**: Switch to advanced editor mode
3. **Advanced mode**: Display professional editors like CodeMirror, MathQuill, etc.

**Advantages:**
- Flexibility: User can choose editing method
- Basic editing is simple
- Utilize professional editors for advanced features

---

## 4. Specific Implementation Plans

### 4.1 codeBlock Editing

#### Plan A: Basic Text Editing (Simple)

```typescript
// Support editable in _isEditableNode
if (group === 'block' && node.text !== undefined && nodeType.editable) {
  return true; // Editable
}

// Process same as general text editing when editing
// Syntax highlighting applied only during rendering (read-only)
```

**Advantages:**
- Simple implementation
- Can navigate with cursor
- Reuse existing logic

**Disadvantages:**
- Syntax highlighting is read-only
- No advanced features like autocomplete

#### Plan B: CodeMirror Integration (Advanced)

```typescript
// Integrate CodeMirror as External Component
registry.registerComponent('codeMirror', {
  mount(container, props) {
    const editor = CodeMirror(container, {
      value: props.value,
      mode: props.language,
      lineNumbers: true
    });
    
    editor.on('change', () => {
      props.onChange(editor.getValue());
    });
    
    return container;
  },
  update(element, prevProps, nextProps) {
    if (prevProps.value !== nextProps.value) {
      const editor = element.querySelector('.CodeMirror')?.CodeMirror;
      if (editor) {
        editor.setValue(nextProps.value);
      }
    }
  },
  managesDOM: true
});
```

**Advantages:**
- Professional code editing features
- Syntax highlighting, autocomplete, etc.

**Disadvantages:**
- Complex implementation
- Need model synchronization

### 4.2 mathBlock Editing

#### Plan A: LaTeX Text Editing

```typescript
// Basic text editing (LaTeX source)
{
  stype: 'mathBlock',
  text: 'E=mc^2',
  attributes: { engine: 'katex' }
}

// Render formula with KaTeX during rendering
// Edit LaTeX source when editing
```

**Advantages:**
- Simple implementation
- Direct LaTeX source editing

**Disadvantages:**
- Cannot edit formula visually
- Need to learn LaTeX syntax

#### Plan B: MathQuill Integration (Advanced)

```typescript
// Integrate MathQuill editor
registry.registerComponent('mathQuill', {
  mount(container, props) {
    const mathField = MQ.MathField(container, {
      spaceBehavesLikeTab: true,
      handlers: {
        edit: () => {
          props.onChange(mathField.latex());
        }
      }
    });
    
    mathField.latex(props.value);
    return container;
  },
  managesDOM: true
});
```

**Advantages:**
- Visual formula editing
- Automatic LaTeX conversion

**Disadvantages:**
- Complex implementation
- MathQuill library dependency

### 4.3 formula Editing (Excel Style)

```typescript
// Excel style formula editing
{
  stype: 'formula',
  text: '=SUM(A1:A10)',
  attributes: { 
    type: 'excel',
    references: ['A1', 'A10']
  }
}

// Need separate formula editor
// Cell reference autocomplete, formula validation, etc.
```

---

## 5. Recommended Implementation Strategy

### 5.1 Phased Implementation

#### Phase 1: Basic Support (Current)
- ✅ Block nodes are not editable (skipped)
- ✅ Only internal inline nodes are editable

#### Phase 2: Editable Block Support
- Add `editable: true` attribute
- Check `editable` in `_isEditableNode`
- Support basic text editing

#### Phase 3: Advanced Editor Integration
- Utilize External Component system
- Integrate CodeMirror, MathQuill, etc.
- Edit mode switching logic

### 5.2 Schema Extension

```typescript
interface NodeTypeDefinition {
  name: string;
  group?: 'block' | 'inline' | 'document';
  editable?: boolean;        // Block but internal text can be edited
  advancedEditor?: string;        // Advanced editor type (codeMirror, mathQuill, etc.)
  content?: string;
  attrs?: Record<string, AttributeDefinition>;
  // ...
}
```

### 5.3 Edit Mode Management

**Important: Edit state is stored only in memory**

Edit state (`isEditing`, `editorType`, etc.) is **not permanently stored**. Instead, it is stored in `ComponentManager`'s `BaseComponentState`.

**Structure:**
```typescript
// INode.metadata: For permanent storage (e.g., loadedAt, lastEditedBy, etc.)
interface INode {
  metadata?: {
    loadedAt?: string;           // Permanent storage
    lastEditedBy?: string;        // Permanent storage
    // ...
  };
}

// ComponentManager's BaseComponentState: Temporary state (memory only)
ComponentManager
  └── componentInstances: Map<string, ComponentInstance>
        └── key: sid
        └── value: ComponentInstance
              └── __stateInstance: BaseComponentState
                    └── data: {
                          isEditing?: boolean;      // Edit mode status (memory only)
                          editorType?: string;      // Editor type in use (memory only)
                          // ...
                        }
```

**Accessing edit state:**
```typescript
// Access edit state through ComponentManager
// Access ComponentManager from EditorViewDOM (internal method)
const componentManager = (editorViewDOM as any)._domRenderer?.getComponentManager();
if (!componentManager) {
  console.warn('ComponentManager not available');
  return;
}

// Get ComponentInstance for specific node
const instance = componentManager.getComponentInstance(nodeId);
const state = instance?.__stateInstance;

if (state) {
  // Check edit state
  const isEditing = state.get('isEditing') || false;
  const editorType = state.get('editorType');
  
  // Set edit state
  state.set({ 
    isEditing: true, 
    editorType: 'codeMirror' 
  });
  
  // Clear edit state
  state.set({ 
    isEditing: false,
    editorType: undefined
  });
}
```

**Edit state management utility function example:**
```typescript
// Use in Extension or Command
function toggleBlockEditorMode(
  editor: Editor, 
  nodeId: string, 
  editorType?: string
): boolean {
  const editorViewDOM = (editor as any)._viewDOM;
  if (!editorViewDOM) return false;
  
  const componentManager = (editorViewDOM as any)._domRenderer?.getComponentManager();
  if (!componentManager) return false;
  
  const instance = componentManager.getComponentInstance(nodeId);
  const state = instance?.__stateInstance;
  if (!state) return false;
  
  const isEditing = state.get('isEditing') || false;
  
  if (isEditing) {
    // Exit edit mode
    state.set({ isEditing: false, editorType: undefined });
  } else {
    // Start edit mode
    state.set({ isEditing: true, editorType: editorType || 'default' });
  }
  
  return true;
}
```

---

## 6. User Experience Scenarios

### 6.1 codeBlock Editing

**Scenario 1: Basic Editing**
```
1. Move cursor to code block (arrow keys)
2. Can input/delete text
3. Syntax highlighting applied only during rendering
```

**Scenario 2: Advanced Editing**
```
1. Double click code block
2. CodeMirror editor displayed
3. Can use syntax highlighting, autocomplete, etc.
4. Exit with Esc or click outside
```

### 6.2 mathBlock Editing

**Scenario 1: LaTeX Editing**
```
1. Move cursor to formula block
2. Directly edit LaTeX source: E=mc^{2}
3. Display as formula during rendering
```

**Scenario 2: Visual Editing**
```
1. Double click formula block
2. MathQuill editor displayed
3. Edit formula visually
4. Automatically convert to LaTeX
```

---

## 7. Implementation Checklist

### Phase 1: Basic Editable Block Support
- [ ] Add `editable` attribute to schema
- [ ] Check `editable` in `_isEditableNode`
- [ ] Include editable in `getPreviousEditableNode` / `getNextEditableNode`
- [ ] Test basic text editing

### Phase 2: Edit Mode Switching
- [ ] Manage `isEditing` state in node metadata
- [ ] Handle double click event
- [ ] Edit mode switching Command
- [ ] Update UI state

### Phase 3: Advanced Editor Integration
- [ ] Extend External Component system
- [ ] CodeMirror integration
- [ ] MathQuill integration
- [ ] Model synchronization logic

---

## 8. References

- ProseMirror Code Block: https://prosemirror.net/docs/guide/#code
- Notion Code Block: User experience observation
- Slate.js Custom Blocks: https://docs.slatejs.org/concepts/10-customizing-editor
- CodeMirror: https://codemirror.net/
- MathQuill: http://mathquill.com/

---

## 9. Conclusion

**Recommended approach: Hybrid approach**

1. **Basic editing**: Support cursor navigation and basic text editing with `editable: true`
2. **Advanced editing**: Display professional editor with External Component on double click
3. **User choice**: User can choose editing method

This approach:
- ✅ Basic editing is simple
- ✅ Utilize professional editors for advanced features
- ✅ Flexible extensibility
- ✅ Compatibility with existing system
