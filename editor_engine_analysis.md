# BaroCSS Editor Engine 분석 리포트

## 1. 개요 (Executive Summary)
BaroCSS 에디터 엔진은 **"데이터 중심의 트랜잭션 모델"**과 **"Fiber 기반의 독자적인 렌더링 엔진"**을 결합한 고성능 리치 텍스트 에디터입니다. React의 Fiber 아키텍처에서 영감을 받은 비동기/우선순위 기반 렌더링 시스템과, ProseMirror와 유사한 강력한 트랜잭션 기반 상태 관리 시스템을 갖추고 있어, 복잡한 문서 구조와 실시간 협업, 고성능 렌더링을 처리할 수 있는 기반이 마련되어 있습니다.

## 2. 핵심 아키텍처 (Core Architecture)

에디터는 크게 **데이터(Data)**, **렌더링(View)**, **제어(Control)**, **정의(Definition)**의 4가지 계층으로 구성됩니다.

### A. 데이터 계층 (`packages/datastore`, `packages/model`)
문서의 상태를 저장하고 변경을 관리하는 핵심 계층입니다.

*   **Flat Node Storage (`DataStore`)**:
    *   모든 노드를 `Map<ID, INode>` 형태의 플랫(Flat)한 구조로 저장하여, 깊은 트리 탐색 없이 ID만으로 즉시 접근이 가능합니다.
    *   부모-자식 관계는 `parentId`와 `content` 배열(ID 목록)로 관리되어, 계층 구조를 논리적으로 재구성합니다.
*   **트랜잭션 시스템 (`TransactionManager`)**:
    *   모든 상태 변경은 **트랜잭션(Transaction)**을 통해 이루어집니다.
    *   `begin()`, `commit()`, `rollback()`을 지원하는 오버레이(Overlay) 시스템을 통해 변경 사항을 임시로 적용해보고, 문제 발생 시 원자적(Atomic)으로 롤백할 수 있습니다.
    *   **Undo/Redo**: `HistoryManager`가 트랜잭션의 역연산(Inverse Operation)을 자동으로 관리합니다.
*   **Operation DSL**:
    *   `insertText`, `splitBlock`, `setAttrs` 등 원자적인 편집 동작들이 정의되어 있으며, 이를 조합해 복잡한 편집 기능을 구현합니다.

### B. 렌더링 계층 (`packages/renderer-dom`, `packages/editor-view-dom`)
데이터를 실제 DOM으로 변환하고 사용자 입력을 처리합니다.

*   **Fiber Reconciliation (`renderer-dom`)**:
    *   React의 Fiber 알고리즘을 독자적으로 구현했습니다.
    *   **Render Phase**: 변경 사항을 계산하고 효과(Effect)를 수집하는 단계 (DOM 조작 없음).
    *   **Commit Phase**: 수집된 변경 사항을 실제 DOM에 일괄 적용하는 단계.
    *   이를 통해 대규모 문서에서도 끊김 없는 렌더링 성능을 보장하려 합니다.
*   **Layered View Architecture (`editor-view-dom`)**:
    *   화면을 여러 겹의 레이어로 분리하여 관리합니다.
        1.  **Content Layer**: 실제 편집 가능한 텍스트 (`contentEditable`).
        2.  **Decorator Layer**: 텍스트 강조, 밑줄 등 시각적 장식.
        3.  **Selection Layer**: 사용자 선택 영역 표시.
        4.  **Context/Custom Layer**: 팝업, 위젯 등.
    *   이 구조는 텍스트 편집과 UI 장식을 분리하여 렌더링 성능을 최적화하고 복잡한 UI를 가능하게 합니다.

### C. 제어 계층 (`packages/editor-core`)
에디터의 두뇌 역할을 하며, 데이터와 뷰를 연결합니다.

*   **Editor Class**: 전체 시스템의 진입점(Entry Point)입니다.
*   **Command System**: `executeCommand('toggleBold')`와 같이 추상화된 명령어를 통해 에디터를 제어합니다.
*   **Extension System**: `use(extension)` 메서드를 통해 기능(명령어, 키맵, 렌더러 등)을 플러그인 형태로 확장할 수 있습니다.
*   **Selection Manager**: DOM의 Selection과 내부 Model의 Selection 간의 동기화를 담당합니다.

### D. 정의 계층 (`packages/dsl`)
UI와 문서 구조를 정의하는 선언적 언어입니다.

*   **Declarative Templates**: `element('div', [text('Hello')])`와 같은 함수형 문법으로 템플릿을 정의합니다.
*   **Data Binding**: `data(d => d.user.name)`와 같이 모델 데이터와 뷰를 바인딩합니다.
*   **Renderer Registry**: 특정 노드 타입(예: `paragraph`, `image`)을 어떻게 렌더링할지 정의하고 등록합니다.

