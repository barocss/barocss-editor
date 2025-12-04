# DOM ↔ Model 매핑 방법 결정 Spec

## 1. 개요

Barocss Editor에서 DOM 요소와 내부 모델 노드 간의 매핑을 위한 최적의 방법을 결정하기 위한 문서입니다. 이 문서는 다양한 매핑 방법을 분석하고, Barocss Editor의 요구사항에 맞는 최종 결론을 제시합니다.

## 2. 요구사항 분석

### 2.1 기능적 요구사항
- **양방향 매핑**: DOM → Model, Model → DOM 변환 지원
- **실시간 동기화**: DOM 변경과 Model 변경 간의 즉시 동기화
- **선택 관리**: 브라우저 Selection과 Model Range 간의 정확한 변환
- **성능**: 대용량 문서에서도 빠른 매핑 조회
- **확장성**: 향후 기능 추가 시 매핑 시스템 확장 가능

### 2.2 비기능적 요구사항
- **디버깅 용이성**: 개발자가 DOM과 Model 관계를 쉽게 파악
- **메모리 효율성**: 불필요한 메모리 사용 최소화
- **보안**: 내부 구조의 불필요한 노출 방지
- **표준 준수**: 웹 표준과의 호환성
- **유지보수성**: 코드의 가독성과 유지보수 용이성

## 3. 매핑 방법 분석

### 3.1 속성 기반 매핑 (Attribute-based)

#### 3.1.1 Data Attributes 방식
```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  <p data-bc-sid="para-1" data-bc-stype="paragraph">...</p>
</div>
```

**장점:**
- 명확하고 직관적인 매핑
- 개발자 도구에서 쉽게 확인 가능
- HTML5 표준 준수
- `querySelector`로 O(1) 검색 가능
- 추가 메타데이터 저장 용이

**단점:**
- DOM 크기 증가 (약 15-20% 증가)
- 보안상 내부 구조 노출
- 속성 오염 가능성

**성능:**
- 조회: O(1) - 매우 빠름
- 설정: O(1) - 매우 빠름
- 메모리: DOM 크기 증가

#### 3.1.2 ID/Class 기반 방식
```html
<div id="bc-node-doc-1" class="bc-document">
  <p id="bc-node-para-1" class="bc-paragraph">...</p>
</div>
```

**장점:**
- CSS 선택자와 호환
- 기존 웹 표준 활용

**단점:**
- ID 충돌 가능성
- CSS와 혼동 가능
- 제한된 메타데이터 저장

### 3.2 WeakMap 기반 매핑

```typescript
const nodeIdMap = new WeakMap<Element, string>();
const elementMap = new WeakMap<string, Element>();
```

**장점:**
- DOM에 속성 추가 없음
- 메모리 효율적 (가비지 컬렉션 자동)
- 보안상 안전
- 성능 우수

**단점:**
- 디버깅 매우 어려움
- 개발자 도구에서 확인 불가
- 메모리 누수 가능성 (순환 참조)
- TypeScript 타입 안전성 문제

**성능:**
- 조회: O(1) - 매우 빠름
- 설정: O(1) - 매우 빠름
- 메모리: 효율적

### 3.3 Symbol 기반 매핑

```typescript
const NODE_ID_SYMBOL = Symbol('nodeId');
(element as any)[NODE_ID_SYMBOL] = nodeId;
```

**장점:**
- DOM에 속성 추가 없음
- 외부에서 접근 어려움 (캡슐화)
- 성능 좋음

**단점:**
- 디버깅 매우 어려움
- TypeScript 타입 안전성 문제
- 개발자 도구에서 확인 불가

### 3.4 위치 기반 매핑 (Position-based)

```typescript
// DOM 트리 순회로 위치 계산
function getNodeIdByPosition(element: Element): string {
  const path = getElementPath(element);
  return calculateNodeIdFromPath(path);
}
```

**장점:**
- DOM에 속성 추가 없음
- 구조적 매핑

**단점:**
- 성능 오버헤드 (매번 계산)
- DOM 구조 변경 시 매핑 깨짐
- 복잡한 구현

**성능:**
- 조회: O(n) - 느림 (트리 순회)
- 설정: O(1) - 빠름
- 메모리: 효율적

### 3.5 하이브리드 매핑

```typescript
// 캐시 + 속성 조합
class HybridMapper {
  private cache = new WeakMap<Element, string>();
  private useAttributes = process.env.NODE_ENV === 'development';
}
```

**장점:**
- 성능과 디버깅의 균형
- 개발/프로덕션 환경 분리

**단점:**
- 구현 복잡성
- 환경별 동작 차이

## 4. 주요 에디터들의 매핑 방식

### 4.1 ProseMirror
- **방식**: 속성 기반 + 위치 기반 하이브리드
- **표기**: `data-pm-node`, `data-pm-pos`
- **특징**: 성능과 디버깅의 균형

### 4.2 Slate.js
- **방식**: 속성 기반
- **표기**: `data-slate-node`, `data-slate-element`
- **특징**: 명확한 매핑, 디버깅 용이

### 4.3 CKEditor 5
- **방식**: 속성 기반
- **표기**: `data-cke-element`, `data-cke-name`
- **특징**: 구조적 매핑

### 4.4 Monaco Editor
- **방식**: WeakMap 기반
- **특징**: 성능 우선, 디버깅 어려움

## 5. Barocss Editor 요구사항 매칭

### 5.1 기능적 요구사항 매칭

