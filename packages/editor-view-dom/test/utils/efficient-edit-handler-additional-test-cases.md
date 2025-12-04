# handleEfficientEdit 추가 테스트 케이스 제안

## 현재 테스트 커버리지
- ✅ 기본 편집 (삽입, 삭제, 교체)
- ✅ mark/decorator 범위 조정
- ✅ 에러 케이스 (노드 찾기 실패)
- ✅ Selection 기반 편집 위치 계산
- ✅ 여러 text node 재구성

---

## 추가 테스트 케이스 (카테고리별)

### 1. 경계값 및 Edge Cases

#### 1.1 빈 텍스트 관련
- **빈 텍스트에서 삽입**: `''` → `'Hello'`
- **전체 텍스트 삭제**: `'Hello'` → `''`
- **빈 텍스트에서 빈 텍스트로**: `''` → `''` (null 반환)
- **빈 텍스트에서 공백으로**: `''` → `' '`

#### 1.2 공백 문자 처리
- **공백만 있는 텍스트**: `'   '` → `'Hello'`
- **공백 삽입**: `'Hello'` → `'Hello World'` (중간에 공백)
- **공백 삭제**: `'Hello World'` → `'HelloWorld'`
- **탭 문자 처리**: `'Hello\tWorld'` → `'Hello World'`
- **줄바꿈 문자 처리**: `'Hello\nWorld'` → `'Hello World'`
- **여러 공백 연속**: `'Hello    World'` → `'Hello World'`

#### 1.3 긴 텍스트
- **매우 긴 텍스트 삽입**: 1000자 이상의 텍스트
- **매우 긴 텍스트 삭제**: 1000자 이상에서 일부 삭제
- **매우 긴 텍스트 교체**: 1000자 이상에서 일부 교체

---

### 2. Selection 관련 테스트

#### 2.1 Selection 위치별 편집
- **Selection이 시작 위치에 있는 경우**: `|Hello` → `X|Hello` (삽입)
- **Selection이 끝 위치에 있는 경우**: `Hello|` → `HelloX|` (삽입)
- **Selection이 중간 위치에 있는 경우**: `Hel|lo` → `HelX|lo` (삽입)
- **Selection이 범위 선택인 경우**: `[Hello]` → `X` (전체 선택 후 교체)
- **Selection이 부분 선택인 경우**: `He[llo]` → `HeX` (부분 선택 후 교체)

#### 2.2 Selection이 편집 범위 밖에 있는 경우
- **Selection이 텍스트 앞에 있는 경우**: `|Hello` → `Hello World` (뒤에 삽입)
- **Selection이 텍스트 뒤에 있는 경우**: `Hello|` → `Hello World` (앞에 삽입)
- **Selection이 다른 노드에 있는 경우**: 다른 inline-text 노드에 Selection이 있을 때

#### 2.3 Selection이 Element 노드에 있는 경우
- **Selection의 startContainer가 Element인 경우**: Element 노드 내부에서 Selection 설정
- **Selection의 endContainer가 Element인 경우**: Element 노드 내부에서 Selection 설정

---

### 3. Mark 관련 테스트

#### 3.1 여러 Mark 조합
- **여러 mark가 겹치는 경우**: `bold[0,5]`, `italic[2,7]` → 텍스트 삽입 시 둘 다 조정
- **여러 mark가 연속되는 경우**: `bold[0,5]`, `italic[5,10]` → 중간에 삽입 시 둘 다 조정
- **여러 mark가 분리된 경우**: `bold[0,5]`, `italic[10,15]` → 중간에 삽입 시 하나만 조정
- **3개 이상의 mark**: `bold[0,5]`, `italic[2,7]`, `underline[4,9]` → 모두 조정

#### 3.2 Mark 범위와 편집 범위 관계
- **Mark가 편집 범위 앞에 있는 경우**: `bold[0,5]`, 편집 위치 10 → 조정 안 됨
- **Mark가 편집 범위 뒤에 있는 경우**: `bold[10,15]`, 편집 위치 5 → 조정 안 됨
- **Mark가 편집 범위와 부분 겹침 (앞)**: `bold[0,10]`, 편집 위치 5 → 조정됨
- **Mark가 편집 범위와 부분 겹침 (뒤)**: `bold[5,15]`, 편집 위치 10 → 조정됨
- **Mark가 편집 범위 안에 완전히 포함**: `bold[5,10]`, 편집 위치 3, 삽입 길이 10 → 조정됨
- **편집 범위가 Mark 안에 완전히 포함**: `bold[0,20]`, 편집 위치 5, 삽입 길이 5 → 조정됨

