# Selection System 명세

## 개요

이 문서는 Barocss Editor의 Selection 시스템에 대한 종합적인 명세입니다. Node Selection과 Range Selection의 차이, ComponentManager와의 통신, Selection UI 렌더링, Model ↔ DOM Selection 변환, 그리고 문제 해결 방법을 다룹니다.

---

## 1. Selection 타입 정의

### 1.1 Range Selection (`type: 'range'`)

**용도**: 텍스트 범위 선택 (offset 기반)

**구조**:
```typescript
interface ModelRangeSelection {
  type: 'range';
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed: boolean;        // true면 커서 (startOffset === endOffset)
  direction?: 'forward' | 'backward';
}
```

**사용 케이스**:
- 텍스트 노드 내의 특정 범위 선택
- Cross-node 텍스트 선택 (여러 노드에 걸친 선택)
- Collapsed selection (커서, `startOffset === endOffset`)

**예시**:
```typescript
// 텍스트 범위 선택
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 10,
  collapsed: false
}

// 커서 (collapsed)
{
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 5,
  collapsed: true
}
```

### 1.2 Node Selection (`type: 'node'`)

**용도**: 노드 전체 선택 (offset 없음)

**구조**:
```typescript
interface ModelNodeSelection {
  type: 'node';
  nodeId: string;
}
```

**사용 케이스**:
- **Atom 노드**: `.text` 필드가 없는 노드 (예: `inline-image`, `inline-video`)
- **Block 요소**: `paragraph`, `heading` 등 block 그룹 노드
- **사용자가 노드를 클릭하여 선택한 경우**

**예시**:
```typescript
// Inline-image 선택
{
  type: 'node',
  nodeId: 'image-1'
}

// Paragraph 선택
{
  type: 'node',
  nodeId: 'paragraph-1'
}
```

### 1.3 Multi-Node Selection (`type: 'multi-node'`)

**용도**: 여러 노드를 동시에 선택 (Ctrl/Cmd + 클릭)

**구조**:
```typescript
interface ModelMultiNodeSelection {
  type: 'multi-node';
  nodeIds: string[];  // 선택된 노드 ID 배열
  primaryNodeId?: string;  // 주요 선택 노드 (마지막으로 선택된 노드)
}
```

**사용 케이스**:
- **여러 이미지 선택**: Ctrl/Cmd + 클릭으로 여러 이미지 동시 선택
- **여러 Block 선택**: 여러 paragraph나 heading 동시 선택
- **혼합 선택**: 이미지와 block 요소를 함께 선택

**예시**:
```typescript
// 여러 이미지 선택
{
  type: 'multi-node',
  nodeIds: ['image-1', 'image-2', 'image-3'],
  primaryNodeId: 'image-3'  // 마지막으로 선택된 노드
}

// 여러 Block 선택
{
  type: 'multi-node',
  nodeIds: ['paragraph-1', 'paragraph-2', 'heading-1'],
  primaryNodeId: 'heading-1'
}

// 혼합 선택
{
  type: 'multi-node',
  nodeIds: ['image-1', 'paragraph-1', 'image-2'],
  primaryNodeId: 'image-2'
}
```

**선택 방법**:
- **Ctrl/Cmd + 클릭**: 노드를 선택 목록에 추가/제거
- **Shift + 클릭**: 범위 선택 (첫 번째 노드부터 마지막 노드까지)
- **드래그**: 여러 노드를 드래그로 선택

### 1.4 Selection 타입 판단 규칙

#### 규칙 1: 텍스트 노드 → Range Selection
- 노드에 `.text` 필드가 있고 `typeof node.text === 'string'`인 경우
- 항상 `type: 'range'` 사용

#### 규칙 2: Atom 노드 → Node Selection
- 노드에 `.text` 필드가 없는 경우 (예: `inline-image`, `inline-video`)
- 항상 `type: 'node'` 사용

#### 규칙 3: Block 요소 → Node Selection (선택적)
- Block 그룹 노드 (예: `paragraph`, `heading`)
- 사용자가 block을 클릭하여 선택한 경우: `type: 'node'`
- Block 내부 텍스트를 선택한 경우: `type: 'range'`

### 1.5 Node Selection ↔ Range Selection 변환

#### Node Selection → Range Selection 변환

**변환이 가능한 경우**:
- 텍스트 노드인 경우: Node Selection을 해당 노드의 전체 텍스트 범위로 변환
- Block 요소인 경우: Block 내부의 첫 번째 텍스트 노드부터 마지막 텍스트 노드까지 변환

**변환 방법**:
```typescript
function convertNodeToRange(
  nodeSelection: ModelNodeSelection,
  dataStore: DataStore
): ModelRangeSelection | null {
  const node = dataStore.getNode(nodeSelection.nodeId);
  if (!node) return null;
  
  // 텍스트 노드인 경우
  if (typeof node.text === 'string') {
    return {
      type: 'range',
      startNodeId: nodeSelection.nodeId,
      startOffset: 0,
      endNodeId: nodeSelection.nodeId,
      endOffset: node.text.length,
      collapsed: false
    };
  }
  
  // Block 요소인 경우: 내부 텍스트 노드 찾기
  if (node.content && Array.isArray(node.content)) {
    // 첫 번째와 마지막 텍스트 노드 찾기
    const textNodes: string[] = [];
    
    // 재귀적으로 텍스트 노드 찾기
    const findTextNodes = (nodeId: string) => {
      const n = dataStore.getNode(nodeId);
      if (!n) return;
      
      if (typeof n.text === 'string') {
        textNodes.push(nodeId);
      } else if (n.content && Array.isArray(n.content)) {
        n.content.forEach(childId => findTextNodes(childId));
      }
    };
    
    findTextNodes(nodeSelection.nodeId);
    
    if (textNodes.length === 0) return null;
    
    const firstNode = dataStore.getNode(textNodes[0]);
    const lastNode = dataStore.getNode(textNodes[textNodes.length - 1]);
    
    if (!firstNode || !lastNode) return null;
    
    return {
      type: 'range',
      startNodeId: textNodes[0],
      startOffset: 0,
      endNodeId: textNodes[textNodes.length - 1],
      endOffset: typeof lastNode.text === 'string' ? lastNode.text.length : 0,
      collapsed: false
    };
  }
  
  // Atom 노드 (예: inline-image)는 변환 불가
  return null;
}
```

**사용 예시**:
```typescript
// Node Selection을 Range Selection으로 변환
const nodeSelection: ModelNodeSelection = {
  type: 'node',
  nodeId: 'paragraph-1'
};

const rangeSelection = convertNodeToRange(nodeSelection, editor.dataStore);
if (rangeSelection) {
  // Range Selection으로 작업 수행
  editor.selectionManager.setSelection(rangeSelection);
}
```

