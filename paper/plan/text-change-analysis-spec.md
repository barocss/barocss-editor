# Smart Text Change Analyzer Specification

## 📋 **Overview**

`Smart Text Change Analyzer` is a core module in `editor-view-dom` that accurately analyzes DOM text changes and passes them to `editor-core`. It combines LCP/LCS algorithms with Selection bias to accurately understand user intent and safely handle Unicode character splitting.

## 🎯 **Core Principles**

### **1. Accurate Delta Calculation Based on LCP/LCS**
- **LCP (Longest Common Prefix)**: calculate common prefix length of two texts
- **LCS (Longest Common Suffix)**: calculate common suffix length after removing LCP
- **O(n) time complexity**: efficient real-time processing

### **2. Selection Bias**
- Adjust change positions based on user's actual cursor position
- Prefer changes near Selection when ambiguous
- Specialized accuracy improvement for 1x1 replacement and delete operations

### **3. Unicode Safety**
- **NFC normalization**: normalize input text for consistency
- **Safe split point protection**: safe splitting of emojis, combining characters, surrogate pairs
- **Safe index adjustment**: adjust split points to prevent character splitting

## 🔧 **Core Interfaces**

### **1. TextChange**
```typescript
interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;        // change start position (based on oldText)
  end: number;          // change end position (based on oldText)
  text: string;         // text to change
  confidence: number;   // analysis confidence (always 1.0)
}
```

**Meaning by type:**
- **Insert**: `start === end` (insertion position), `text` is text to insert
- **Delete**: `start ~ end` (region to delete), `text` is empty string
- **Replace**: `start ~ end` (region to replace), `text` is replacement text

### **2. TextChangeAnalysisOptions**
```typescript
interface TextChangeAnalysisOptions {
  oldText: string;
  newText: string;
  selectionOffset: number;  // user Selection position
  selectionLength?: number; // selected text length (0 means cursor)
}
```

## 🧮 **Algorithm Design**

### **1. Overall Processing Flow**

```typescript
export function analyzeTextChanges(options: TextChangeAnalysisOptions): TextChange[] {
  // 1. Unicode normalization (NFC)
  const normalizedOldText = oldText.normalize('NFC');
  const normalizedNewText = newText.normalize('NFC');
  
  // 2. Basic delta calculation based on LCP/LCS
  const textDifference = calculateTextDifference(normalizedOldText, normalizedNewText);
  
  // 3. Apply Selection bias
  const changes = analyzeTextChangesWithSelection(/* ... */);
  
  // 4. Adjust to safe character split points
  const adjustedChanges = changes.map(change => ({
    ...change,
    start: adjustToSafeSplitPoint(/* ... */),
    end: adjustToSafeSplitPoint(/* ... */)
  }));
  
  return adjustedChanges;
}
```

### **2. LCP/LCS Algorithm**

```typescript
function calculateTextDifference(oldText: string, newText: string) {
  // LCP: find identical prefix length
  let lcp = 0;
  const m = Math.min(oldText.length, newText.length);
  while (lcp < m && oldText.charCodeAt(lcp) === newText.charCodeAt(lcp)) {
    lcp++;
  }

  // LCS: find identical suffix length after removing LCP
  let lcs = 0;
  const bRem = oldText.length - lcp;
  const aRem = newText.length - lcp;
  while (
    lcs < bRem &&
    lcs < aRem &&
    oldText.charCodeAt(oldText.length - 1 - lcs) === newText.charCodeAt(newText.length - 1 - lcs)
  ) {
    lcs++;
  }

  // Calculate change region
  const start = lcp;
  const end = oldText.length - lcs;
  const deleted = oldText.slice(start, end);
  const inserted = newText.slice(lcp, newText.length - lcs);
}
```

### **3. Selection Bias Algorithm**

#### **A. 1x1 Replacement Optimization**
```typescript
if (kind === 'replace' && inserted.length === 1 && deleted.length === 1) {
  const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
  const searchRadius = Math.min(3, Math.floor(oldText.length * 0.05));
  
  // Search for exact position in limited range centered on Selection
  for (let i = searchStart; i <= searchEnd; i++) {
    const simulated = oldText.slice(0, i) + inserted + oldText.slice(i + 1);
    if (simulated === newText) {
      // Exact position found
      finalStart = i;
      finalEnd = i + 1;
      break;
    }
  }
}
```

#### **B. Delete Operation Optimization**
```typescript
else if (kind === 'delete') {
  const delLen = end - start;
  const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
  const windowRadius = Math.min(6, Math.floor(oldText.length * 0.1));
  
  let bestStart = start;
  let bestDist = Math.abs(biasCenter - (start + Math.floor(delLen / 2)));
  let bestOverlap = 0;

  // Select optimal position considering both overlap with Selection and distance
  for (let s = minS; s <= maxS; s++) {
    const overlap = isCollapsed
      ? (biasCenter >= spanStart && biasCenter <= spanEnd) ? 1 : 0
      : Math.max(0, Math.min(spanEnd, selectionEnd) - Math.max(spanStart, selectionStart));
    
    if (overlap > bestOverlap || (overlap === bestOverlap && dist < bestDist)) {
      bestOverlap = overlap;
      bestDist = dist;
      bestStart = s;
    }
  }
}
```

