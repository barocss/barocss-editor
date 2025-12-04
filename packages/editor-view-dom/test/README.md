# Editor View DOM Tests

`@barocss/editor-view-dom` 패키지의 테스트 스위트입니다.

## 📁 테스트 구조

### [`core/`](./core/)
핵심 기능 테스트
- EditorViewDOM 클래스 기본 동작
- Container 기반 API 및 계층 시스템
- 모델-뷰 동기화

### [`events/`](./events/)
이벤트 처리 테스트
- 브라우저 이벤트 시뮬레이션
- 이벤트 핸들러 통합
- MutationObserver 연동

### [`text-analysis/`](./text-analysis/)
텍스트 분석 알고리즘 테스트
- Smart Text Analyzer 핵심 로직
- 유니코드 및 복합 문자 처리
- 변경 감지 및 분류

### [`decorator-system/`](./decorator-system/)
Decorator 시스템 테스트
- DecoratorRegistry 및 DecoratorManager
- Layer/Inline/Block Decorator 타입
- 커스텀 렌더러 등록

### [`integration/`](./integration/)
통합 테스트
- 시스템 간 상호작용
- 실제 사용 시나리오
- Selection 매핑 및 처리

## 🚀 실행 방법

### 전체 테스트 실행
```bash
pnpm test
```

### 특정 그룹 테스트 실행
```bash
pnpm test test/core           # 핵심 기능 테스트
pnpm test test/events         # 이벤트 테스트
pnpm test test/text-analysis  # 텍스트 분석 테스트
pnpm test test/decorator-system # Decorator 시스템 테스트
pnpm test test/integration    # 통합 테스트
```

### 특정 테스트 파일 실행
```bash
pnpm test test/core/layered-api.test.ts
pnpm test test/events/event-integration.test.ts
```

### 테스트 실행 옵션
```bash
pnpm test:run                 # 단일 실행 (watch 모드 없음)
pnpm test:coverage           # 커버리지 포함 실행
pnpm test:ui                 # UI 모드로 실행
```

## 🔧 테스트 환경

- **테스트 러너**: Vitest
- **DOM 환경**: JSDOM
- **모킹**: vi (Vitest 내장)
- **설정 파일**: `vitest.config.ts`

## 📝 테스트 작성 가이드

### 기본 구조
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('테스트 그룹명', () => {
  beforeEach(() => {
    // 각 테스트 전 설정
  });
  
  afterEach(() => {
    // 각 테스트 후 정리
  });
  
  it('should 테스트 내용', () => {
    // 테스트 코드
    expect(actual).toBe(expected);
  });
});
```

### 모킹 예시
```typescript
// editor-core 모킹
const mockEditor = {
  emit: vi.fn(),
  on: vi.fn(),
  executeCommand: vi.fn()
} as any;

// DOM API 모킹
Object.defineProperty(window, 'getSelection', {
  value: vi.fn(() => ({
    getRangeAt: vi.fn(),
    removeAllRanges: vi.fn()
  }))
});
```

## 🐛 알려진 제약사항

- **JSDOM 제약**: 일부 브라우저 네이티브 API가 완전히 지원되지 않음
- **이벤트 시뮬레이션**: 실제 브라우저와 다를 수 있는 이벤트 동작
- **Selection API**: JSDOM에서 제한적인 Selection 객체 지원

## 📊 커버리지 목표

- **전체 커버리지**: 90% 이상
- **핵심 로직**: 95% 이상
- **에러 처리**: 85% 이상
