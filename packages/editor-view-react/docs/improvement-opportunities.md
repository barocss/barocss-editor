# editor-view-dom / editor-view-react 개선 후보

editor-view-dom과 editor-view-react를 비교·분석한 결과, 아래 개선이 가능하다.

**적용 완료 (1–4번)**: DecoratorExportData/LoadDecoratorsPatternFunctions shared 통일, addDecorator(DecoratorGenerator) 지원, IEditorViewDOM 타입 정리, 스펙/README 업데이트.

---

## 1. editor-view-dom

### 1.1 DecoratorExportData·LoadDecoratorsPatternFunctions를 shared에서 사용

- **현재**: `packages/editor-view-dom/src/types.ts`에 `DecoratorExportData`가 로컬로 정의되어 있고, `loadDecorators`의 `patternFunctions`는 인라인 타입으로만 정의됨.
- **개선**: `DecoratorExportData`, `LoadDecoratorsPatternFunctions`를 `@barocss/shared`에서 import하고, editor-view-dom의 types에서 해당 정의 제거. `loadDecorators` 시그니처에 `LoadDecoratorsPatternFunctions` 사용.
- **효과**: 타입 중복 제거, shared와 시그니처 일치.

### 1.2 IEditorViewDOM 타입 정리

- **현재**: `getDecorators?(options?: any): any[]`로 되어 있음.
- **개선**: `getDecorators(options?: DecoratorQueryOptions): (Decorator | DecoratorGenerator)[]`로 명시. `defineDecoratorType`의 `schema` 인자 타입을 shared의 `DecoratorTypeSchema`로 통일.
- **효과**: 타입 안정성·자동완성 개선, editor-view-react와 개념적 일치.

---

## 2. editor-view-react

### 2.1 addDecorator에 DecoratorGenerator 지원

- **현재**: `addDecorator(decorator: Decorator)`만 받음. editor-view-dom은 `addDecorator(decorator: Decorator | DecoratorGenerator)`를 지원함.
- **개선**: `EditorViewHandle.addDecorator(decorator: Decorator | DecoratorGenerator)`로 확장. `DecoratorGenerator`인 경우 `decoratorGeneratorManagerRef.current?.registerGenerator(generator, bumpDecoratorVersion)` 호출 후 `bumpDecoratorVersion()` 호출.
- **효과**: DOM 뷰와 동일하게 generator 기반 데코레이터 등록 가능, API 일치.

### 2.2 ref.destroy() (선택)

- **현재**: editor-view-dom은 `view.destroy()`로 이벤트/observer/레이어 정리. editor-view-react는 언마운트 시 `useEffect` cleanup으로 observer 해제·이벤트 해제.
- **개선**: ref에 `destroy?(): void`를 두고, 호출 시 데코레이터 매니저 clear·버전 bump 등 선택적 정리만 수행. React는 언마운트가 곧 정리이므로 필수는 아님.
- **효과**: DOM과 동일한 “명시적 정리” API를 쓰고 싶을 때 사용 가능. 우선순위는 낮음.

---

## 3. 공통·문서

### 3.1 스펙/README 반영

- **editor-view-react**: `editor-view-react-spec.md`, `README.md`에 최근 추가된 ref API 반영  
  (`defineDecoratorType`, `convertStaticRangeToModel`, `getDecorators(options?)`, `DecoratorSchemaRegistry` 사용).
- **editor-view-dom**: README/문서에 `LoadDecoratorsPatternFunctions`, `DecoratorQueryOptions` 등 shared 타입 사용 여부 명시.

### 3.2 테스트

- **editor-view-react**: `addDecorator(DecoratorGenerator)` 지원 시, generator 등록 후 `getDecorators()`에 반영되는지 한 번 더 검증하는 테스트 추가.
- **editor-view-dom**: `DecoratorExportData`를 shared에서 쓰도록 바꾼 뒤, 기존 export/load 관련 테스트가 그대로 통과하는지 확인.

---

## 우선순위 제안

| 순서 | 항목 | 패키지 | 비고 |
|------|------|--------|------|
| 1 | DecoratorExportData·LoadDecoratorsPatternFunctions를 shared로 통일 | editor-view-dom | 타입 일원화 |
| 2 | addDecorator(DecoratorGenerator) 지원 | editor-view-react | DOM과 API parity |
| 3 | IEditorViewDOM getDecorators·defineDecoratorType 타입 정리 | editor-view-dom | 타입 품질 |
| 4 | 스펙/README 업데이트 | 둘 다 | 유지보수성 |
| 5 | ref.destroy() (선택) | editor-view-react | 필요 시 추가 |

원하면 위 항목별로 이슈/PR 단위로 나눠서 적용할 수 있다.
