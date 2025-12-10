# React DSL Specification

## 📋 Overview

React DSL (Domain Specific Language) is a domain-specific language for defining node-type-specific renderers using React components in Zero Editor. It leverages JSX syntax and React Hooks to write intuitive and powerful renderers.

## 🎯 Design Goals

### 1. **React-friendly**
- Use JSX syntax
- Support React Hooks
- Leverage existing React knowledge

### 2. **Type Safety**
- Full TypeScript support
- Compile-time error detection
- Autocomplete and refactoring support

### 3. **Performance Optimization**
- Leverage React.memo, useMemo, etc.
- Virtual DOM-based optimization
- Support lazy rendering

### 4. **Extensibility**
- Support Context API
- Reuse custom hooks
- Integrate with plugin system

## 🏗️ Core Concepts

### 1. **Renderer Definition**

```typescript
// Basic syntax
function rendererReact<T = any>(
  nodeType: TNodeType, 
  component: React.ComponentType<T>
): ReactRendererDefinition;

interface ReactRendererDefinition {
  type: 'react';
  nodeType: TNodeType;
  component: React.ComponentType<any>;
  props?: (data: any) => any;
}
```

### 2. **Component Types**

```typescript
// Basic component props
interface BaseNodeProps {
  data: any;
  isSelected?: boolean;
  isFocused?: boolean;
  isHovered?: boolean;
  onSelect?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
}

// Specific node type props
interface TextNodeProps extends BaseNodeProps {
  data: {
    id: string;
    type: 'text';
    text: string;
    attributes: {
      bold: boolean;
      italic: boolean;
      color?: string;
    };
  };
}
```

### 3. **Context API**

```typescript
// Editor context
interface EditorContextType {
  theme: 'light' | 'dark';
  readOnly: boolean;
  selection: {
    isSelected: (nodeId: string) => boolean;
    getSelectionRange: (nodeId: string) => Range | null;
  };
  actions: {
    onNodeClick: (nodeId: string) => void;
    onNodeEdit: (nodeId: string) => void;
    onNodeDelete: (nodeId: string) => void;
  };
}

const EditorContext = createContext<EditorContextType | null>(null);

// Context Hook
const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
};
```

## 📝 Usage Examples

### 1. **Basic Renderer Definition**

```typescript
// Text renderer
const TextRenderer: React.FC<TextNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    fontWeight: data.attributes.bold ? 'bold' : 'normal',
    fontStyle: data.attributes.italic ? 'italic' : 'normal',
    color: data.attributes.color || 'inherit',
    backgroundColor: isSelected ? '#e3f2fd' : 'transparent'
  }), [data.attributes, isSelected]);
  
  return (
    <span 
      className={`text-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.text}
    </span>
  );
};

const textRenderer = rendererReact<TextNodeProps>('text', TextRenderer);