### E. 스키마 계층 (`packages/schema`)
문서의 구조적 무결성을 보장하는 유효성 검증 계층입니다.

*   **Schema Definition**: 노드(`Node`)와 마크(`Mark`)의 구조, 속성, 포함 관계를 정의합니다.
*   **Validation System**:
    *   **Attribute Validation**: 각 노드나 마크가 가질 수 있는 속성의 타입(string, number 등)과 필수 여부를 검증합니다.
    *   **Content Model**: 노드가 가질 수 있는 자식 노드의 종류와 순서를 제어합니다.
    *   **Mark Exclusion**: 특정 마크끼리의 공존 불가능 조건(예: 코드 블록 내에서는 볼드 금지 등)을 정의하고 검증합니다.
*   **Extensibility**: `createSchema`를 통해 기존 스키마를 상속받아 새로운 노드나 마크를 추가하며 확장할 수 있습니다.

## 3. 현재 구현된 주요 기능 (Current Capabilities)

1.  **강력한 문서 편집 모델**:
    *   텍스트 삽입/삭제, 블록 분할/병합, 속성 변경 등 기본적인 리치 텍스트 편집 기능이 `Operation`으로 구현되어 있습니다.
    *   스키마(Schema) 검증을 통해 잘못된 문서 구조가 생성되는 것을 방지합니다.

2.  **고성능 렌더링 엔진**:
    *   단순 `innerHTML` 교체가 아닌, 변경된 부분만 정밀하게 업데이트하는 **Reconciliation(재조정)** 알고리즘이 탑재되어 있습니다.
    *   **Text Collapse**: 불필요한 텍스트 노드를 병합하여 DOM 노드 개수를 최소화합니다.

3.  **확장성 (Extensibility)**:
    *   **Custom Node**: 개발자가 새로운 종류의 노드(예: 유튜브 임베드, 코드 블록)를 정의하고 렌더링 방식을 `dsl`로 지정할 수 있습니다.
    *   **Decorator**: 정규식 패턴(예: 해시태그, 멘션)을 감지하여 자동으로 스타일을 입히는 기능이 구현되어 있습니다.

4.  **입력 처리 및 IME 지원**:
    *   한글/일본어와 같은 조합형 문자(IME) 입력 시 발생하는 `composition` 이벤트를 처리하여, 입력 중인 글자가 깨지지 않도록 하는 로직이 포함되어 있습니다.

5.  **협업 준비성**:
    *   모든 변경이 `AtomicOperation` 이벤트로 발행되고, ID 기반으로 관리되므로 추후 CRDT(Conflict-free Replicated Data Type)나 OT(Operational Transformation)와 같은 실시간 협업 기술을 접목하기 용이한 구조입니다.

## 4. 데이터 흐름 (Data Flow)

1.  **User Action**: 사용자가 키보드를 누름 (`keydown`).
2.  **Event Handler**: `editor-view-dom`의 `InputHandler`가 이벤트를 감지.
3.  **Command**: 키맵에 매핑된 명령(예: `insertText`)을 실행.
4.  **Transaction**: `TransactionManager`가 트랜잭션을 시작하고 `insertText` 오퍼레이션을 기록.
5.  **DataStore Update**: `DataStore`가 오퍼레이션을 수행하여 노드 상태 변경.
6.  **Event Emission**: `editor:content.change` 이벤트 발생.
7.  **Reconciliation**: `DOMRenderer`가 변경된 모델과 현재 DOM을 비교(Diff).
8.  **DOM Update**: 변경된 부분만 실제 브라우저 DOM에 반영.

## 5. 결론 및 제언

BaroCSS 에디터 엔진은 상용 수준의 에디터(Notion, Figma Text 등)가 채택하는 고급 아키텍처 기술들을 충실히 구현하고 있습니다.

*   **장점**: 구조가 매우 체계적이며, 특히 **데이터와 뷰의 완벽한 분리**, **Fiber 기반 렌더링**은 성능과 유지보수성 측면에서 큰 강점입니다.
*   **잠재적 과제**:
    *   **Selection 동기화**: `ContentEditable`의 네이티브 커서와 가상 모델 간의 동기화는 에디터 개발의 난제입니다. 현재 `SelectionManager`와 `applyModelSelectionWithRetry` 등의 로직으로 처리하고 있으나, 다양한 브라우저 호환성 테스트가 필요할 것으로 보입니다.
    *   **복잡도**: 아키텍처가 고도화된 만큼, 새로운 기능을 추가할 때 `DSL` -> `Model` -> `Renderer` -> `View`의 흐름을 모두 이해해야 하는 진입 장벽이 있습니다.

현재 상태는 **"핵심 엔진(Core Engine)이 완성된 단계"**로 보이며, 이제 이 위에 구체적인 UI 기능(툴바, 메뉴 등)과 다양한 플러그인을 쌓아 올릴 준비가 되어 있습니다.
