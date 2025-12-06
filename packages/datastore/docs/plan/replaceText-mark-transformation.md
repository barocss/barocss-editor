# replaceText의 데이터와 Mark 변환 관계

## 개요

`RangeOperations.replaceText()` 메서드는 텍스트 범위를 교체할 때 해당 노드의 모든 marks를 자동으로 조정합니다. 이 문서는 텍스트 교체 작업이 marks에 미치는 영향을 상세히 설명합니다.

## 기본 개념

### 용어 정의

- **교체 범위 (Replacement Range)**: `[start, end]` - 교체될 텍스트의 시작과 끝 오프셋
- **새 텍스트 (newText)**: 교체 범위에 삽입될 새로운 텍스트
- **Delta (δ)**: `newText.length - (end - start)` - 텍스트 길이 변화량
- **Mark 범위**: `[ms0, me0]` - Mark가 적용된 텍스트 범위

### Mark 조정 원칙

1. **연속성 보존**: 가능한 한 mark의 연속성을 유지합니다.
2. **범위 보존**: 교체 범위 밖의 mark 범위는 그대로 유지됩니다.
3. **자동 조정**: 교체 범위와 겹치는 mark는 자동으로 조정됩니다.
4. **분리 최소화**: 불필요한 mark 분리를 최소화합니다.

## Mark 조정 케이스

### 케이스 1: Mark가 교체 범위 앞에 있음

**조건**: `me0 <= start`

**동작**: Mark 범위는 변경되지 않습니다.

**예제**:
```
텍스트: "Hello world"
Mark:   [0, 5] "Hello" (bold)
교체:   [6, 11] "world" → "universe"
결과:   [0, 5] "Hello" (bold) - 변경 없음
```

**시각화**:
```
Before: [Hello][world]
        [====]         (bold mark)
        [     ][====]  (replacement range)

After:  [Hello][universe]
        [====]         (bold mark - unchanged)
```

---

### 케이스 2: Mark가 교체 범위 뒤에 있음

**조건**: `ms0 >= end`

**동작**: Mark 범위의 시작과 끝이 delta만큼 이동합니다.

**변환 공식**: `[ms0 + delta, me0 + delta]`

**예제**:
```
텍스트: "Hello world"
Mark:   [6, 11] "world" (bold)
교체:   [0, 5] "Hello" → "Hi"
Delta:  2 - 5 = -3
결과:   [3, 8] "world" (bold) - 오프셋 조정
```

**시각화**:
```
Before: [Hello][world]
        [====]         (replacement range)
        [     ][====]   (bold mark)

After:  [Hi][world]
        [==]           (replacement range)
        [  ][====]     (bold mark - shifted left by 3)
```

---

### 케이스 3: Mark가 교체 범위 왼쪽과 겹침 (Overlaps Left Only)

**조건**: `ms0 < start && me0 > start && me0 <= end`

**동작**: Mark의 왼쪽 부분만 유지되고, 교체 범위와 겹치는 부분은 제거됩니다.

**변환 공식**: `[ms0, start]`

**예제**:
```
텍스트: "Hello world"
Mark:   [0, 7] "Hello w" (bold)
교체:   [5, 11] " world" → " universe"
결과:   [0, 5] "Hello" (bold) - 겹치는 부분 제거
```

**시각화**:
```
Before: [Hello world]
        [========]     (bold mark)
        [     ][====]  (replacement range)

After:  [Hello][universe]
        [====]         (bold mark - truncated to [0, 5])
        [     ][======]
```

---

### 케이스 4: Mark가 교체 범위 오른쪽과 겹침 (Overlaps Right Only)

**조건**: `ms0 >= start && ms0 < end && me0 > end`

**동작**: Mark의 오른쪽 부분만 유지되고, 오프셋이 조정됩니다.

**변환 공식**: `[start + newText.length, me0 + delta]`

**조건**: `newEnd > newStart`인 경우에만 유지됩니다.

**예제**:
```
텍스트: "Hello world"
Mark:   [5, 11] " world" (bold)
교체:   [0, 5] "Hello" → "Hi"
Delta:  2 - 5 = -3
newStart: 0 + 2 = 2
newEnd: 11 + (-3) = 8
결과:   [2, 8] " world" (bold) - 오프셋 조정
```

**시각화**:
```
Before: [Hello][world]
        [====]         (replacement range)
        [     ][====]  (bold mark)

After:  [Hi][world]
        [==]           (replacement range)
        [  ][====]     (bold mark - shifted and truncated)
```

---

### 케이스 5: Mark가 교체 범위 안에 완전히 포함됨 (Fully Inside)

**조건**: `ms0 >= start && me0 <= end`

**동작**: Mark가 완전히 제거됩니다.