// Paragraph renderer
const ParagraphRenderer: React.FC<ParagraphNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme, readOnly } = useEditor();
  
  const handleClick = useCallback(() => {
    if (!readOnly) {
      onSelect?.(data.sid);
    }
  }, [data.sid, readOnly, onSelect]);
  
  const style = useMemo(() => ({
    textAlign: data.attributes.align || 'left',
    textIndent: `${(data.attributes.indent || 0) * 20}px`
  }), [data.attributes]);
  
  return (
    <p 
      className={`paragraph theme-${theme} ${isSelected ? 'selected' : ''} ${readOnly ? 'readonly' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </p>
  );
};

const paragraphRenderer = rendererReact<ParagraphNodeProps>('paragraph', ParagraphRenderer);
```

### 2. **Custom Hook Usage**

```typescript
// Selection state hook
const useNodeSelection = (nodeId: string) => {
  const { selection } = useEditor();
  const [isSelected, setIsSelected] = useState(false);
  
  useEffect(() => {
    const updateSelection = () => {
      setIsSelected(selection.isSelected(nodeId));
    };
    
    updateSelection();
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, [nodeId, selection]);
  
  return isSelected;
};

// Node action hook
const useNodeActions = (nodeId: string) => {
  const { actions, readOnly } = useEditor();
  
  const handleClick = useCallback(() => {
    if (!readOnly) actions.onNodeClick(nodeId);
  }, [nodeId, readOnly, actions]);
  
  const handleEdit = useCallback(() => {
    if (!readOnly) actions.onNodeEdit(nodeId);
  }, [nodeId, readOnly, actions]);
  
  const handleDelete = useCallback(() => {
    if (!readOnly) actions.onNodeDelete(nodeId);
  }, [nodeId, readOnly, actions]);
  
  return { handleClick, handleEdit, handleDelete };
};

// Style hook
const useNodeStyle = (attributes: any) => {
  const { theme } = useEditor();
  
  return useMemo(() => ({
    fontWeight: attributes.bold ? 'bold' : 'normal',
    fontStyle: attributes.italic ? 'italic' : 'normal',
    color: attributes.color || 'inherit',
    backgroundColor: theme === 'dark' ? '#333' : '#fff'
  }), [attributes.bold, attributes.italic, attributes.color, theme]);
};

// Text renderer using hooks
const TextRenderer: React.FC<TextNodeProps> = ({ data }) => {
  const isSelected = useNodeSelection(data.sid);
  const { handleClick } = useNodeActions(data.sid);
  const style = useNodeStyle(data.attributes);
  
  return (
    <span 
      className={`text-node ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.text}
    </span>
  );
};
```

### 3. **Composite Renderer**

```typescript
// Image renderer
const ImageRenderer: React.FC<ImageNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);
  
  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(false);
  }, []);
  
  const style = useMemo(() => ({
    width: data.attributes.width ? `${data.attributes.width}px` : 'auto',
    height: data.attributes.height ? `${data.attributes.height}px` : 'auto',
    maxWidth: '100%',
    border: isSelected ? '2px solid #007ACC' : '1px solid #ddd'
  }), [data.attributes, isSelected]);
  
  if (hasError) {
    return (
      <div 
        className={`image-error theme-${theme}`}
        style={style}
        onClick={handleClick}
      >
        <span>Failed to load image</span>
      </div>
    );
  }
  
  return (
    <img
      src={data.attributes.src}
      alt={data.attributes.alt || ''}
      className={`image-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
};

const imageRenderer = rendererReact<ImageNodeProps>('image', ImageRenderer);

// Link renderer
const LinkRenderer: React.FC<LinkNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback((event: React.MouseEvent) => {
    if (data.attributes.target === '_blank') {
      event.preventDefault();
      window.open(data.attributes.href, '_blank');
    }
    onSelect?.(data.sid);
  }, [data.attributes, data.sid, onSelect]);
  
  const style = useMemo(() => ({
    color: data.attributes.color || '#007ACC',
    textDecoration: 'underline'
  }), [data.attributes]);
  
  return (
    <a
      href={data.attributes.href}
      target={data.attributes.target || '_self'}
      className={`link-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </a>
  );
};

const linkRenderer = rendererReact<LinkNodeProps>('link', LinkRenderer);
```

### 4. **List Renderer**

```typescript
// List item renderer
const ListItemRenderer: React.FC<ListItemNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    marginLeft: `${(data.attributes.level || 0) * 20}px`,
    listStyleType: data.attributes.type === 'number' ? 'decimal' : 'disc'
  }), [data.attributes]);
  
  return (
    <li 
      className={`list-item theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </li>
  );
};

const listItemRenderer = rendererReact<ListItemNodeProps>('listItem', ListItemRenderer);

// List renderer
const ListRenderer: React.FC<ListNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    listStyleType: data.attributes.type === 'number' ? 'decimal' : 'disc'
  }), [data.attributes]);
  
  return (
    <ul 
      className={`list theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </ul>
  );
};

const listRenderer = rendererReact<ListNodeProps>('list', ListRenderer);
```

### 5. **Table Renderer**

```typescript
// Table cell renderer
const TableCellRenderer: React.FC<TableCellNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: data.attributes.align || 'left'
  }), [data.attributes]);
  
  return (
    <td
      colSpan={data.attributes.colspan || 1}
      rowSpan={data.attributes.rowspan || 1}
      className={`table-cell theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </td>
  );
};

const tableCellRenderer = rendererReact<TableCellNodeProps>('tableCell', TableCellRenderer);

// Table row renderer
const TableRowRenderer: React.FC<TableRowNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  return (
    <tr 
      className={`table-row theme-${theme} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </tr>
  );
};

