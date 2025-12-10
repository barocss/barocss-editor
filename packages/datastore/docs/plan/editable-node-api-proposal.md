# Editable Node API Proposal

## Current Implementation Status

### ✅ Already Implemented

1. **Schema attribute**
   - `editable?: boolean` - Whether block node is editable

2. **Private function**
   - `_isEditableNode(nodeId: string): boolean` - Check if editable (private)

3. **Public API**
   - `getPreviousEditableNode(nodeId: string): string | null` - Find previous editable node
   - `getNextEditableNode(nodeId: string): string | null` - Find next editable node

---

## Additional Proposals

### 1. Public API: `isEditableNode()`

**Purpose:** Check if node is editable from Extension or Command

**Signature:**
```typescript
isEditableNode(nodeId: string): boolean
```

**Usage example:**
```typescript
// Use in Extension
if (dataStore.isEditableNode(nodeId)) {
  // Handle editable node
} else {
  // Handle non-editable node
}
```

**Implementation location:**
- Add public method to `packages/datastore/src/data-store.ts`
- Internally call `utility._isEditableNode()`

---

### 2. Query Editable Node List

**Purpose:** Query all editable nodes in document

**Signature:**
```typescript
getEditableNodes(options?: {
  filter?: (node: INode) => boolean;
  includeText?: boolean; // Include nodes with .text field
  includeInline?: boolean; // Include inline nodes
  includeEditableBlocks?: boolean; // Include editable: true block nodes
}): INode[]
```

**Usage example:**
```typescript
// Query all editable nodes
const editableNodes = dataStore.getEditableNodes();

// Query only text nodes
const textNodes = dataStore.getEditableNodes({
  includeText: true,
  includeInline: false,
  includeEditableBlocks: false
});

// Query only editable block nodes
const editableBlocks = dataStore.getEditableNodes({
  includeText: false,
  includeInline: false,
  includeEditableBlocks: true
});
```

---

### 3. Filter Editable Nodes

**Purpose:** Filter DocumentIterator or other query results to editable nodes

**Signature:**
```typescript
filterEditableNodes(nodeIds: string[]): string[]
```

**Usage example:**
```typescript
// Filter to editable nodes from all nodes
const allNodes = dataStore.findNodesByType('*');
const editableNodeIds = dataStore.filterEditableNodes(
  allNodes.map(n => n.sid!)
);
```

---

### 4. Editable Node Statistics

**Purpose:** Provide statistics on editable nodes in document

**Signature:**
```typescript
getEditableNodeStats(): {
  total: number;
  textNodes: number;
  inlineNodes: number;
  editableBlocks: number;
  byType: Record<string, number>;
}
```

**Usage example:**
```typescript
const stats = dataStore.getEditableNodeStats();
console.log(`Total ${stats.total} editable nodes`);
console.log(`Text nodes: ${stats.textNodes}`);
console.log(`Inline nodes: ${stats.inlineNodes}`);
console.log(`Editable Blocks: ${stats.editableBlocks}`);
```

---

### 5. Calculate Editable Node Range

**Purpose:** Calculate range of editable nodes within specific range

**Signature:**
```typescript
getEditableNodeRange(startNodeId: string, endNodeId: string): {
  startNodeId: string;
  endNodeId: string;
  nodeIds: string[];
  totalTextLength: number;
}
```

**Usage example:**
```typescript
// Calculate range of editable nodes between two nodes
const range = dataStore.getEditableNodeRange('text-1', 'text-5');
console.log(`Number of nodes in range: ${range.nodeIds.length}`);
console.log(`Total text length: ${range.totalTextLength}`);
```

---

### 6. Search Editable Nodes

**Purpose:** Search editable nodes matching specific conditions

**Signature:**
```typescript
findEditableNodes(predicate: (node: INode) => boolean): INode[]
```

**Usage example:**
```typescript
// Find editable nodes with text length >= 10
const longTextNodes = dataStore.findEditableNodes(
  node => node.text && node.text.length >= 10
);
```

