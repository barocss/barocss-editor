# Backspace 테스트 체크리스트

## 테스트 환경 설정

### 1. 서버 실행
```bash
cd apps/editor-test
pnpm dev
```

서버가 `http://localhost:5174`에서 실행됩니다.

### 2. 브라우저 열기
브라우저에서 `http://localhost:5174` 접속

### 3. 개발자 도구 열기
- F12 또는 Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows)
- Console 탭 열기
- Execution Flow 확인 (Devtool 패널)

---

## 테스트 시나리오

### ✅ 테스트 1: 일반 Backspace (offset > 0)

**초기 상태:**
- 텍스트: "Hello World"
- 커서: offset 5 ("o" 뒤)

**동작:**
1. 커서를 "Hello World"의 "o" 뒤에 위치
2. Backspace 키 입력

**예상 결과:**
- 텍스트: "Hell World"
- 커서: offset 4 ("l" 뒤)
- Execution Flow에 `backspace` command 표시
- `deleteText` operation 실행됨

**확인 사항:**
- [ ] 텍스트가 올바르게 삭제됨
- [ ] 커서 위치가 올바름
- [ ] Execution Flow에 `backspace` command 표시
- [ ] `deleteText` operation 실행됨

---

### ✅ 테스트 2: Range Selection에서 Backspace

**초기 상태:**
- 텍스트: "Hello World"
- 선택: "ell" (offset 1-4)

**동작:**
1. "Hello World"에서 "ell" 선택
2. Backspace 키 입력

**예상 결과:**
- 텍스트: "Ho World"
- 커서: offset 1 (삭제된 위치)
- Execution Flow에 `backspace` command 표시
- `deleteText` operation 실행됨

**확인 사항:**
- [ ] 선택된 텍스트가 삭제됨
- [ ] 커서 위치가 올바름
- [ ] Execution Flow에 `backspace` command 표시

---

### ✅ 테스트 3: Offset 0에서 Backspace (케이스 A - 이전 노드 문자 삭제)

**초기 상태:**
```
[text-1: "Hello"] [text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)
```

**동작:**
1. 두 개의 텍스트 노드가 있는 paragraph 생성
2. 두 번째 노드의 시작 위치에 커서 위치
3. Backspace 키 입력

**예상 결과:**
```
[text-1: "Hell"] [text-2: "World"]
                 ↑ 커서 (text-2의 offset 0 유지)
```

**확인 사항:**
- [ ] 이전 노드의 마지막 문자가 삭제됨
- [ ] 현재 노드는 변경되지 않음
- [ ] 커서 위치가 유지됨
- [ ] Execution Flow에 `backspace` command 표시
- [ ] `deleteText` operation 실행됨 (이전 노드에 대해)

**테스트 방법:**
- Devtool의 Model Tree에서 노드 구조 확인
- Execution Flow에서 실행된 operation 확인

---

### ⚠️ 테스트 4: Offset 0에서 Backspace (케이스 B - 빈 노드 병합)

**초기 상태:**
```
[text-1: ""] [text-2: "World"]
             ↑ 커서 (text-2의 offset 0)
```

**동작:**
1. 빈 텍스트 노드와 텍스트 노드가 있는 paragraph 생성
2. 두 번째 노드의 시작 위치에 커서 위치
3. Backspace 키 입력

**예상 결과:**
```
[text-1: "World"] (text-2 삭제됨)
↑ 커서 (text-1의 offset 0)
```

**확인 사항:**
- [ ] 빈 노드가 삭제되고 현재 노드와 병합됨
- [ ] 텍스트가 올바르게 병합됨
- [ ] 커서 위치가 올바름
- [ ] Execution Flow에 `backspace` command 표시
- [ ] `mergeTextNodes` operation 실행됨

**주의:**
- 현재 구현 상태 확인 필요 (Phase 2 구현 여부)

---

### ⚠️ 테스트 5: Offset 0에서 Backspace (케이스 C - 이전 노드 전체 삭제)

**초기 상태:**
```
[text-1: "Hello"] [image-1] [text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)
```

**동작:**
1. 텍스트 노드, 이미지 노드, 텍스트 노드가 있는 paragraph 생성
2. 세 번째 노드의 시작 위치에 커서 위치
3. Backspace 키 입력

**예상 결과:**
```
[text-1: "Hello"] [text-2: "World"]
                 ↑ 커서 (text-2의 offset 0 유지)
```

**확인 사항:**
- [ ] 이미지 노드가 삭제됨
- [ ] 텍스트 노드는 변경되지 않음
- [ ] 커서 위치가 유지됨
- [ ] Execution Flow에 `backspace` command 표시
- [ ] `deleteNode` operation 실행됨

**주의:**
- 이미지 노드 삽입 기능 필요
- `deleteNode` command 구현 확인 필요

---

### ✅ 테스트 6: Offset 0에서 Backspace (케이스 D - 다른 부모)

