# Event Tests

이 디렉토리는 DOM 이벤트 처리 및 브라우저 상호작용을 테스트합니다.

## 테스트 파일들

### `browser-event-simulation.test.ts`
- 브라우저 네이티브 이벤트 시뮬레이션
- `input`, `beforeinput`, `keydown`, `paste`, `drop` 등 이벤트 테스트
- 복합 이벤트 시나리오 검증
- IME 및 composition 이벤트 처리

### `event-integration.test.ts`
- 이벤트 핸들러 통합 테스트
- 이벤트 → 명령 변환 검증
- 이벤트 체이닝 및 전파 테스트
- Selection 변경 이벤트 처리

### `mutation-observer-integration.test.ts`
- MutationObserver와 Smart Text Analyzer 통합 테스트
- DOM 변경 감지 및 분석
- 텍스트 변경사항 추적
- 변경 이벤트 발생 검증

## 실행 방법

```bash
# 모든 이벤트 테스트 실행
pnpm test test/events

# 특정 테스트 파일 실행
pnpm test test/events/event-integration.test.ts
```

## 주의사항

- 일부 테스트는 JSDOM 환경의 제약으로 인해 제한적일 수 있습니다
- 브라우저별 이벤트 동작 차이를 고려한 테스트가 포함되어 있습니다