#### 3.3 Mark 삭제 시나리오
- **Mark 범위 전체가 삭제되는 경우**: `bold[0,5]`, `'Hello'` → `''` (전체 삭제)
- **Mark 범위 일부가 삭제되는 경우**: `bold[0,10]`, `'Hello World'` → `'Hello'` (일부 삭제)
- **Mark 범위 앞부분이 삭제되는 경우**: `bold[5,15]`, `'Hello World'` → `'World'` (앞부분 삭제)

#### 3.4 복잡한 Mark 구조
- **중첩된 mark**: `bold[0,10]` 안에 `italic[2,7]` → 둘 다 조정
- **Mark가 여러 text node에 걸쳐 있는 경우**: mark가 여러 text node를 포함하는 경우

---

### 4. Decorator 관련 테스트

#### 4.1 여러 Decorator 조합
- **여러 decorator가 겹치는 경우**: `highlight[0,5]`, `comment[2,7]` → 둘 다 조정
- **여러 decorator가 연속되는 경우**: `highlight[0,5]`, `comment[5,10]` → 둘 다 조정
- **여러 decorator가 분리된 경우**: `highlight[0,5]`, `comment[10,15]` → 하나만 조정
- **3개 이상의 decorator**: `highlight[0,5]`, `comment[2,7]`, `badge[4,9]` → 모두 조정

#### 4.2 Decorator 범위와 편집 범위 관계
- **Decorator가 편집 범위 앞에 있는 경우**: `highlight[0,5]`, 편집 위치 10 → 조정 안 됨
- **Decorator가 편집 범위 뒤에 있는 경우**: `highlight[10,15]`, 편집 위치 5 → 조정 안 됨
- **Decorator가 편집 범위와 부분 겹침 (앞)**: `highlight[0,10]`, 편집 위치 5 → 조정됨
- **Decorator가 편집 범위와 부분 겹침 (뒤)**: `highlight[5,15]`, 편집 위치 10 → 조정됨
- **Decorator가 편집 범위 안에 완전히 포함**: `highlight[5,10]`, 편집 위치 3, 삽입 길이 10 → 조정됨
- **편집 범위가 Decorator 안에 완전히 포함**: `highlight[0,20]`, 편집 위치 5, 삽입 길이 5 → 조정됨

#### 4.3 Decorator 삭제 시나리오
- **Decorator 범위 전체가 삭제되는 경우**: `highlight[0,5]`, `'Hello'` → `''` (전체 삭제)
- **Decorator 범위 일부가 삭제되는 경우**: `highlight[0,10]`, `'Hello World'` → `'Hello'` (일부 삭제)
- **Decorator 범위 앞부분이 삭제되는 경우**: `highlight[5,15]`, `'Hello World'` → `'World'` (앞부분 삭제)

#### 4.4 다른 nodeId의 Decorator
- **다른 nodeId의 decorator는 조정되지 않아야 함**: `target.sid !== nodeId`인 decorator는 무시

---

### 5. 복잡한 DOM 구조 테스트

#### 5.1 여러 Mark가 중첩된 구조
- **Bold 안에 Italic**: `<strong>He<em>ll</em>o</strong>` → 텍스트 변경 시 둘 다 조정
- **Italic 안에 Bold**: `<em>He<strong>ll</strong>o</em>` → 텍스트 변경 시 둘 다 조정
- **3중 중첩**: `<strong>He<em>ll<u>o</u></em></strong>` → 모두 조정

#### 5.2 Mark와 Decorator가 혼합된 구조
- **Mark와 Decorator가 겹치는 경우**: `bold[0,5]`, `highlight[2,7]` → 둘 다 조정
- **Mark와 Decorator가 분리된 경우**: `bold[0,5]`, `highlight[10,15]` → 하나만 조정
- **Mark 안에 Decorator가 있는 경우**: `bold[0,10]`, `highlight[2,7]` → 둘 다 조정

#### 5.3 여러 Text Node 분리
- **Mark로 인한 분리**: `Hello <strong>World</strong> Test` → 전체 텍스트 재구성
- **Decorator로 인한 분리**: `Hello <span class="highlight">World</span> Test` → 전체 텍스트 재구성
- **Mark와 Decorator로 인한 복합 분리**: 복잡한 구조에서 전체 텍스트 재구성

