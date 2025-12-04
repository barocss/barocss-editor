# 아키텍처 가이드

## 패키지 구조

### 핵심 패키지

- **`@barocss/editor-core`**: Editor 핵심 기능
  - Editor 클래스
  - Extension 시스템
  - Command 시스템
  - Event 시스템

- **`@barocss/editor-view-dom`**: DOM 기반 뷰
  - EditorViewDOM 클래스
  - Input Handler
  - MutationObserver 통합
  - Selection 동기화

- **`@barocss/datastore`**: 데이터 저장소
  - DataStore 클래스
  - CoreOperations
  - RangeOperations
  - MarkOperations
  - DecoratorOperations

- **`@barocss/model`**: Transaction 및 Operation
  - TransactionManager
  - TransactionBuilder
  - Operation 정의
  - SelectionContext

- **`@barocss/renderer-dom`**: DOM 렌더러
  - DOMRenderer
  - Reconciler (Fiber 기반)
  - VNodeBuilder
  - Fiber Reconciliation

- **`@barocss/extensions`**: 확장 기능
  - Extension 정의
  - Command 구현
  - createCoreExtensions
  - createBasicExtensions

- **`@barocss/devtool`**: 개발 도구
  - Devtool 클래스
  - AutoTracer
  - Execution Flow 추적
  - Model Tree 시각화

### 지원 패키지

- **`@barocss/schema`**: 스키마 정의
- **`@barocss/dsl`**: DSL 유틸리티
- **`@barocss/text-analyzer`**: 텍스트 분석
- **`@barocss/dom-observer`**: DOM 관찰자

## 주요 아키텍처 패턴

### 1. Command Pattern

- View Layer에서 Command 실행
- Command는 Transaction으로 변환
- Transaction은 여러 Operation 조합

### 2. Transaction Pattern

- 모든 데이터 변경은 Transaction으로 래핑
- TransactionManager가 History 자동 관리
- SelectionContext로 Selection 자동 업데이트

### 3. Fiber Reconciliation

- React 스타일 Fiber Reconciliation
- `alternate`를 통한 이전 상태 관리
- `sid` 기반 매칭

### 4. DOM-First vs Model-First

- **DOM-First**: 텍스트 입력/삭제 (MutationObserver 기반)
- **Model-First**: 구조 변경 (Command 기반)

## 데이터 흐름

### 입력 처리 흐름

1. 브라우저 이벤트 (`beforeinput`, `keydown`)
2. InputHandler 분류 및 처리
3. Command 실행 (`editor.executeCommand`)
4. Transaction 생성 및 실행
5. DataStore 업데이트
6. `editor:content.change` 이벤트 발생
7. DOMRenderer 렌더링
8. Selection 동기화

### 렌더링 흐름

1. VNodeBuilder가 Model에서 VNode 생성
2. Reconciler가 이전 VNode와 비교
3. Fiber Tree 생성 및 업데이트
4. DOM Operations 실행
5. Selection 복원

## 테스트

- 테스트 파일은 `*.test.ts` 형식
- 테스트는 `packages/*/test/` 디렉토리에 위치
- `pnpm test:run`로 실행

## 문서

- 아키텍처 문서: `docs/` 디렉토리
- 패키지별 문서: `packages/*/docs/` 디렉토리
- 스펙 문서: `paper/` 디렉토리

