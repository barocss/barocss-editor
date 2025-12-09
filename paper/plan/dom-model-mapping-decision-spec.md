# DOM ↔ Model Mapping Method Decision Spec

## 1. Overview

This document determines the optimal method for mapping between DOM elements and internal model nodes in Barocss Editor. It analyzes various mapping methods and presents final conclusions that match Barocss Editor's requirements.

## 2. Requirements Analysis

### 2.1 Functional Requirements
- **Bidirectional Mapping**: Support DOM → Model, Model → DOM conversion
- **Real-time Synchronization**: Immediate synchronization between DOM changes and Model changes
- **Selection Management**: Accurate conversion between browser Selection and Model Range
- **Performance**: Fast mapping lookup even in large documents
- **Extensibility**: Mapping system can be extended for future features

### 2.2 Non-functional Requirements
- **Debugging Ease**: Developers can easily understand DOM and Model relationships
- **Memory Efficiency**: Minimize unnecessary memory usage
- **Security**: Prevent unnecessary exposure of internal structure
- **Standard Compliance**: Compatibility with web standards
- **Maintainability**: Code readability and ease of maintenance

## 3. Mapping Method Analysis

### 3.1 Attribute-based Mapping

#### 3.1.1 Data Attributes Method
```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  <p data-bc-sid="para-1" data-bc-stype="paragraph">...</p>
</div>
```

**Advantages:**
- Clear and intuitive mapping
- Easy to check in developer tools
- HTML5 standard compliant
- O(1) search with `querySelector`
- Easy to store additional metadata

**Disadvantages:**
- DOM size increase (approximately 15-20% increase)
- Internal structure exposure from security perspective
- Attribute pollution possibility

**Performance:**
- Lookup: O(1) - Very fast
- Setting: O(1) - Very fast
- Memory: DOM size increase

#### 3.1.2 ID/Class-based Method
```html
<div id="bc-node-doc-1" class="bc-document">
  <p id="bc-node-para-1" class="bc-paragraph">...</p>
</div>
```

**Advantages:**
- Compatible with CSS selectors
- Utilizes existing web standards

**Disadvantages:**
- ID collision possibility
- Possible confusion with CSS
- Limited metadata storage

### 3.2 WeakMap-based Mapping

```typescript
const nodeIdMap = new WeakMap<Element, string>();
const elementMap = new WeakMap<string, Element>();
```

**Advantages:**
- No attribute addition to DOM
- Memory efficient (automatic garbage collection)
- Secure
- Excellent performance

**Disadvantages:**
- Very difficult debugging
- Cannot check in developer tools
- Memory leak possibility (circular references)
- TypeScript type safety issues

**Performance:**
- Lookup: O(1) - Very fast
- Setting: O(1) - Very fast
- Memory: Efficient

### 3.3 Symbol-based Mapping

```typescript
const NODE_ID_SYMBOL = Symbol('nodeId');
(element as any)[NODE_ID_SYMBOL] = nodeId;
```

**Advantages:**
- No attribute addition to DOM
- Difficult external access (encapsulation)
- Good performance

**Disadvantages:**
- Very difficult debugging
- TypeScript type safety issues
- Cannot check in developer tools

### 3.4 Position-based Mapping

```typescript
// Calculate position by traversing DOM tree
function getNodeIdByPosition(element: Element): string {
  const path = getElementPath(element);
  return calculateNodeIdFromPath(path);
}
```

**Advantages:**
- No attribute addition to DOM
- Structural mapping

**Disadvantages:**
- Performance overhead (calculation every time)
- Mapping breaks on DOM structure change
- Complex implementation

**Performance:**
- Lookup: O(n) - Slow (tree traversal)
- Setting: O(1) - Fast
- Memory: Efficient

### 3.5 Hybrid Mapping

```typescript
// Cache + attribute combination
class HybridMapper {
  private cache = new WeakMap<Element, string>();
  private useAttributes = process.env.NODE_ENV === 'development';
}
```

**Advantages:**
- Balance between performance and debugging
- Development/production environment separation

**Disadvantages:**
- Implementation complexity
- Different behavior per environment

## 4. Mapping Methods of Major Editors

### 4.1 ProseMirror
- **Method**: Attribute-based + position-based hybrid
- **Notation**: `data-pm-node`, `data-pm-pos`
- **Characteristics**: Balance between performance and debugging

### 4.2 Slate.js
- **Method**: Attribute-based
- **Notation**: `data-slate-node`, `data-slate-element`
- **Characteristics**: Clear mapping, easy debugging

### 4.3 CKEditor 5
- **Method**: Attribute-based
- **Notation**: `data-cke-element`, `data-cke-name`
- **Characteristics**: Structural mapping

### 4.4 Monaco Editor
- **Method**: WeakMap-based
- **Characteristics**: Performance priority, difficult debugging

## 5. Barocss Editor Requirements Matching

### 5.1 Functional Requirements Matching

| Requirement | Attribute-based | WeakMap | Symbol | Position-based | Hybrid |
|---------|-----------|---------|--------|-----------|------------|
| Bidirectional mapping | ✅ | ✅ | ✅ | ❌ | ✅ |
| Real-time synchronization | ✅ | ✅ | ✅ | ❌ | ✅ |
| Selection management | ✅ | ✅ | ✅ | ❌ | ✅ |
| Performance | ✅ | ✅ | ✅ | ❌ | ✅ |
| Extensibility | ✅ | ✅ | ✅ | ❌ | ✅ |

