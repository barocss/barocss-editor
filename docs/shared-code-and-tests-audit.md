# 공용 코드·shared 적용·테스트 현황 점검

전체 패키지를 기준으로 (1) 공용으로 쓸 만한 코드, (2) shared 적용 후보, (3) 테스트 유무를 정리했다.

---

## 1. @barocss/shared 사용 현황

| 패키지 | shared 사용 | 비고 |
|--------|-------------|------|
| editor-view-dom | ✅ | getKeyString, DecoratorManager, DecoratorExportData 등 |
| editor-view-react | ✅ | getKeyString, decorator 타입·매니저 전부 |
| editor-core | ✅ | IS_MAC, normalizeKeyString, expandModKey |
| renderer-dom | ❌ | decorator 타입 자체 정의 (vnode/decorator/types.ts) |
| renderer-react | ❌ | decorator 타입 자체 정의 (decorator/types.ts) |
| extensions | ❌ | editor-core 경유로 간접 사용 |
| converter, model, schema, datastore | ❌ | 키/플랫폼/데코레이터 미사용 |
| collaboration, collaboration-*, dom-observer | ❌ | 키/플랫폼/데코레이터 미사용 |
| devtool, dsl, text-analyzer | ❌ | 키/플랫폼/데코레이터 미사용 |

---

## 2. 공용으로 쓰는 코드 / 중복

### 2.1 Decorator 관련 타입

- **shared**: `Decorator`, `DecoratorTarget`, `DecoratorPosition`, `DecoratorTypeSchema` 등 (editor-view-dom/react에서 사용).
- **renderer-react** (`packages/renderer-react/src/decorator/types.ts`): `Decorator`, `DecoratorTarget`, `DecoratorPosition`을 자체 정의. 구조는 shared와 호환.
- **renderer-dom** (`packages/renderer-dom/src/vnode/decorator/types.ts`): 동일하게 자체 정의. `target`을 필수로 두는 등 shared와 약간 다름.
- **editor-view-dom** (`packages/editor-view-dom/src/decorator/types.ts`): 자체 `Decorator` 등 (레거시·DOM 전용 필드 포함).

**정리**:  
- **renderer-react**: shared에 의존 추가 후 `Decorator`/`DecoratorTarget`/`DecoratorPosition`을 shared에서 re-export하거나 import해서 쓰면 타입 일치·유지보수에 유리. (선택)  
- **renderer-dom**: `target` 필수 등 요구사항이 달라서, shared 타입을 확장하거나 그대로 쓰기보다는 지금처럼 로컬 타입 유지가 나을 수 있음. 필요 시만 shared 참조.

### 2.2 그 외

- **getKeyString / 플랫폼 / 키 바인딩**: shared에만 있고, editor-core·editor-view-dom·editor-view-react에서만 사용. 다른 패키지에서 키 이벤트를 직접 다루지 않으면 shared 적용 추가 후보는 없음.
- **i18n (replacePlaceholders, normalizeLocale)**: shared만 export. 사용처가 있으면 그쪽에서 shared 도입 검토.

---

## 3. 공용 패키지(shared) 적용 후보

| 대상 | 제안 | 우선순위 |
|------|------|----------|
| renderer-react | `@barocss/shared` 의존 추가 후 `Decorator`/`DecoratorTarget`/`DecoratorPosition`를 shared에서 import해 사용 | 낮음 (타입 일치용) |
| renderer-dom | decorator 타입은 현재처럼 로컬 유지. shared 의존은 필수 아님 | - |
| extensions / converter / model / schema / datastore 등 | 키·플랫폼·데코레이터를 직접 쓰지 않으면 shared 추가 불필요 | - |

---

## 4. 테스트가 없는 패키지

| 패키지 | test/test:run 스크립트 | test 파일 존재 | 조치 제안 |
|--------|------------------------|----------------|-----------|
| **devtool** | ❌ 없음 | ❌ 없음 | 테스트 스크립트 + 기본 단위 테스트 추가 권장 |
| 그 외 (converter, schema, editor-core, model, shared, …) | ✅ 있음 | ✅ 있음 | - |

- **devtool**: `src/devtool.ts`, `src/auto-tracer/*`, `src/ui.ts` 등에 대한 vitest 설정 + 최소 1~2개 단위 테스트(예: devtool 생성/구독) 추가하면 안정성·리그레션 방지에 도움.
- **text-run-index** API는 `@barocss/shared`에 포함되어 있으며, 해당 테스트는 shared 패키지에서 실행.

---

## 5. 요약

1. **공용 코드**: Decorator 관련 타입이 shared·renderer-react·renderer-dom·editor-view-dom에 걸쳐 비슷하게 정의돼 있음. renderer-react만 선택적으로 shared 타입으로 통일할 수 있음.
2. **shared 적용**: 이미 editor-view-dom, editor-view-react, editor-core에서 적절히 사용 중. renderer-react에만 선택적으로 적용 검토.
3. **테스트 없음**: **devtool** 패키지에 테스트 스크립트와 테스트 코드가 없음. 여기에 테스트 추가하는 것이 우선 권장.

원하면 devtool용 `vitest.config.ts`와 예시 테스트 골격도 작성해 줄 수 있다.