#### 5.4 빈 Text Node 처리
- **빈 text node가 있는 경우**: `<strong></strong>` (빈 mark wrapper)
- **빈 text node와 실제 text node 혼합**: `Hello <strong></strong> World`

---

### 6. 유니코드 및 특수 문자 테스트

#### 6.1 유니코드 문자
- **이모지 처리**: `'Hello 👋'` → `'Hello 👋 World'`
- **유니코드 조합 문자**: `'café'` → `'café world'` (é는 e + ́ 조합)
- **유니코드 정규화 후 동일한 경우**: `'café'` (NFC) vs `'café'` (NFD) → null 반환
- **한글 처리**: `'안녕'` → `'안녕하세요'`
- **일본어 처리**: `'こんにちは'` → `'こんにちは世界'`
- **중국어 처리**: `'你好'` → `'你好世界'`

#### 6.2 특수 문자
- **특수 기호**: `'Hello @#$%'` → `'Hello @#$% World'`
- **수학 기호**: `'x = y + z'` → `'x = y + z * 2'`
- **HTML 엔티티**: `'Hello &lt;world&gt;'` → `'Hello &lt;world&gt; test'`
- **제어 문자**: 탭, 줄바꿈 등

#### 6.3 다국어 혼합
- **영어 + 한글**: `'Hello 안녕'` → `'Hello 안녕 World'`
- **영어 + 일본어 + 한글**: `'Hello こんにちは 안녕'` → 복잡한 편집

---

### 7. 편집 위치 및 범위 테스트

#### 7.1 편집 위치별 테스트
- **시작 위치 삽입**: `|Hello` → `X|Hello`
- **시작 위치 삭제**: `|Hello` → `|ello` (첫 글자 삭제)
- **끝 위치 삽입**: `Hello|` → `HelloX|`
- **끝 위치 삭제**: `Hello|` → `Hell|` (마지막 글자 삭제)
- **중간 위치 삽입**: `Hel|lo` → `HelX|lo`
- **중간 위치 삭제**: `Hel|lo` → `He|lo` (중간 글자 삭제)

#### 7.2 여러 위치 동시 편집 (text-analyzer가 여러 변경 감지)
- **두 곳에 삽입**: `Hello` → `HeXlloY` (이론적으로 가능하지만 실제로는 드뭄)
- **두 곳에 삭제**: `Hello World` → `Hlo Wrld` (두 곳에서 삭제)

#### 7.3 대량 편집
- **대량 삽입**: `'Hello'` → `'Hello' + 1000자`
- **대량 삭제**: 1000자 → `'Hello'`
- **대량 교체**: 1000자 → 다른 1000자

---

### 8. 에러 및 예외 케이스

#### 8.1 DOM 구조 문제
- **Text Run Index가 빈 경우**: `runs.runs.length === 0` → null 반환
- **buildTextRunIndex가 null 반환하는 경우**: → null 반환
- **convertDOMToModelPosition이 null 반환하는 경우**: Selection이 있어도 변환 실패

#### 8.2 Selection 변환 실패
- **Selection의 startContainer가 Element인 경우**: → selectionOffset = 0
- **Selection의 endContainer가 Element인 경우**: → selectionLength = 0
- **convertDOMToModelPosition이 실패하는 경우**: → selectionOffset = 0

#### 8.3 text-analyzer 결과
- **text-analyzer가 빈 배열 반환 (유니코드 정규화 후 동일)**: → null 반환
- **text-analyzer가 여러 변경 감지**: → 첫 번째 변경만 사용

---

### 9. 성능 및 스트레스 테스트

#### 9.1 많은 Mark/Decorator
- **100개 이상의 mark**: 모든 mark가 조정되는지 확인
- **100개 이상의 decorator**: 모든 decorator가 조정되는지 확인
- **Mark와 Decorator 혼합 (각 50개)**: 모두 조정되는지 확인

#### 9.2 많은 Text Node
- **100개 이상의 text node**: 전체 텍스트 재구성이 정확한지 확인
- **깊게 중첩된 구조**: 매우 깊은 중첩 구조에서 정확성 확인

---

### 10. 실제 사용 시나리오

#### 10.1 타이핑 시나리오
- **연속 타이핑**: `'H'` → `'He'` → `'Hel'` → `'Hell'` → `'Hello'` (각 단계별 테스트)
- **백스페이스**: `'Hello'` → `'Hell'` → `'Hel'` → `'He'` → `'H'` → `''` (각 단계별 테스트)
- **중간 삽입**: `'Hello'` → `'HeXllo'` → `'HeXYllo'` (중간에 계속 삽입)

