# Core Tests

이 디렉토리는 `editor-view-dom`의 핵심 기능을 테스트합니다.

## 테스트 파일들

### `editor-view-dom.test.ts`
- EditorViewDOM 클래스의 기본 생성자 및 초기화 테스트
- 기본 API 동작 검증
- 생명주기 관리 테스트

### `layered-api.test.ts`
- Container 기반 API 테스트
- 5계층 구조 생성 및 관리 테스트
- 계층별 속성 및 스타일 검증
- 계층 커스터마이징 테스트

### `model-application.test.ts`
- 모델 데이터와 DOM 동기화 테스트
- 데이터 변경 시 DOM 업데이트 검증
- 모델-뷰 바인딩 테스트

## 실행 방법

```bash
# 모든 핵심 테스트 실행
pnpm test test/core

# 특정 테스트 파일 실행
pnpm test test/core/layered-api.test.ts
```
