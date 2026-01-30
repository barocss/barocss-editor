# 입력·동기화·IME 점검 (Input, DOM–Model Sync, Composition)

네 가지 관점에서 현재 BaroCSS 에디터의 입력/동기화/IME 처리를 점검하고, 현대 에디터·스펙·브라우저 이슈를 반영한 개선 방향을 정리한다.

---

## 1. 브라우저가 DOM을 임의로 변경한 뒤, 우리 렌더 구조와 다를 수 있음 → model 동기화 방식 재검토

### 현재 BaroCSS

- **beforeinput**에서 `insertText` / `insertReplacementText`는 **preventDefault 하지 않음**. 브라우저가 먼저 DOM을 수정한다.
- **MutationObserver**가 변경된 DOM을 감지한 뒤 `handleTextContentChange` / `handleDomMutations`(C1/C2/C3/C4)에서 **변경된 노드**를 보고 model을 갱신한다.
- **문제**: 브라우저가 만든 DOM 구조(예: 새 text node, wrapper div, 빈 span 병합 등)는 우리가 렌더한 구조(`data-bc-sid` 붙은 span, 마크별 자식)와 다를 수 있다. 그 상태에서 "어떤 DOM 노드 = 어떤 model 노드"를 **closest('[data-bc-sid]')** 로만 추론하면:
  - 브라우저가 **새로 만든 노드**에는 `data-bc-sid`가 없어 **untracked**로 빠지거나,
  - **여러 model 텍스트가 한 엘리먼트로 합쳐진 경우** 하나의 sid만 잡혀 잘못된 범위로 model을 갱신할 수 있다.

### 현대 에디터·스펙의 접근

- **InputEvent.getTargetRanges()** (Input Events Level 2): `beforeinput` 시점에 **“이벤트가 취소되지 않을 때 영향받을 DOM 범위”**를 **브라우저가 알려준다**. DOM을 직접 수정하기 **전**이므로, 이 범위를 model 좌표로 변환해 **preventDefault + model 반영 + 우리가 DOM 갱신**하는 식으로 쓸 수 있다.
- **Lexical / ProseMirror**: “DOM이 먼저 바뀌고 그걸 따라간다”보다는 **beforeinput에서 막고, model을 source of truth로 갱신한 뒤, view가 그 model을 반영**하는 쪽에 가깝다. DOM 구조는 우리가 제어한다.
- **EditContext API**: contenteditable 대신 별도 편집 표면을 두고, 입력/IME를 우리 제어 하에 두는 방향이다.

### 정리

- **DOM이 먼저 바뀌는 현재 방식**은 “브라우저가 만든 구조 ≠ 우리 렌더 구조”일 때 **model 동기화가 애매해질 수 있다**는 지적이 타당하다.
- **개선 방향**:  
  - **beforeinput**에서 `insertText` / `insertReplacementText` 등에 대해 **getTargetRanges()**로 영향 범위를 얻고,  
  - 그 범위를 **model selection/range**로 변환한 뒤 **preventDefault** 하고,  
  - **model만 갱신**(replaceText 등)하고 **우리 render 경로**로만 DOM을 갱신하면, “브라우저 임의 DOM”에 의존하지 않게 된다.  
  - (undo/redo는 브라우저 스택 대신 자체 history로 처리하는 전제.)

---

## 2. iOS Safari 등에서 composition 이벤트 이후 beforeinput/input이 발생해 isComposing이 불안정함

### 브라우저/스펙 이슈

- **Safari (macOS)**: `compositionend`와 `keydown`/`input` 순서가 스펙과 다르고, **compositionend 이후**에 `input`이 오는 경우가 있어, 그 시점의 `event.isComposing`은 이미 `false`인 경우가 많다. 그래서 **isComposing만으로는 “지금 조합 중인 입력인지”를 신뢰하기 어렵다**는 보고가 있다.
- **keyCode 229**: IME가 키를 가로챌 때 `keydown`에 `keyCode === 229`가 오는 경우가 많다. Safari 등에서 **“지금 IME가 처리 중이다”**를 감지하는 **보조 수단**으로 keyCode 229를 쓰는 구현이 있다.
- **W3C / 브라우저별**: `compositionend`와 `input`의 순서가 브라우저마다 다르고, 스펙 논의도 계속되고 있다.

### 현재 BaroCSS

