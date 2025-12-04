# 디버깅 방법

## Auto Tracing을 사용한 디버깅

Barocss Editor는 자동 추적(Auto Tracing) 기능을 제공하여 실행 플로우를 디버깅할 수 있습니다.

### 1. Devtool 활성화

```typescript
import { Devtool } from '@barocss/devtool';

const devtool = new Devtool({
  editor,
  enableAutoTracing: true,  // Auto Tracing 활성화
  debug: true
});
```

### 2. Execution Flow 탭 확인

Devtool의 "Execution Flow" 탭에서 다음을 확인할 수 있습니다:

- **플로우 목록**: 최근 실행된 플로우들 (traceId, duration, spans 수)
- **Span 상세**: 각 함수 호출의 실행 시간, 패키지, 입력/출력
- **에러 추적**: 에러가 발생한 span은 빨간색으로 표시

### 3. 디버깅 시나리오

#### 시나리오 1: 특정 함수가 호출되지 않는 경우

1. Execution Flow 탭에서 플로우 목록 확인
2. 예상한 함수가 span 목록에 없는지 확인
3. `instrumentation-targets.ts`에서 해당 함수가 계측 대상에 포함되어 있는지 확인

#### 시나리오 2: 함수 실행 시간이 너무 긴 경우

1. Execution Flow 탭에서 플로우 클릭
2. Span 상세에서 각 함수의 duration 확인
3. 오래 걸리는 함수를 식별하고 최적화

#### 시나리오 3: 에러 발생 위치 추적

1. Execution Flow 탭에서 빨간색으로 표시된 플로우 확인
2. 플로우 클릭하여 에러가 발생한 span 확인
3. 에러 메시지와 스택 트레이스 확인

#### 시나리오 4: 호출 체인 확인

1. Execution Flow 탭에서 플로우 클릭
2. Span 목록에서 부모-자식 관계 확인 (parentSpanId)
3. 전체 호출 체인을 따라가며 문제 지점 식별

### 4. 모니터링 대상 추가

새로운 함수를 모니터링하려면:

```typescript
// packages/devtool/src/auto-tracer/instrumentation-targets.ts

export const INSTRUMENTATION_TARGETS: InstrumentationTarget[] = [
  // ... 기존 대상들 ...
  {
    package: '@barocss/your-package',
    className: 'YourClass',
    methods: ['yourMethod']
  }
];
```

### 5. 브라우저 콘솔에서 확인

```javascript
// Devtool 인스턴스 접근
const devtool = window.__devtool;

// 활성 플로우 확인
console.log(devtool._getCompletedFlows(10));
```

### 6. 이벤트 리스너로 직접 추적

```typescript
editor.on('editor:trace.start', (data) => {
  console.log('[Trace Start]', data);
});

editor.on('editor:trace.end', (data) => {
  console.log('[Trace End]', data);
});

editor.on('editor:trace.error', (data) => {
  console.error('[Trace Error]', data);
});
```

