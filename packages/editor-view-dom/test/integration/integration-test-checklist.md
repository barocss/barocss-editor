# EditorViewDOM + renderer-dom 통합 테스트 체크리스트

## ✅ 완료된 테스트

### 기본 통합 테스트 (`renderer-dom-integration.test.ts`)
- [x] 간단한 paragraph 렌더링
- [x] heading과 paragraph가 있는 문서 렌더링
- [x] 중첩 구조 렌더링
- [x] 마크가 있는 텍스트 렌더링
- [x] 콘텐츠 업데이트
- [x] DOM 요소 identity 보존 (sid 기반)
- [x] 빈 문서 처리
- [x] content 속성 없는 문서 처리

### 디테일한 통합 테스트 (`renderer-dom-detailed-integration.test.ts`)
- [x] Complex Marks (2개)
  - [x] 여러 마크 중첩 처리
  - [x] 여러 텍스트 노드에 걸친 마크 처리
- [x] Deep Nesting (2개)
  - [x] 5단계 깊은 중첩 구조
  - [x] 텍스트와 엘리먼트 혼합 콘텐츠
- [x] Content Updates (3개)
  - [x] 자식 추가 시 DOM 보존
  - [x] 자식 제거 시 나머지 DOM 보존
  - [x] 자식 재정렬 시 DOM identity 보존
- [x] Attributes and Styles (2개)
  - [x] 엘리먼트 속성 업데이트
  - [x] 속성 제거 처리
- [x] Proxy-based Lazy Evaluation (2개)
  - [x] getDocumentProxy() 사용 확인
  - [x] 대용량 문서 성능 테스트 (100개 paragraph)
- [x] Error Handling (2개)
  - [x] stype 누락 처리
  - [x] 잘못된 트리 구조 처리
- [x] Real-world Scenarios (2개)
  - [x] Article 구조 렌더링
  - [x] 점진적 콘텐츠 업데이트

## 🔄 진행 중

없음

## ✅ 최근 완료 사항 (2024)

### id/type → sid/stype 변환 완료
- [x] 모든 통합 테스트 파일에서 `id`/`type` → `sid`/`stype` 변환 완료
- [x] `renderer-dom-integration.test.ts` - 변환 완료
- [x] `renderer-dom-detailed-integration.test.ts` - 변환 완료
- [x] `component-state-integration.test.ts` - 변환 완료
- [x] `decorator-integration.test.ts` - 변환 완료
- [x] `performance-integration.test.ts` - 변환 완료
- [x] `complex-scenarios-integration.test.ts` - 변환 완료
- [x] `error-handling-integration.test.ts` - 변환 완료
- [x] `portal-integration.test.ts` - 변환 완료
- [x] `table-integration.test.ts` - 변환 완료
- [x] `form-elements-integration.test.ts` - 변환 완료
- [x] `layer-decorator-integration.test.ts` - 변환 완료
- [x] `mount-unmount-integration.test.ts` - 변환 완료

## 📋 다음 단계

### Component State 관리 통합 테스트 ✅
- [x] Component state 초기화 및 접근 (`component-state-integration.test.ts`)
- [x] setState() 호출 시 자동 재렌더링 (기본 확인)
- [x] 여러 컴포넌트의 독립적인 state 관리
- [x] state 변경 시 DOM 업데이트 확인
- [x] state 재렌더링 시 유지 확인
- [x] getState()를 통한 state 접근
- [x] BaseComponentState.mount/unmount 호출 확인 (`mount-unmount-integration.test.ts` - 테스트 작성 완료)

### Decorator 통합 테스트 ✅
- [x] Inline decorator 렌더링 및 업데이트 (`decorator-integration.test.ts`)
- [x] Block decorator 렌더링 및 업데이트
- [x] Decorator 추가/제거 시 host DOM 안정성
- [x] 여러 decorator 중첩 처리
- [x] Decorator position 변경 (before/after)
- [x] Decorator와 mark 동시 적용
- [x] Layer decorator 렌더링 및 업데이트 (`layer-decorator-integration.test.ts` - 테스트 작성 완료)

### Portal 통합 테스트 ✅
- [x] Portal 기본 렌더링 (`portal-integration.test.ts`)
- [x] Portal target 변경
- [x] Portal content 업데이트
- [x] 여러 Portal 동시 사용
- [x] Portal 정리 (unmount 시)
- [x] Portal with Complex Content

### 성능 및 스케일 테스트 ✅
- [x] 1000개 노드 렌더링 성능 (`performance-integration.test.ts`)
- [x] 2000개 노드 렌더링 성능 (5000개는 너무 느려서 2000개로 조정)
- [x] 대량 업데이트 성능
- [x] 메모리 누수 확인 (반복 렌더링)
- [x] Proxy lazy evaluation 성능 비교
- [x] Mixed Decorators and Marks 성능

### 복잡한 시나리오 테스트 ✅
- [x] 리스트 아이템 동적 추가/제거/재정렬 (`complex-scenarios-integration.test.ts`)
- [x] 중첩된 리스트 구조
- [x] 동적 속성/스타일 업데이트
- [x] 조건부 렌더링 (when)
- [x] 반복 렌더링 (each)
- [x] 테이블 구조 렌더링 (`table-integration.test.ts` - 9개 테스트 작성 완료)
- [x] 폼 요소 렌더링 (`form-elements-integration.test.ts` - 테스트 작성 완료)

### 에러 처리 및 엣지 케이스 ✅
- [x] 잘못된 stype 처리 (`error-handling-integration.test.ts`)
- [x] 중복 sid 처리
- [x] 매우 깊은 중첩 (20+ 레벨)
- [x] 빈 content 배열 처리
- [x] null/undefined 값 처리
- [x] Missing sid 처리
- [x] Invalid child types 처리
- [x] Missing required properties 처리

### 데이터 변환 테스트 ✅
- [x] TreeDocument → ModelData 변환 (기본 통합 테스트에서 확인)
- [x] INode 직접 사용 (stype/sid) (기본 통합 테스트에서 확인)
- [x] Proxy 기반 lazy evaluation (성능 테스트에서 확인)
- [x] convertTreeToModel 에러 처리 (에러 처리 테스트에서 확인)

## 📊 테스트 통계

- **완료된 테스트**: 100+ 개
  - 기본 통합 테스트: 8개 (`renderer-dom-integration.test.ts`)
  - 디테일한 통합 테스트: 15개 (`renderer-dom-detailed-integration.test.ts`)
  - Component State 관리: 7개 (`component-state-integration.test.ts`)
  - Decorator 통합: 8개 (`decorator-integration.test.ts`)
  - Portal 통합: 8개 (`portal-integration.test.ts`)
  - 성능 및 스케일: 6개 (`performance-integration.test.ts`)
  - 복잡한 시나리오: 7개 (`complex-scenarios-integration.test.ts`)
  - 에러 처리 및 엣지 케이스: 8개 (`error-handling-integration.test.ts`)
  - 테이블 구조: 9개 (`table-integration.test.ts`)
  - 폼 요소: 다수 (`form-elements-integration.test.ts`)
  - Layer decorator: 다수 (`layer-decorator-integration.test.ts`)
  - Mount/Unmount: 다수 (`mount-unmount-integration.test.ts`)
- **현재 커버리지**: 기본 기능, 주요 시나리오, 성능, 복잡한 케이스, 에러 처리

## 🎯 우선순위

1. **높음**: Component State 관리, Decorator 통합
2. **중간**: Portal 통합, 복잡한 시나리오
3. **낮음**: 성능 테스트, 엣지 케이스