- **beforeinput**의 `event.isComposing`으로만 조합 상태를 갱신하고, compositionstart/end 리스너는 사용하지 않는 구현이다.
- 따라서 Safari 등에서 **compositionend 뒤에 오는 beforeinput/input**은 `isComposing === false`로 처리되어, **조합이 끝난 직후의 입력을 “일반 입력”으로 잘못 분류**하거나, **render를 건너뛰지 않아** 조합이 깨질 수 있다.

### 개선 방향

- **조합 상태를 “beforeinput isComposing” 단일 신호가 아니라, 여러 신호를 조합해 추정**하는 쪽이 안전하다:
  - **compositionstart** → 조합 시작 플래그 켬.
  - **compositionend** → 조합 종료 플래그를 켜고, **짧은 시간(예: 50~100ms) 동안** “방금 조합이 끝났다”는 상태 유지. 이 구간에 오는 beforeinput/input은 **조합 종료 직후**로 간주하고, **model 반영/렌더 정책**을 조합 종료와 동일하게(예: 한 번만 반영, render 지연 등) 처리.
  - **keydown keyCode === 229** → IME가 키를 처리 중일 가능성이 높으므로, **해당 keydown 이후 일정 시간**은 “IME 관련 입력”으로 간주하고, **model 반영/렌더**를 보수적으로 처리(예: 바로 render 하지 않기).
- **beforeinput.isComposing**은 유지하되, **“true이면 조합 중”**으로만 쓰고, **“false여도 방금 compositionend였거나 keyCode 229 직후면 조합 관련으로 취급”**하는 식으로 보완하면, Safari에서도 더 안정적으로 동작할 수 있다.

---

## 3. 현대 contenteditable 에디터들이 이 문제를 어떻게 풀었는지 구조

### 요약

| 접근 | 대표 | 핵심 |
|------|------|------|
| **beforeinput + preventDefault** | Lexical, (ProseMirror 일부) | 텍스트/삽입은 beforeinput에서 막고, **model만 갱신** 후 **자체 render**. DOM 구조를 우리가 통제. |
| **getTargetRanges()** | Input Events Level 2, MDN 예제 | **DOM이 바뀌기 전**에 “영향받을 범위”를 받아서, **model 좌표로 변환 → preventDefault → model 반영**. |
| **compositionstart/end + 타이밍** | 여러 구현 | **isComposing만 믿지 않고**, composition 이벤트와 **타이머/플래그**로 “조합 중/직후” 구간을 정의. |
| **keyCode 229** | Safari 등 IME 이슈 대응 | **keydown 229**를 “IME 처리 중” 보조 지표로 사용. |
| **EditContext API** | (차세대) | contenteditable 대신 **별도 편집 컨텍스트**로 입력/IME를 받아, DOM과 완전 분리. |

### BaroCSS에 적용할 수 있는 구조

- **입력 경로**:  
  - **beforeinput**에서 `getTargetRanges()`(지원 시)로 대상 범위를 얻고,  
  - **model range**로 변환 가능하면 **preventDefault** 후 **replaceText(또는 delete+insert)** 로만 model 갱신.  
  - **우리 render**만 DOM을 갱신 → “브라우저가 만든 DOM 구조”에 의존하지 않음(1번 해소).
- **조합(IME)**:  
  - **compositionstart/end** 다시 사용 + **“조합 종료 직후” 구간** 플래그/타이머.  
  - **keyCode 229**로 IME 구간 보조 감지.  
  - **isComposing**은 참고만 하고, “조합 중/직후”는 **복합 조건**으로 판단 → Safari 등에서도 안정화(2번 해소).

---

## 4. 모델과 렌더가 1:1이 아님(하나의 model 노드 → 여러 자식 DOM) → 글자 입력을 “어디에” 반영할지

### 현재 BaroCSS