**예제**:
```
텍스트: "Hello world"
Mark:   [6, 8] "wo" (bold)
교체:   [5, 11] " world" → " universe"
결과:   (제거됨) - mark가 교체 범위 안에 완전히 포함
```

**시각화**:
```
Before: [Hello][world]
        [     ][====]  (replacement range)
        [      ][=]    (bold mark - fully inside)

After:  [Hello][universe]
        [     ][========] (replacement range)
        (bold mark removed)
```

---

### 케이스 6: Mark가 교체 범위를 완전히 포함함 (Spans Across)

**조건**: `ms0 < start && me0 > end`

이 케이스는 교체 유형에 따라 다르게 처리됩니다.

#### 6-1: 삽입 (Insertion) - `start === end`

**동작**: Mark 범위를 확장하여 삽입된 텍스트를 포함합니다.

**변환 공식**: `[ms0, me0 + delta]`

**예제**:
```
텍스트: "Hello world"
Mark:   [0, 11] "Hello world" (bold)
교체:   [5, 5] "" → " beautiful"
Delta:  10 - 0 = 10
결과:   [0, 21] "Hello beautiful world" (bold) - 확장됨
```

**시각화**:
```
Before: [Hello world]
        [===========]  (bold mark)
        [     |]       (insertion point)

After:  [Hello beautiful world]
        [====================]  (bold mark - extended)
```

#### 6-2: 작은 교체/삭제 (Small Replacement/Deletion) - `delta >= -1`

**동작**: Mark 범위를 확장하여 교체된 텍스트를 포함합니다.

**변환 공식**: `[ms0, me0 + delta]`

**예제**:
```
텍스트: "Hello world"
Mark:   [0, 11] "Hello world" (bold)
교체:   [5, 6] " " → "x"
Delta:  1 - 1 = 0
결과:   [0, 11] "Helloxworld" (bold) - 확장됨 (delta=0이므로 길이 동일)
```

**예제 (1글자 삭제)**:
```
텍스트: "Hello world"
Mark:   [0, 11] "Hello world" (bold)
교체:   [5, 6] " " → ""
Delta:  0 - 1 = -1
결과:   [0, 10] "Helloworld" (bold) - 확장됨 (delta=-1이므로 1글자 감소)
```

**시각화**:
```
Before: [Hello world]
        [===========]  (bold mark)
        [     ][=]     (replacement range)

After:  [Helloxworld]
        [==========]   (bold mark - extended, delta=0)
```

#### 6-3: 큰 삭제 (Large Deletion) - `delta < -1`

**동작**: Mark를 두 개로 분리합니다.

**변환 공식**:
- 왼쪽 부분: `[ms0, start]`
- 오른쪽 부분: `[start + newText.length, me0 + delta]`
- 조건: `rightEnd > rightStart`인 경우에만 오른쪽 부분 유지

**예제**:
```
텍스트: "Hello beautiful world"
Mark:   [0, 22] "Hello beautiful world" (bold)
교체:   [5, 15] " beautiful" → ""
Delta:  0 - 10 = -10
결과:   
  - 왼쪽: [0, 5] "Hello" (bold)
  - 오른쪽: [5, 12] " world" (bold) - 분리됨
```

**시각화**:
```
Before: [Hello beautiful world]
        [====================]  (bold mark)
        [     ][==========]      (replacement range - large deletion)

After:  [Hello][world]
        [====]         (bold mark - left part)
        [     ][====]  (bold mark - right part)
```

---

## Delta 계산

Delta는 텍스트 길이 변화량을 나타냅니다:

```typescript
delta = newText.length - (end - start)
```

### Delta 값의 의미

- **delta > 0**: 텍스트가 증가 (삽입 또는 확장)
- **delta = 0**: 텍스트 길이 동일 (교체)
- **delta < 0**: 텍스트가 감소 (삭제)

### Delta 예제

| 교체 범위 | 새 텍스트 | Delta | 설명 |
|---------|----------|-------|------|
| `[5, 5]` | `"x"` | `1` | 1글자 삽입 |
| `[5, 6]` | `"x"` | `0` | 1글자 교체 |
| `[5, 6]` | `""` | `-1` | 1글자 삭제 |
| `[5, 10]` | `"x"` | `-4` | 5글자 → 1글자 (4글자 감소) |
| `[5, 5]` | `"hello"` | `5` | 5글자 삽입 |

## 복합 케이스 예제

### 예제 1: 여러 Marks가 있는 경우

