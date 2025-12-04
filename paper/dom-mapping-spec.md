# DOM ↔ Model 매핑 표식 체계 스펙

## 1. 개요

에디터의 DOM 요소와 Model 노드 간의 매핑을 위한 표식 체계를 정의합니다. 이 체계는 에디터 제어, 디버깅, 성능 최적화를 목표로 합니다.

## 2. 핵심 원칙

### 2.1 최소한의 정보
- **필수 정보만 포함**: DOM ↔ Model 매핑에 꼭 필요한 정보만
- **단순성 우선**: 복잡한 속성보다는 명확한 매핑
- **성능 최적화**: `querySelector`로 O(1) 검색 가능

### 2.2 개발자 경험
- **디버깅 용이**: 개발자 도구에서 쉽게 식별
- **일관성**: 모든 요소에 동일한 규칙 적용
- **확장성**: 필요시 나중에 속성 추가 가능

## 3. 표식 체계 설계

### 3.1 기본 구조

```html
<!-- 기본 노드 -->
<div data-bc-sid="node-sid" data-bc-stype="node-type">
  <!-- 자식 노드들 -->
</div>

<!-- 텍스트 노드 (부모 요소의 속성 상속) -->
<span data-bc-sid="text-node-sid" data-bc-stype="text">
  텍스트 내용
</span>
```

### 3.2 속성 정의

#### `data-bc-sid` (필수)
- **용도**: Model 노드의 고유 ID
- **형식**: `string`
- **예시**: `"doc-1"`, `"para-2"`, `"text-3"`
- **규칙**: 
  - 문서 전체에서 유일해야 함
  - 변경되지 않는 안정적인 ID
  - 예측 가능한 패턴 (타입-번호)

#### `data-bc-stype` (필수)
- **용도**: Schema에 정의된 노드 타입
- **형식**: `string`
- **예시**: `"document"`, `"paragraph"`, `"text"`, `"heading"`
- **규칙**:
  - Schema에 정의된 노드 타입과 일치
  - 소문자, 하이픈 구분
  - 렌더러 선택에 사용

## 4. 노드 타입별 표식 규칙

### 4.1 Document 노드
```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  <!-- 문서 루트 -->
</div>
```

### 4.2 Block 노드 (paragraph, heading, list 등)
```html
<p data-bc-sid="para-1" data-bc-stype="paragraph">
  <!-- 블록 내용 -->
</p>

<h1 data-bc-sid="heading-1" data-bc-stype="heading">
  <!-- 제목 내용 -->
</h1>
```

### 4.3 Inline 노드 (text, link, strong 등)
```html
<span data-bc-sid="text-1" data-bc-stype="text">
  일반 텍스트
</span>

<strong data-bc-sid="strong-1" data-bc-stype="strong">
  <span data-bc-sid="text-2" data-bc-stype="text">
    굵은 텍스트
  </span>
</strong>

<a data-bc-sid="link-1" data-bc-stype="link">
  <span data-bc-sid="text-3" data-bc-stype="text">
    링크 텍스트
  </span>
</a>
```

### 4.4 Atomic 노드 (image, table 등)
```html
<img data-bc-sid="img-1" data-bc-stype="image" />

<table data-bc-sid="table-1" data-bc-stype="table">
  <tr data-bc-sid="row-1" data-bc-stype="table-row">
    <td data-bc-sid="cell-1" data-bc-stype="table-cell">
      <!-- 셀 내용 -->
    </td>
  </tr>
</table>
```

## 5. 매핑 규칙

### 5.1 기본 매핑
- `data-bc-sid` → Model의 `id`
- `data-bc-stype` → Schema의 `type`

### 5.2 텍스트 노드 처리
- 텍스트 노드는 부모 Element의 `data-bc-sid` 속성 상속
- `data-bc-stype`은 `"text"`로 설정

## 6. 사용 예시

### 6.1 기본 사용법
```typescript
// DOM 요소에서 Model 정보 추출
const element = document.querySelector('[data-bc-sid="para-1"]');
const nodeId = element.getAttribute('data-bc-sid'); // "para-1"
const nodeType = element.getAttribute('data-bc-stype'); // "paragraph"

// Model ID로 DOM 요소 찾기
const domElement = document.querySelector(`[data-bc-sid="${nodeId}"]`);

// 타입으로 모든 요소 찾기
const paragraphs = document.querySelectorAll('[data-bc-stype="paragraph"]');
```

## 7. 성능 특성

- **조회 성능**: O(1) - `querySelector` 사용
- **메모리 사용량**: 최소 (캐시 없음)
- **일관성**: 높음 (항상 DOM 속성에서 직접 읽기)
- **복잡성**: 낮음 (단순한 구조)

## 8. 구현 상태

### ✅ 완료된 기능
- `data-bc-sid` 속성 자동 설정 (factory.ts)
- `data-bc-stype` 속성 자동 설정 (factory.ts)
- DOM ↔ Model 매핑 (selection-manager.ts)
- 기본 테스트 케이스

### 🔄 현재 구현
- `renderer-dom`에서 자동으로 `data-bc-sid`, `data-bc-stype` 설정
- `editor-core`에서 DOM ↔ Model 변환 처리
- 단순한 속성 기반 접근 방식

## 9. 예시: 완전한 문서 구조

```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  
  <h1 data-bc-sid="heading-1" data-bc-stype="heading">
    <span data-bc-sid="text-1" data-bc-stype="text">
      제목
    </span>
  </h1>
  
  <p data-bc-sid="para-1" data-bc-stype="paragraph">
    <span data-bc-sid="text-2" data-bc-stype="text">
      이것은 
    </span>
    <strong data-bc-sid="strong-1" data-bc-stype="strong">
      <span data-bc-sid="text-3" data-bc-stype="text">
        굵은 텍스트
      </span>
    </strong>
    <span data-bc-sid="text-4" data-bc-stype="text">
      입니다.
    </span>
  </p>
  
  <p data-bc-sid="para-2" data-bc-stype="paragraph">
    <a data-bc-sid="link-1" data-bc-stype="link">
      <span data-bc-sid="text-5" data-bc-stype="text">
        링크
      </span>
    </a>
    <span data-bc-sid="text-6" data-bc-stype="text">
      입니다.
    </span>
  </p>
  
</div>
```

이 단순한 표식 체계를 통해 에디터의 DOM과 Model 간의 매핑을 효율적으로 관리할 수 있습니다.
