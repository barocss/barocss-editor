# Build 함수 테스트 커버리지

## ✅ 테스트 완료된 기능
1. ✅ 기본 element 빌드 (`dom-renderer-build.test.ts`)
2. ✅ Nested elements 빌드 (`dom-renderer-build.test.ts`)
3. ✅ Decorator 적용 (`dom-renderer-build.test.ts`)
4. ✅ Component 빌드 - Contextual (`init-state.test.ts`, `component-rerender.test.ts`)
5. ✅ Component 빌드 - External (`component-placeholder-*.test.ts`, `external-component-chart.test.ts`)
6. ✅ Component + Decorator 조합 (`dom-renderer-build.test.ts`)
7. ✅ Slot 처리 (`bTable.test.ts`, `component-child-mount.test.ts`)
8. ✅ Component children 처리 (`component-children.test.ts`)
10. ✅ Component state 초기화 (`init-state.test.ts`)
11. ✅ `each()` - 배열 반복 처리 (`dom-renderer-build.test.ts`)
12. ✅ `when()` - 조건부 렌더링 (`dom-renderer-build.test.ts`)
13. ✅ Dynamic tag (함수로 태그 결정) (`dom-renderer-build.test.ts`)
14. ✅ Mixed content (text + elements) (`dom-renderer-build.test.ts`)
15. ✅ data() 함수 다양한 패턴 (`dom-renderer-build.test.ts`)
    - Simple path: `data('text')`
    - Nested path: `data('user.name')`
    - Attributes path: `data('attributes.imageUrl')`
    - Getter function: `data((d) => d.user?.name)`
    - Getter function with defaultValue: `data((d) => d.missing, 'Default')`
16. ✅ attr() 함수 (`dom-renderer-build.test.ts`)
17. ✅ text() 함수 (`dom-renderer-build.test.ts`)
18. ✅ slot() 함수 (`dom-renderer-build.test.ts`)
    - Array content
    - Single non-array value
    - String/number values
    - Empty slot

19. ✅ Mark 처리 (`dom-renderer-build.test.ts`)
    - Single mark
    - Multiple marks
    - Overlapping marks
    - Mark + Decorator 조합
    - **Mark & Decorator 중첩 시나리오 (6개 추가 테스트):**
      - Decorator가 Mark보다 큰 범위로 감싸는 경우
      - Mark가 Decorator 범위 내에 있는 경우
      - 여러 Mark와 겹치는 여러 Decorator
      - 부분적으로 겹치는 Mark와 Decorator
      - 여러 겹치는 Mark를 Decorator로 감싸는 경우
      - Mark 내부에 Decorator가 있는 경우 (작은 Decorator가 Mark 범위 내)
20. ✅ 중첩된 slot 처리 (`dom-renderer-build.test.ts`)
    - 깊게 중첩된 slot (outer -> middle -> inner)
21. ✅ 복잡한 Component props 전달 패턴 (`dom-renderer-build.test.ts`)
    - Function-based props
    - Nested data in props

## ✅ 모든 주요 기능 테스트 완료!

## 📝 현재 Build 테스트 현황
- `test/core/dom-renderer-build.test.ts` - **45개 테스트 모두 통과**
- `test/components/*` - 42개 build 테스트 모두 통과
- `test/core/bTable.test.ts` - 2개 build 테스트 모두 통과
- **총 89개 build 테스트 모두 통과**

## 🎯 다음 단계
1. Build 함수의 엣지 케이스 확인 및 테스트
2. 성능 테스트 (대량 데이터 처리)
3. 에러 핸들링 테스트 강화

