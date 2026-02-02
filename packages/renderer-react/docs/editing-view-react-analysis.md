# React editing view: approach comparison and improvement options

Analysis of Barocss’s “full React tree inside contenteditable” approach vs other editors (ProseMirror, Lexical, TipTap), risks (cursor, IME, reconciliation), and concrete improvements.

**Audience**: Anyone deciding how to evolve renderer-react and editor-view-react.  
**References**: renderer-react-spec.md, editor-view-react-spec.md, docs/renderer-react-and-editor-react.md.

---

## 1. Current Barocss approach

### 1.1 Pipeline

- **Content**: Document = model tree (DataStore). On every `editor:content.change`, `EditorViewContentLayer` sets `documentSnapshot` state → React re-renders.
- **Rendering**: `ReactRenderer.build(documentSnapshot)` produces a **full ReactNode tree** (DSL → React.createElement). That tree is the **only child** of a single **contenteditable div**.
- **Selection**: Model selection is applied to DOM after render: `editor:selection.model` → `skipApplyModelSelectionToDOM` check → **requestAnimationFrame ×2** → `selectionHandler.convertModelSelectionToDOM(sel)`. DOM → model: `selectionchange` → `convertDOMSelectionToModel` → `editor.updateSelection`.
- **Input**: beforeinput/keydown → commands (replaceText, insertParagraph, …). MutationObserver → C1 classification → replaceText; optionally **skipNextRenderFromMO** so the *next* `editor:content.change` does not trigger a React refresh (data-only update; DOM already updated by user).

### 1.2 Design choices

| Choice | Rationale |
|--------|-----------|
| Full React tree inside one contenteditable | Reuse same DSL/templates as renderer-dom; one code path for “model → UI”. |
| sid as React key | Stable identity so React reuses DOM nodes and does not remount unnecessarily (reduces cursor loss). |
| data-bc-sid / data-bc-stype on every node | View layer can map model selection (sid + offset) to DOM for `convertModelSelectionToDOM`. |
| Selection apply in rAF×2 | After React has committed so DOM is stable before we set selection. |
| skipApplyModelSelectionToDOM | When selection came from DOM (e.g. user click), do not overwrite it with model selection. |
| skipNextRenderFromMO (spec) | When MO C1 path already updated model from DOM, skip one React refresh to avoid double update. |

---

## 2. How other editors handle React and contenteditable

### 2.1 ProseMirror / TipTap

- **Content DOM**: ProseMirror **owns** the contenteditable DOM. It builds and updates the DOM directly (no React for the main document content). React is used for **NodeViews** (custom nodes): TipTap’s `ReactNodeViewRenderer` wraps a React component; the **editable text** is in a slot (`NodeViewContent`) that ProseMirror fills and controls.
- **Selection**: ProseMirror keeps selection in its own state and syncs with the DOM; React does not re-render the main content on every change.
- **Implication**: No “React re-renders the whole content on every content change”; cursor/selection are not at risk from React reconciliation.

### 2.2 Lexical

- **State**: Selection is part of **EditorState** (with the node tree). Reconciliation is async (`queueMicrotask`). The editor does not treat the DOM as the source of truth for selection.
- **React**: Lexical’s React bindings render from EditorState, but the **editable content** and DOM updates are managed by Lexical, not by “React re-renders full tree on every change.”
- **Implication**: Again, the main content is not “full React tree re-rendered on every keystroke.”

### 2.3 “Full React contenteditable” (our approach)

- **Pattern**: One contenteditable div; **children = React tree** from model. Every content change → state update → React re-renders the tree.
- **Known issue (React + contenteditable)**: When React reconciles and **replaces or updates** DOM nodes inside contenteditable, the browser can **reset cursor** to start or end (especially in Safari/Firefox). Fix: (1) **Stable keys** so React reuses nodes. (2) **Restore selection after render** (e.g. rAF after commit). (3) **Avoid unnecessary full replacements** (e.g. skip refresh when only data changed and DOM already matches).
- **Our mitigations**: (1) sid as key. (2) Model → DOM selection in rAF×2. (3) skipApplyModelSelectionToDOM. (4) skipNextRenderFromMO in **spec** (not yet applied in EditorViewContentLayer — see §5).

---

## 3. Risks and where we stand

