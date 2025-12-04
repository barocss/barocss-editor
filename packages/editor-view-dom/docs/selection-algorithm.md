# Selection 처리 알고리즘

## 개요

이 문서는 Editor의 Model과 DOM 간 Selection 동기화를 위한 알고리즘과 데이터 구조를 설명합니다. 특히 텍스트 노드 분할, offset 매핑, selection 변환 알고리즘을 다룹니다.

## 1. 텍스트 관리 아키텍처

### 1.1 Model 레벨 텍스트 표현

**단일 연속 문자열 (Flat Text Model)**

Model에서는 텍스트를 하나의 연속된 문자열로 관리합니다:

```
Model Text: "bold and italic"
            └─ offset: 0 ──────────────── 15 ─┘
```

**특징:**
- 단일 노드에 하나의 텍스트 문자열
- Offset은 0부터 시작하는 연속된 정수
- Mark는 텍스트 범위 `[start, end)`로 표현

### 1.2 DOM 레벨 텍스트 표현

**분할된 텍스트 노드 (Fragmented Text DOM)**

DOM에서는 mark/decorator로 인해 텍스트가 여러 개의 text node로 분할됩니다:

```
DOM Structure:
<span data-bc-sid="text-1">
  <b>bold</b>           ← Text Node 1: "bold" (DOM offset 0-4)
  <span> and </span>    ← Text Node 2: " and " (DOM offset 0-5)
  <i>italic</i>         ← Text Node 3: "italic" (DOM offset 0-6)
</span>
```

**특징:**
- 각 text node는 독립적인 offset 공간을 가짐
- Mark wrapper로 인해 구조가 중첩됨
- Decorator는 시각적 표현만 담당 (selection 계산에서 제외)

### 1.3 매핑 문제

**문제:**
- Model offset `10`은 어느 DOM text node의 어느 offset인가?
- DOM text node의 offset `3`은 Model offset 몇인가?

**해결:**
- Text Run Index를 사용하여 양방향 매핑
- 각 text node의 Model offset 범위를 기록

## 2. Text Run Index 알고리즘

### 2.1 데이터 구조

```
TextRun {
  domTextNode: Text        // 실제 DOM text node 참조
  start: number           // Model offset 시작 (inclusive)
  end: number             // Model offset 끝 (exclusive)
}

ContainerRuns {
  runs: TextRun[]         // 텍스트 노드 순서대로 정렬된 배열
  total: number          // 전체 텍스트 길이 (마지막 run의 end)
  byNode: Map<Text, {start, end}>  // 역방향 조회 맵 (선택적)
}
```

### 2.2 Text Run Index 생성 알고리즘

**입력:**
- `container`: `data-bc-sid` 속성을 가진 컨테이너 요소
- `excludePredicate`: 제외할 요소 판단 함수 (decorator 등)

**알고리즘:**

```
1. runs = []
2. total = 0
3. 
4. FOR EACH child IN container.childNodes:
5.   IF child IS Text Node:
6.     text = child.textContent
7.     length = text.length
8.     runs.append({
9.       domTextNode: child,
10.      start: total,
11.      end: total + length
12.    })
13.    total = total + length
14.    
15.  ELSE IF child IS Element:
16.    IF excludePredicate(child) IS TRUE:
17.      CONTINUE  // decorator 등 제외
18.    
19.    // TreeWalker로 내부의 모든 text node 수집
20.    walker = createTreeWalker(child, SHOW_TEXT, {
21.      acceptNode: (node) => {
22.        IF node의 부모 중 decorator가 있으면:
23.          RETURN REJECT
24.        RETURN ACCEPT
25.      }
26.    })
27.    
28.    WHILE textNode = walker.nextNode():
29.      text = textNode.textContent
30.      length = text.length
31.      runs.append({
32.        domTextNode: textNode,
33.        start: total,
34.        end: total + length
35.      })
36.      total = total + length
37.
38. RETURN { runs, total, byNode }
```

**시간 복잡도:** O(n) where n = text node 개수

**공간 복잡도:** O(n)

### 2.3 Model Offset → DOM Offset 변환 알고리즘

**입력:**
- `runs`: TextRun 배열 (start 기준 정렬됨)
- `modelOffset`: Model offset 값

**알고리즘:**

