# Smart Text Change Analyzer Specification

## 📋 **개요**

`Smart Text Change Analyzer`는 `editor-view-dom`에서 DOM 텍스트 변경사항을 정확히 분석하고 `editor-core`로 전달하는 핵심 모듈입니다. LCP/LCS 알고리즘과 Selection 바이어싱을 결합하여 사용자의 의도를 정확히 파악하고, 유니코드 문자를 안전하게 분할 처리합니다.

## 🎯 **핵심 원칙**

### **1. LCP/LCS 기반 정확한 델타 계산**
- **LCP (Longest Common Prefix)**: 두 텍스트의 공통 접두사 길이 계산
- **LCS (Longest Common Suffix)**: LCP 제거 후 공통 접미사 길이 계산
- **O(n) 시간 복잡도**: 효율적인 실시간 처리

### **2. Selection 바이어싱 (Selection Bias)**
- 사용자의 실제 커서 위치를 기준으로 변경사항 위치 조정
- 모호한 경우 Selection 근처의 변경사항을 우선 선택
- 1x1 교체와 삭제 연산에 특화된 정확도 향상

### **3. 유니코드 안전성**
- **NFC 정규화**: 입력 텍스트를 정규화하여 일관성 확보
- **안전한 분할 지점 보호**: 이모지, 결합 문자, 서로게이트 페어의 분할 안전성
- **안전한 인덱스 조정**: 문자 분할을 방지하는 분할 지점 조정

## 🔧 **핵심 인터페이스**

### **1. TextChange**
```typescript
interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;        // 변경 시작 위치 (oldText 기준)
  end: number;          // 변경 끝 위치 (oldText 기준)
  text: string;         // 변경할 텍스트
  confidence: number;   // 분석 신뢰도 (항상 1.0)
}
```

**각 타입별 의미:**
- **Insert**: `start === end` (삽입 위치), `text`는 삽입할 텍스트
- **Delete**: `start ~ end` (삭제할 영역), `text`는 빈 문자열
- **Replace**: `start ~ end` (교체할 영역), `text`는 교체할 텍스트

### **2. TextChangeAnalysisOptions**
```typescript
interface TextChangeAnalysisOptions {
  oldText: string;
  newText: string;
  selectionOffset: number;  // 사용자 Selection 위치
  selectionLength?: number; // 선택된 텍스트 길이 (0이면 커서)
}
```

## 🧮 **알고리즘 설계**

### **1. 전체 처리 흐름**

```typescript
export function analyzeTextChanges(options: TextChangeAnalysisOptions): TextChange[] {
  // 1. 유니코드 정규화 (NFC)
  const normalizedOldText = oldText.normalize('NFC');
  const normalizedNewText = newText.normalize('NFC');
  
  // 2. LCP/LCS 기반 기본 델타 계산
  const textDifference = calculateTextDifference(normalizedOldText, normalizedNewText);
  
  // 3. Selection 바이어싱 적용
  const changes = analyzeTextChangesWithSelection(/* ... */);
  
  // 4. 안전한 문자 분할 지점으로 조정
  const adjustedChanges = changes.map(change => ({
    ...change,
    start: adjustToSafeSplitPoint(/* ... */),
    end: adjustToSafeSplitPoint(/* ... */)
  }));
  
  return adjustedChanges;
}
```

### **2. LCP/LCS 알고리즘**

```typescript
function calculateTextDifference(oldText: string, newText: string) {
  // LCP: 동일한 접두사 길이 찾기
  let lcp = 0;
  const m = Math.min(oldText.length, newText.length);
  while (lcp < m && oldText.charCodeAt(lcp) === newText.charCodeAt(lcp)) {
    lcp++;
  }

  // LCS: LCP 제거 후 동일한 접미사 길이 찾기
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

  // 변경 영역 계산
  const start = lcp;
  const end = oldText.length - lcs;
  const deleted = oldText.slice(start, end);
  const inserted = newText.slice(lcp, newText.length - lcs);
}
```

### **3. Selection 바이어싱 알고리즘**

#### **A. 1x1 교체 최적화**
```typescript
if (kind === 'replace' && inserted.length === 1 && deleted.length === 1) {
  const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
  const searchRadius = Math.min(3, Math.floor(oldText.length * 0.05));
  
  // Selection 중심으로 제한된 범위에서 정확한 위치 탐색
  for (let i = searchStart; i <= searchEnd; i++) {
    const simulated = oldText.slice(0, i) + inserted + oldText.slice(i + 1);
    if (simulated === newText) {
      // 정확한 위치 발견
      finalStart = i;
      finalEnd = i + 1;
      break;
    }
  }
}
```