```
초기 텍스트: "Hello world"
Marks:
  - bold: [0, 11]
  - italic: [6, 11]

교체: [5, 6] " " → "x"

처리:
1. bold [0, 11]:
   - spansAcross (0 < 5 && 11 > 6)
   - delta = 1 - 1 = 0
   - delta >= -1 → 확장: [0, 11]

2. italic [6, 11]:
   - ms0 >= end? 6 >= 6? false
   - overlapsRightOnly? 6 >= 5 && 6 < 6 && 11 > 6? false
   - spansAcross? 6 < 5? false
   - 실제로는: ms0 = 6, end = 6이므로 ms0 >= end는 false
   - 하지만 me0 > end (11 > 6)이므로 overlapsRightOnly로 처리
   - newStart = 5 + 1 = 6
   - newEnd = 11 + 0 = 11
   - 결과: [6, 11] (변경 없음, delta=0이므로)

최종 결과:
  - bold: [0, 11] "Helloxworld"
  - italic: [6, 11] "world"
```

### 예제 2: Mark 분리 케이스

```
초기 텍스트: "Hello beautiful world"
Marks:
  - bold: [0, 22]

교체: [5, 15] " beautiful" → ""

처리:
1. bold [0, 22]:
   - spansAcross (0 < 5 && 22 > 15)
   - delta = 0 - 10 = -10
   - delta < -1 → 분리
   - 왼쪽: [0, 5] "Hello"
   - 오른쪽: [5, 12] " world" (15 + 0 = 15, 22 + (-10) = 12)

최종 결과:
  - bold: [0, 5] "Hello"
  - bold: [5, 12] " world"
```

## 구현 세부사항

### 처리 순서

1. 각 mark에 대해 다음 순서로 조건을 확인:
   - `me0 <= start` → 케이스 1
   - `ms0 >= end` → 케이스 2
   - `overlapsLeftOnly` → 케이스 3
   - `overlapsRightOnly` → 케이스 4
   - `fullyInside` → 케이스 5 (제거)
   - `spansAcross` → 케이스 6

2. 각 케이스는 독립적으로 처리되며, 한 mark는 하나의 케이스에만 해당합니다.

### 주의사항

1. **빈 범위 제거**: `overlapsRightOnly`와 `spansAcross`의 오른쪽 부분은 `newEnd > newStart` 조건을 확인하여 빈 범위를 제거합니다.

2. **Delta 계산**: Delta는 텍스트 길이 변화량이므로, mark 범위 조정 시 `delta`를 직접 사용합니다.

3. **연속성 보존**: `spansAcross` 케이스에서 작은 교체/삭제(`delta >= -1`)는 mark를 분리하지 않고 확장하여 연속성을 유지합니다.

## 테이블 요약

| 케이스 | 조건 | 동작 | 변환 공식 |
|--------|------|------|----------|
| 1. 앞에 있음 | `me0 <= start` | 변경 없음 | `[ms0, me0]` |
| 2. 뒤에 있음 | `ms0 >= end` | 오프셋 이동 | `[ms0 + delta, me0 + delta]` |
| 3. 왼쪽 겹침 | `ms0 < start && me0 > start && me0 <= end` | 왼쪽 부분만 유지 | `[ms0, start]` |
| 4. 오른쪽 겹침 | `ms0 >= start && ms0 < end && me0 > end` | 오른쪽 부분만 유지 (오프셋 조정) | `[start + newText.length, me0 + delta]` (if `newEnd > newStart`) |
| 5. 완전 포함 | `ms0 >= start && me0 <= end` | 제거 | (제거됨) |
| 6-1. 삽입 | `spansAcross && start === end` | 확장 | `[ms0, me0 + delta]` |
| 6-2. 작은 교체 | `spansAcross && start < end && delta >= -1` | 확장 | `[ms0, me0 + delta]` |
| 6-3. 큰 삭제 | `spansAcross && start < end && delta < -1` | 분리 | 왼쪽: `[ms0, start]`, 오른쪽: `[start + newText.length, me0 + delta]` (if `rightEnd > rightStart`) |

## Mark 정규화

`replaceText`는 marks 조정 후 자동으로 정규화를 수행합니다:

1. **빈 범위 제거**: `ms0 >= me0`인 marks 제거
2. **범위 클램프**: 범위를 텍스트 길이에 맞게 조정
3. **중복 제거**: 동일한 (stype, attrs, range)를 가진 marks 제거
4. **병합**: 인접하거나 겹치는 동일 타입 marks 병합
5. **정렬**: 시작 오프셋 기준으로 정렬

정규화는 `setMarks`를 통해 수행되며, 다른 mark 관련 메서드들(`applyMark`, `removeMark` 등)과 동일한 방식으로 처리됩니다.ㅚ고 있어 

## 참고사항

- 이 문서는 `RangeOperations.replaceText()` 메서드의 단일 노드 경로(fast-path)에 대한 설명입니다.
- 다중 노드 경로는 `deleteText()` + `insertText()` 조합으로 처리됩니다.
- Mark 조정은 원자적(atomic) 작업으로, 모든 marks가 동시에 조정됩니다.
- Marks 조정 후 자동으로 정규화가 수행되어 일관성 있는 상태를 보장합니다.