- **한 개의 model inline-text 노드**가 **마크/데코레이터** 때문에 **여러 자식 요소**(span 등)로 렌더될 수 있다. 즉 **하나의 model 노드 ↔ 여러 DOM 노드**.
- **MutationObserver**는 **characterData** 변경이 난 **DOM 노드**를 알려준다. 그 노드에서 **closest('[data-bc-sid]')**로 **어느 model 노드인지** 찾고, 그 **model 노드 전체 텍스트**를 기준으로 **handleEfficientEdit** 등으로 diff 해서 반영한다.
- **문제**:  
  - 브라우저가 **우리 span 구조를 깨고** (예: 텍스트만 있는 새 노드 생성, span 병합/분리) 변경하면, **같은 model 노드 안의 “어느 offset”이 바뀌었는지**를 DOM 구조만으로는 정확히 알기 어렵다.  
  - **여러 DOM 텍스트가 하나의 model 텍스트에 대응**하는데, “지금 변경은 그 중 어디에 해당하는지”를 **beforeinput 시점의 범위**로 알면 훨씬 명확하다.

### getTargetRanges()와의 연결

- **beforeinput** 시점에는 **아직 DOM이 바뀌지 않았다**.  
  **getTargetRanges()**는 “이 입력이 적용되면 **어느 DOM 범위**가 바뀔지”를 **StaticRange 배열**로 준다.
- 이 **StaticRange**를 **우리 selection/position 매핑**(DOM offset ↔ model node+offset)으로 변환하면, **“어느 model 노드의 어느 offset~offset”에 삽입/치환이 일어날지**를 **DOM 구조가 깨지기 전에** 알 수 있다.
- 그러면 **preventDefault** 후 **그 model 범위에만** replaceText(또는 delete+insert)를 적용하면, **“하나의 model 노드 → 여러 DOM 자식”** 구조에서도 **글자 입력을 올바른 model 위치에만** 반영할 수 있다(4번 해소).

### 정리

- **DOM이 이미 바뀐 뒤**에 “어디가 바뀌었는지”를 **DOM만 보고** 추론하는 현재 방식은, **model–DOM이 1:1이 아닐 때** 오차가 날 수 있다.
- **beforeinput + getTargetRanges()**로 **영향받을 범위를 먼저** 받고, **그 범위를 model 좌표로만 해석**해서 **model만 수정**하고 **우리 render**로 DOM을 다시 그리면, **“여러 자식 DOM = 하나의 model”** 구조에서도 **입력을 올바른 model 위치에** 반영할 수 있다.

---

## 5. 이미 변경된 DOM이 우리 구조와 다를 때 어떻게 대응할지

**상황**: 브라우저가 이미 DOM을 수정했고, 그 결과가 우리가 렌더한 구조(`data-bc-sid`, 마크별 span 등)와 다르다.  
예: 새 text node만 생김, 빈 span 제거, div/span이 우리 템플릿과 다른 계층으로 바뀜.

### 5.1 감지(Detection)

**우리가 이미 쓰는 신호**

- **`resolveModelTextNodeId(target) === null`**  
  변경이 난 노드에서 `closest('[data-bc-sid]')`로 올라가도 sid가 없음 → **untracked**.  
  현재는 `editor:input.untracked_text` emit 후 **model 갱신·동기화를 하지 않음**.
- **C1/C2 분류 실패**  
  `classifyDomChange`에서 “이 mutation을 우리가 아는 케이스(C1/C2/C3/C4)”로 매핑하지 못하면 **UNKNOWN** 등으로 빠짐.

**추가로 쓸 수 있는 감지**

- **구조 검사**: contenteditable 루트 아래를 순회해, “우리가 그린 트리”와 비교.
  - 예: **inline-text에 해당하는 영역** 안에 **`data-bc-sid`가 없는 요소**가 섞여 있는지,  
  - 또는 **같은 sid를 가진 요소가 여러 개**인지(브라우저가 복제·이동했을 수 있음).
- **텍스트 일치 여부**: 특정 sid에 대해 **model.text**와 **reconstructModelTextFromDOM(해당 엘리먼트)** 결과가 다르면, “이미 DOM이 우리가 기대하는 구조/내용이 아님”으로 볼 수 있음.  
  (다만 “다름”이 “브라우저가 바꾼 것”인지 “아직 동기화 안 된 것”인지는 타이밍에 따라 구분 필요.)
- **MutationRecord 내용**: `addedNodes`에 **data-bc-sid가 없는** element가 들어오면 “브라우저가 새로 만든 구조”로 간주.

정리하면, **“DOM이 우리 구조와 다르다”**는 다음처럼 정의할 수 있다.