#### **B. 삭제 연산 최적화**
```typescript
else if (kind === 'delete') {
  const delLen = end - start;
  const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
  const windowRadius = Math.min(6, Math.floor(oldText.length * 0.1));
  
  let bestStart = start;
  let bestDist = Math.abs(biasCenter - (start + Math.floor(delLen / 2)));
  let bestOverlap = 0;

  // Selection과의 겹침과 거리를 모두 고려한 최적 위치 선택
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

### **4. 유니코드 안전성 처리**

#### **A. 안전한 문자 분할 지점 감지**
```typescript
function isSafeCharacterSplit(text: string, index: number): boolean {
  const before = text.codePointAt(index - 1);
  const after = text.codePointAt(index);
  
  // 서로게이트 페어 확인 (UTF-16)
  if (before >= 0xD800 && before <= 0xDBFF) return false; // High Surrogate
  if (after >= 0xDC00 && after <= 0xDFFF) return false;  // Low Surrogate
  
  // 결합 문자 확인 (Combining Marks)
  if (after >= 0x0300 && after <= 0x036F) return false;  // Combining Diacritical Marks
  if (after >= 0x1AB0 && after <= 0x1AFF) return false;  // Combining Diacritical Marks Extended
  if (after >= 0x1DC0 && after <= 0x1DFF) return false;  // Combining Diacritical Marks Supplement
  if (after >= 0x20D0 && after <= 0x20FF) return false;  // Combining Diacritical Marks for Symbols
  if (after >= 0xFE20 && after <= 0xFE2F) return false;  // Combining Half Marks
  
  return true;
}
```

#### **B. 안전한 분할 지점으로 조정**
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

## 📊 **지원하는 시나리오**

### **1. 기본 텍스트 변경사항**

#### **A. 텍스트 삽입**
```typescript
// 예시: "Hello world" → "Hello beautiful world"
// selectionOffset: 6, selectionLength: 0
// 결과: { type: 'insert', start: 6, end: 6, text: 'beautiful ', confidence: 1.0 }
```

#### **B. 텍스트 삭제**
```typescript
// 예시: "Hello beautiful world" → "Hello world"
// selectionOffset: 6, selectionLength: 10
// 결과: { type: 'delete', start: 6, end: 16, text: '', confidence: 1.0 }
```

#### **C. 텍스트 교체**
```typescript
// 예시: "Hello world" → "Hello universe"
// selectionOffset: 6, selectionLength: 5
// 결과: { type: 'replace', start: 6, end: 11, text: 'universe', confidence: 1.0 }
```

### **2. Selection 바이어싱 시나리오**

#### **A. 동일한 문자 연속 패턴**
```typescript
// 예시: "aaaaa" → "aaaa"
// selectionOffset: 2, selectionLength: 1
// LCP/LCS만으로는 모호하지만 Selection 바이어싱으로 정확한 위치 감지
// 결과: { type: 'delete', start: 2, end: 3, text: '', confidence: 1.0 }
```

#### **B. 1x1 문자 교체**
```typescript
// 예시: "abcdef" → "abXdef"
// selectionOffset: 2, selectionLength: 1
// Selection 근처에서 정확한 교체 위치 탐색
// 결과: { type: 'replace', start: 2, end: 3, text: 'X', confidence: 1.0 }
```

### **3. 유니코드 문자 안전 분할 처리**

#### **A. 이모지 처리**
```typescript
// 예시: "Hello 👋" → "Hello 👋 world"
// 이모지는 여러 UTF-16 코드 유닛으로 구성되지만 안전하게 처리
// 결과: { type: 'insert', start: 8, end: 8, text: ' world', confidence: 1.0 }
```

#### **B. 결합 문자 처리**
```typescript
// 예시: "café" → "cafés"
// é = e + ́ (결합 문자)이지만 분할 지점을 안전하게 보호
// 결과: { type: 'insert', start: 4, end: 4, text: 's', confidence: 1.0 }
```

#### **C. 유니코드 정규화**
```typescript
// 예시: "cafe\u0301" (e + combining acute) → "café" (precomposed)
// NFC 정규화로 동일한 문자로 인식하여 변경사항 없음
// 결과: [] (빈 배열)
```

## 🧪 **테스트 검증 시나리오**

### **1. 기본 기능 검증 (43개 테스트 통과)**

#### **A. 기본 텍스트 변경**
- ✅ 단순 삽입: `"Hello world"` → `"Hello beautiful world"`
- ✅ 단순 삭제: `"Hello beautiful world"` → `"Hello world"`
- ✅ 단순 교체: `"Hello world"` → `"Hello universe"`
- ✅ 동일한 텍스트: 변경사항 없음

#### **B. Selection 바이어싱**
- ✅ Selection 근처 변경 우선: `"aa"` → `"aaa"` (selectionOffset: 2)
- ✅ 1x1 교체 정확도: `"abcdef"` → `"abXdef"` (selectionOffset: 2)
- ✅ Selection 겹침 고려: `"Hello beautiful world"` → `"Hello world"` (selectionOffset: 8, length: 5)

#### **C. 유니코드 처리**
- ✅ 이모지 안전 처리: `"Hello 👋"` → `"Hello 👋 world"`
- ✅ 결합 문자 안전 처리: `"café"` → `"cafés"`
- ✅ 유니코드 정규화: `"cafe\u0301"` → `"café"` (변경사항 없음)

#### **D. LCP/LCS 알고리즘**
- ✅ 공통 접두사 감지: `"The quick brown fox"` → `"The quick red fox"`
- ✅ 공통 접미사 감지: `"prefix_old_suffix"` → `"prefix_new_suffix"`
- ✅ 복합 변경: `"abc"` → `"axyzc"`

#### **E. 엣지 케이스**
- ✅ 빈 텍스트 삽입: `""` → `"Hello"`
- ✅ 전체 텍스트 삭제: `"Hello"` → `""`
- ✅ 단일 문자 교체: `"a"` → `"b"`
- ✅ 성능 테스트: 10,000자 텍스트 처리 < 100ms

## 🔍 **유니코드 지원 범위**

### **1. 서로게이트 페어 (Surrogate Pairs)**
- **범위**: U+D800-U+DBFF (High Surrogate), U+DC00-U+DFFF (Low Surrogate)
- **용도**: UTF-16에서 4바이트 유니코드 문자 표현
- **예시**: 이모지, 한자, 특수 기호

### **2. 결합 문자 (Combining Marks)**
- **U+0300-U+036F**: Combining Diacritical Marks (가장 일반적)
- **U+1AB0-U+1AFF**: Combining Diacritical Marks Extended
- **U+1DC0-U+1DFF**: Combining Diacritical Marks Supplement
- **U+20D0-U+20FF**: Combining Diacritical Marks for Symbols
- **U+FE20-U+FE2F**: Combining Half Marks

### **3. 정규화 지원**
- **NFC (Canonical Decomposition, followed by Canonical Composition)**
- **입력**: 결합 문자 형태 (e + ́)
- **출력**: 정규화된 형태 (é)
- **목적**: 동일한 문자의 다른 표현을 통일

## 📈 **성능 지표**

### **1. 시간 복잡도**
- **LCP/LCS 계산**: O(n) where n = max(oldText.length, newText.length)
- **Selection 바이어싱**: O(k) where k = search radius (최대 6)
- **유니코드 분할 지점 조정**: O(m) where m = character split point search distance
- **전체 처리**: O(n) (선형 시간)

### **2. 공간 복잡도**
- **메모리 사용량**: O(1) (상수 공간)
- **임시 변수**: O(1)
- **결과 배열**: O(k) where k = number of changes (보통 1)

### **3. 처리 속도**
- **목표**: 1ms 이내 (일반적인 텍스트)
- **최대**: 5ms (10,000자 이상)
- **실제 측정**: 10,000자 텍스트 < 100ms

## 🔄 **Integration with Editor Core**

### **1. 이벤트 전달**
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

### **2. Model 동기화**
- **정확한 위치**: Selection offset을 통한 정확한 모델 업데이트
- **점진적 업데이트**: 변경된 부분만 모델에 반영
- **유니코드 안전성**: 문자의 안전한 분할 처리

## 🚀 **핵심 개선사항**

### **1. LCP/LCS 알고리즘 도입**
- **기존**: 단순 문자열 비교
- **개선**: O(n) 시간 복잡도의 정확한 델타 계산
- **효과**: 동일한 문자 연속 패턴에서도 정확한 위치 감지

### **2. Selection 바이어싱**
- **기존**: Selection 정보 무시
- **개선**: 사용자 의도 반영한 변경사항 위치 조정
- **효과**: 모호한 경우의 정확도 대폭 향상

### **3. 유니코드 안전성**
- **기존**: UTF-16 코드 유닛 단위 처리
- **개선**: 유니코드 문자 단위 안전 처리
- **효과**: 이모지, 결합 문자 등 유니코드 문자 안전 분할 처리

### **4. NFC 정규화**
- **기존**: 정규화 없음
- **개선**: 입력 텍스트 NFC 정규화
- **효과**: 동일한 문자의 다른 표현 통일

## 📚 **참고 자료**

- [Unicode Normalization Forms](https://unicode.org/reports/tr15/)
- [UTF-16 Surrogate Pairs](https://unicode.org/faq/utf_bom.html#utf16-2)
- [Combining Characters](https://unicode.org/charts/PDF/U0300.pdf)
- [LCP/LCS Algorithms](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem)

---

**버전**: 2.0.0  
**최종 수정**: 2024-12-19  
**작성자**: Barocss Editor Team

## 📝 **변경 이력**

### **v2.0.0 (2024-12-19)**
- ✅ LCP/LCS 알고리즘 도입으로 정확한 델타 계산
- ✅ Selection 바이어싱으로 사용자 의도 반영
- ✅ 유니코드 문자 안전 분할 처리
- ✅ NFC 정규화로 일관성 확보
- ✅ 43개 테스트 모두 통과
- ✅ 성능 최적화 (O(n) 시간 복잡도)

### **v1.0.0 (2024-01-XX)**
- 🎯 초기 스펙 정의
- 🎯 기본 텍스트 변경 감지 알고리즘 설계