#### Range Selection → Node Selection 변환

**변환이 가능한 경우**:
- Range Selection의 `startNodeId`와 `endNodeId`가 같은 atom 노드인 경우
- Range Selection이 노드 전체를 선택하는 경우 (startOffset: 0, endOffset: 노드 텍스트 길이)

**변환 방법**:
```typescript
function convertRangeToNode(
  rangeSelection: ModelRangeSelection,
  dataStore: DataStore
): ModelNodeSelection | null {
  // 같은 노드인 경우
  if (rangeSelection.startNodeId === rangeSelection.endNodeId) {
    const node = dataStore.getNode(rangeSelection.startNodeId);
    if (!node) return null;
    
    // Atom 노드인 경우 (텍스트 필드 없음)
    if (typeof node.text !== 'string') {
      return {
        type: 'node',
        nodeId: rangeSelection.startNodeId
      };
    }
    
    // 텍스트 노드 전체를 선택하는 경우
    const textLength = node.text ? node.text.length : 0;
    if (rangeSelection.startOffset === 0 && 
        rangeSelection.endOffset === textLength) {
      // 텍스트 노드는 Node Selection으로 변환하지 않음 (Range 유지)
      // 단, Block 요소인 경우는 변환 가능
      const parent = findBlockParent(node, dataStore);
      if (parent) {
        return {
          type: 'node',
          nodeId: parent.sid
        };
      }
    }
  }
  
  return null;
}

// Block 부모 찾기
function findBlockParent(node: INode, dataStore: DataStore): INode | null {
  // 노드의 부모를 찾아서 block 그룹인지 확인
  // (구현 생략)
  return null;
}
```

**사용 예시**:
```typescript
// Range Selection을 Node Selection으로 변환
const rangeSelection: ModelRangeSelection = {
  type: 'range',
  startNodeId: 'image-1',
  startOffset: 0,
  endNodeId: 'image-1',
  endOffset: 0,
  collapsed: true
};

const nodeSelection = convertRangeToNode(rangeSelection, editor.dataStore);
if (nodeSelection) {
  // Node Selection으로 작업 수행
  editor.selectionManager.setSelection(nodeSelection);
}
```

#### 변환이 필요한 시나리오

**1. 텍스트 편집 작업을 위해 Node → Range 변환**
```
사용자가 paragraph를 클릭하여 Node Selection
    ↓
텍스트 편집을 위해 Range Selection으로 변환
    ↓
텍스트 입력/수정 작업 수행
```

**2. 노드 삭제를 위해 Range → Node 변환**
```
사용자가 inline-image 앞에 커서 (Range Selection)
    ↓
Backspace 입력 시 Range → Node 변환
    ↓
이미지 노드 삭제
```

**3. Block 전체 선택을 위해 Range → Node 변환**
```
사용자가 paragraph 내부 텍스트 전체 선택 (Range Selection)
    ↓
Block 전체 선택으로 변환 (Node Selection)
    ↓
Block 단위 작업 수행 (삭제, 이동 등)
```

#### 변환 시 주의사항

1. **Atom 노드는 Range로 변환 불가**
   - `inline-image`, `inline-video` 등은 텍스트 필드가 없어 Range Selection으로 변환할 수 없음
   - Node Selection만 유지

2. **텍스트 노드는 Node로 변환하지 않음**
   - 텍스트 노드는 항상 Range Selection 사용
   - Block 요소만 Node Selection으로 변환 가능

3. **변환 실패 시 원본 Selection 유지**
   - 변환이 불가능한 경우 `null` 반환
   - 원본 Selection을 그대로 유지

4. **Selection 변경 이벤트 발생**
   - 변환 후 `editor:selection.model` 이벤트 발생
   - UI가 자동으로 업데이트됨

---

## 2. ComponentManager 통신

### 2.1 ComponentManager 생성 위치

**ComponentManager는 `DOMRenderer`에서 생성됩니다:**

```
DOMRenderer (packages/renderer-dom/src/dom-renderer.ts)
  └── constructor()
      └── componentManager = new ComponentManager()
      └── this.componentManager = componentManager
```

**생성 흐름:**
```typescript
// packages/renderer-dom/src/dom-renderer.ts
export class DOMRenderer {
  private componentManager: ComponentManager;
  
  constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
    // ComponentManager 생성
    const componentManager = new ComponentManager();
    this.componentManager = componentManager;
    
    // VNodeBuilder와 Reconciler에 전달
    this.builder = new VNodeBuilder(registry, {
      componentStateProvider: componentManager,
      componentManager: componentManager,
      // ...
    });
    this.reconciler = new Reconciler(/* ... */, this.componentManager, /* ... */);
  }
  
  // ComponentManager 접근 메서드
  getComponentManager(): ComponentManager {
    return this.componentManager;
  }
}
```

**EditorViewDOM에서 ComponentManager 접근:**

```
EditorViewDOM (packages/editor-view-dom/src/editor-view-dom.ts)
  └── private _domRenderer?: DOMRenderer
      └── _domRenderer.getComponentManager()
          └── ComponentManager
```

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
export class EditorViewDOM {
  private _domRenderer?: DOMRenderer;  // Content 레이어용 DOMRenderer
  
  // ComponentManager 접근
  private getComponentManager(): ComponentManager | undefined {
    return this._domRenderer?.getComponentManager();
  }
}
```

**중요:**
- ComponentManager는 `renderer-dom` 패키지의 `DOMRenderer`에서 생성됩니다
- `EditorViewDOM`은 `DOMRenderer`를 통해 ComponentManager에 접근합니다
- 각 `DOMRenderer` 인스턴스마다 독립적인 `ComponentManager`가 있습니다
- Content 레이어의 `_domRenderer`가 메인 ComponentManager입니다

### 2.1.1 ComponentManager 접근 방식

**구조:**
```
EditorViewDOM
  └── _domRenderer?: DOMRenderer
      └── getComponentManager() → ComponentManager
```

**접근 방식:**
- ComponentManager는 DOMRenderer의 일부이므로 DOMRenderer를 통해 접근
- EditorViewDOM은 편의 메서드를 통해 ComponentManager에 접근

**구현:**
```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
export class EditorViewDOM {
  private _domRenderer?: DOMRenderer;  // Content 레이어용 DOMRenderer
  
  /**
   * ComponentManager 접근 편의 메서드
   * Content 레이어의 DOMRenderer에서 ComponentManager를 가져옵니다.
   */
  private getComponentManager(): ComponentManager | undefined {
    return this._domRenderer?.getComponentManager();
  }
  
