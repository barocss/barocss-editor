# 디버그 로깅 표준

## React의 디버그 로깅 패턴

### React의 접근 방식

React는 다음과 같은 패턴을 사용합니다:

1. **`__DEV__` 플래그 사용**
   - 개발 빌드에서만 활성화
   - 프로덕션 빌드에서는 완전히 제거 (dead code elimination)
   - 빌드 타임에 결정됨

2. **로그 레벨 구분**
   - `console.warn()`: 경고 메시지 (개발 중 문제 가능성)
   - `console.error()`: 에러 메시지 (치명적 문제)
   - `console.log()`: 일반 디버그 정보 (드물게 사용)

3. **조건부 로깅**
   ```javascript
   if (__DEV__) {
     console.warn('Warning message');
   }
   ```

4. **프로덕션 빌드 최적화**
   - 번들러가 `__DEV__`가 false인 코드를 제거
   - 프로덕션 빌드 크기 최소화

## 현재 프로젝트의 문제점

### 혼재된 패턴

1. **`process.env.NODE_ENV === 'test'`**
   - 테스트 환경에서만 활성화
   - 개발 환경에서는 비활성화됨

2. **`(globalThis as any).__DEBUG_RECONCILE__`**
   - 런타임 플래그
   - 개발자가 수동으로 활성화해야 함

3. **`(globalThis as any).__DEBUG_MARKS__`**
   - 런타임 플래그
   - 특정 기능(mark)만 디버깅

### 문제점

- 일관성 없음: 여러 패턴이 혼재
- 개발 환경에서 기본적으로 비활성화: 디버깅이 어려움
- 프로덕션 빌드 최적화 부족: 조건 체크가 런타임에 수행됨

## 제안하는 표준

### 1. `__DEV__` 플래그 도입

```typescript
// packages/renderer-dom/src/utils/dev.ts
import { __DEV__ } from '../utils/dev';

if (__DEV__) {
  console.warn('Development warning');
}
```

### 2. 카테고리별 로깅

```typescript
// packages/renderer-dom/src/utils/logger.ts
import { logger, LogCategory } from '../utils/logger';

// Debug log (개발 모드 + 카테고리 활성화 시에만)
logger.debug(LogCategory.RECONCILE, 'prevVNode 정보', {
  vnodeSid: vnode.sid,
  prevVNodeExists: !!prevVNode,
});

// Warning (카테고리 활성화 시에만)
logger.warn(LogCategory.RECONCILE, 'prevVNode를 찾지 못함', {
  vnodeSid: vnode.sid,
});

// Error (항상 표시)
logger.error(LogCategory.RECONCILE, 'Failed to reconcile', error);
```

### 3. 런타임 활성화

```typescript
// 브라우저 콘솔에서
import { setCategoryEnabled, LogCategory } from '@barocss/renderer-dom';

// 특정 카테고리 활성화
setCategoryEnabled(LogCategory.RECONCILE, true);
setCategoryEnabled(LogCategory.FIBER, true);

// 모든 카테고리 활성화
import { enableAllCategories } from '@barocss/renderer-dom';
enableAllCategories();
```

### 4. 사용 예시

```typescript
// Before
if (process.env.NODE_ENV === 'test' || (globalThis as any).__DEBUG_RECONCILE__) {
  console.log('[reconcileFiberNode] prevVNode 정보:', { ... });
}

// After
import { logger, LogCategory } from '../utils/logger';

logger.debug(LogCategory.RECONCILE, 'prevVNode 정보', {
  vnodeSid: vnode.sid,
  prevVNodeExists: !!prevVNode,
  // ...
});
```

## 마이그레이션 가이드

### 단계별 마이그레이션

1. **새로운 코드부터 표준 사용**
   - 새로운 기능은 표준 logger 사용
   - 기존 코드는 점진적으로 마이그레이션

2. **레거시 플래그 호환성**
   - `__DEBUG_RECONCILE__` → `LogCategory.RECONCILE` 자동 매핑
   - `__DEBUG_MARKS__` → `LogCategory.MARK` 자동 매핑

3. **빌드 설정**
   - Vite에서 `__DEV__` 플래그 처리
   - 프로덕션 빌드에서 dead code elimination

## React와의 차이점

### React
- `__DEV__`는 빌드 타임 상수
- 프로덕션 빌드에서 완전히 제거됨
- 런타임 활성화 불가

### 우리 제안
- `__DEV__`는 개발 모드 기본값
- 카테고리별 런타임 활성화 지원
- 개발자가 필요할 때만 활성화 가능

**이유:**
- 개발 중에는 기본적으로 활성화하여 디버깅 용이
- 프로덕션에서는 비활성화하여 성능 최적화
- 특정 기능만 디버깅할 수 있는 유연성 제공

## 권장 사항

1. **에러 로그는 항상 유지**
   - `logger.error()`는 프로덕션에서도 필요
   - 치명적 문제는 항상 보고되어야 함

2. **경고 로그는 카테고리별 제어**
   - `logger.warn()`은 카테고리 활성화 시에만 표시
   - 프로덕션에서는 기본적으로 비활성화

3. **디버그 로그는 개발 모드 + 카테고리 활성화**
   - `logger.debug()`는 두 조건 모두 만족 시에만 표시
   - 기본적으로 비활성화

4. **일관된 포맷**
   - `[Category] Message` 형식
   - 구조화된 데이터 객체 전달

## 구현 상태

✅ **완료:**
- `packages/renderer-dom/src/utils/dev.ts` - `__DEV__`, `__TEST__` 플래그
- `packages/renderer-dom/src/utils/logger.ts` - 카테고리별 logger
- `packages/renderer-dom/src/index.ts` - Public API export

⏳ **진행 중:**
- 기존 코드 마이그레이션 (점진적)

📋 **향후 계획:**
- Vite 빌드 설정에서 `__DEV__` 플래그 처리
- 프로덕션 빌드 최적화