---

### 7. Group Editable Nodes

**Purpose:** Group editable nodes by type

**Signature:**
```typescript
groupEditableNodesByType(): Record<string, INode[]>
```

**Usage example:**
```typescript
const grouped = dataStore.groupEditableNodesByType();
console.log('inline-text nodes:', grouped['inline-text']);
console.log('codeBlock nodes:', grouped['codeBlock']);
```

---

## Priority

### Phase 1: Essential API (Implement immediately)
1. ✅ `isEditableNode()` - Expose as public API
   - Frequently used in Extension/Command
   - Expose current private function as public

### Phase 2: Useful API (Short term)
2. ✅ `getEditableNodes()` - Query editable node list
   - Useful for document analysis, statistics, etc.
3. ✅ `filterEditableNodes()` - Filtering utility
   - Use in combination with other query results

### Phase 3: Advanced API (Medium term)
4. ✅ `getEditableNodeStats()` - Statistics
   - Useful for document analysis, debugging
5. ✅ `getEditableNodeRange()` - Range calculation
   - Useful for Selection handling, text extraction, etc.

### Phase 4: Optional API (Long term)
6. ✅ `findEditableNodes()` - Search
   - When specific condition search is needed
7. ✅ `groupEditableNodesByType()` - Grouping
   - When type-based analysis is needed

---

## Implementation Examples

### `isEditableNode()` Implementation

```typescript
// packages/datastore/src/data-store.ts
/**
 * Checks if node is an editable node.
 * 
 * Editable nodes:
 * - Text nodes (have .text field)
 * - Inline nodes (group === 'inline')
 * - Editable block nodes (group === 'block' && editable === true && have .text field)
 * 
 * @param nodeId Node ID
 * @returns Whether editable
 */
isEditableNode(nodeId: string): boolean {
  return this.utility._isEditableNode(nodeId);
}
```

### `getEditableNodes()` Implementation

```typescript
// packages/datastore/src/operations/utility-operations.ts
/**
 * Queries all editable nodes in document.
 * 
 * @param options Filter options
 * @returns Array of editable nodes
 */
getEditableNodes(options?: {
  filter?: (node: INode) => boolean;
  includeText?: boolean;
  includeInline?: boolean;
  includeEditableBlocks?: boolean;
}): INode[] {
  const {
    filter,
    includeText = true,
    includeInline = true,
    includeEditableBlocks = true
  } = options || {};

  const result: INode[] = [];
  
  for (const [nodeId, node] of this.dataStore.getNodes()) {
    if (!this._isEditableNode(nodeId)) {
      continue;
    }

    // Filter by type
    const schema = (this.dataStore as any)._activeSchema;
    if (schema) {
      const nodeType = schema.getNodeType?.(node.stype);
      if (nodeType) {
        const group = nodeType.group;
        const isTextNode = node.text !== undefined && typeof node.text === 'string';
        const isEditableBlock = group === 'block' && nodeType.editable === true && isTextNode;
        const isInline = group === 'inline';
        
        if (isTextNode && !includeText && !isEditableBlock) {
          continue;
        }
        if (isInline && !includeInline) {
          continue;
        }
        if (isEditableBlock && !includeEditableBlocks) {
          continue;
        }
      }
    }

    // Apply custom filter
    if (filter && !filter(node)) {
      continue;
    }

    result.push(node);
  }

  return result;
}
```

---

## Test Cases

Test cases should be added for each API:

1. `isEditableNode()` tests
   - Text node
   - Inline node
   - Editable block node
   - Regular block node
   - Document node

2. `getEditableNodes()` tests
   - Query all editable nodes
   - Filter by type
   - Apply custom filter

3. `filterEditableNodes()` tests
   - Empty array
   - All editable nodes
   - Including non-editable nodes

---

## Documentation

JSDoc comments and usage examples should be added for each API.