  // 사용 예시
  private handleSelectionChange(selection: ModelSelection): void {
    const componentManager = this.getComponentManager();
    if (!componentManager) {
      console.warn('[EditorViewDOM] ComponentManager not available');
      return;
    }
    
    // ComponentManager 이벤트 emit
    componentManager.emit('select', sid, data);
  }
}
```

**이 접근 방식의 장점:**
1. **책임 분리**: ComponentManager는 DOMRenderer의 일부로, 렌더링과 밀접한 관련이 있음
2. **레이어 독립성**: 각 레이어(DOMRenderer)마다 독립적인 ComponentManager 유지
3. **캡슐화**: DOMRenderer 내부 구조를 외부에 노출하지 않음
4. **일관성**: 다른 DOMRenderer 기능들도 동일한 패턴으로 접근
5. **유지보수성**: DOMRenderer 내부 구조 변경 시 EditorViewDOM 수정 최소화

### 2.2 Selection 변경 이벤트 흐름

```
Selection 변경 발생
    ↓
editor:selection.model 이벤트 발생 (EditorCore)
    ↓
EditorViewDOM에서 이벤트 수신
    ↓
getComponentManager() 편의 메서드로 ComponentManager 접근
    ↓
Selection 타입 판단 (Node vs Range)
    ↓
ComponentManager에 select/deselect 이벤트 emit
    ↓
컴포넌트가 이벤트 수신하여 UI 업데이트
```

### 2.3 구현 위치 및 코드

**위치**: `packages/editor-view-dom/src/editor-view-dom.ts`

**구현 예시:**

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
export class EditorViewDOM {
  private _domRenderer?: DOMRenderer;
  private _lastSelectedNodes: string[] = [];  // 이전에 선택된 노드 추적
  
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // ... 초기화 ...
    
    // Selection 변경 이벤트 리스너 등록
    this.setupSelectionEventListeners();
  }
  
  private setupSelectionEventListeners(): void {
    // editor:selection.model 이벤트 수신
    this.editor.on('editor:selection.model', (selection: ModelSelection) => {
      this.handleSelectionChange(selection);
    });
  }
  
  private handleSelectionChange(selection: ModelSelection): void {
    // ComponentManager 접근 (편의 메서드 사용)
    const componentManager = this.getComponentManager();
    if (!componentManager) {
      console.warn('[EditorViewDOM] ComponentManager not available');
      return;
    }
    
    // 1. 이전에 선택된 노드들 deselect
    if (this._lastSelectedNodes.length > 0) {
      this._lastSelectedNodes.forEach(sid => {
        componentManager.emit('deselect', sid, {
          selection: null,
          nodeId: sid
        });
      });
    }
    
    // 2. 새로운 selection에서 선택된 노드 추출
    const selectedNodes: string[] = [];
    
    if (selection.type === 'node') {
      // Node selection: nodeId 직접 사용
      selectedNodes.push(selection.nodeId);
    } else if (selection.type === 'range') {
      // Range selection: atom 노드인지 확인
      const startNode = this.editor.dataStore.getNode(selection.startNodeId);
      const endNode = this.editor.dataStore.getNode(selection.endNodeId);
      
      // Atom 노드 (예: inline-image)인 경우 node selection으로 처리
      if (startNode && typeof startNode.text !== 'string') {
        selectedNodes.push(selection.startNodeId);
      } else if (endNode && typeof endNode.text !== 'string') {
        selectedNodes.push(selection.endNodeId);
      }
      // 텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음
      // (또는 필요시 텍스트 노드도 선택 상태로 표시 가능)
    } else if (selection.type === 'multi-node') {
      // Multi-node selection: 모든 노드에 select 이벤트 emit
      selectedNodes.push(...selection.nodeIds);
    }
    
    // 3. 선택된 노드들에 select 이벤트 emit
    this._lastSelectedNodes = selectedNodes;
    selectedNodes.forEach(sid => {
      componentManager.emit('select', sid, {
        selection,
        nodeId: sid
      });
    });
  }
}
```

**구현 시 주의사항:**

1. **ComponentManager 접근 타이밍**
   - `_domRenderer`가 초기화되기 전에는 ComponentManager에 접근할 수 없음
   - `render()` 호출 전에는 `_domRenderer`가 `undefined`일 수 있음
   - 따라서 `getComponentManager()` 호출 시 null 체크 필요

2. **이전 선택 상태 추적**
   - `_lastSelectedNodes` 배열로 이전에 선택된 노드들을 추적
   - Selection 변경 시 이전 노드들에 `deselect` 이벤트 emit
   - 새로운 노드들에 `select` 이벤트 emit

3. **Selection 타입별 처리**
   - `node`: `nodeId` 직접 사용
   - `range`: atom 노드인지 확인 후 처리 (텍스트 노드는 제외)
   - `multi-node`: 모든 `nodeIds`에 이벤트 emit

### 2.4 ComponentManager 이벤트 API

**ComponentManager 이벤트 시스템**:
```typescript
// ComponentManager (packages/renderer-dom/src/component-manager.ts)
class ComponentManager {
  // 이벤트 리스너 등록
  on(event: string, handler: (sid: string, data: any) => void): void;
  
  // 이벤트 리스너 제거
  off(event: string, handler?: (sid: string, data: any) => void): void;
  
  // 이벤트 emit
  emit(event: string, sid: string, data: any): void;
}
```

**이벤트 타입**:
- `'select'`: 노드가 선택됨
  - `sid`: 선택된 노드의 sid
  - `data`: `{ selection: ModelSelection, nodeId: string }`
- `'deselect'`: 노드 선택이 해제됨
  - `sid`: 선택 해제된 노드의 sid
  - `data`: `{ selection: null, nodeId: string }`

### 2.5 컴포넌트에서 이벤트 수신

**컴포넌트 예시**:
```typescript
// 컴포넌트 마운트 시
componentManager.on('select', (sid, data) => {
  if (sid === this.nodeId) {
    // 선택됨 상태로 UI 업데이트
    this.setState({ isSelected: true });
    
    // 선택 UI 표시 (예: 테두리, resize 핸들러 등)
    this.updateSelectionUI(true);
  }
});

componentManager.on('deselect', (sid, data) => {
  if (sid === this.nodeId) {
    // 선택 해제 상태로 UI 업데이트
    this.setState({ isSelected: false });
    
    // 선택 UI 제거
    this.updateSelectionUI(false);
  }
});
```

---

## 3. Selection UI 렌더링

### 3.1 Range Selection UI

**렌더링 방식**: 브라우저 기본 Selection 사용

```
텍스트: "Hello World"
        ↑---선택---↑
```

**특징**:
- 브라우저의 기본 텍스트 선택 하이라이트 사용
- `window.getSelection()`으로 DOM Selection 관리
- CSS `::selection` 스타일로 커스터마이징 가능

