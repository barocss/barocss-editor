# Integration Tests

이 디렉토리는 여러 컴포넌트 간의 통합 및 전체적인 시스템 동작을 테스트합니다.

## 테스트 파일들

### `correct-test-cases.test.ts`
- 전체 시스템의 올바른 동작 검증
- 실제 사용 시나리오 기반 테스트
- 에지 케이스 및 예외 상황 처리
- 시스템 안정성 검증

### `selection-mapping-test.test.ts`
- Selection과 DOM 간의 매핑 테스트
- 커서 위치 추적 및 변환
- Range 객체 처리
- Selection 상태 동기화

### `simple-selection-test.test.ts`
- 기본적인 Selection 동작 테스트
- 단순한 선택 시나리오 검증
- Selection 이벤트 처리
- 기본 Selection API 테스트

## 통합 테스트 범위

### 시스템 간 상호작용
- `editor-core` ↔ `editor-view-dom` 통신
- DOM 이벤트 → 모델 업데이트 플로우
- 모델 변경 → DOM 렌더링 플로우

### 실제 사용 시나리오
- 사용자 입력 → 텍스트 분석 → 모델 업데이트
- 키보드 단축키 → 명령 실행 → DOM 변경
- 복사/붙여넣기 → 데이터 처리 → 렌더링

### 성능 및 안정성
- 대용량 텍스트 처리
- 연속적인 입력 처리
- 메모리 누수 방지
- 에러 복구 메커니즘

## 실행 방법

```bash
# 모든 통합 테스트 실행
pnpm test test/integration

# 특정 테스트 파일 실행
pnpm test test/integration/correct-test-cases.test.ts
```

## 주의사항

- 통합 테스트는 실행 시간이 더 오래 걸릴 수 있습니다
- 실제 브라우저 환경에서의 추가 테스트가 필요할 수 있습니다
