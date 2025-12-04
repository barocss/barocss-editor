# Barocss Architecture Documentation

Barocss의 아키텍처를 이해하기 위한 문서 모음입니다.

## 📚 핵심 문서

### 시작하기
1. **[architecture-summary.md](./architecture-summary.md)** - 빠른 참조용 요약
2. **[architecture-design-principles.md](./architecture-design-principles.md)** - 핵심 설계 원칙 ⭐
3. **[architecture-practical-examples.md](./architecture-practical-examples.md)** - 실전 예제

### 상세 설명
4. **[architecture-reconcile-algorithm.md](./architecture-reconcile-algorithm.md)** - Reconcile 알고리즘 상세 ⭐
5. **[architecture-reconcile-overview.md](./architecture-reconcile-overview.md)** - 전체 아키텍처 개요
6. **[architecture-flow-diagram.md](./architecture-flow-diagram.md)** - 플로우 다이어그램
7. **[architecture-mathematical-model.md](./architecture-mathematical-model.md)** - 수학적 모델

## 🎯 빠른 시작

Barocss는 다음 구조로 동작합니다:

```
DSL → VNode → Reconcile → DOM
```

### 핵심 개념
- **DSL**: 함수형 템플릿 정의 (`element`, `data`, `when`, `component`)
- **VNodeBuilder**: 템플릿 → VNode 변환 (순수 함수)
- **DOMReconcile**: VNode 차이 → DOM 변경 (최소한의 DOM 조작)
- **VNode는 reconcile에서 동적으로 판단되지 않음** ⭐ (핵심 설계 원칙)

### 예제
```typescript
import { define, element, data } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';

// 템플릿 정의
define('paragraph', element('p', {}, [data('text')]));

// Render
const renderer = new DOMRenderer();
const model = { stype: 'paragraph', text: 'Hello' };
renderer.render(container, model);
```

## 📖 문서 가이드

### 새로 시작하는 경우
1. `architecture-summary.md`로 전체 개념 파악
2. `architecture-practical-examples.md`로 실제 사용법 학습
3. `architecture-design-principles.md`로 핵심 원칙 이해

### 깊이 있게 이해하려면
1. `architecture-reconcile-overview.md` - 전체 구조
2. `architecture-flow-diagram.md` - 데이터 흐름
3. `architecture-mathematical-model.md` - 수학적 모델

### 특정 주제
- **설계 원칙**: `architecture-design-principles.md`
- **실전 예제**: `architecture-practical-examples.md`
- **Reconcile 동작**: `architecture-reconcile-overview.md`
- **함수형 표현**: `architecture-mathematical-model.md`

## 🔗 관련 문서

### dom/ 폴더
- `portal-system-spec.md` - Portal 시스템 사양
- `portal-use-cases.md` - Portal 사용 사례
- `decorator-implementation-guide.md` - Decorator 구현 가이드

### 기타
- `api-reference.md` - API 참조

## 🎓 학습 경로

### 초급
1. `architecture-summary.md` - 기본 개념
2. `architecture-practical-examples.md` - 간단한 예제

### 중급
3. `architecture-design-principles.md` - 핵심 원칙
4. `architecture-reconcile-overview.md` - 전체 흐름

### 고급
5. `architecture-flow-diagram.md` - 상세한 데이터 흐름
6. `architecture-mathematical-model.md` - 수학적 근거

## 💡 핵심 내용 요약

### 설계 원칙
- **VNode는 reconcile에서 동적으로 판단되지 않음**
- Build Phase와 Reconcile Phase 완전 분리
- 순수 함수 우선 (VNodeBuilder)
- 책임의 명확성

### 데이터 흐름
```
DSL (element, data, when) 
  → VNodeBuilder (순수 함수)
  → VNode Tree (완성됨)
  → DOMReconcile (차이 계산)
  → DOM (최소 변경)
```

### 레이어 구조
```
1. DSL Layer (packages/dsl)
   - 템플릿 빌더 (순수 함수)
   
2. VNode Layer (packages/vnode)
   - Template → VNode 변환
   
3. Renderer Layer (packages/renderer-dom)
   - VNode → DOM 업데이트
```

## 🔍 문제 해결

### VNode 관련
- `architecture-design-principles.md`의 "VNode vs Reconcile 분리 원칙" 참고
- VNode는 Build Phase에서만 생성됨

### Reconcile 관련
- `architecture-reconcile-overview.md`의 "Children Reconcile" 섹션
- `architecture-design-principles.md`의 "수학적 표현" 참고

### 실전 사용
- `architecture-practical-examples.md`의 예제 참고

## 📝 문서 업데이트 이력

- 2024: Core architecture 문서 생성
- 2024: DSL 패키지 추가, 설계 원칙 문서화
- 2024: 중복 문서 정리, 구조 개선