```
1. IF modelOffset < 0 OR modelOffset > runs.total:
2.   RETURN null  // 범위 밖
3.
4. IF modelOffset == runs.total:
5.   lastRun = runs[runs.length - 1]
6.   RETURN {
7.     node: lastRun.domTextNode,
8.     offset: lastRun.domTextNode.textContent.length
9.   }
10.
11. // Binary Search로 적절한 run 찾기
12. runIndex = binarySearchRun(runs, modelOffset)
13. IF runIndex == -1:
14.   RETURN null
15.
16. run = runs[runIndex]
17. localOffset = modelOffset - run.start
18.
19. RETURN {
20.   node: run.domTextNode,
21.   offset: min(localOffset, run.domTextNode.textContent.length)
22. }
```

**Binary Search 알고리즘:**

```
binarySearchRun(runs, offset):
1. lo = 0
2. hi = runs.length - 1
3. ans = -1
4.
5. WHILE lo <= hi:
6.   mid = (lo + hi) / 2
7.   run = runs[mid]
8.   
9.   IF offset < run.start:
10.    hi = mid - 1
11.  ELSE IF offset >= run.end:
12.    lo = mid + 1
13.  ELSE:
14.    ans = mid
15.    BREAK
16.
17. RETURN ans
```

**시간 복잡도:** O(log n)

### 2.4 DOM Offset → Model Offset 변환 알고리즘

**입력:**
- `runs`: TextRun 배열
- `textNode`: DOM text node
- `domOffset`: DOM text node 내의 offset

**알고리즘:**

```
1. // 역방향 맵 사용 (O(1))
2. IF runs.byNode EXISTS:
3.   runInfo = runs.byNode.get(textNode)
4.   IF runInfo EXISTS:
5.     RETURN runInfo.start + min(domOffset, runInfo.end - runInfo.start)
6.
7. // 역방향 맵이 없으면 선형 탐색 (O(n))
8. FOR EACH run IN runs:
9.   IF run.domTextNode == textNode:
10.    localOffset = min(domOffset, run.end - run.start)
11.    RETURN run.start + localOffset
12.
13. RETURN 0  // 찾지 못함
```

**시간 복잡도:** O(1) (역방향 맵 사용) 또는 O(n) (선형 탐색)

## 3. Selection 변환 알고리즘

### 3.1 Model Selection → DOM Selection 변환

**입력:**
- `modelSelection`: `{ startNodeId, startOffset, endNodeId, endOffset, type: 'range' }`

**알고리즘:**

```
1. // 1. 컨테이너 요소 찾기
2. startContainer = findElementBySid(modelSelection.startNodeId)
3. endContainer = findElementBySid(modelSelection.endNodeId)
4. 
5. IF startContainer == null OR endContainer == null:
6.   RETURN FAILURE
7.
8. // 2. 텍스트 컨테이너 찾기 (상위로 올라가며 탐색)
9. startTextContainer = findBestContainer(startContainer)
10. endTextContainer = findBestContainer(endContainer)
11.
12. IF startTextContainer == null OR endTextContainer == null:
13.   RETURN FAILURE
14.
15. // 3. Text Run Index 생성
16. startRuns = buildTextRunIndex(startTextContainer)
17. endRuns = buildTextRunIndex(endTextContainer)
18.
19. // 4. Model offset → DOM offset 변환
20. startDOMRange = findDOMRangeFromModelOffset(startRuns, modelSelection.startOffset)
21. endDOMRange = findDOMRangeFromModelOffset(endRuns, modelSelection.endOffset)
22.
23. IF startDOMRange == null OR endDOMRange == null:
24.   RETURN FAILURE
25.
26. // 5. DOM Selection 설정
27. selection = window.getSelection()
28. selection.removeAllRanges()
29. 
30. range = document.createRange()
31. range.setStart(startDOMRange.node, startDOMRange.offset)
32. range.setEnd(endDOMRange.node, endDOMRange.offset)
33. 
34. selection.addRange(range)
35. RETURN SUCCESS
```

**findBestContainer 알고리즘:**

```
findBestContainer(element):
1. current = element
2. 
3. // 상위로 올라가며 텍스트 컨테이너 찾기
4. WHILE current != null:
5.   IF current IS text container:
6.     RETURN current
7.   current = current.parentElement.closest('[data-bc-sid]')
8.
9. // 텍스트 컨테이너가 없으면 최초 요소 반환
10. IF element.getAttribute('data-bc-sid') != null:
11.   RETURN element
12.
13. RETURN null
```

### 3.2 DOM Selection → Model Selection 변환

**입력:**
- `domSelection`: 브라우저 Selection 객체

**알고리즘:**

