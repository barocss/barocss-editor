## Reconcile Concepts and Rules

- VNode domain
  - VNode tree is pure model + DSL output.
  - No decorators are embedded in the VNode tree. Marks may wrap text but are rendered as part of normal elements.

- Decorators
  - Decorators are rendered after content and anchored to existing DOM elements or ranges.
  - Decorator DOM is managed in separate layers/containers and is not part of the main VNode reconcile.

- Portals
  - Portal content renders to an external target container (e.g., document.body or a provided element).
  - The VNode reconcile for the main tree should not move portal content; only the placeholder/host remains in the main tree.

- DOM order and stability
  - Minimal-change principle: reuse existing DOM nodes whenever possible.
  - Movement is performed with insertBefore to achieve target order; avoid detach/reattach when not strictly needed.
  - Explicit deletions only; never remove due to mere reordering.

---

## WIP-based Reconcile Algorithm (authoritative)

Goal: Decide DOM mutations using only prevVNode ↔ nextVNode, with a Work-In-Progress (WIP) tree as the sole state carrier. DOM is only the sink for finalization, never the source of truth for comparisons.

### Data structures
- WIP node
  - fields: vnode, previousVNode, domNode, parent, children: WIP[]
  - flags: needsUpdate, isRendered, toDelete?
  - ordering: orderIndex (position among parent’s next children)
- Root
  - Single WIP that corresponds to nextVNode root; forms a tree by nested `children` references

### Phases
1) Build WIP (tree construction)
   - Input: prevVNode, nextVNode
   - For each next child:
     - Match to previous child
       - keyed: same key → match
       - unkeyed: heuristic (same tag + text) or fallback by position
     - Create child WIP: set `previousVNode`, link `parent`
     - Set `orderIndex` to next child’s index
     - If a matched prev had a DOM node previously, carry it via WIP resolution (not by querying DOM)
   - For prev children missing in next and having a key: create minimal WIP and mark `toDelete = true`

2) Process WIP (content planning)
   - For each WIP: decide attrs/text/children changes vs previousVNode
   - Do not mutate DOM; compute work only
   - Mark `needsUpdate` when any change exists

3) Execute (finalize DOM updates)
   - Traverse WIP tree top-down. For each parent WIP:
     - Create a stable list: `childrenSorted = children.filter(!toDelete).sort(by orderIndex asc)`
     - For each child in childrenSorted:
       - Ensure child.domNode exists (create if needed)
       - Compute reference:
         - If first child: `ref = parent.domNode.firstChild` (or null → append)
         - Else: `ref = previousSibling.domNode.nextSibling` (sibling from childrenSorted order)
       - Insert: `parent.domNode.insertBefore(child.domNode, ref)`
         - This achieves correct ordering without inspecting existing DOM contents
       - Apply attrs/text mutations computed in Process phase
     - Deletions: for `toDelete` children, if `child.domNode` exists under `parent.domNode`, remove it
   - Root WIP:
     - If new: append root.domNode to container
     - If updated: keep identity; apply mutations; children finalize handles order

### Matching rules
- Keyed match takes precedence
- Unkeyed match favors stable reuse by position; falls back to heuristic (same tag + text)
- No DOM queries; matches only via WIP links built from prev/next

### Ordering rules
- Order derives solely from `orderIndex` on each child WIP (source: nextVNode.index)
- Finalize in `orderIndex` ascending; reference sibling is the previous child’s domNode.nextSibling
- No tail-trim by DOM counting; the childrenSorted pass defines the exact end state

### Deletion rules
- Keyed child missing in next: `toDelete = true` and remove during finalize
- Unkeyed tail shrink: not needed; childrenSorted defines final set; anything not in it isn’t appended/retained

### Invariants and guards
- Never read container/parent.childNodes to decide diff
- Never rely on existing DOM order to compute order; use `orderIndex` only
- Cycle/dup guards in finalize:
  - Skip if child.domNode.contains(parent.domNode)
  - Skip duplicate appends; identity is WIP.domNode

### Idempotency
- Running reconcile twice with the same nextVNode yields the same DOM identity and order
- Portals/decorators remain managed in their own layers and do not affect main reconcile

---

## Practical notes
- Component/portal managers attach their own DOM to their target containers; main reconcile is unaffected
- Decorator rendering must not mutate main content order; it should render to dedicated layers after finalize
- Tests should validate:
  - Keyed reorder without detach
  - Unkeyed index-based reuse
  - Explicit keyed deletion only
  - Double reconcile identity preservation

---

