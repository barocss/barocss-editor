# renderer-dom 연동 추가 기능 테스트 체크리스트

## 📋 테스트 항목

### 1. BaseComponentState.mount/unmount 호출 확인 ✅ (테스트 작성 완료, 디버깅 필요)
- [x] mount() 호출 시점 확인 (컴포넌트가 DOM에 마운트될 때) - 테스트 작성 완료, 컴포넌트 렌더링 이슈
- [x] unmount() 호출 시점 확인 (컴포넌트가 DOM에서 제거될 때) - 테스트 작성 완료, 컴포넌트 렌더링 이슈
- [x] 여러 컴포넌트의 독립적인 mount/unmount - 테스트 작성 완료, 컴포넌트 렌더링 이슈
- [x] 재렌더링 시 mount/unmount 호출 여부 확인 (호출되지 않아야 함) - 테스트 작성 완료, 컴포넌트 렌더링 이슈
- [x] sid 변경 시 unmount → mount 호출 확인 - 테스트 작성 완료, 컴포넌트 렌더링 이슈

**참고**: 
- ComponentManager에서 `stateInstHook.mount()`와 `stateInstHook.unmount()`를 호출하는 것을 확인함
- 하지만 BaseComponentState.mount/unmount는 현재 TODO 상태
- 테스트 파일 작성 완료: `mount-unmount-integration.test.ts`
- 컴포넌트가 렌더링되지 않는 문제 발견 (디버깅 필요)

### 2. Layer decorator 렌더링 테스트 ✅ (테스트 작성 완료)
- [x] Layer decorator 기본 렌더링 (layers.decorator 레이어에 렌더링) - 테스트 작성 완료
- [x] Layer decorator position 업데이트 - 테스트 작성 완료
- [x] Layer decorator 추가/제거 - 테스트 작성 완료
- [x] 여러 Layer decorator 동시 렌더링 - 테스트 작성 완료
- [x] Layer decorator와 inline/block decorator 혼합 사용 - 테스트 작성 완료

**참고**: 
- 테스트 파일 작성 완료: `layer-decorator-integration.test.ts`
- 일부 테스트에서 컴포넌트 렌더링 이슈 발견 (디버깅 필요)

### 3. 테이블 구조 렌더링 테스트 ✅ (테스트 작성 완료)
- [x] 기본 테이블 구조 렌더링 (table > tbody > tr > td) - 테스트 작성 완료
- [x] 테이블 셀 내용 업데이트 - 테스트 작성 완료
- [x] 테이블 행 추가/제거 - 테스트 작성 완료
- [x] 테이블 행 재정렬 - 테스트 작성 완료
- [x] 중첩된 테이블 구조 - 테스트 작성 완료
- [x] 테이블에 marks/decorator 적용 - 테스트 작성 완료

**참고**: 
- 테스트 파일 작성 완료: `table-integration.test.ts`
- 테이블 템플릿 등록 필요 (table, tbody, tr, td, th)
- 일부 테스트에서 렌더링 이슈 발견 (디버깅 필요)

### 4. 폼 요소 렌더링 테스트 ✅ (테스트 작성 완료)
- [x] input 요소 렌더링 및 값 업데이트 - 테스트 작성 완료
- [x] textarea 요소 렌더링 및 값 업데이트 - 테스트 작성 완료
- [x] select 요소 렌더링 및 선택값 변경 - 테스트 작성 완료
- [x] checkbox/radio 요소 렌더링 및 상태 변경 - 테스트 작성 완료
- [x] 폼 요소와 Component State 연동 - 테스트 작성 완료
- [x] 폼 요소 이벤트 처리 (onChange 등) - 테스트 작성 완료

**참고**: 
- 테스트 파일 작성 완료: `form-elements-integration.test.ts`
- 폼 요소 템플릿 등록 필요 (input, textarea, select, option, checkbox, radio)
- 일부 테스트에서 렌더링 이슈 발견 (디버깅 필요)

## 📊 진행 상황

- **완료**: 4/4 항목 (테스트 작성 완료)
- **디버깅 필요**: 모든 테스트 파일에서 컴포넌트 렌더링 이슈 발견
- **대기**: 디버깅 및 테스트 통과 확인