```
1. range = domSelection.getRangeAt(0)
2. 
3. // 1. 컨테이너 요소 찾기
4. startContainer = findBestContainer(range.startContainer)
5. endContainer = findBestContainer(range.endContainer)
6. 
7. IF startContainer == null OR endContainer == null:
8.   RETURN { type: 'none' }
9.
10. startNodeId = startContainer.getAttribute('data-bc-sid')
11. endNodeId = endContainer.getAttribute('data-bc-sid')
12.
13. IF startNodeId == null OR endNodeId == null:
14.   RETURN { type: 'none' }
15.
16. // 2. Text Run Index 생성
17. startRuns = buildTextRunIndex(startContainer)
18. endRuns = (startContainer == endContainer) ? startRuns : buildTextRunIndex(endContainer)
19.
20. // 3. DOM offset → Model offset 변환
21. startModelOffset = convertDOMOffsetToModelOffset(
22.   startContainer, 
23.   range.startContainer, 
24.   range.startOffset, 
25.   startRuns
26. )
27. endModelOffset = convertDOMOffsetToModelOffset(
28.   endContainer,
29.   range.endContainer,
30.   range.endOffset,
31.   endRuns
32. )
33.
34. // 4. Selection 방향 결정
35. direction = determineSelectionDirection(domSelection, startContainer, endContainer, startModelOffset, endModelOffset)
36.
37. // 5. 통일된 ModelSelection 형식으로 정규화
38. modelSelection = normalizeSelection(startNodeId, startModelOffset, endNodeId, endModelOffset)
39.
40. RETURN {
41.   type: 'range',
42.   ...modelSelection,
43.   direction
44. }
```

**convertDOMOffsetToModelOffset 알고리즘:**

```
convertDOMOffsetToModelOffset(container, domNode, domOffset, runs):
1. IF domNode IS Text Node:
2.   // 역방향 맵 사용
3.   runInfo = runs.byNode.get(domNode)
4.   IF runInfo EXISTS:
5.     localOffset = clamp(domOffset, 0, runInfo.end - runInfo.start)
6.     RETURN runInfo.start + localOffset
7.   
8.   // 역방향 맵이 없으면 binary search
9.   // (실제로는 byNode 맵을 항상 생성하므로 이 경로는 거의 사용되지 않음)
10.  RETURN binarySearchAndConvert(runs, domNode, domOffset)
11.
12. ELSE IF domNode IS Element:
13.   // Element의 child index를 사용하여 경계 텍스트 노드 찾기
14.   boundaryText = findTextAtElementBoundary(container, domNode, domOffset)
15.   IF boundaryText != null:
16.     runInfo = runs.byNode.get(boundaryText)
17.     RETURN runInfo.start  // 또는 runInfo.end (경계에 따라)
18.
19. RETURN 0
```

## 4. 텍스트 노드 분할 규칙

### 4.1 Mark로 인한 분할

**규칙:**
- 각 mark는 독립적인 wrapper 요소를 생성
- Mark가 겹치면 중첩된 구조 생성
- 각 wrapper 내부의 text node는 독립적으로 관리

**예시:**

```
Model: "bold and italic" (marks: bold[0-14], italic[0-14])

DOM:
<span data-bc-sid="text-1">
  <b>
    <i>bold and italic</i>  ← 하나의 text node
  </b>
</span>
```

**중첩된 경우:**

```
Model: "bold and italic" (marks: bold[0-9], italic[9-14])

DOM:
<span data-bc-sid="text-1">
  <b>bold</b>              ← text node 1
  <i>italic</i>            ← text node 2
</span>
```

### 4.2 Decorator로 인한 분할

**규칙:**
- Decorator는 시각적 표현만 담당
- Selection 계산에서 제외됨
- Decorator 하위의 text node는 수집하지 않음

**예시:**

```
<span data-bc-sid="text-1">
  <span data-decorator-sid="dec-1">decorator</span>  ← 제외
  <b>bold</b>                                         ← 포함
</span>
```

### 4.3 Text Run Index 생성 시 고려사항

**포함:**
- `data-bc-sid` 직접 자식인 text node
- Mark wrapper 내부의 text node
- 중첩된 mark 구조의 모든 text node

**제외:**
- Decorator 하위의 text node
- `data-bc-decorator` 속성을 가진 요소 하위
- `data-decorator-sid` 속성을 가진 요소 하위

## 5. Selection 동기화 타이밍

### 5.1 Model → DOM 동기화 타이밍