- 변경이 난 노드가 **어느 model 노드(sid)에도 매핑되지 않음**(untracked), 또는  
- **매핑은 되지만** 그 sid 아래 DOM이 **우리 템플릿/렌더 규칙과 맞지 않음**  
  (예: sid 하나인데 자식이 우리가 그리지 않은 태그/계층이거나, reconstruct 결과가 model과 불일치).

### 5.2 대응 전략(Response) 옵션

**A. 그대로 두고 model만 갱신하지 않음 (현재 untracked 동작)**

- **동작**: DOM은 브라우저가 바꾼 그대로 두고, **model은 건드리지 않음**.  
  `editor:input.untracked_text` 등으로 “여기서는 동기화 포기”만 알림.
- **장점**: 잘못된 model 갱신으로 인한 데이터 오염을 막을 수 있음.
- **단점**: **model과 DOM이 계속 어긋남**. 이후 우리가 **render()**를 호출하면(다른 이유로) **model 기준으로 다시 그리면서 사용자가 입력한 내용이 사라질 수 있음**.

**B. 해당 구간만 model 기준으로 다시 그리기 (Re-render from model)**

- **동작**: “이 DOM은 우리 구조가 아니다”라고 판단된 **구간(블록 또는 특정 sid)**에 대해, **model을 그대로 두고** 그 부분만 **우리 render**로 다시 그림.
- **전제**: 그 구간의 **model이 이미 올바르다**고 가정.  
  즉, **그 입력은 beforeinput 등으로 이미 model에 반영되었다**거나, **반영할 수 없으니 버린다**는 전제.
- **장점**: DOM을 다시 “우리 구조”로 맞출 수 있음.
- **단점**: **model에 반영되지 않은 입력**이 있었다면 **그 내용이 덮어씌워져 사라짐**.  
  그래서 “DOM이 다르다”고 감지했을 때 **무조건** re-render하면 위험.  
  **model이 최신인 경우에만** (예: 방금 우리가 model 갱신 후 skipRender로 render만 안 한 경우) 선택하는 게 안전함.

**C. DOM에서 “최선의 추정”으로 model 갱신한 뒤, 우리 구조로 다시 그리기 (Best-effort DOM→model 후 re-render)**

- **동작**:  
  1) **브라우저가 만든 DOM**에서 텍스트/구조를 읽어, **휴리스틱**으로 “어느 model 노드의 어느 범위가 바뀌었을지” 추정.  
  2) 그 추정으로 **model을 한 번 갱신** (replaceText 등).  
  3) **그 다음** 그 구간을 **model 기준으로 re-render**.
- **장점**: 사용자 입력을 **완전히 버리지 않고** model에 남기려 할 수 있음.
- **단점**:  
  - 휴리스틱이 잘못되면 **model이 잘못 갱신**되고, 그대로 re-render되면 **잘못된 내용이 고정**됨.  
  - “어느 sid의 어느 offset인지”를 **구조가 깨진 DOM**에서 추론하는 것이 **복잡하고 브라우저별로 다름**.  
  - IME 조합 중이면 **중간 상태**를 model에 넣을 위험도 있음.

**D. 전체 편집 영역을 model 기준으로 한 번에 다시 그리기 (Full re-render from model)**

- **동작**: “DOM이 우리 구조와 다르다”가 **여러 구간**이거나 **경계가 불명확**할 때, **contenteditable 전체**를 **현재 model** 기준으로 **한 번에 render**하고, **selection만 DOM에서 읽어서 복원**.
- **전제**: **model이 이미 올바른 source of truth**이거나, **어긋난 부분은 포기**한다.
- **장점**: 구현이 단순하고, DOM을 **완전히 우리 구조**로 되돌릴 수 있음.
- **단점**:  
  - **model에 반영되지 않은 입력**이 있으면 **사라짐**.  
  - **전체 re-render**는 비용이 크고, **포커스/selection/IME**가 깨질 수 있음.  
  - 그래서 **일상적인 입력 경로**로 쓰기보다는 **“동기화가 완전히 꼬였을 때의 비상 수단”**으로 두는 게 맞음.

**E. DOM만 “우리 구조”에 가깝게 고치기 (DOM 정규화만, model은 별도)**

- **동작**: model은 건드리지 않고, **DOM만** “우리가 기대하는 형태”로 **정규화**.  
  예: `data-bc-sid` 없는 텍스트 노드를 **알맞은 span으로 감싸기**, 빈 span 제거, 잘못된 중첩 풀기 등.