| 요구사항 | 속성 기반 | WeakMap | Symbol | 위치 기반 | 하이브리드 |
|---------|-----------|---------|--------|-----------|------------|
| 양방향 매핑 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 실시간 동기화 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 선택 관리 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 성능 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 확장성 | ✅ | ✅ | ✅ | ❌ | ✅ |

### 5.2 비기능적 요구사항 매칭

| 요구사항 | 속성 기반 | WeakMap | Symbol | 위치 기반 | 하이브리드 |
|---------|-----------|---------|--------|-----------|------------|
| 디버깅 용이성 | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| 메모리 효율성 | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| 보안 | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| 표준 준수 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 유지보수성 | ✅ | ❌ | ❌ | ❌ | ⚠️ |

## 6. 성능 벤치마크 (예상)

### 6.1 조회 성능 (1000개 요소 기준)
- **속성 기반**: ~0.1ms (querySelector)
- **WeakMap**: ~0.05ms (메모리 접근)
- **Symbol**: ~0.05ms (메모리 접근)
- **위치 기반**: ~5ms (트리 순회)

### 6.2 설정 성능 (1000개 요소 기준)
- **속성 기반**: ~0.2ms (setAttribute)
- **WeakMap**: ~0.1ms (메모리 설정)
- **Symbol**: ~0.1ms (메모리 설정)
- **위치 기반**: ~0.1ms (계산)

### 6.3 메모리 사용량
- **속성 기반**: +15-20% (DOM 크기)
- **WeakMap**: +5-10% (메모리)
- **Symbol**: +5-10% (메모리)
- **위치 기반**: +0% (계산만)

## 7. 위험도 분석

### 7.1 속성 기반 매핑
- **기술적 위험**: 낮음
- **성능 위험**: 중간 (DOM 크기 증가)
- **보안 위험**: 중간 (구조 노출)
- **유지보수 위험**: 낮음

### 7.2 WeakMap 기반 매핑
- **기술적 위험**: 중간 (복잡성)
- **성능 위험**: 낮음
- **보안 위험**: 낮음
- **유지보수 위험**: 높음 (디버깅 어려움)

### 7.3 하이브리드 매핑
- **기술적 위험**: 높음 (복잡성)
- **성능 위험**: 낮음
- **보안 위험**: 중간
- **유지보수 위험**: 중간

## 8. 구현 복잡도

### 8.1 속성 기반 매핑
- **초기 구현**: 간단
- **유지보수**: 간단
- **테스트**: 간단
- **디버깅**: 간단

### 8.2 WeakMap 기반 매핑
- **초기 구현**: 중간
- **유지보수**: 복잡
- **테스트**: 복잡
- **디버깅**: 매우 복잡

### 8.3 하이브리드 매핑
- **초기 구현**: 복잡
- **유지보수**: 복잡
- **테스트**: 복잡
- **디버깅**: 중간

## 9. 결론 및 권장사항

### 9.1 1차 결론: 속성 기반 매핑 선택

**선택 이유:**
1. **개발 생산성**: 디버깅과 개발이 매우 용이
2. **명확성**: DOM과 Model의 관계가 명시적
3. **표준 준수**: HTML5 data attributes 활용
4. **확장성**: 추가 메타데이터 쉽게 저장
5. **성능**: 실용적인 수준의 성능 (O(1) 조회)

**단점 완화 방안:**
- DOM 크기 증가 → 압축/최적화로 완화
- 보안 노출 → 민감한 정보는 제외
- 속성 오염 → `data-bc-*` 네임스페이스로 격리

### 9.2 2차 결론: 단계적 최적화 전략

#### Phase 1: 기본 속성 기반 매핑 (현재)
```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  <p data-bc-sid="para-1" data-bc-stype="paragraph">...</p>
</div>
```

#### Phase 2: 단순한 속성 기반 접근 (현재)
```typescript
class SimpleMapper {
  getNodeId(element: Element): string {
    // 항상 속성에서 직접 읽기 (캐시 없음)
    return element.getAttribute('data-bc-sid') || 'unknown';
  }
  
  getElementByNodeId(nodeId: string): Element | null {
    // 항상 DOM에서 직접 찾기 (캐시 없음)
    return document.querySelector(`[data-bc-sid="${nodeId}"]`);
  }
  
  getAbsolutePosition(element: Element): number {
    // 필요 시에만 계산 (캐시 없음)
    return this._calculatePosition(element);
  }
}
```

#### Phase 3: 하이브리드 접근 (필요시)
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

### 9.3 최종 결론

**Barocss Editor는 단순한 속성 기반 매핑을 채택하여 일관성과 안정성을 보장합니다.**

**핵심 원칙:**
1. **단순성 우선**: 복잡한 캐싱 없이 속성 기반 매핑
2. **일관성 보장**: 항상 DOM 속성에서 직접 읽기
3. **표준 준수**: HTML5 data attributes 활용
4. **확장성**: 향후 기능 추가 시 매핑 시스템 확장 가능

**구현 우선순위:**
1. ✅ **Phase 1**: 기본 속성 기반 매핑 구현 (완료)
2. ✅ **Phase 2**: 단순한 속성 기반 접근 (완료)
3. 🔄 **Phase 3**: 성능 최적화 (필요시)

이 전략을 통해 Barocss Editor는 단순성과 일관성을 보장하면서, 안정적이고 확장 가능한 매핑 시스템을 구축할 수 있습니다.