#### 10.2 복사/붙여넣기 시나리오
- **전체 선택 후 붙여넣기**: `'Hello'` → `'World'` (전체 교체)
- **부분 선택 후 붙여넣기**: `'Hello'` → `'HeWorld'` (부분 교체)
- **중간에 붙여넣기**: `'Hello'` → `'HeWorldllo'` (중간 삽입)

#### 10.3 IME 입력 시나리오
- **한글 조합**: `'안'` → `'안녕'` → `'안녕하'` → `'안녕하세요'` (조합 과정)
- **일본어 조합**: `'こ'` → `'こん'` → `'こんに'` → `'こんにちは'` (조합 과정)

---

### 11. Mark/Decorator 범위 조정 세부 테스트

#### 11.1 삽입 시 범위 조정
- **Mark 범위 앞에 삽입**: `bold[5,10]`, 편집 위치 0, 삽입 길이 3 → `bold[8,13]` (범위 이동)
- **Mark 범위 안에 삽입**: `bold[5,10]`, 편집 위치 7, 삽입 길이 3 → `bold[5,13]` (범위 확장)
- **Mark 범위 뒤에 삽입**: `bold[5,10]`, 편집 위치 15, 삽입 길이 3 → `bold[5,10]` (변경 없음)

#### 11.2 삭제 시 범위 조정
- **Mark 범위 앞부분 삭제**: `bold[5,10]`, 편집 위치 0, 삭제 길이 3 → `bold[2,7]` (범위 이동)
- **Mark 범위 일부 삭제**: `bold[5,10]`, 편집 위치 7, 삭제 길이 3 → `bold[5,7]` (범위 축소)
- **Mark 범위 전체 삭제**: `bold[5,10]`, 편집 위치 5, 삭제 길이 5 → mark 제거 또는 빈 범위

#### 11.3 교체 시 범위 조정
- **Mark 범위와 겹치는 교체**: `bold[5,10]`, 편집 위치 7, 삭제 길이 3, 삽입 길이 5 → `bold[5,12]` (범위 조정)

---

### 12. 복합 시나리오

#### 12.1 Mark + Decorator + Selection 조합
- **Mark, Decorator, Selection이 모두 있는 경우**: 복잡한 편집 시나리오
- **Mark와 Decorator가 겹치고 Selection이 있는 경우**: Selection 바이어싱 테스트

#### 12.2 여러 편집 연속
- **삽입 후 삭제**: `'Hello'` → `'Hello World'` → `'Hello'` (연속 편집)
- **삭제 후 삽입**: `'Hello World'` → `'Hello'` → `'Hello Test'` (연속 편집)

---

## 우선순위별 정리

### 높은 우선순위 (핵심 기능)
1. ✅ 빈 텍스트 처리
2. ✅ Selection이 Element 노드에 있는 경우
3. ✅ Mark/Decorator 범위와 편집 범위 관계 (부분 겹침, 완전 포함 등)
4. ✅ 여러 Mark/Decorator 조합
5. ✅ 유니코드 정규화 후 동일한 경우 (null 반환)
6. ✅ 다른 nodeId의 Decorator 무시

### 중간 우선순위 (실제 사용 시나리오)
7. ✅ IME 입력 시나리오 (한글, 일본어 조합)
8. ✅ 복사/붙여넣기 시나리오
9. ✅ 연속 타이핑 시나리오
10. ✅ 중첩된 Mark 구조
11. ✅ Mark와 Decorator 혼합 구조

### 낮은 우선순위 (Edge Cases)
12. ✅ 매우 긴 텍스트
13. ✅ 많은 Mark/Decorator (100개 이상)
14. ✅ 특수 문자 처리
15. ✅ text-analyzer가 여러 변경 감지하는 경우

---

## 테스트 작성 시 주의사항

1. **DOM 구조 정확성**: 테스트에서 생성하는 DOM 구조가 실제 렌더링 결과와 일치해야 함
2. **Mark/Decorator 범위**: 실제 조정 결과를 정확히 검증해야 함
3. **Selection 정규화**: DOM offset → Model offset 변환이 정확한지 확인
4. **유니코드 처리**: 정규화 후 동일한 경우 null 반환 확인
5. **에러 처리**: 예외 상황에서 null 반환 확인