**구현**:
- `convertModelSelectionToDOM()`: Model Selection → DOM Selection 변환
- 브라우저가 자동으로 하이라이트 렌더링

### 3.2 Node Selection UI

**렌더링 방식**: 컴포넌트가 직접 선택 UI 렌더링

**예시: Inline-image 선택 UI**
```
┌─────────────────────┐
│  [이미지]           │ ← 선택된 상태
│  ┌───────────────┐  │
│  │  테두리       │  │ ← 선택 UI (테두리)
│  │  ┌─────────┐ │  │
│  │  │  이미지 │ │  │
│  │  └─────────┘ │  │
│  │  [resize 핸들러]│ ← 선택 UI (resize 핸들러)
│  └───────────────┘  │
└─────────────────────┘
```

**구현**:
```typescript
// 컴포넌트에서 선택 UI 렌더링
updateSelectionUI(isSelected: boolean): void {
  const element = this.domElement; // 컴포넌트의 DOM 요소
  
  if (isSelected) {
    // 선택 UI 추가
    element.classList.add('selected');
    element.style.border = '2px solid #0066ff';
    element.style.outline = 'none';
    
    // Resize 핸들러 추가 (예: inline-image)
    if (this.nodeType === 'inline-image') {
      this.addResizeHandlers(element);
    }
  } else {
    // 선택 UI 제거
    element.classList.remove('selected');
    element.style.border = '';
    element.style.outline = '';
    
    // Resize 핸들러 제거
    this.removeResizeHandlers(element);
  }
}
```

**CSS 예시**:
```css
/* Node Selection 스타일 */
[data-bc-sid].selected {
  border: 2px solid #0066ff !important;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.2);
}

/* Inline-image 선택 시 */
[data-bc-sid="image-1"].selected {
  position: relative;
}

[data-bc-sid="image-1"].selected::after {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border: 2px solid #0066ff;
  pointer-events: none;
}
```

### 3.3 Block Selection UI

**렌더링 방식**: Block 요소 전체에 선택 UI 표시

**예시: Paragraph 선택 UI**
```
┌─────────────────────────────┐
│ paragraph-1 (선택됨)        │ ← 선택된 상태
│ ┌─────────────────────────┐ │
│ │ [선택 테두리]            │ │ ← 선택 UI (테두리)
│ │                         │ │
│ │ text-1: "Hello World"   │ │
│ │                         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**구현**:
```typescript
// Block 요소 선택 UI
updateBlockSelectionUI(isSelected: boolean): void {
  const blockElement = this.domElement;
  
  if (isSelected) {
    blockElement.classList.add('block-selected');
    blockElement.style.borderLeft = '3px solid #0066ff';
    blockElement.style.backgroundColor = 'rgba(0, 102, 255, 0.05)';
  } else {
    blockElement.classList.remove('block-selected');
    blockElement.style.borderLeft = '';
    blockElement.style.backgroundColor = '';
  }
}
```

---

## 4. Model ↔ DOM Selection 변환

### 4.1 텍스트 관리 아키텍처

#### Model 레벨 텍스트 표현

**단일 연속 문자열 (Flat Text Model)**

Model에서는 텍스트를 하나의 연속된 문자열로 관리합니다:

```
Model Text: "bold and italic"
            └─ offset: 0 ──────────────── 15 ─┘
```

**특징:**
- 단일 노드에 하나의 텍스트 문자열
- Offset은 0부터 시작하는 연속된 정수
- Mark는 텍스트 범위 `[start, end)`로 표현

#### DOM 레벨 텍스트 표현

**분할된 텍스트 노드 (Fragmented Text DOM)**

DOM에서는 mark/decorator로 인해 텍스트가 여러 개의 text node로 분할됩니다:

```
DOM Structure:
<span data-bc-sid="text-1">
  <b>bold</b>           ← Text Node 1: "bold" (DOM offset 0-4)
  <span> and </span>    ← Text Node 2: " and " (DOM offset 0-5)
  <i>italic</i>         ← Text Node 3: "italic" (DOM offset 0-6)
</span>
```

**특징:**
- 각 text node는 독립적인 offset 공간을 가짐
- Mark wrapper로 인해 구조가 중첩됨
- Decorator는 시각적 표현만 담당 (selection 계산에서 제외)

#### 매핑 문제

**문제:**
- Model offset `10`은 어느 DOM text node의 어느 offset인가?
- DOM text node의 offset `3`은 Model offset 몇인가?

**해결:**
- Text Run Index를 사용하여 양방향 매핑
- 각 text node의 Model offset 범위를 기록

### 4.2 Text Run Index 알고리즘

#### 데이터 구조

```typescript
interface TextRun {
  domTextNode: Text;        // 실제 DOM text node 참조
  start: number;            // Model offset 시작 (inclusive)
  end: number;              // Model offset 끝 (exclusive)
}