### **4. Unicode Safety Handling**

#### **A. Safe Character Split Point Detection**
```typescript
function isSafeCharacterSplit(text: string, index: number): boolean {
  const before = text.codePointAt(index - 1);
  const after = text.codePointAt(index);
  
  // Surrogate pair check (UTF-16)
  if (before >= 0xD800 && before <= 0xDBFF) return false; // High Surrogate
  if (after >= 0xDC00 && after <= 0xDFFF) return false;  // Low Surrogate
  
  // Combining character check (Combining Marks)
  if (after >= 0x0300 && after <= 0x036F) return false;  // Combining Diacritical Marks
  if (after >= 0x1AB0 && after <= 0x1AFF) return false;  // Combining Diacritical Marks Extended
  if (after >= 0x1DC0 && after <= 0x1DFF) return false;  // Combining Diacritical Marks Supplement
  if (after >= 0x20D0 && after <= 0x20FF) return false;  // Combining Diacritical Marks for Symbols
  if (after >= 0xFE20 && after <= 0xFE2F) return false;  // Combining Half Marks
  
  return true;
}
```

#### **B. Adjust to Safe Split Point**
```typescript
function adjustToSafeSplitPoint(text: string, index: number, direction: 'left' | 'right'): number {
  let adjusted = Math.max(0, Math.min(text.length, index));
  
  if (direction === 'left') {
    while (adjusted > 0 && !isSafeCharacterSplit(text, adjusted)) {
      adjusted--;
    }
  } else {
    while (adjusted < text.length && !isSafeCharacterSplit(text, adjusted)) {
      adjusted++;
    }
  }
  
  return adjusted;
}
```

## 📊 **Supported Scenarios**

### **1. Basic Text Changes**

#### **A. Text Insertion**
```typescript
// Example: "Hello world" → "Hello beautiful world"
// selectionOffset: 6, selectionLength: 0
// Result: { type: 'insert', start: 6, end: 6, text: 'beautiful ', confidence: 1.0 }
```

#### **B. Text Deletion**
```typescript
// Example: "Hello beautiful world" → "Hello world"
// selectionOffset: 6, selectionLength: 10
// Result: { type: 'delete', start: 6, end: 16, text: '', confidence: 1.0 }
```

#### **C. Text Replacement**
```typescript
// Example: "Hello world" → "Hello universe"
// selectionOffset: 6, selectionLength: 5
// Result: { type: 'replace', start: 6, end: 11, text: 'universe', confidence: 1.0 }
```

### **2. Selection Bias Scenarios**

#### **A. Consecutive Identical Character Pattern**
```typescript
// Example: "aaaaa" → "aaaa"
// selectionOffset: 2, selectionLength: 1
// Ambiguous with LCP/LCS alone, but Selection bias detects exact position
// Result: { type: 'delete', start: 2, end: 3, text: '', confidence: 1.0 }
```

#### **B. 1x1 Character Replacement**
```typescript
// Example: "abcdef" → "abXdef"
// selectionOffset: 2, selectionLength: 1
// Search for exact replacement position near Selection
// Result: { type: 'replace', start: 2, end: 3, text: 'X', confidence: 1.0 }
```

### **3. Unicode Character Safe Split Handling**

#### **A. Emoji Handling**
```typescript
// Example: "Hello 👋" → "Hello 👋 world"
// Emojis consist of multiple UTF-16 code units but handled safely
// Result: { type: 'insert', start: 8, end: 8, text: ' world', confidence: 1.0 }
```

#### **B. Combining Character Handling**
```typescript
// Example: "café" → "cafés"
// é = e + ́ (combining character) but split point is safely protected
// Result: { type: 'insert', start: 4, end: 4, text: 's', confidence: 1.0 }
```

#### **C. Unicode Normalization**
```typescript
// Example: "cafe\u0301" (e + combining acute) → "café" (precomposed)
// NFC normalization recognizes as same character, so no change
// Result: [] (empty array)
```

## 🧪 **Test Validation Scenarios**

### **1. Basic Functionality Verification (43 tests passed)**

#### **A. Basic Text Changes**
- ✅ Simple insertion: `"Hello world"` → `"Hello beautiful world"`
- ✅ Simple deletion: `"Hello beautiful world"` → `"Hello world"`
- ✅ Simple replacement: `"Hello world"` → `"Hello universe"`
- ✅ Identical text: no changes

#### **B. Selection Bias**
- ✅ Prefer changes near Selection: `"aa"` → `"aaa"` (selectionOffset: 2)
- ✅ 1x1 replacement accuracy: `"abcdef"` → `"abXdef"` (selectionOffset: 2)
- ✅ Consider Selection overlap: `"Hello beautiful world"` → `"Hello world"` (selectionOffset: 8, length: 5)