- **장점**: **사용자가 입력한 텍스트**는 DOM에 그대로 두고, **구조만** 우리 쪽에 맞출 수 있음.
- **단점**:  
  - “알맞은 span”이 **어느 model 노드(sid)**인지는 **DOM만으로는 모호**할 수 있음.  
  - 정규화 후에도 **model과 DOM의 대응**을 어떻게 유지할지**(동기화)**를 또 풀어야 함.  
  - 결국 **정규화한 DOM을 다시 model에 반영**하는 단계가 필요해, **C와 비슷한 난이도**가 됨.

### 5.3 정리: 어떤 전략을 언제 쓰면 좋은지

- **근본적으로 줄이고 싶은 것**: “브라우저가 DOM을 먼저 바꿔서 구조가 달라지는 상황” 자체.  
  → **beforeinput + getTargetRanges() + preventDefault**로 **가능한 입력은 DOM을 건드리지 않고** model만 갱신하고 우리가 render.  
  그러면 “이미 바뀐 DOM이 우리 구조와 다르다”는 경우가 **폐스트, 드래그 등 제한된 경로**에서만 발생하게 할 수 있음.

- **그래도 발생했을 때(폐스트, 구형 브라우저, getTargetRanges 실패 등)**:
  - **우선**: **해당 mutation/구간만** “우리 구조가 아니다”로 **감지**하고, **model은 갱신하지 않음**(현재 untracked와 유사).  
    그대로 **re-render만 하면** 사용자 입력이 사라질 수 있으므로, **re-render는 하지 않음**.
  - **선택 1 – 비상 복구**: 사용자 액션(예: “포커스 잃었다가 다시 들어옴”) 또는 **주기적 검사**에서 “contenteditable 내부에 untracked/구조 불일치가 많다”고 판단되면, **그때만** **model을 기준으로 전체(또는 해당 블록) re-render**하고 selection 복원.  
    “일상 입력” 경로에서는 가급적 **re-render를 자동으로 하지 않음**.
  - **선택 2 – 제한적 best-effort**: **untracked가 난 직후**이고 **조합 중이 아닐 때**만, **해당 노드의 부모/형제 중 우리 sid가 있는 구간**을 기준으로 “여기에 삽입된 텍스트”를 **한 번만** model에 반영 시도하고, **성공하면** 그 구간만 우리 구조로 re-render.  
    실패하거나 애매하면 **model은 건드리지 않고** re-render도 하지 않음.

- **역할 나누기**:
  - **1차**: **preventDefault + model 갱신 + 우리 render**로 “DOM이 우리 구조와 다른 변경”을 **최소화**.
  - **2차**: 그래도 “DOM이 다르다”가 감지되면 **model을 함부로 덮어쓰지 않고**, **re-render도 보수적으로** (비상 복구·제한적 best-effort만).
  - **3차**: **정규화(DOM만 고치기)**는 “model과의 대응 관계”를 명확히 정의할 수 있을 때만 도입하는 게 안전함.

이렇게 정리하면, **“이미 변경된 DOM이 우리 구조와 다를 때”**는  
- **감지**를 명확히 하고,  
- **일상 경로에서는 model/render를 보수적으로** 두고,  
- **비상/제한적 시나리오**에서만 re-render나 best-effort sync를 쓰는 것**이 타당하다.

### 5.4 경계에 생성된 text node (조상이 inline-text가 아닌 경우)

**상황**: 모델의 텍스트는 항상 **id 기반 span**(`data-bc-sid` + `data-bc-stype="inline-text"`) 하위에만 렌더된다. 그런데 브라우저가 **임의의 영역**에 text node를 만들면, 그 text node의 조상 중 `closest('[data-bc-sid]')`로 찾은 요소가 **블록**(paragraph, heading 등)이어서 **inline-text가 아닐 수 있다**.  
→ 이때는 **"경계에 생성된 텍스트"**로 보면 된다: sid는 있지만, 그 sid는 텍스트를 담는 inline-text 노드가 아니다.

**감지**

- `resolveModelTextNodeId(target)`으로 sid를 얻은 뒤, **dataStore.getNode(sid)**로 노드를 조회한다.
- **node.stype !== 'inline-text'**이면 "이 텍스트는 inline-text span 하위가 아니다" → 경계에 생성된 것으로 판단한다.
- (sid가 아예 없으면 기존처럼 untracked; sid는 있는데 타입만 inline-text가 아니면 경계 케이스.)