interface ContainerRuns {
  runs: TextRun[];          // 텍스트 노드 순서대로 정렬된 배열
  total: number;            // 전체 텍스트 길이 (마지막 run의 end)
  byNode?: Map<Text, { start: number; end: number }>;  // 역방향 조회 맵 (선택적)
}
```

#### Text Run Index 생성 알고리즘

**입력:**
- `container`: `data-bc-sid` 속성을 가진 컨테이너 요소
- `excludePredicate`: 제외할 요소 판단 함수 (decorator 등)

**알고리즘:**

```
1. runs = []
2. total = 0
3. 
4. FOR EACH child IN container.childNodes:
5.   IF child IS Text Node:
6.     text = child.textContent
7.     length = text.length
8.     runs.append({
9.       domTextNode: child,
10.      start: total,
11.      end: total + length
12.    })
13.    total = total + length
14.    
15.  ELSE IF child IS Element:
16.    IF excludePredicate(child) IS TRUE:
17.      CONTINUE  // decorator 등 제외
18.    
19.    // TreeWalker로 내부의 모든 text node 수집
20.    walker = createTreeWalker(child, SHOW_TEXT, {
21.      acceptNode: (node) => {
22.        IF node의 부모 중 decorator가 있으면:
23.          RETURN REJECT
24.        RETURN ACCEPT
25.      }
26.    })
27.    
28.    WHILE textNode = walker.nextNode():
29.      text = textNode.textContent
30.      length = text.length
31.      runs.append({
32.        domTextNode: textNode,
33.        start: total,
34.        end: total + length
35.      })
36.      total = total + length
37.
38. RETURN { runs, total, byNode }
```

**시간 복잡도:** O(n) where n = text node 개수

**공간 복잡도:** O(n)

#### Model Offset → DOM Offset 변환

**알고리즘:**

```
1. IF modelOffset < 0 OR modelOffset > runs.total:
2.   RETURN null  // 범위 밖
3.
4. IF modelOffset == runs.total:
5.   lastRun = runs[runs.length - 1]
6.   RETURN {
7.     node: lastRun.domTextNode,
8.     offset: lastRun.domTextNode.textContent.length
9.   }
10.
11. // Binary Search로 적절한 run 찾기
12. runIndex = binarySearchRun(runs, modelOffset)
13. IF runIndex == -1:
14.   RETURN null
15.
16. run = runs[runIndex]
17. localOffset = modelOffset - run.start
18.
19. RETURN {
20.   node: run.domTextNode,
21.   offset: min(localOffset, run.domTextNode.textContent.length)
22. }
```

**시간 복잡도:** O(log n)

#### DOM Offset → Model Offset 변환

**알고리즘:**

```
1. // 역방향 맵 사용 (O(1))
2. IF runs.byNode EXISTS:
3.   runInfo = runs.byNode.get(textNode)
4.   IF runInfo EXISTS:
5.     RETURN runInfo.start + min(domOffset, runInfo.end - runInfo.start)
6.
7. // 역방향 맵이 없으면 선형 탐색 (O(n))
8. FOR EACH run IN runs:
9.   IF run.domTextNode == textNode:
10.    localOffset = min(domOffset, run.end - run.start)
11.    RETURN run.start + localOffset
12.
13. RETURN 0  // 찾지 못함
```

**시간 복잡도:** O(1) (역방향 맵 사용) 또는 O(n) (선형 탐색)

### 4.3 Model Selection → DOM Selection 변환

**입력:**
- `modelSelection`: `{ startNodeId, startOffset, endNodeId, endOffset, type: 'range' }`

**알고리즘:**

```
1. // 1. 컨테이너 요소 찾기
2. startContainer = findElementBySid(modelSelection.startNodeId)
3. endContainer = findElementBySid(modelSelection.endNodeId)
4. 
5. IF startContainer == null OR endContainer == null:
6.   RETURN FAILURE
7.
8. // 2. 텍스트 컨테이너 찾기 (상위로 올라가며 탐색)
9. startTextContainer = findBestContainer(startContainer)
10. endTextContainer = findBestContainer(endContainer)
11.
12. IF startTextContainer == null OR endTextContainer == null:
13.   RETURN FAILURE
14.
15. // 3. Text Run Index 생성
16. startRuns = buildTextRunIndex(startTextContainer)
17. endRuns = buildTextRunIndex(endTextContainer)
18.
19. // 4. Model offset → DOM offset 변환
20. startDOMRange = findDOMRangeFromModelOffset(startRuns, modelSelection.startOffset)
21. endDOMRange = findDOMRangeFromModelOffset(endRuns, modelSelection.endOffset)
22.
23. IF startDOMRange == null OR endDOMRange == null:
24.   RETURN FAILURE
25.
26. // 5. DOM Selection 설정
27. selection = window.getSelection()
28. selection.removeAllRanges()
29. 
30. range = document.createRange()
31. range.setStart(startDOMRange.node, startDOMRange.offset)
32. range.setEnd(endDOMRange.node, endDOMRange.offset)
33. 
34. selection.addRange(range)
35. RETURN SUCCESS
```

### 4.4 DOM Selection → Model Selection 변환

**입력:**
- `domSelection`: 브라우저 Selection 객체

**알고리즘:**

```
1. range = domSelection.getRangeAt(0)
2. 
3. // 1. 컨테이너 요소 찾기
4. startContainer = findBestContainer(range.startContainer)
5. endContainer = findBestContainer(range.endContainer)
6. 
7. IF startContainer == null OR endContainer == null:
8.   RETURN { type: 'none' }
9.
10. startNodeId = startContainer.getAttribute('data-bc-sid')
11. endNodeId = endContainer.getAttribute('data-bc-sid')
12.
13. IF startNodeId == null OR endNodeId == null:
14.   RETURN { type: 'none' }
15.
16. // 2. Text Run Index 생성
17. startRuns = buildTextRunIndex(startContainer)
18. endRuns = (startContainer == endContainer) ? startRuns : buildTextRunIndex(endContainer)
19.
20. // 3. DOM offset → Model offset 변환
21. startModelOffset = convertDOMOffsetToModelOffset(
22.   startContainer, 
23.   range.startContainer, 
24.   range.startOffset, 
25.   startRuns
26. )
27. endModelOffset = convertDOMOffsetToModelOffset(
28.   endContainer,
29.   range.endContainer,
30.   range.endOffset,
31.   endRuns
32. )
33.
34. // 4. Selection 방향 결정
35. direction = determineSelectionDirection(domSelection, startContainer, endContainer, startModelOffset, endModelOffset)
36.
37. // 5. 통일된 ModelSelection 형식으로 정규화
38. modelSelection = normalizeSelection(startNodeId, startModelOffset, endNodeId, endModelOffset)
39.
40. RETURN {
41.   type: 'range',
42.   ...modelSelection,
43.   direction
44. }
```

### 4.5 Selection 동기화 타이밍

#### Model → DOM 동기화 타이밍

**문제:**
- 렌더링이 완료되기 전에 selection을 적용하면 DOM이 아직 업데이트되지 않음
- Text Run Index가 오래된 DOM을 기반으로 생성될 수 있음

**해결:**

```
1. Model 변경 발생
   ↓
2. Transaction 실행
   ↓
3. selectionAfter 계산
   ↓
4. editor.updateSelection(selectionAfter)
   ↓
5. _pendingModelSelection에 저장
   ↓
6. render() 호출
   ↓
7. reconcile() 실행 (DOM 업데이트)
   ↓
8. reconcile 완료 콜백 호출
   ↓
9. applyModelSelectionWithRetry() 실행
   ↓
10. Text Run Index 생성 (최신 DOM 기반)
    ↓
11. DOM Selection 적용
```

#### DOM → Model 동기화 타이밍

**문제:**
- 사용자가 DOM에서 selection을 변경할 때 즉시 Model로 반영해야 함
- 하지만 DOM 변경이 진행 중일 때는 변환을 지연해야 할 수 있음

**해결:**

```
1. selectionchange 이벤트 발생
   ↓
2. handleSelectionChange() 호출
   ↓
3. convertDOMSelectionToModel(selection)
   ↓
4. editor.updateSelection(modelSelection)
   ↓
5. editor:selection.model 이벤트 발생
```

### 4.6 텍스트 노드 분할 규칙

#### Mark로 인한 분할

**규칙:**
- 각 mark는 독립적인 wrapper 요소를 생성
- Mark가 겹치면 중첩된 구조 생성
- 각 wrapper 내부의 text node는 독립적으로 관리

**예시:**

```
Model: "bold and italic" (marks: bold[0-14], italic[0-14])

DOM:
<span data-bc-sid="text-1">
  <b>
    <i>bold and italic</i>  ← 하나의 text node
  </b>