### 5.2 Non-functional Requirements Matching

| Requirement | Attribute-based | WeakMap | Symbol | Position-based | Hybrid |
|---------|-----------|---------|--------|-----------|------------|
| Debugging ease | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| Memory efficiency | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| Security | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| Standard compliance | ✅ | ✅ | ✅ | ✅ | ✅ |
| Maintainability | ✅ | ❌ | ❌ | ❌ | ⚠️ |

## 6. Performance Benchmark (Expected)

### 6.1 Lookup Performance (Based on 1000 elements)
- **Attribute-based**: ~0.1ms (querySelector)
- **WeakMap**: ~0.05ms (memory access)
- **Symbol**: ~0.05ms (memory access)
- **Position-based**: ~5ms (tree traversal)

### 6.2 Setting Performance (Based on 1000 elements)
- **Attribute-based**: ~0.2ms (setAttribute)
- **WeakMap**: ~0.1ms (memory setting)
- **Symbol**: ~0.1ms (memory setting)
- **Position-based**: ~0.1ms (calculation)

### 6.3 Memory Usage
- **Attribute-based**: +15-20% (DOM size)
- **WeakMap**: +5-10% (memory)
- **Symbol**: +5-10% (memory)
- **Position-based**: +0% (calculation only)

## 7. Risk Analysis

### 7.1 Attribute-based Mapping
- **Technical Risk**: Low
- **Performance Risk**: Medium (DOM size increase)
- **Security Risk**: Medium (structure exposure)
- **Maintenance Risk**: Low

### 7.2 WeakMap-based Mapping
- **Technical Risk**: Medium (complexity)
- **Performance Risk**: Low
- **Security Risk**: Low
- **Maintenance Risk**: High (difficult debugging)

### 7.3 Hybrid Mapping
- **Technical Risk**: High (complexity)
- **Performance Risk**: Low
- **Security Risk**: Medium
- **Maintenance Risk**: Medium

## 8. Implementation Complexity

### 8.1 Attribute-based Mapping
- **Initial Implementation**: Simple
- **Maintenance**: Simple
- **Testing**: Simple
- **Debugging**: Simple

### 8.2 WeakMap-based Mapping
- **Initial Implementation**: Medium
- **Maintenance**: Complex
- **Testing**: Complex
- **Debugging**: Very complex

### 8.3 Hybrid Mapping
- **Initial Implementation**: Complex
- **Maintenance**: Complex
- **Testing**: Complex
- **Debugging**: Medium

## 9. Conclusion and Recommendations

### 9.1 Primary Conclusion: Attribute-based Mapping Selected

**Selection Reasons:**
1. **Development Productivity**: Very easy debugging and development
2. **Clarity**: Explicit relationship between DOM and Model
3. **Standard Compliance**: Utilizes HTML5 data attributes
4. **Extensibility**: Easy to store additional metadata
5. **Performance**: Practical level of performance (O(1) lookup)

**Disadvantage Mitigation:**
- DOM size increase → Mitigated with compression/optimization
- Security exposure → Exclude sensitive information
- Attribute pollution → Isolated with `data-bc-*` namespace

### 9.2 Secondary Conclusion: Phased Optimization Strategy

#### Phase 1: Basic Attribute-based Mapping (Current)
```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  <p data-bc-sid="para-1" data-bc-stype="paragraph">...</p>
</div>
```

#### Phase 2: Simple Attribute-based Approach (Current)
```typescript
class SimpleMapper {
  getNodeId(element: Element): string {
    // Always read directly from attribute (no cache)
    return element.getAttribute('data-bc-sid') || 'unknown';
  }
  
  getElementByNodeId(nodeId: string): Element | null {
    // Always find directly from DOM (no cache)
    return document.querySelector(`[data-bc-sid="${nodeId}"]`);
  }
  
  getAbsolutePosition(element: Element): number {
    // Calculate only when needed (no cache)
    return this._calculatePosition(element);
  }
}
```

#### Phase 3: Hybrid Approach (If Needed)
```typescript
class HybridMapper {
  private useAttributes = process.env.NODE_ENV === 'development';
  
  setMapping(element: Element, nodeId: string) {
    if (this.useAttributes) {
      element.setAttribute('data-bc-sid', nodeId);
    } else {
      this.weakMap.set(element, nodeId);
    }
  }
}
```

### 9.3 Final Conclusion

**Barocss Editor adopts simple attribute-based mapping to ensure consistency and stability.**

**Core Principles:**
1. **Simplicity First**: Attribute-based mapping without complex caching
2. **Consistency Guarantee**: Always read directly from DOM attributes
3. **Standard Compliance**: Utilizes HTML5 data attributes
4. **Extensibility**: Mapping system can be extended for future features

**Implementation Priority:**
1. ✅ **Phase 1**: Basic attribute-based mapping implementation (Completed)
2. ✅ **Phase 2**: Simple attribute-based approach (Completed)
3. 🔄 **Phase 3**: Performance optimization (If needed)

Through this strategy, Barocss Editor can build a stable and extensible mapping system while ensuring simplicity and consistency.