**모델 업데이트 옵션**

1. **갱신 포기 (현재 권장)**  
   - model은 건드리지 않고, **editor:input.boundary_text** 등으로만 알림.  
   - re-render 시 해당 DOM 텍스트가 model에 없어 사라질 수 있음.  
   - 잘못된 노드(블록)에 replaceText를 적용하는 것보다 안전함.

2. **새 inline-text 노드 생성**  
   - 해당 블록(sid)의 **자식 목록**에서, DOM 순서(형제/이전·다음 노드)를 기준으로 "이 텍스트가 들어갈 위치"를 정한다.  
   - 그 위치에 **새 inline-text 노드**를 생성하고, 브라우저가 넣은 텍스트를 그 노드의 `text`로 넣은 뒤, 해당 구간만 **우리 render**로 다시 그린다.  
   - 모델이 우리 구조와 맞아떨어지지만, "위치 추정" 휴리스틱과 블록 자식 삽입 API가 필요함.

3. **인접 inline-text에 병합**  
   - 같은 블록 안 **이전/다음 inline-text 형제**를 찾아, 그 노드의 **끝** 또는 **처음**에 텍스트를 삽입하는 방식으로 model을 갱신한 뒤 re-render.  
   - 새 노드를 만들지 않지만, "앞에 붙일지 뒤에 붙일지"를 DOM만으로 결정해야 해서 휴리스틱이 필요함.

**정리**:  
- **당장은 1번(갱신 포기)**으로 두고, 경계 케이스를 **untracked와 구분해 감지**만 해 두는 것이 안전하다.  
- 나중에 **getTargetRanges() + preventDefault**로 입력 경로를 model-first로 바꾸면, "경계에 text node가 생기는" 상황 자체가 줄어든다.  
- 2·3번은 "이미 DOM이 바뀐 뒤"의 제한적 best-effort로, 필요 시 §5.3의 "선택 2"와 함께 설계·도입할 수 있다.

---

## 6. 코드에서 할 수 있는 것 (우선순위)

### 6.1 당장 해도 되는 것 (리스크 낮음)

- **IME/조합 상태 보강**
  - **위치**: `packages/editor-view-dom` (EditorViewDOM, InputHandler).
  - **내용**:
    - **compositionstart / compositionend** 리스너 다시 등록.  
      `compositionstart` → `_isComposing = true`.  
      `compositionend` → `_isComposing = false` + **“조합 종료 직후”** 플래그를 켜고 **50~100ms 후** 해제(타이머).
    - **keydown keyCode === 229**일 때 **IME 구간** 보조 플래그 설정(짧은 시간 유지).
    - **beforeinput / handleTextContentChange** 등에서 **isComposing**뿐 아니라 **“조합 종료 직후” 구간**도 **조합 중과 동일**하게 처리(예: model 반영·render 정책).
  - **효과**: Safari 등에서 **isComposing**만 믿지 않고 조합 중/직후를 더 안정적으로 구분.