| Risk | Description | Our status |
|------|-------------|------------|
| **Cursor jump on re-render** | React updates DOM → browser moves cursor. | Mitigated by sid keys + selection apply in rAF×2. Remaining risk if keys change or structure changes in a way that forces remounts. |
| **Double refresh (MO C1)** | User types → MO sees change → replaceText → model commit → editor:content.change → React re-renders even though DOM already correct. | Spec has skipNextRenderFromMO; **content layer does not yet honor it** (§5). |
| **IME / composition** | Intermediate composition state can conflict with model/React updates. | We have isComposing and syncFocusedTextNodeAfterComposition; input-handler defers or skips during composition where needed. |
| **Performance** | Re-rendering full tree on every content change can be costly on large documents. | Same registry/tree as renderer-dom; React’s reconciliation and sid keys help. No structural “only re-render changed subtree” yet. |
| **Selection during composition** | Applying model selection in the middle of IME can break composition. | skipApplyModelSelectionToDOM and isComposing used in selection/input flow; can be tightened if we see issues. |

---

## 4. What is “good” and what differs

- **Same as others**: Model (or EditorState) as source of truth; selection represented in model/state; DOM selection synced from model after updates.
- **Different**: We render the **entire** content as a React tree inside one contenteditable; ProseMirror/Lexical do not. So we depend more on (1) **stable keys**, (2) **selection restore after render**, (3) **skipping redundant React updates** when DOM already matches (e.g. MO C1).
- **Reasonable for us**: We want one DSL and one template set for DOM and React; “full React tree in contenteditable” achieves that. The tradeoff is that we must be strict about keys, selection timing, and when we re-render.

---

## 5. Concrete improvements

### 5.1 Honor skipNextRenderFromMO in EditorViewContentLayer (recommended)

- **Spec**: “When true, next editor:content.change (from model commit during MO C1) must not trigger refresh (data-only update).”
- **Current**: EditorViewContentLayer always calls `setDocumentSnapshot(next)` on `editor:content.change`.
- **Change**: In the `editor:content.change` handler, if `viewStateRef.current.skipNextRenderFromMO` is true, do **not** call `setDocumentSnapshot`; set `skipNextRenderFromMO = false` and return. So one “data-only” content change does not trigger a React re-render and avoids cursor/selection flicker and double refresh.

### 5.2 Optional: Skip React refresh while composing

- **Idea**: If `viewStateRef.current.isComposing` is true and the event is a “text” content change (no structure change), optionally skip `setDocumentSnapshot` until compositionend. Reduces chance of React replacing DOM during IME.
- **Tradeoff**: Snapshot can lag by one composition; only worth it if we observe IME issues.

### 5.3 E2E: Cursor and selection stability

- Add E2E (e.g. in editor-react): type in the middle of a paragraph, apply bold, insert new line; assert DOM selection (or cursor offset) stays correct. Catches regressions in keys, selection apply timing, or skipNextRenderFromMO.

### 5.4 Document and tests

- Document in editor-view-react-spec that “full React tree in contenteditable” is intentional and that sid keys + rAF×2 + skip flags are the mitigations.
- Add a unit test (or spec verification) that when `skipNextRenderFromMO` is true, the content layer does not update documentSnapshot on the next editor:content.change (after implementing §5.1).

---

## 6. What not to change (without strong reason)

- **renderer-react**: Stays “model + registry → ReactNode” only. No selection or DOM logic there.
- **Selection flow**: Model → DOM only after render (rAF×2); DOM → model on selectionchange. Keep this split.
- **One contenteditable div**: Changing to “many small contenteditable” or ProseMirror-style “editor-owned DOM with React only for NodeViews” would be a large architectural change; only consider if cursor/IME/performance remain unsolved after §5.

---

## 7. References

- renderer-react: `packages/renderer-react/docs/renderer-react-spec.md`
- editor-view-react: `packages/editor-view-react/docs/editor-view-react-spec.md`
- Design: `docs/renderer-react-and-editor-react.md`
- Cursor/React: e.g. “React contenteditable cursor jumps” (Stack Overflow); Lexical selection docs; ProseMirror NodeViews with React (TipTap).

---

## 8. Full tree build vs partial update (현재 방식의 구조)

### 8.1 우리가 매번 "처음부터 끝까지" 만드는가?

**예.** 현재 구조는 다음과 같다.