**문제:**
- 렌더링이 완료되기 전에 selection을 적용하면 DOM이 아직 업데이트되지 않음
- Text Run Index가 오래된 DOM을 기반으로 생성될 수 있음

**해결:**

```
1. Model 변경 발생
   ↓
2. Transaction 실행
   ↓
3. selectionAfter 계산
   ↓
4. editor.updateSelection(selectionAfter)
   ↓
5. _pendingModelSelection에 저장
   ↓
6. render() 호출
   ↓
7. reconcile() 실행 (DOM 업데이트)
   ↓
8. reconcile 완료 콜백 호출
   ↓
9. applyModelSelectionWithRetry() 실행
   ↓
10. Text Run Index 생성 (최신 DOM 기반)
    ↓
11. DOM Selection 적용
```

**핵심:** 렌더링 완료 후에만 selection 적용

### 5.2 DOM → Model 동기화 타이밍

**문제:**
- 프로그래밍 방식의 selection 변경도 `selectionchange` 이벤트를 발생시킴
- 무한 루프 방지 필요

**해결:**

```
1. DOM Selection 변경
   ↓
2. selectionchange 이벤트 발생
   ↓
3. _isProgrammaticChange 플래그 확인
   ↓
4. IF _isProgrammaticChange == true:
      RETURN  // 무시
   ↓
5. convertDOMSelectionToModel()
   ↓
6. editor.updateSelection(modelSelection)
   ↓
7. _isProgrammaticChange = false (다음 이벤트 루프에서)
```

**핵심:** 프로그래밍 방식 변경과 사용자 변경 구분

## 6. 성능 최적화

### 6.1 Text Run Index 생성 전략

**현재 전략: 캐시 없이 매번 새로 생성**

**이유:**
- DOM이 변경되면 Text Run Index도 무효화되어야 함
- 캐시 무효화 로직이 복잡함 (어떤 요소가 변경되었는지 추적 필요)
- Text Run Index 생성 비용이 크지 않음:
  - 일반적으로 inline-text 노드 하나당 text run은 몇 개 정도
  - TreeWalker 순회는 O(n) where n = text node 개수
  - Selection 변환은 사용자 입력 시점에만 발생하므로 빈도가 높지 않음

**구현:**

```
getTextRunsForContainer(container):
  containerId = container.getAttribute('data-bc-sid')
  
  // 매번 새로 생성 (캐시 사용 안 함)
  runs = buildTextRunIndex(container, containerId, {
    buildReverseMap: true,      // 역방향 맵 생성
    excludePredicate: isDecorator,
    normalizeWhitespace: false
  })
  
  RETURN runs
```

**성능 분석:**
- Text Run Index 생성: O(n) where n = text node 개수
- 일반적인 inline-text 노드: text run 1~5개 정도
- Selection 변환 빈도: 사용자 입력 시점에만 발생 (낮음)
- 결론: 캐시 없이도 충분히 빠름

**캐싱을 고려할 경우:**
- Reconcile 완료 시점에 변경된 요소의 캐시만 무효화
- MutationObserver와 연동하여 DOM 변경 감지 시 자동 무효화
- 하지만 현재는 복잡도 대비 이점이 크지 않아 캐시를 사용하지 않음

### 6.2 역방향 맵 사용

**전략:**
- Text node → Model offset 범위 매핑
- O(1) 조회 가능 (선형 탐색 O(n) 대비)

**구현:**

```
byNode = Map<Text, { start: number, end: number }>()

// 생성 시
FOR EACH run IN runs:
  byNode.set(run.domTextNode, { start: run.start, end: run.end })

// 조회 시
convertDOMOffsetToModelOffset(textNode, domOffset):
  runInfo = byNode.get(textNode)  // O(1)
  IF runInfo:
    RETURN runInfo.start + clamp(domOffset, 0, runInfo.end - runInfo.start)
```

**현재 구현 상태:**
- ✅ `buildReverseMap: true` 옵션으로 생성됨
- ✅ `getTextRunsForContainer`에서 항상 역방향 맵 생성
- ✅ `convertDOMOffsetToModelOffset`에서 활용됨

**성능 비교:**
- 역방향 맵 사용: O(1)
- 선형 탐색: O(n) where n = text run 개수
- Binary Search: O(log n) (Model offset → DOM offset 변환 시)

### 6.3 Binary Search 활용

**전략:**
- TextRun 배열은 start 기준 정렬됨
- Model offset → DOM offset 변환 시 O(log n)

**구현:**