## Terminology
- RenderUnit: This document refers to the per-node reconcile unit as RenderUnit.
  - In code, RenderUnit maps to the type `DOMWorkInProgress`.
  - Fields referenced as `wip.*` correspond to `renderUnit.*` conceptually.

---

## WIP Node Relationships (structure map)

- Identity
  - Each WIP corresponds 1:1 to a nextVNode (root included).
  - `wip.previousVNode` links to matched prev (if any), used only for diffing.

- Hierarchy
  - `wip.parent: WIP | null` — parent WIP (null for root).
  - `wip.children: WIP[]` — nextVNode.children와 동일한 트리 구조(순서는 orderIndex로 동일).

- Ordering
  - `wip.orderIndex: number` — 부모의 next children에서의 위치(0..n-1).
  - 형제 순회는 항상 `orderIndex` 오름차순으로 수행.

- DOM binding (sink only)
  - `wip.domNode: Node | null` — 이 WIP가 소유하는 실제 DOM 노드(없으면 finalize에서 생성).
  - finalize 전에는 DOM을 소스로 사용하지 않으며 쿼리하지 않는다.

- Lifecycle flags
  - `wip.needsUpdate: boolean` — attrs/text/children 변경이 감지된 경우.
  - `wip.isRendered: boolean` — Process 단계 완료 표식.
  - `wip.toDelete?: boolean` — prev에는 존재하나 next에는 없는 keyed child를 제거 대상으로 표시.

- Data flow per phase
  1) Build: prev/next 매칭 → 트리 연결(parent/children) → orderIndex 부여 → toDelete 마킹
  2) Process: attrs/text/children 변경 계산 → needsUpdate 설정(단, DOM 미접근)
  3) Finalize: 부모 단위로 children을 orderIndex 정렬 →
     - ensure domNode (없으면 생성)
     - 이전 형제 domNode 기반으로 insertBefore 계산(첫 자식은 부모의 첫 위치로)
     - needsUpdate인 경우 attrs/text 적용
     - toDelete인 keyed 노드는 해당 domNode를 제거

- Guarantees
  - 부모-자식-형제 관계와 orderIndex만으로 최종 DOM 상태가 결정된다.
  - 동일 부모의 형제 순서는 children 배열과 orderIndex에서 유도되며, 기존 DOM 순서에 의존하지 않는다.
  - 재사용(identity)은 오직 `wip.domNode`를 통해 보장된다.

---

## Implementation Mapping (modules ↔ concepts)

- DOMReconcile (packages/renderer-dom/src/dom-reconcile.ts)
  - Owns root WIP creation and lifecycle
  - Orchestrates phases: Build → Process → Execute(finalize)
  - Passes work to managers: WorkInProgressManager, ComponentManager, PortalManager, DOMOperations

- WorkInProgressManager (packages/renderer-dom/src/work-in-progress-manager.ts)
  - Builds the WIP tree from nextVNode (link parent/children, carry previousVNode)
  - Assigns orderIndex to each child WIP (from next children order)
  - Schedules processing (needsUpdate) and executes finalize in parent→children order
  - Ensure finalize runs with siblings sorted by orderIndex (enforced at execute time)

- KeyBasedReconciler (packages/renderer-dom/src/key-based-reconciler.ts)
  - Computes prev↔next matching (keyed first, then heuristic) without reading DOM
  - Creates/updates child WIPs and sets `desiredIndex`/`orderIndex`
  - Marks prev-only keyed nodes as `toDelete` (no DOM operations here)

- DOMOperations (packages/renderer-dom/src/dom-operations.ts)
  - Creates element nodes with correct namespace and attributes
  - Finalize logic:
    - For each child WIP (already ordered): ensure domNode
    - Insert by `insertBefore` using prior sibling domNode.nextSibling (or first position)
    - Apply attrs/text mutations
    - Remove if `toDelete`
    - Guards: cycle/duplicate append checks

- ComponentManager (packages/renderer-dom/src/component-manager.ts)
  - Finalize for components:
    - insert: mount → returns root element bound to WIP.domNode
    - update: update instance with prev/next props
    - remove: unmount and clean DOM it owns

- PortalManager (packages/renderer-dom/src/portal-manager.ts)
  - Finalize for portals:
    - insert/update: render content to target container (external to main tree)
    - remove: cleanup from target
  - Main tree contains only the portal host/placeholder

- Display/Decorator renderers
  - Render to dedicated layers after main finalize
  - Must not alter main content order; managed independently of WIP tree

- Guarantees in code
  - No DOM queries to compute diff/order in KeyBasedReconciler
  - Only finalize touches DOM; DOM is never the source of truth
  - Order comes from WIP.orderIndex; identity from WIP.domNode