#### **C. Unicode Handling**
- ✅ Safe emoji handling: `"Hello 👋"` → `"Hello 👋 world"`
- ✅ Safe combining character handling: `"café"` → `"cafés"`
- ✅ Unicode normalization: `"cafe\u0301"` → `"café"` (no change)

#### **D. LCP/LCS Algorithm**
- ✅ Common prefix detection: `"The quick brown fox"` → `"The quick red fox"`
- ✅ Common suffix detection: `"prefix_old_suffix"` → `"prefix_new_suffix"`
- ✅ Complex changes: `"abc"` → `"axyzc"`

#### **E. Edge Cases**
- ✅ Empty text insertion: `""` → `"Hello"`
- ✅ Full text deletion: `"Hello"` → `""`
- ✅ Single character replacement: `"a"` → `"b"`
- ✅ Performance test: 10,000 character text processing < 100ms

## 🔍 **Unicode Support Range**

### **1. Surrogate Pairs**
- **Range**: U+D800-U+DBFF (High Surrogate), U+DC00-U+DFFF (Low Surrogate)
- **Purpose**: represent 4-byte Unicode characters in UTF-16
- **Examples**: emojis, Chinese characters, special symbols

### **2. Combining Characters (Combining Marks)**
- **U+0300-U+036F**: Combining Diacritical Marks (most common)
- **U+1AB0-U+1AFF**: Combining Diacritical Marks Extended
- **U+1DC0-U+1DFF**: Combining Diacritical Marks Supplement
- **U+20D0-U+20FF**: Combining Diacritical Marks for Symbols
- **U+FE20-U+FE2F**: Combining Half Marks

### **3. Normalization Support**
- **NFC (Canonical Decomposition, followed by Canonical Composition)**
- **Input**: combining character form (e + ́)
- **Output**: normalized form (é)
- **Purpose**: unify different representations of the same character

## 📈 **Performance Metrics**

### **1. Time Complexity**
- **LCP/LCS calculation**: O(n) where n = max(oldText.length, newText.length)
- **Selection bias**: O(k) where k = search radius (max 6)
- **Unicode split point adjustment**: O(m) where m = character split point search distance
- **Overall processing**: O(n) (linear time)

### **2. Space Complexity**
- **Memory usage**: O(1) (constant space)
- **Temporary variables**: O(1)
- **Result array**: O(k) where k = number of changes (usually 1)

### **3. Processing Speed**
- **Target**: within 1ms (typical text)
- **Maximum**: 5ms (10,000+ characters)
- **Actual measurement**: 10,000 character text < 100ms

## 🔄 **Integration with Editor Core**

### **1. Event Delivery**
```typescript
editor.emit('editor:content.change', {
  changes: [
    {
      type: 'insert',
      start: 6,
      end: 6,
      text: 'beautiful ',
      confidence: 1.0
    }
  ],
  oldText: 'Hello world',
  newText: 'Hello beautiful world',
  target: textNode
});
```

### **2. Model Synchronization**
- **Accurate position**: accurate model updates via Selection offset
- **Incremental updates**: reflect only changed parts in model
- **Unicode safety**: safe character split handling

## 🚀 **Key Improvements**

### **1. LCP/LCS Algorithm Introduction**
- **Previous**: simple string comparison
- **Improved**: accurate delta calculation with O(n) time complexity
- **Effect**: accurate position detection even in consecutive identical character patterns

### **2. Selection Bias**
- **Previous**: ignored Selection information
- **Improved**: adjust change positions reflecting user intent
- **Effect**: significant accuracy improvement in ambiguous cases

### **3. Unicode Safety**
- **Previous**: UTF-16 code unit level processing
- **Improved**: safe Unicode character-level processing
- **Effect**: safe split handling of Unicode characters like emojis and combining characters

### **4. NFC Normalization**
- **Previous**: no normalization
- **Improved**: NFC normalization of input text
- **Effect**: unify different representations of the same character

## 📚 **References**

- [Unicode Normalization Forms](https://unicode.org/reports/tr15/)
- [UTF-16 Surrogate Pairs](https://unicode.org/faq/utf_bom.html#utf16-2)
- [Combining Characters](https://unicode.org/charts/PDF/U0300.pdf)
- [LCP/LCS Algorithms](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem)

---

**Version**: 2.0.0  
**Last Modified**: 2024-12-19  
**Author**: Barocss Editor Team

## 📝 **Change History**

### **v2.0.0 (2024-12-19)**
- ✅ Accurate delta calculation with LCP/LCS algorithm
- ✅ User intent reflection with Selection bias
- ✅ Safe Unicode character split handling
- ✅ Consistency with NFC normalization
- ✅ All 43 tests passed
- ✅ Performance optimization (O(n) time complexity)

### **v1.0.0 (2024-01-XX)**
- 🎯 Initial spec definition
- 🎯 Basic text change detection algorithm design