const tableRowRenderer = rendererReact<TableRowNodeProps>('tableRow', TableRowRenderer);

// Table renderer
const TableRenderer: React.FC<TableNodeProps> = ({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    borderCollapse: 'collapse',
    width: '100%'
  }), []);
  
  return (
    <table 
      className={`table theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.content.map(child => (
        <NodeRenderer key={child.sid} node={child} />
      ))}
    </table>
  );
};

const tableRenderer = rendererReact<TableNodeProps>('table', TableRenderer);
```

## 🔧 Advanced Features

### 1. **Context Provider**

```typescript
// Editor provider
const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [readOnly, setReadOnly] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  
  const selection = {
    isSelected: (nodeId: string) => selectedNodes.has(nodeId),
    getSelectionRange: (nodeId: string) => {
      // Selection range logic
      return null;
    }
  };
  
  const actions = {
    onNodeClick: (nodeId: string) => {
      setSelectedNodes(new Set([nodeId]));
    },
    onNodeEdit: (nodeId: string) => {
      // Edit logic
      console.log('Edit node:', nodeId);
    },
    onNodeDelete: (nodeId: string) => {
      // Delete logic
      console.log('Delete node:', nodeId);
    }
  };
  
  const value = {
    theme,
    readOnly,
    selection,
    actions
  };
  
  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};
```

### 2. **Performance Optimization**

```typescript
// Component optimized with React.memo
const OptimizedTextRenderer = React.memo<TextNodeProps>(({ data, isSelected, onSelect }) => {
  const { theme } = useEditor();
  
  const handleClick = useCallback(() => {
    onSelect?.(data.sid);
  }, [data.sid, onSelect]);
  
  const style = useMemo(() => ({
    fontWeight: data.attributes.bold ? 'bold' : 'normal',
    fontStyle: data.attributes.italic ? 'italic' : 'normal',
    color: data.attributes.color || 'inherit',
    backgroundColor: isSelected ? '#e3f2fd' : 'transparent'
  }), [data.attributes, isSelected]);
  
  return (
    <span 
      className={`text-node theme-${theme} ${isSelected ? 'selected' : ''}`}
      style={style}
      onClick={handleClick}
    >
      {data.text}
    </span>
  );
});

// Optimize computation with useMemo
const ComplexRenderer: React.FC<ComplexNodeProps> = ({ data }) => {
  const { theme } = useEditor();
  
  const computedStyle = useMemo(() => {
    const baseStyle = {
      padding: '10px',
      margin: '5px',
      border: '1px solid #ddd'
    };
    
    switch (data.attributes.type) {
      case 'warning':
        return { ...baseStyle, borderColor: '#ff9800', backgroundColor: '#fff3e0' };
      case 'error':
        return { ...baseStyle, borderColor: '#f44336', backgroundColor: '#ffebee' };
      case 'success':
        return { ...baseStyle, borderColor: '#4caf50', backgroundColor: '#e8f5e8' };
      default:
        return baseStyle;
    }
  }, [data.attributes.type]);
  
  return (
    <div style={computedStyle}>
      {data.content}
    </div>
  );
};
```

### 3. **Renderer Registration and Management**

```typescript
// React renderer registry
class ReactRendererRegistry {
  private _renderers = new Map<TNodeType, ReactRendererDefinition>();
  
  // Register renderer
  register(renderer: ReactRendererDefinition): void {
    this._renderers.set(renderer.nodeType, renderer);
  }
  
  // Get renderer
  get(nodeType: TNodeType): ReactRendererDefinition | undefined {
    return this._renderers.get(nodeType);
  }
  
  // Get all renderers
  getAll(): ReactRendererDefinition[] {
    return Array.from(this._renderers.values());
  }
}

// React renderer factory
class ReactRendererFactory {
  constructor(private registry: ReactRendererRegistry) {}
  
  // Create renderer
  createRenderer(nodeType: TNodeType, data: any): HTMLElement {
    const renderer = this.registry.get(nodeType);
    if (!renderer) {
      throw new Error(`React renderer for node type '${nodeType}' not found`);
    }
    
    // Render React component to DOM
    const container = document.createElement('div');
    const root = createRoot(container);
    
    const props = renderer.props ? renderer.props(data) : { data };
    root.render(React.createElement(renderer.component, props));
    
    return container.firstChild as HTMLElement;
  }
}
```

## 📊 Usage Examples

### Complete React Renderer Setup

```typescript
// 1. Define renderers
const textRenderer = rendererReact<TextNodeProps>('text', TextRenderer);
const paragraphRenderer = rendererReact<ParagraphNodeProps>('paragraph', ParagraphRenderer);
const imageRenderer = rendererReact<ImageNodeProps>('image', ImageRenderer);
const linkRenderer = rendererReact<LinkNodeProps>('link', LinkRenderer);

// 2. Register renderers
const registry = new ReactRendererRegistry();
registry.register(textRenderer);
registry.register(paragraphRenderer);
registry.register(imageRenderer);
registry.register(linkRenderer);

// 3. Create renderer factory
const factory = new ReactRendererFactory(registry);

// 4. Wrap with editor provider
const App: React.FC = () => {
  return (
    <EditorProvider>
      <div className="editor">
        {/* Editor content */}
      </div>
    </EditorProvider>
  );
};

// 5. Render
const data = {
  id: 'para-1',
  type: 'paragraph',
  attributes: { align: 'center' },
  content: [
    {
      id: 'text-1',
      type: 'text',
      text: 'Hello World',
      attributes: { bold: true }
    }
  ]
};

const element = factory.createRenderer('paragraph', data);
document.body.appendChild(element);
```

## 📚 API Reference

### Core Functions

```typescript
// Create React renderer
function rendererReact<T = any>(
  nodeType: TNodeType, 
  component: React.ComponentType<T>
): ReactRendererDefinition;

// Register renderer
function registerReactRenderer(definition: ReactRendererDefinition): void;

// Context Hook
function useEditor(): EditorContextType;
```

### Type Definitions

```typescript
interface ReactRendererDefinition {
  type: 'react';
  nodeType: TNodeType;
  component: React.ComponentType<any>;
  props?: (data: any) => any;
}

interface BaseNodeProps {
  data: any;
  isSelected?: boolean;
  isFocused?: boolean;
  isHovered?: boolean;
  onSelect?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
}

interface EditorContextType {
  theme: 'light' | 'dark';
  readOnly: boolean;
  selection: {
    isSelected: (nodeId: string) => boolean;
    getSelectionRange: (nodeId: string) => Range | null;
  };
  actions: {
    onNodeClick: (nodeId: string) => void;
    onNodeEdit: (nodeId: string) => void;
    onNodeDelete: (nodeId: string) => void;
  };
}
```

## 🔍 Examples

### Advanced Renderer Using Custom Hooks

```typescript
// Custom hook
const useNodeState = (nodeId: string) => {
  const { selection } = useEditor();
  const [isSelected, setIsSelected] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  useEffect(() => {
    const updateSelection = () => {
      setIsSelected(selection.isSelected(nodeId));
    };
    
    updateSelection();
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, [nodeId, selection]);
  
  return { isSelected, isHovered, setIsHovered };
};

// Advanced text renderer
const AdvancedTextRenderer: React.FC<TextNodeProps> = ({ data, onSelect }) => {
  const { theme, readOnly } = useEditor();
  const { isSelected, isHovered, setIsHovered } = useNodeState(data.sid);
  const { handleClick, handleEdit, handleDelete } = useNodeActions(data.sid);
  
  const style = useMemo(() => ({
    fontWeight: data.attributes.bold ? 'bold' : 'normal',
    fontStyle: data.attributes.italic ? 'italic' : 'normal',
    color: data.attributes.color || 'inherit',
    backgroundColor: isSelected ? '#e3f2fd' : isHovered ? '#f5f5f5' : 'transparent',
    cursor: readOnly ? 'default' : 'pointer'
  }), [data.attributes, isSelected, isHovered, readOnly]);
  
  return (
    <span 
      className={`text-node theme-${theme} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
      style={style}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {data.text}
      {isHovered && !readOnly && (
        <div className="text-actions">
          <button onClick={handleEdit}>Edit</button>
          <button onClick={handleDelete}>Delete</button>
        </div>
      )}
    </span>
  );
};

const advancedTextRenderer = rendererReact<TextNodeProps>('text', AdvancedTextRenderer);
```

This React DSL enables you to create intuitive and performant renderers by leveraging React's powerful features.