**초기 상태:**
```
[paragraph-1 > text-1: "Hello"]
[paragraph-2 > text-2: "World"]
                    ↑ 커서 (text-2의 offset 0)
```

**동작:**
1. 두 개의 paragraph 생성
2. 두 번째 paragraph의 텍스트 시작 위치에 커서 위치
3. Backspace 키 입력

**예상 결과:**
- 변화 없음 (블록 경계이므로)

**확인 사항:**
- [ ] 아무 동작도 하지 않음
- [ ] 텍스트가 변경되지 않음
- [ ] 커서 위치가 유지됨
- [ ] Execution Flow에 `backspace` command 표시 (실패 또는 무시)

---

### ✅ 테스트 7: Offset 0에서 Backspace (케이스 E - 이전 노드 없음)

**초기 상태:**
```
[text-1: "World"]
↑ 커서 (offset 0)
```

**동작:**
1. 단일 텍스트 노드가 있는 paragraph 생성
2. 텍스트의 시작 위치에 커서 위치
3. Backspace 키 입력

**예상 결과:**
- 변화 없음

**확인 사항:**
- [ ] 아무 동작도 하지 않음
- [ ] 텍스트가 변경되지 않음
- [ ] 커서 위치가 유지됨

---

### ✅ 테스트 8: Composing 상태에서 Backspace

**동작:**
1. 한글 입력 시작 ("ㅎ")
2. Backspace 키 입력 (조합 중)

**예상 결과:**
- 조합 취소 (브라우저 기본 동작)
- 모델 변경 없음

**확인 사항:**
- [ ] 조합이 취소됨
- [ ] Execution Flow에 `backspace` command가 표시되지 않음
- [ ] 브라우저 기본 동작이 실행됨

---

### ✅ 테스트 9: Mark가 있는 텍스트에서 Backspace

**초기 상태:**
- 텍스트: "bold and italic" (bold+italic mark, 전체)
- 커서: "and" 뒤 (offset 9)

**동작:**
1. Bold+Italic mark가 있는 텍스트 생성
2. "and" 뒤에 커서 위치
3. Backspace 키 입력

**예상 결과:**
- 텍스트: "bold nd italic"
- Mark: 자동 조정됨 (분리되지 않음)
- 커서: offset 8

**확인 사항:**
- [ ] 텍스트가 올바르게 삭제됨
- [ ] Mark 범위가 올바르게 조정됨
- [ ] Mark가 분리되지 않음
- [ ] Devtool의 Model Tree에서 Mark 확인

---

### ✅ 테스트 10: 여러 노드에 걸친 Range Selection 삭제

**초기 상태:**
```
[text-1: "Hello"] [text-2: "World"]
     ↑---선택---↑
```

**동작:**
1. 두 개의 텍스트 노드가 있는 paragraph 생성
2. 첫 번째 노드의 일부와 두 번째 노드의 일부 선택
3. Backspace 키 입력

**예상 결과:**
- 선택된 범위가 삭제됨
- 노드가 병합되거나 분리될 수 있음

**확인 사항:**
- [ ] 선택된 범위가 삭제됨
- [ ] 노드 구조가 올바르게 변경됨
- [ ] Execution Flow에 `backspace` command 표시
- [ ] Cross-node 삭제가 올바르게 처리됨

---

## 테스트 결과 기록

### 성공한 테스트
- [ ] 테스트 1: 일반 Backspace
- [ ] 테스트 2: Range Selection
- [ ] 테스트 3: Offset 0 - 케이스 A
- [ ] 테스트 4: Offset 0 - 케이스 B
- [ ] 테스트 5: Offset 0 - 케이스 C
- [ ] 테스트 6: Offset 0 - 케이스 D
- [ ] 테스트 7: Offset 0 - 케이스 E
- [ ] 테스트 8: Composing 상태
- [ ] 테스트 9: Mark가 있는 텍스트
- [ ] 테스트 10: 여러 노드에 걸친 Range Selection

### 발견된 버그

#### 버그 #1: [제목]
- 시나리오: [어떤 테스트에서 발생]
- 증상: [무엇이 잘못되었는지]
- 재현 방법: [어떻게 재현하는지]
- 콘솔 로그: [관련 로그]
- Execution Flow: [관련 Execution Flow]

---

## 디버깅 팁

### Execution Flow 확인
1. Devtool 패널 열기
2. Execution Flow 탭 확인
3. `backspace` command 실행 확인
4. 실행된 operations 확인
5. `selectionBefore` / `selectionAfter` 확인

### 콘솔 로그 확인
- `[DeleteExtension]` 로그 확인
- `[EditorViewDOM]` 로그 확인
- 에러 메시지 확인

### Model Tree 확인
1. Devtool의 Model Tree 탭 확인
2. 노드 구조 확인
3. 텍스트 변경 확인
4. Mark 변경 확인

---

## 다음 단계

테스트 완료 후:
1. 발견된 버그를 우선순위별로 정리
2. 각 버그에 대한 수정 계획 수립
3. 수정 후 재테스트

