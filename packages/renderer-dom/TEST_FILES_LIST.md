# Renderer-DOM 테스트 파일 목록

총 **44개**의 테스트 파일이 있습니다.

## 카테고리별 분류

### 1. Core - VNode Builder 관련 (12개)
- `core/vnode-builder-verification.test.ts` - VNode 빌더 검증
- `core/vnode-builder-text-rendering.test.ts` - 텍스트 렌더링
- `core/vnode-builder-dsl-functions.test.ts` - DSL 함수 테스트
- `core/vnode-builder-function-component.test.ts` - 함수 컴포넌트
- `core/vnode-builder-portal.test.ts` - Portal 테스트
- `core/vnode-builder-performance.test.ts` - 성능 테스트
- `core/vnode-builder-edge-cases.test.ts` - 엣지 케이스
- `core/vnode-full-document.test.ts` - 전체 문서 빌드
- `core/vnode-data-text-concept.test.ts` - data('text') 개념
- `core/vnode-decorator-structure.test.ts` - Decorator 구조
- `core/vnode-block-decorator-position.test.ts` - Block decorator 위치
- `core/vnode-complex-marks-decorators.test.ts` - 복잡한 마크/데코레이터

### 2. Core - Reconciler 관련 (15개)
- `core/reconciler-verification.test.ts` - Reconciler 검증
- `core/reconciler-component-state-integration.test.ts` - 컴포넌트 상태 통합
- `core/reconciler-advanced-cases.test.ts` - 고급 케이스
- `core/reconciler-complex-scenarios.test.ts` - 복잡한 시나리오
- `core/reconciler-text-vnode.test.ts` - 텍스트 VNode
- `core/reconciler-update-flow.test.ts` - 업데이트 흐름
- `core/reconciler-lifecycle.test.ts` - 라이프사이클
- `core/reconciler-errors.test.ts` - 에러 처리
- `core/reconciler-portal.test.ts` - Portal
- `core/reconciler-component-updatebysid.test.ts` - SID 기반 컴포넌트 업데이트
- `core/reconciler-prevvnode-nextvnode.test.ts` - 이전/다음 VNode
- `core/reconciler-selection-pool.behavior.test.ts` - 선택 풀 동작
- `core/reconciler-selection-preservation.test.ts` - 선택 보존
- `core/reconciler-performance.test.ts` - 성능
- `core/reconcile-root-basic.test.ts` - Root 기본 테스트

### 3. Core - DOM Renderer 관련 (4개)
- `core/dom-renderer-simple-rerender.test.ts` - 간단한 리렌더
- `core/dom-renderer-components.test.ts` - 컴포넌트
- `core/dom-renderer-multiple-render.test.ts` - 다중 렌더
- `core/dom-renderer-full-document-main.test.ts` - 전체 문서 메인

### 4. Core - Decorator 관련 (3개)
- `core/block-decorator-spec.test.ts` - Block decorator 스펙
- `core/decorator-types.test.ts` - Decorator 타입
- `core/mark-decorator-complex.test.ts` - 마크/데코레이터 복합

### 5. Core - Mark 관련 (1개)
- `core/mark-rendering-verification.test.ts` - 마크 렌더링 검증

### 6. Core - 기타 (6개)
- `core/full-top-down-render-pattern.test.ts` - 전체 상향식 렌더 패턴
- `core/vnode-selection-anchoring.test.ts` - VNode 선택 앵커링
- `core/vnode-structure-snapshot.test.ts` - VNode 구조 스냅샷
- `core/props-resolution-unit.test.ts` - Props 해석 유닛
- `core/bTable.test.ts` - bTable 테스트
- `core/measure.test.ts` - 측정

### 7. Edge Cases (2개)
- `edge-cases/nested-template.test.ts` - 중첩 템플릿
- `edge-cases/native-tag-restriction.test.ts` - 네이티브 태그 제한

### 8. Registry/DSL (1개)
- `registry/dsl/dsl-and-registry.test.ts` - DSL 및 레지스트리

## 실행 순서 제안

1. **VNode Builder 기본 검증** (가장 기본적인 기능)
   - `core/vnode-builder-verification.test.ts`
   - `core/vnode-builder-text-rendering.test.ts`
   - `core/vnode-builder-dsl-functions.test.ts`

2. **Decorator 관련** (최근 개선 사항)
   - `core/block-decorator-spec.test.ts`
   - `core/vnode-block-decorator-position.test.ts`
   - `core/decorator-types.test.ts`

3. **Mark 관련**
   - `core/mark-rendering-verification.test.ts`
   - `core/mark-decorator-complex.test.ts`

4. **Reconciler 기본**
   - `core/reconciler-verification.test.ts`
   - `core/reconcile-root-basic.test.ts`
   - `core/reconciler-text-vnode.test.ts`

5. **Reconciler 고급**
   - `core/reconciler-advanced-cases.test.ts`
   - `core/reconciler-complex-scenarios.test.ts`
   - `core/reconciler-component-state-integration.test.ts`

6. **DOM Renderer**
   - `core/dom-renderer-simple-rerender.test.ts`
   - `core/dom-renderer-components.test.ts`

7. **기타**
   - 나머지 테스트 파일들