1. **상태**: `EditorViewContentLayer`에 **문서 전체**를 나타내는 `documentSnapshot` 하나만 있다. `editor:content.change`가 올 때마다 (skipNextRenderFromMO가 아닌 경우) `setDocumentSnapshot(next)`로 이 값을 갱신한다.
2. **빌드**: `content = useMemo(() => renderer.build(documentSnapshot), [documentSnapshot, renderer])`이므로, `documentSnapshot`이 바뀔 때마다 **루트부터** `buildToReact(registry, model.stype, model)`이 한 번 호출된다.
3. **재귀**: `buildToReact` 안에서 `slot('content')`를 만나면 `model.content`의 **모든 자식**에 대해 `buildToReact(registry, child.stype, child)`를 호출한다. 즉, **모든 노드를 한 번씩 순회**하며 `React.createElement`를 호출해 **전체 React 엘리먼트 트리**를 매번 새로 만든다.
4. **메모이제이션 없음**: "이 노드만 바뀌었으니 이 서브트리만 다시 만들자" 같은 로직은 없다. 항상 루트 → 자식 → … 순으로 **전체 트리 생성**이다.

정리하면, **콘텐츠가 바뀔 때마다 "처음(루트)부터 끝(모든 리프)까지" 한 번 더 만드는 방식**이 맞다.

### 8.2 그럼 "중복 렌더링"이 있나?

- **DOM이 두 번 그려지는가?**  
  아니다. React는 가상 트리를 한 번 만들고, 이전 트리와 diff한 뒤 **바뀐 부분만** DOM에 반영한다. 그래서 "화면이 두 번 그려지는" 식의 중복은 없다.

- **그래도 "중복"이라 부를 수 있는 부분**  
  - **트리 생성**: 변경된 노드가 한 개여도, **전체 문서 트리**에 대해 `buildToReact`가 돌고, 모든 노드에 대해 `createElement`가 호출된다. (노드 수 N이면 O(N) 작업.)
  - **React 리콘실리**: 새 트리와 이전 트리를 **전체** 비교한다. `key={sid}` 덕분에 "어떤 게 같은 노드인지"는 빠르게 알 수 있어서, 실제 DOM 조작은 "바뀐 노드만"일 수 있지만, **비교 자체**는 트리 전체를 돈다.

즉, "화면 중복 렌더"가 아니라 **"한 번의 content 변경에 대해, 트리 전체를 다시 만들고 전체를 diff한다"**는 의미에서 **작업량이 중복**된다고 보는 게 맞다. 문서가 크면 클수록, 한 글자만 바꿔도 **전체 트리 생성 + 전체 diff** 비용이 든다.

### 8.3 구조적으로 더 알아두면 좋은 것

- **상태 위치**: 지금은 "문서 전체"가 **한 덩어리 상태**로 루트(ContentLayer)에 있다. 그래서 어떤 노드가 바뀌어도 **그 상태가 바뀌는 것**이라, React 입장에서는 "루트가 바뀌었다"고 보고, 루트가 리렌더되면서 **항상 전체 트리를 다시 만든다**.
- **ProseMirror와의 차이**: ProseMirror는 "이 노드만 바뀌었다"는 정보를 알고, **그 노드에 해당하는 DOM만** 갱신한다. 우리는 그 단위(노드 단위 갱신)가 없고, "문서 전체 스냅샷" 단위로만 갱신한다.
- **React만으로 부분 갱신을 하려면**: "문서 전체"를 루트 상태로 두지 않고, **노드별로 구독 단위를 나누거나**, **바뀐 노드만 선택적으로 리렌더**되게 해야 한다. 그게 아래 §9의 "노드 단위 구독" 패턴이다.

---

## 9. ProseMirror처럼 "노드 단위"로 렌더링 제어를 할 수 있나? (React로 가능한가)

### 9.1 가능하다

React만으로도 **"이 노드만 바뀌었을 때 이 노드에 해당하는 컴포넌트만 다시 그리기"**를 만들 수 있다. 핵심은 **상태/구독 단위를 "문서 전체"가 아니라 "노드(sid) 단위"로 쪼개는 것**이다.

### 9.2 패턴: 노드 단위 구독 (Per-node subscription)

- **저장소**: 문서를 "노드 ID(sid) → 그 노드의 데이터" 형태로 둔다.  
  - 예: `getNode(sid)`로 노드 데이터 조회,  
  - `subscribe(callback)`에서 "어떤 sid가 바뀌었는지"만 알려주거나,  
  - React 18 `useSyncExternalStore`에 넣을 수 있는 "스토어" 형태.
- **노드 컴포넌트**: `NodeView(sid)` 같은 컴포넌트가 **그 sid 하나만** 구독한다.  
  - 예: `useSyncExternalStore(store, () => store.getNode(sid), getServerSnapshot)`  
  - 또는 "이 sid가 바뀌었을 때만 알림 받는" 훅/컨텍스트.