- **DOM 구조 불일치 시 동작 명시**
  - **위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`  
    (`handleTextContentChange`에서 `textNodeId === null`일 때, `editor:input.untracked_text` emit하는 부분).
  - **내용**:
    - 주석 추가: **“DOM이 우리 렌더 구조와 다를 때 model 갱신·re-render 하지 않음.  
      대응 전략은 docs/input-and-composition-review.md §5 참고.”**
    - **경계 케이스**(조상 중 `closest('[data-bc-sid]')`가 inline-text가 아님): `editor:input.boundary_text`로 감지·알림. 모델 갱신·re-render 하지 않음(§5.4).
    - 필요 시 `editor:input.untracked_text` payload에 `structureMismatch: true` 등 필드 추가(나중에 비상 복구 훅에서 사용 가능).
  - **효과**: "여기서 동기화 포기 + re-render 안 함"이 코드에서 명확해짐.

### 6.2 단계적으로 할 것 (기능 추가)

- **getTargetRanges() 탐색**
  - **위치**: `InputHandlerImpl.handleBeforeInput`, `updateInsertHintFromBeforeInput` 부근.
  - **내용**:
    - **insertText / insertReplacementText**일 때 `event.getTargetRanges?.()`가 있으면 호출.
    - 반환된 **StaticRange[]**를 **기존 DOM→model position 변환**으로 model range로 바꿀 수 있으면 로그 또는 내부 플래그로 기록.
    - **실제 preventDefault는 하지 않음** → 기존 MutationObserver 경로 유지.  
      “어디까지 변환 가능한지”만 확인하는 단계.
  - **효과**: 이후 **preventDefault + model 반영 + 우리 render** 경로를 넣을 때 필요한 정보·위치를 파악.

- **getTargetRanges() + preventDefault 경로 (본격 도입)**
  - **위치**: 위 탐색 후, `handleBeforeInput`에서 insertText/insertReplacementText 분기.
  - **내용**:
    - getTargetRanges()로 범위 획득 + **DOM→model 변환 성공** 시에만 **preventDefault**.
    - **replaceText**(또는 delete+insert) command로 **model만 갱신**.
    - **editor:content.change** 등으로 **우리 render** 호출(skipRender: false).
    - 변환 실패 또는 getTargetRanges 미지원 시 **기존처럼 브라우저 기본 동작 + MutationObserver** 유지.
  - **효과**: “브라우저가 DOM을 먼저 바꿔서 구조가 달라지는” 경우를 줄임.

### 6.3 나중에 할 것 (문서만으로도 충분)

- **비상 복구**: “포커스 복귀” 또는 “untracked/구조 불일치 다수” 감지 시 **model 기준 re-render + selection 복원**.  
  필요할 때 별도 이슈/스펙으로 설계 후 구현.
- **제한적 best-effort**: untracked 직후·조합 아님일 때만 DOM에서 텍스트 추정 → model 반영 시도.  
  휴리스틱 정의·테스트 부담이 있으므로 문서 §5.2의 “선택 2”로 두고, 필요 시 도입.

---

## 7. 제안하는 작업 순서 (요약)

1. **문서/현황 정리**  
   - beforeinput에서 **어떤 inputType**을 **preventDefault** 할지, **getTargetRanges()** 지원 여부·폴백 전략을 문서로 명시.

2. **IME 보강 (코드 반영)**  
   - compositionstart/end + “조합 종료 직후” 타이머 + keyCode 229 보조.  
   - beforeinput/handleTextContentChange에서 “조합 종료 직후” 구간 정책 적용.

3. **DOM 불일치 시 주석·payload**  
   - untracked_text 경로에 §5 대응 전략 참고 주석 및 (선택) structureMismatch 플래그.

4. **getTargetRanges() 도입**  
   - 먼저 **탐색**(호출·변환 시도·로그)만 하고,  
   - 이어서 **preventDefault + model 갱신 + 우리 render** 경로 추가.  
   - 미지원/실패 시 **기존 MutationObserver** 유지.

5. **범위 선택 + 입력**  
   - range selection + insertText/insertReplacementText도 getTargetRanges()로 범위 얻어 **preventDefault** 후 model replaceText.

6. **테스트**  
   - Safari (macOS/iOS) 한글/일본어 조합, range 선택 후 입력, getTargetRanges() 미지원 폴백.

---

## 8. 관련 문서

- **편집 가능 영역·contenteditable 전략**: `docs/editable-regions-and-contenteditable-strategy.md`  
  - 스키마별 contenteditable=false 필요 여부, ProseMirror식 구조에서 선택+한글 입력 시 IME 깨짐, contenteditable=false 없이 “inline-text 내부에서만 입력”을 keydown/compositionstart로 제한하는 방식, Safari에서 compositionstart에서 막는 이유.

## 9. 참고 자료

- Input Events Level 2 – getTargetRanges: https://w3c.github.io/input-events/#dom-inputevent-gettargetranges  
- MDN InputEvent.getTargetRanges(): https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/getTargetRanges  
- WebKit Bug 165004 (composition/keydown order): https://bugs.webkit.org/show_bug.cgi?id=165004  
- Slate – real beforeinput: https://github.com/ianstormtaylor/slate/issues/2060  
- Lexical – state-based model, beforeinput: https://lexical.dev/docs  
- EditContext API: https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API  
- Why ContentEditable is Terrible (DOM vs logical model): https://medium.engineering/why-contenteditable-is-terrible-122d8a40e480  