</span>
```

**중첩된 경우:**

```
Model: "bold and italic" (marks: bold[0-9], italic[9-14])

DOM:
<span data-bc-sid="text-1">
  <b>bold</b>              ← text node 1
  <i>italic</i>            ← text node 2
</span>
```

#### Decorator로 인한 분할

**규칙:**
- Decorator는 시각적 표현만 담당
- Selection 계산에서 제외됨
- Decorator 하위의 text node는 수집하지 않음

**예시:**

```
<span data-bc-sid="text-1">
  <span data-decorator-sid="dec-1">decorator</span>  ← 제외
  <b>bold</b>                                         ← 포함
</span>
```

#### Text Run Index 생성 시 고려사항

**포함:**
- `data-bc-sid` 직접 자식인 text node
- Mark wrapper 내부의 text node
- 중첩된 mark 구조의 모든 text node

**제외:**
- Decorator 하위의 text node
- `data-bc-decorator` 속성을 가진 요소 하위
- `data-decorator-sid` 속성을 가진 요소 하위

---

## 5. Selection 변경 시나리오

### 5.1 Range → Node Selection 변경

**시나리오**: Backspace로 텍스트가 삭제되고 inline-image가 선택된 상태가 됨

```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 커서 (text-2 offset 0)

After Backspace:
[text-1: "Hello"] [image-1]
                   ↑ image-1이 선택된 상태

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-2', startOffset: 0, ... }
- After: { type: 'node', nodeId: 'image-1' }

ComponentManager 이벤트:
1. deselect('text-2', { ... })
2. select('image-1', { selection: { type: 'node', nodeId: 'image-1' } })

UI 변경:
1. 텍스트 선택 하이라이트 제거
2. image-1에 선택 테두리 표시
```

### 5.2 Node → Range Selection 변경

**시나리오**: 이미지가 선택된 상태에서 텍스트를 클릭

```
Before:
[text-1: "Hello"] [image-1 (선택됨)] [text-2: "World"]
                                              ↑ 클릭

After:
[text-1: "Hello"] [image-1] [text-2: "World"]
                                              ↑ 커서

Selection 변경:
- Before: { type: 'node', nodeId: 'image-1' }
- After: { type: 'range', startNodeId: 'text-2', startOffset: 0, collapsed: true }

ComponentManager 이벤트:
1. deselect('image-1', { ... })

UI 변경:
1. image-1 선택 테두리 제거
2. text-2에 커서 표시
```

### 5.3 Range → Range Selection 변경

**시나리오**: 텍스트 범위 선택 변경

```
Before:
텍스트: "Hello World"
        ↑---선택---↑

After:
텍스트: "Hello World"
            ↑---선택---↑

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 0, endOffset: 5, ... }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 2, endOffset: 7, ... }

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)

UI 변경:
1. 브라우저가 자동으로 선택 하이라이트 업데이트
```

### 5.4 Node ↔ Range Selection 변환 시나리오

#### 시나리오 1: Node → Range 변환 (텍스트 편집)

**상황**: 사용자가 paragraph를 클릭하여 Node Selection, 이후 텍스트 편집 시작

```
Before:
[paragraph-1 (선택됨)]
  └─ text-1: "Hello World"

사용자 입력 시작:
[paragraph-1]
  └─ text-1: "Hello World"
              ↑ 커서 (Range Selection)

Selection 변환:
- Before: { type: 'node', nodeId: 'paragraph-1' }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 0, collapsed: true }

변환 이유:
- 텍스트 입력은 Range Selection이 필요
- Node Selection에서는 텍스트 편집 불가
```

#### 시나리오 2: Range → Node 변환 (Atom 노드 선택)

**상황**: 사용자가 inline-image 앞에 커서, Backspace 입력

```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 커서 (text-2 offset 0, Range Selection)

Backspace 입력:
[text-1: "Hello"] [image-1]
                   ↑ image-1 선택 (Node Selection)

Selection 변환:
- Before: { type: 'range', startNodeId: 'text-2', startOffset: 0, ... }
- After: { type: 'node', nodeId: 'image-1' }

변환 이유:
- Atom 노드는 텍스트 필드가 없어 Range Selection 불가
- Node Selection으로 변환하여 노드 삭제 가능
```

#### 시나리오 3: Range → Node 변환 (Block 전체 선택)

**상황**: 사용자가 paragraph 내부 텍스트 전체 선택 후 Block 삭제

```
Before:
[paragraph-1]
  └─ text-1: "Hello World"
      ↑---전체 선택---↑ (Range Selection)

사용자 작업: Block 삭제
[paragraph-1 (선택됨)] (Node Selection)

Selection 변환:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 0, endOffset: 11, ... }
- After: { type: 'node', nodeId: 'paragraph-1' }

변환 이유:
- Block 단위 작업 (삭제, 이동)은 Node Selection이 적합
- Range Selection은 텍스트 편집용
```

#### 시나리오 4: 변환 실패 (Atom 노드 → Range)

**상황**: 사용자가 inline-image를 선택한 상태에서 텍스트 편집 시도

```
Before:
[image-1 (선택됨)] (Node Selection)

사용자 입력 시도:
→ 변환 실패 (Atom 노드는 Range로 변환 불가)
→ 원본 Node Selection 유지
→ 입력 무시 또는 경고 표시

변환 실패 이유:
- Atom 노드 (inline-image)는 텍스트 필드가 없음
- Range Selection으로 변환 불가
- Node Selection만 유지 가능
```

### 5.5 사용자 액션별 Selection 변경 시나리오

#### 시나리오 1: 텍스트 입력

**상황**: 사용자가 텍스트를 입력

```
Before:
[text-1: "Hello"]
           ↑ 커서 (offset 5)

사용자 입력: " World"

After:
[text-1: "Hello World"]
                    ↑ 커서 (offset 11)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 11, endOffset: 11, collapsed: true }

처리 흐름:
1. MutationObserver가 DOM 변경 감지
2. InputHandler가 트랜잭션 실행 (insertText)
3. Transaction 완료 후 selectionAfter 계산
4. editor.updateSelection(selectionAfter)
5. editor:selection.model 이벤트 발생
6. EditorViewDOM에서 DOM Selection 업데이트

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 2: Delete 키 입력

**상황**: 사용자가 Delete 키를 눌러 텍스트 삭제

