# React DSL 스펙 문서

## 📋 개요

React DSL(Domain Specific Language)은 Zero Editor에서 React 컴포넌트를 사용하여 노드 타입별 렌더러를 정의하기 위한 도메인 특화 언어입니다. JSX 문법과 React Hooks를 활용하여 직관적이고 강력한 렌더러를 작성할 수 있습니다.

## 🎯 설계 목표

### 1. **React 친화적**
- JSX 문법 사용
- React Hooks 지원
- 기존 React 지식 활용

### 2. **타입 안전성**
- TypeScript 완벽 지원
- 컴파일 타임 오류 검출
- 자동 완성 및 리팩토링 지원

### 3. **성능 최적화**
- React.memo, useMemo 등 활용
- 가상 DOM 기반 최적화
- 지연 렌더링 지원

### 4. **확장성**
- Context API 지원
- 커스텀 훅 재사용
- 플러그인 시스템과 통합

## 🏗️ 핵심 개념

### 1. **렌더러 정의**

```typescript
// 기본 문법
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

### 2. **컴포넌트 타입**

```typescript
// 기본 컴포넌트 props
interface BaseNodeProps {
  data: any;
  isSelected?: boolean;
  isFocused?: boolean;
  isHovered?: boolean;
  onSelect?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
}

// 특정 노드 타입 props
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
// 에디터 컨텍스트
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

## 📝 사용 예시

### 1. **기본 렌더러 정의**

```typescript
// 텍스트 렌더러
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

// 문단 렌더러
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

### 2. **커스텀 훅 활용**

```typescript
// 선택 상태 훅
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

// 노드 액션 훅
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

// 스타일 훅
const useNodeStyle = (attributes: any) => {
  const { theme } = useEditor();
  
  return useMemo(() => ({
    fontWeight: attributes.bold ? 'bold' : 'normal',
    fontStyle: attributes.italic ? 'italic' : 'normal',
    color: attributes.color || 'inherit',
    backgroundColor: theme === 'dark' ? '#333' : '#fff'
  }), [attributes.bold, attributes.italic, attributes.color, theme]);
};

// 훅을 사용한 텍스트 렌더러
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

### 3. **복합 렌더러**

```typescript
// 이미지 렌더러
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

// 링크 렌더러
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

### 4. **리스트 렌더러**

```typescript
// 리스트 아이템 렌더러
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

// 리스트 렌더러
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

### 5. **테이블 렌더러**

```typescript
// 테이블 셀 렌더러
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

// 테이블 행 렌더러
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

// 테이블 렌더러
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

## 🔧 고급 기능

### 1. **Context Provider**

```typescript
// 에디터 프로바이더
const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [readOnly, setReadOnly] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  
  const selection = {
    isSelected: (nodeId: string) => selectedNodes.has(nodeId),
    getSelectionRange: (nodeId: string) => {
      // 선택 범위 로직
      return null;
    }
  };
  
  const actions = {
    onNodeClick: (nodeId: string) => {
      setSelectedNodes(new Set([nodeId]));
    },
    onNodeEdit: (nodeId: string) => {
      // 편집 로직
      console.log('Edit node:', nodeId);
    },
    onNodeDelete: (nodeId: string) => {
      // 삭제 로직
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

### 2. **성능 최적화**

```typescript
// React.memo로 최적화된 컴포넌트
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

// useMemo로 계산 최적화
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

### 3. **렌더러 등록 및 관리**

```typescript
// React 렌더러 레지스트리
class ReactRendererRegistry {
  private _renderers = new Map<TNodeType, ReactRendererDefinition>();
  
  // 렌더러 등록
  register(renderer: ReactRendererDefinition): void {
    this._renderers.set(renderer.nodeType, renderer);
  }
  
  // 렌더러 가져오기
  get(nodeType: TNodeType): ReactRendererDefinition | undefined {
    return this._renderers.get(nodeType);
  }
  
  // 모든 렌더러 가져오기
  getAll(): ReactRendererDefinition[] {
    return Array.from(this._renderers.values());
  }
}

// React 렌더러 팩토리
class ReactRendererFactory {
  constructor(private registry: ReactRendererRegistry) {}
  
  // 렌더러 생성
  createRenderer(nodeType: TNodeType, data: any): HTMLElement {
    const renderer = this.registry.get(nodeType);
    if (!renderer) {
      throw new Error(`React renderer for node type '${nodeType}' not found`);
    }
    
    // React 컴포넌트를 DOM으로 렌더링
    const container = document.createElement('div');
    const root = createRoot(container);
    
    const props = renderer.props ? renderer.props(data) : { data };
    root.render(React.createElement(renderer.component, props));
    
    return container.firstChild as HTMLElement;
  }
}
```

## 📊 사용 예시

### 완전한 React 렌더러 설정

```typescript
// 1. 렌더러 정의
const textRenderer = rendererReact<TextNodeProps>('text', TextRenderer);
const paragraphRenderer = rendererReact<ParagraphNodeProps>('paragraph', ParagraphRenderer);
const imageRenderer = rendererReact<ImageNodeProps>('image', ImageRenderer);
const linkRenderer = rendererReact<LinkNodeProps>('link', LinkRenderer);

// 2. 렌더러 등록
const registry = new ReactRendererRegistry();
registry.register(textRenderer);
registry.register(paragraphRenderer);
registry.register(imageRenderer);
registry.register(linkRenderer);

// 3. 렌더러 팩토리 생성
const factory = new ReactRendererFactory(registry);

// 4. 에디터 프로바이더로 감싸기
const App: React.FC = () => {
  return (
    <EditorProvider>
      <div className="editor">
        {/* 에디터 컨텐츠 */}
      </div>
    </EditorProvider>
  );
};

// 5. 렌더링
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

## 📚 API 레퍼런스

### 핵심 함수

```typescript
// React 렌더러 생성
function rendererReact<T = any>(
  nodeType: TNodeType, 
  component: React.ComponentType<T>
): ReactRendererDefinition;

// 렌더러 등록
function registerReactRenderer(definition: ReactRendererDefinition): void;

// Context Hook
function useEditor(): EditorContextType;
```

### 타입 정의

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

## 🔍 예제

### 커스텀 훅을 사용한 고급 렌더러

```typescript
// 커스텀 훅
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

// 고급 텍스트 렌더러
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

이렇게 React DSL을 통해 React의 강력한 기능들을 활용하여 직관적이고 성능이 뛰어난 렌더러를 만들 수 있습니다.
