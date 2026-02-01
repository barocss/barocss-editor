# 내부 로직 검증 순서 및 테스트 전략

**원칙**: 패키지별로 내부 로직을 단단히 검증한 뒤 기능 추가를 진행한다. 검증은 **테스트 코드를 최대한 활용**한다.

---

## 1. 검증 순서 (의존성 하단 → 상단)

아래 패키지는 다른 `@barocss/*` 패키지에 의존하지 않거나, 이미 검증된 패키지에만 의존한다. **이 순서대로** 검증하면, 상위 패키지 검증 시 하위가 이미 안정되어 있다.

| 순서 | 패키지 | 의존(@barocss) | 검증 시점 |
|------|--------|----------------|-----------|
| **1** | **shared** | 없음 | 유틸·상수·키 문자열 등 단위 테스트로 검증 |
| **2** | **schema** | 없음 | 스키마 정의·getNodeType·그룹 검증 |
| **3** | **text-analyzer** | 없음 | 텍스트 변경 분석·유니코드 분석 테스트 |
| **4** | **text-run-index** | 없음 | 텍스트 런 인덱스·오프셋 변환 테스트 |
| **5** | **dsl** | 없음 | DSL 함수·레지스트리·템플릿 빌더 테스트 |
| **6** | **datastore** | schema, model(타입) | CRUD·트랜잭션·락·오버레이·마크·쿼리 테스트 |
| **7** | **converter** | datastore | 변환·로드/저장 로직 테스트 |
| **8** | **dom-observer** | text-analyzer | MutationObserver·변경 분류 테스트 |
| **9** | **renderer-dom** | dsl, text-run-index | 리콘실·VNode·DOM 매핑·마크 렌더 테스트 |
| **10** | **renderer-react** | dsl | React 빌드·렌더러 테스트 |
| **11** | **model** | datastore, editor-core(타입), schema | 트랜잭션·DSL·오퍼레이션 실행 테스트 |
| **12** | **editor-core** | datastore, model, renderer-dom, shared, schema | 키바인딩·컨텍스트·명령 실행·selectionManager 테스트 |
| **13** | **extensions** | editor-core, model, converter | 확장 명령·before/after 훅 테스트 |
| **14** | **editor-view-dom** | dsl, datastore, dom-observer, editor-core, renderer-dom, schema, shared, text-analyzer | 입력·선택·DOM 동기화 테스트 |
| **15** | **editor-view-react** | dsl, editor-core, renderer-react, shared, text-analyzer, text-run-index | EditorView·selection·input-handler 테스트 (필요 시 추가) |
| **16** | **collaboration** | datastore | 협업 어댑터·동기화 테스트 |
| **17** | **devtool** | editor-core, model | 트레이싱·UI 연동 테스트 (선택) |

---

## 2. 패키지별 검증 범위 및 테스트 활용

각 패키지에서 **어떤 내부 로직을 검증할지**와 **어떤 테스트를 쓸지**를 정리한다. 기존 `vitest` 테스트가 있으면 `pnpm --filter @barocss/<패키지> test:run`으로 실행한다.

### Tier 0 (외부 의존 없음)

- **shared**  
  - 검증: 키 문자열·상수·공용 타입·유틸 함수  
  - 테스트: 단위 테스트로 입력/출력·엣지 케이스 검증  

- **schema**  
  - 검증: 스키마 등록·getNodeType·group·content 규칙  
  - 테스트: `packages/schema` 내 vitest 테스트 활용·커버리지 확인  

- **text-analyzer**  
  - 검증: `analyzeTextChanges`, 유니코드/조합 문자 처리  
  - 테스트: `packages/text-analyzer/test/` (smart-text-analyzer, unicode-text-analysis)  

- **text-run-index**  
  - 검증: `buildTextRunIndex`, `binarySearchRun`, 오프셋↔DOM 매핑  
  - 테스트: 해당 패키지에 테스트 추가 후 `test:run`  

- **dsl**  
  - 검증: DSL 함수·레지스트리·템플릿 빌더  
  - 테스트: `packages/dsl/tests/` (dsl-functions 등)  

### Tier 1 (datastore / converter / DOM·React 렌더 기초)