```
Before:
[text-1: "Hello World"]
           ↑ 커서 (offset 5)

Delete 키 입력

After:
[text-1: "Hello orld"]
           ↑ 커서 (offset 5)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- (커서 위치는 동일, 텍스트만 삭제됨)

처리 흐름:
1. keydown 이벤트 (Delete 키)
2. preventDefault() (Model-First)
3. DOM Selection → Model Selection 변환
4. 삭제 범위 계산 (offset 5부터 1글자)
5. Command 실행 (deleteText)
6. Transaction 완료 후 selectionAfter 적용 (커서 위치 유지)

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 3: 화살표 키로 Selection 이동

**상황**: 사용자가 화살표 키로 커서 이동

```
Before:
[text-1: "Hello World"]
           ↑ 커서 (offset 5)

→ 키 입력

After:
[text-1: "Hello World"]
            ↑ 커서 (offset 6)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 6, endOffset: 6, collapsed: true }

처리 흐름:
1. keydown 이벤트 (ArrowRight)
2. 브라우저가 자동으로 DOM Selection 이동
3. selectionchange 이벤트 발생
4. handleSelectionChange() 호출
5. convertDOMSelectionToModel()로 Model Selection 변환
6. editor.updateSelection(modelSelection)
7. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 4: 클릭으로 Selection 변경

**상황**: 사용자가 텍스트를 클릭하여 커서 이동

```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                 ↑ 커서 (text-1 offset 5)

사용자 클릭: text-2 offset 2

After:
[text-1: "Hello"] [image-1] [text-2: "World"]
                                      ↑ 커서 (text-2 offset 2)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-2', startOffset: 2, endOffset: 2, collapsed: true }

처리 흐름:
1. click 이벤트 발생
2. 브라우저가 자동으로 DOM Selection 설정
3. selectionchange 이벤트 발생
4. handleSelectionChange() 호출
5. convertDOMSelectionToModel()로 Model Selection 변환
6. editor.updateSelection(modelSelection)
7. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

**상황**: 사용자가 atom 노드(inline-image)를 클릭

```
Before:
[text-1: "Hello"] [image-1] [text-2: "World"]
                   ↑ 커서 (text-1 offset 5)

사용자 클릭: image-1

After:
[text-1: "Hello"] [image-1 (선택됨)] [text-2: "World"]

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'node', nodeId: 'image-1' }

처리 흐름:
1. click 이벤트 발생
2. 클릭된 요소가 atom 노드인지 확인
3. Node Selection으로 변환
4. editor.updateSelection({ type: 'node', nodeId: 'image-1' })
5. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
1. deselect('text-1', { ... })
2. select('image-1', { selection: { type: 'node', nodeId: 'image-1' } })
```

#### 시나리오 5: 드래그로 Selection 변경

**상황**: 사용자가 마우스 드래그로 텍스트 범위 선택

```
Before:
[text-1: "Hello World"]
           ↑ 커서 (offset 5)

사용자 드래그: offset 5 → offset 11

After:
[text-1: "Hello World"]
           ↑---선택---↑

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 11, collapsed: false }

처리 흐름:
1. mousedown 이벤트 (드래그 시작)
2. mousemove 이벤트 (드래그 중)
3. 브라우저가 자동으로 DOM Selection 업데이트
4. selectionchange 이벤트 발생 (드래그 중 여러 번 발생)
5. 디바운싱 적용 (드래그 중: 100ms, 일반: 16ms)
6. handleSelectionChange() 호출
7. convertDOMSelectionToModel()로 Model Selection 변환
8. editor.updateSelection(modelSelection)
9. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 6: 복사/붙여넣기 시 Selection 변경

**상황**: 사용자가 텍스트를 붙여넣기

```
Before:
[text-1: "Hello"]
           ↑ 커서 (offset 5)

붙여넣기: " World"

After:
[text-1: "Hello World"]
                    ↑ 커서 (offset 11)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 11, endOffset: 11, collapsed: true }

처리 흐름:
1. paste 이벤트 발생
2. 붙여넣을 텍스트 추출
3. insertText() 호출
4. Transaction 실행 (insertText)
5. Transaction 완료 후 selectionAfter 계산
6. editor.updateSelection(selectionAfter)
7. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 7: Enter 키 입력 시 Selection 변경

**상황**: 사용자가 Enter 키를 눌러 새 paragraph 생성

```
Before:
[paragraph-1]
  └─ text-1: "Hello"
              ↑ 커서 (offset 5)

Enter 키 입력

After:
[paragraph-1]
  └─ text-1: "Hello"
[paragraph-2]
  └─ text-2: ""
              ↑ 커서 (offset 0)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-2', startOffset: 0, endOffset: 0, collapsed: true }

처리 흐름:
1. keydown 이벤트 (Enter 키)
2. preventDefault() (Model-First)
3. DOM Selection → Model Selection 변환
4. Command 실행 (insertParagraph)
5. Transaction 완료 후 selectionAfter 계산 (새 paragraph의 시작 위치)
6. editor.updateSelection(selectionAfter)
7. editor:selection.model 이벤트 발생
8. EditorViewDOM에서 DOM Selection 업데이트

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 8: 트랜잭션 완료 후 selectionAfter 적용

**상황**: Command 실행 후 자동으로 Selection 업데이트

```
Before:
[text-1: "Hello"]
           ↑ 커서 (offset 5)

Command 실행: deleteText(offset 5, length 1)

Transaction 실행:
1. 모델에서 텍스트 삭제
2. selectionAfter 계산: { startNodeId: 'text-1', startOffset: 5, ... }

After:
[text-1: "Hllo"]
           ↑ 커서 (offset 5)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }
- (커서 위치는 동일, 텍스트만 삭제됨)

처리 흐름:
1. Command 실행 (deleteText)
2. Transaction 실행
3. Transaction 완료 후 selectionAfter 계산
4. editor.updateSelection(selectionAfter)
5. editor:selection.model 이벤트 발생
6. EditorViewDOM에서 _pendingModelSelection에 저장
7. render() 호출
8. reconcile() 완료 후 applyModelSelectionWithRetry() 실행
9. DOM Selection 업데이트

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 9: 노드 삭제 시 Selection 변경

**상황**: 사용자가 선택된 노드를 삭제

```
Before:
[text-1: "Hello"] [image-1 (선택됨)] [text-2: "World"]

Delete 키 입력

After:
[text-1: "Hello"] [text-2: "World"]
                          ↑ 커서 (text-2 offset 0)

Selection 변경:
- Before: { type: 'node', nodeId: 'image-1' }
- After: { type: 'range', startNodeId: 'text-2', startOffset: 0, endOffset: 0, collapsed: true }

처리 흐름:
1. keydown 이벤트 (Delete 키)
2. preventDefault() (Model-First)
3. 현재 Selection이 Node Selection인지 확인
4. Command 실행 (deleteNode)
5. Transaction 실행
6. 노드 삭제 후 다음 노드로 Selection 이동
7. Transaction 완료 후 selectionAfter 계산
8. editor.updateSelection(selectionAfter)
9. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
1. deselect('image-1', { ... })
2. (text-2는 range selection이므로 ComponentManager 이벤트 없음)
```

#### 시나리오 10: 블록 병합 시 Selection 변경

**상황**: Backspace로 블록 경계에서 블록 병합

```
Before:
[paragraph-1]
  └─ text-1: "Hello"
              ↑ 커서 (offset 5)