- **트리 구조**: 루트는 "문서 루트 sid"와 "그 자식들"만 알고, 각 자식에 대해 `NodeView(childSid)`만 렌더한다.  
  - 루트는 "자식 sid 목록"만 구독하면 되고,  
  - 각 `NodeView(sid)`는 **자기 노드(sid) 데이터**만 구독한다.
- **결과**: 특정 sid의 데이터(텍스트, 속성, 자식 등)가 바뀌면, **그 sid를 구독하는 컴포넌트만** 리렌더된다. 다른 노드는 구독 데이터가 안 바뀌었으므로 리렌더되지 않는다. → **ProseMirror처럼 "변경된 노드에 해당하는 부분만" 렌더링을 제어**하는 효과를 낼 수 있다.

### 9.3 우리 쪽에 필요한 구조적 요소

| 필요한 것 | 설명 |
|-----------|------|
| **노드 단위 읽기** | `editor`/DataStore에 이미 있는 `getNode(sid)`로 "한 노드 스냅샷"을 읽을 수 있으면 됨. |
| **"어떤 sid가 바뀌었는지" 알림** | `editor:content.change`에 "바뀐 sid 목록"을 붙이거나, 별도 이벤트(`editor:node.change`, payload: `{ sid }`)를 두어, 스토어가 "이 sid가 갱신됐다"고 구독자에게만 알려주게 함. |
| **스토어 형태** | `getNode(sid)` + `subscribe(listener)`를 제공하는 레이어. listener는 "sid 집합이 바뀌었다" 정도만 받아도 됨. React 18이면 `useSyncExternalStore(store.getNode(sid), store.subscribe)` 같은 형태로 "이 sid만 구독" 가능. |
| **트리 구조 정보** | 각 노드의 `content`(자식 sid 배열)는 `getNode(sid).content`로 알 수 있으면 됨. 루트는 "문서 루트 sid"와 "그 자식들"만 알면 되고, 각 `NodeView(sid)`는 자기 `model.content`에 대해 `NodeView(childSid)`만 나열하면 됨. |
| **렌더링 로직** | `NodeView(sid)` 안에서는 지금의 `buildToReact(registry, model.stype, model)`를 **그 노드 하나**에만 적용하면 됨. DSL/템플릿은 그대로 쓸 수 있음. |

즉, **지금의 "한 번에 전체 트리 만드는" 로직을 "한 노드만 받아서 그 노드 서브트리만 만드는" 함수로 그대로 쓰고**, **호출하는 쪽만** "전체 스냅샷 상태 한 번"이 아니라 "노드별 구독 + 노드별 컴포넌트"로 바꾸면 된다.

### 9.4 트레이드오프

- **장점**: content가 바뀔 때 **실제로 바뀐 노드에 해당하는 컴포넌트만** 리렌더되므로, 큰 문서에서 **트리 생성/리콘실리 비용이 "바뀐 노드 수"에 비례**하게 줄어든다. ProseMirror에 가까운 "노드 단위 렌더 제어"가 가능해진다.
- **단점**:  
  - "어떤 sid가 바뀌었는지"를 모델/트랜잭션 쪽에서 알려줘야 하므로, 이벤트/스토어 설계가 필요하다.  
  - 기존 "한 스냅샷으로 전체 트리 만든다"는 단순 구조에서, "노드별 구독 + NodeView(sid)" 구조로 바뀌므로 코드 구조 변경이 있다.  
  - 디버깅 시 "지금 어떤 노드가 리렌더됐는지"를 추적하는 게 조금 더 중요해진다.

### 9.5 정리

- **현재**: 매 content 변경마다 **전체 트리를 처음부터 끝까지 다시 만들고**, React가 **전체 트리를 diff**한다. DOM 갱신은 key 덕분에 최소화되지만, **연산량은 노드 수에 비례**한다.
- **React만으로 ProseMirror 스타일 제어 가능 여부**: **가능하다.** "노드 단위 구독 + NodeView(sid)" 패턴으로 가면, **바뀐 노드에 해당하는 부분만** 다시 그리도록 제어할 수 있다.
- **도입 시점**: 문서가 작으면 현재 방식만으로도 충분할 수 있다. 문서가 커서 "한 글자 바꿀 때마다 전체 트리 생성이 부담"이 되는 시점에, §9의 노드 단위 구독 구조를 검토하면 된다.