- **datastore**  
  - 검증: getNode/setNode·트랜잭션·락·오버레이·마크·content 조작·쿼리·방문자  
  - 테스트: `packages/datastore/test/` 전반 (data-store-*.test.ts, iterator, lock, mark 등) — **기존 테스트 최대 활용**  

- **converter**  
  - 검증: 문서↔저장 형식 변환·로드/저장 일관성  
  - 테스트: `packages/converter` 내 vitest 테스트  

- **dom-observer**  
  - 검증: MutationObserver 설정·변경 수집·분류  
  - 테스트: `packages/dom-observer` vitest  

- **renderer-dom**  
  - 검증: 리콘실·VNode↔DOM·마크/데코레이터·data-bc-sid 부여  
  - 테스트: `packages/renderer-dom/test/` (reconciler, mark, decorator 등)  

- **renderer-react**  
  - 검증: build→React 노드·렌더러 인스턴스 동작  
  - 테스트: 필요 시 단위 테스트 추가 후 `test:run`  

### Tier 2 (model·editor-core·extensions)

- **model**  
  - 검증: 트랜잭션 실행·DSL 시퀀스·오퍼레이션별 부작용·selectionContext  
  - 테스트: `packages/model/test/` — `transaction/`, `operations/*.exec.test.ts`, `operations/*.test.ts` **전부 실행**해 회귀 방지  

- **editor-core**  
  - 검증: keybindings resolve·context 갱신·executeCommand·selectionManager·updateSelection  
  - 테스트: `packages/editor-core/test/` (selection-manager, editor, keybinding 등)  

- **extensions**  
  - 검증: 명령 등록·실행·before/after 훅·converter 연동  
  - 테스트: `packages/extensions/test/`  

### Tier 3 (view·협업·도구)

- **editor-view-dom**  
  - 검증: 입력→모델 반영·선택 DOM↔모델 동기화·키다운/beforeinput  
  - 테스트: `packages/editor-view-dom/test/` (event-handlers, integration, selection 등) — **기존 테스트 최대 활용**  

- **editor-view-react**  
  - 검증: EditorView 마운트·selectionchange·input-handler·contentEditable 이벤트 연결  
  - 테스트: 단위 테스트 추가 또는 apps/editor-react E2E와 연계 (E2E는 내부 로직 안정화 후 재활성화)  

- **collaboration**  
  - 검증: 어댑터·동기화 프로토콜·datastore 연동  
  - 테스트: collaboration, collaboration-yjs, collaboration-liveblocks 각각 test:run  

- **devtool**  
  - 검증: 필요 시 트레이싱·이벤트 수집 로직만 단위 테스트 (선택)  

---

## 3. 실행 방법

- **단일 패키지**  
  ```bash
  pnpm --filter @barocss/<패키지명> test:run
  ```
  예: `pnpm --filter @barocss/datastore test:run`, `pnpm --filter @barocss/model test:run`

- **순서대로 전체 검증** (Tier 0 → 3)  
  ```bash
  pnpm --filter @barocss/shared test:run
  pnpm --filter @barocss/schema test:run
  pnpm --filter @barocss/text-analyzer test:run
  # … 위 표 순서대로 반복
  ```

- **CI에서 한 번에**  
  루트 또는 워크스페이스에서 `pnpm -r test:run` (각 패키지 script에 `test:run`이 있을 때).  
  필요하면 `docs/internal-logic-validation.md` 순서를 CI 스크립트나 체크리스트에 반영한다.

---

## 4. 정리

- **내부 로직 검증**: 위 **1→2→…→17 순서**를 지키면, 하위 패키지가 안정된 상태에서 상위를 검증할 수 있다.  
- **테스트 활용**: 이미 있는 vitest 테스트를 **최대한 활용**하고, 커버리지가 부족한 패키지(예: editor-view-react, text-run-index, renderer-react)에는 **필요한 단위 테스트를 추가**한다.  
- **기능 추가**: 해당 기능이 건드리는 패키지의 검증(테스트 통과)이 끝난 뒤 진행한다.  
- **E2E**: 리스트/인용 등 E2E는 view 레이어(keydown·beforeinput 연결 등)가 안정된 뒤 다시 활성화한다.