[paragraph-2]
  └─ text-2: "World"
              ↑ 커서 (offset 0)

Backspace 키 입력

After:
[paragraph-1]
  └─ text-1: "HelloWorld"
                    ↑ 커서 (offset 5)

Selection 변경:
- Before: { type: 'range', startNodeId: 'text-2', startOffset: 0, endOffset: 0, collapsed: true }
- After: { type: 'range', startNodeId: 'text-1', startOffset: 5, endOffset: 5, collapsed: true }

처리 흐름:
1. keydown 이벤트 (Backspace)
2. preventDefault() (Model-First)
3. DOM Selection → Model Selection 변환
4. 이전 노드가 다른 부모인지 확인 (블록 경계)
5. Command 실행 (mergeBlockNodes)
6. Transaction 실행
7. 블록 병합 후 Selection을 병합된 위치로 이동
8. Transaction 완료 후 selectionAfter 계산
9. editor.updateSelection(selectionAfter)
10. editor:selection.model 이벤트 발생

ComponentManager 이벤트:
- 없음 (텍스트 노드는 range selection이므로 ComponentManager 이벤트 없음)
```

---

## 6. 구현 체크리스트

### 6.1 Selection 타입 판단
- [ ] 텍스트 노드 → Range Selection 변환
- [ ] Atom 노드 → Node Selection 변환
- [ ] Block 요소 → Node Selection 변환 (선택적)

### 6.6 Node ↔ Range Selection 변환
- [ ] Node Selection → Range Selection 변환 (텍스트 노드, Block 요소)
- [ ] Range Selection → Node Selection 변환 (Atom 노드, Block 전체 선택)
- [ ] 변환 실패 시 원본 Selection 유지
- [ ] 변환 후 Selection 변경 이벤트 발생 확인

### 6.2 ComponentManager 통신
- [ ] `EditorViewDOM`에서 `_domRenderer.getComponentManager()`로 ComponentManager 접근
- [ ] `editor:selection.model` 이벤트 수신
- [ ] 이전 선택 상태 추적 (`_lastSelectedNodes`)
- [ ] Selection 타입별 노드 추출 (node, range, multi-node)
- [ ] 이전 노드들에 `deselect` 이벤트 emit
- [ ] 새로운 노드들에 `select` 이벤트 emit
- [ ] 컴포넌트에서 이벤트 수신 및 UI 업데이트

### 6.3 Selection UI 렌더링
- [ ] Range Selection: 브라우저 기본 Selection 사용
- [ ] Node Selection: 컴포넌트가 선택 UI 렌더링
- [ ] Block Selection: Block 요소 선택 UI

### 6.4 Model ↔ DOM Selection 변환
- [ ] Text Run Index 생성 알고리즘 구현
- [ ] Model → DOM 변환 구현
- [ ] DOM → Model 변환 구현
- [ ] 동기화 타이밍 관리
- [ ] Decorator 하위 제외 처리
- [ ] `normalizeWhitespace: false` 사용

### 6.5 Multi-Node Selection
- [ ] Ctrl/Cmd + 클릭으로 노드 추가/제거
- [ ] Shift + 클릭으로 범위 선택
- [ ] 드래그로 여러 노드 선택
- [ ] Multi-node selection UI 렌더링
- [ ] Bounding box 표시
- [ ] Primary 노드 표시

---

## 7. Selection 문서 통합 방안

### 7.1 현재 Selection 관련 문서

1. **`selection-system.md`** (현재 문서)
   - Selection 타입 정의, ComponentManager 통신, UI 렌더링, Model ↔ DOM 변환, 문제 해결
   - **위치**: 종합 명세 문서 (통합 완료)

2. **`selection-algorithm.md`**
   - Range selection 변환 알고리즘 (Text Run Index, offset 매핑)
   - **위치**: 알고리즘 상세 설명

3. **`selection-handling.md`**
   - DOM ↔ Model selection 변환 가이드, 문제 해결
   - **위치**: 구현 가이드 및 트러블슈팅

4. **`selection-sync-validation.md`**
   - Selection 동기화 검증
   - **위치**: 검증 및 테스트

### 7.2 통합 방안 제안

#### 통합 완료 상태

**현재 구조** (통합 완료):
```
selection-system.md (통합 문서)
├── 1. Selection 타입 정의
├── 2. ComponentManager 통신
├── 3. Selection UI 렌더링
├── 4. Model ↔ DOM Selection 변환
│   ├── 4.1 텍스트 관리 아키텍처
│   ├── 4.2 Text Run Index 알고리즘
│   ├── 4.3 Model Selection → DOM Selection 변환
│   ├── 4.4 DOM Selection → Model Selection 변환
│   ├── 4.5 Selection 동기화 타이밍
│   └── 4.6 텍스트 노드 분할 규칙
├── 5. Selection 변경 시나리오
├── 6. Node ↔ Range Selection 변환
├── 7. 문제 해결 및 주의사항
├── 8. 구현 체크리스트
└── 9. 참고 자료
```

**통합된 내용**:
- ✅ `selection-algorithm.md`의 핵심 내용 (Text Run Index, 변환 알고리즘)
- ✅ `selection-handling.md`의 문제 해결 및 주의사항
- ✅ `selection-sync-validation.md`의 검증 내용 (간단히 요약)

**제거된 내용**:
- ❌ Toolbar 렌더링 관련 내용 (외부 UI이므로 제거)

**남은 문서**:
- `selection-algorithm.md`: 알고리즘 상세 설명 (참고용)
- `selection-handling.md`: 트러블슈팅 가이드 (참고용)
- `selection-sync-validation.md`: 검증 및 테스트 (참고용)

---

## 8. 참고 자료

### 8.1 Selection 관련 문서 (참고용)
- [Selection Algorithm](./selection-algorithm.md): 알고리즘 상세 설명 (참고용)
- [Selection Handling](./selection-handling.md): 트러블슈팅 가이드 (참고용)
- [Selection Sync Validation](./selection-sync-validation.md): 검증 및 테스트 (참고용)

**참고**: 이 문서들(`selection-system.md`)에 핵심 내용이 통합되었습니다. 상세 알고리즘 설명이 필요할 때만 참고하세요.

### 8.2 관련 문서
- [Backspace Detailed Spec](./backspace-detailed-spec.md): Backspace 후 Selection 변경 규칙
- [Selection Spec](../../paper/selection-spec.md): Selection 타입 정의 (Paper 문서)