```
binarySearchRun(runs, modelOffset):
  lo = 0
  hi = runs.length - 1
  
  WHILE lo <= hi:
    mid = (lo + hi) / 2
    run = runs[mid]
    
    IF modelOffset < run.start:
      hi = mid - 1
    ELSE IF modelOffset >= run.end:
      lo = mid + 1
    ELSE:
      RETURN mid  // 찾음
  
  RETURN -1  // 찾지 못함
```

**현재 구현 상태:**
- ✅ `binarySearchRun` 함수 구현됨
- ✅ `findDOMRangeFromModelOffset`에서 활용됨

**성능 비교:**
- Binary Search: O(log n)
- 선형 탐색: O(n)

### 6.2 추가 최적화 방안

#### 6.2.1 Lazy Text Run Index 생성

**전략:**
- Selection 변환이 필요할 때만 생성
- 불필요한 생성 방지

**현재 상태:**
- ✅ 이미 구현됨 (요청 시 생성)

#### 6.2.2 Incremental 업데이트 (향후 개선)

**전략:**
- DOM 변경이 작은 경우 전체 재생성 대신 증분 업데이트
- 복잡도가 높아 현재는 전체 재생성 사용

**향후 개선 방안:**
- Text node 추가/삭제만 감지하여 해당 run만 업데이트
- Mark 변경으로 인한 구조 변경은 전체 재생성 유지
- 하지만 현재는 생성 비용이 낮아 전체 재생성으로 충분함

## 7. 엣지 케이스 처리

### 7.1 빈 텍스트 노드

**처리:**
- `textContent.length == 0`인 text node는 skip
- Run에 포함하지 않음

### 7.2 범위 밖 offset

**처리:**
- `modelOffset < 0`: 첫 번째 run의 start로 클램프
- `modelOffset > total`: 마지막 run의 end로 클램프

### 7.3 여러 노드에 걸친 Selection

**처리:**
- startNodeId와 endNodeId가 다른 경우
- 각각 독립적으로 Text Run Index 생성
- 각각 Model offset → DOM offset 변환

### 7.4 Collapsed Selection (커서)

**처리:**
- `startOffset == endOffset`인 경우
- start와 end가 같은 DOM 위치로 변환
- `range.collapsed = true`로 설정

## 8. 데이터 흐름 다이어그램

### 8.1 전체 흐름

```
┌─────────────┐
│   Model     │
│  Selection  │
└──────┬──────┘
       │
       │ updateSelection()
       ↓
┌──────────────────┐
│ SelectionManager │
└──────┬───────────┘
       │
       │ editor:selection.model
       ↓
┌──────────────────┐
│  EditorViewDOM   │
│ _pendingSelection │
└──────┬───────────┘
       │
       │ render() 완료 후
       ↓
┌──────────────────┐
│ Text Run Index   │
│    생성          │
└──────┬───────────┘
       │
       │ Model offset → DOM offset
       ↓
┌──────────────────┐
│  DOM Selection   │
│     적용         │
└──────────────────┘
```

### 8.2 역방향 흐름

```
┌──────────────────┐
│  DOM Selection   │
│   (사용자 변경)   │
└──────┬───────────┘
       │
       │ selectionchange
       ↓
┌──────────────────┐
│ SelectionHandler │
└──────┬───────────┘
       │
       │ Text Run Index 생성
       ↓
┌──────────────────┐
│ DOM offset →     │
│ Model offset     │
└──────┬───────────┘
       │
       │ fromDOMSelection()
       ↓
┌─────────────┐
│   Model     │
│  Selection  │
└─────────────┘
```

## 9. 핵심 원칙

### 9.1 단일 진실의 원천 (Single Source of Truth)

- **Model이 진실의 원천**: 모든 selection 상태는 Model에 저장
- **DOM은 표현**: DOM selection은 Model selection의 시각적 표현일 뿐

### 9.2 일관성 보장

- **통일된 형식**: 모든 selection은 `{ startNodeId, startOffset, endNodeId, endOffset }` 형식 사용
- **양방향 변환**: Model ↔ DOM 변환이 항상 가능해야 함

### 9.3 타이밍 관리

- **렌더링 완료 후 적용**: DOM이 업데이트된 후에만 selection 적용
- **프로그래밍 변경 구분**: 무한 루프 방지

### 9.4 정확성 우선

- **trim() 사용 안 함**: 실제 DOM offset과 정확히 매칭
- **모든 text node 수집**: mark/decorator로 분할된 모든 text node 포함

