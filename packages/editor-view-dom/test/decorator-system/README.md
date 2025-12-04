# Decorator System Tests

이 디렉토리는 Decorator 시스템의 기능을 테스트합니다.

## 테스트 파일들

### `decorator-system.test.ts`
- DecoratorRegistry 기능 테스트
- DecoratorManager CRUD 작업 테스트
- Decorator 타입 등록 및 검증
- 커스텀 렌더러 등록 테스트
- 이벤트 발생 및 처리 검증

## Decorator 타입

### Layer Decorator
- DOM 구조 변경 없이 CSS 오버레이로 표현
- 하이라이트, 주석, 어노테이션 등
- diff에 포함됨

### Inline Decorator
- 텍스트 내부에 실제 DOM 위젯 삽입
- 링크 버튼, 멘션, 커스텀 위젯 등
- `data-bc-decorator="inline"` 속성으로 diff에서 제외

### Block Decorator
- 블록 레벨에 실제 DOM 위젯 삽입
- 툴바, 컨텍스트 메뉴, 커스텀 패널 등
- `data-bc-decorator="block"` 속성으로 diff에서 제외

## 핵심 클래스

### DecoratorRegistry
- Decorator 타입 및 렌더러 등록 관리
- 스키마 검증 기능
- 타입 안전성 보장

### DecoratorManager
- Decorator 인스턴스 CRUD 작업
- 이벤트 발생 (`decorator:added`, `decorator:updated`, `decorator:removed`)
- 쿼리 및 필터링 기능

## 실행 방법

```bash
# Decorator 시스템 테스트 실행
pnpm test test/decorator-system

# 특정 테스트 파일 실행
pnpm test test/decorator-system/decorator-system.test.ts
```
