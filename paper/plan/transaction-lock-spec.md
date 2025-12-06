# Transaction Lock System Specification

## 개요

DataStore 기반의 글로벌 락 및 큐 관리 시스템을 통한 트랜잭션 순서 보장 메커니즘에 대한 명세서입니다.

## 목적

- **순서 보장**: 트랜잭션이 시작된 순서대로 완료되도록 보장
- **동시성 제어**: 한 번에 하나의 트랜잭션만 실행하여 데이터 일관성 유지
- **FIFO 처리**: First In, First Out 방식으로 트랜잭션 처리
- **타임아웃 관리**: 무한 대기 방지를 위한 타임아웃 설정
- **락 추적**: 고유 락 ID를 통한 소유자 추적 및 디버깅 지원
- **안전한 해제**: 락 ID 검증을 통한 안전한 락 해제

## 아키텍처

### 1. DataStore 락 관리

```typescript
class DataStore {
  // 락 상태 관리 (ID 기반)
  private _currentLock: {
    lockId: string;
    ownerId: string;
    acquiredAt: number;
    timeoutId: NodeJS.Timeout;
  } | null = null;
  
  private _transactionQueue: Array<{
    lockId: string;
    ownerId: string;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  
  private _lockTimeout: number = 5000; // 5초 타임아웃
  
  // 락 통계
  private _lockStats = {
    totalAcquisitions: number;
    totalReleases: number;
    totalTimeouts: number;
    averageWaitTime: number;
  };
}
```

### 2. 락 생명주기 (ID 기반)

```
1. acquireLock(ownerId) 호출
   ├─ 락이 비어있음 → 고유 락 ID 생성 및 즉시 획득
   └─ 락이 사용 중 → 큐에 추가 및 대기 (락 ID 생성)

2. 트랜잭션 실행
   ├─ 성공 → commit()
   └─ 실패 → rollback()

3. releaseLock(lockId) 호출
   ├─ 락 ID 검증 → 올바른 ID인지 확인
   ├─ 큐가 비어있음 → 락 해제
   └─ 큐에 대기 중 → 다음 트랜잭션에게 락 전달
```

## API 명세

### DataStore 락 API

#### `acquireLock(ownerId?: string): Promise<string>`

글로벌 락을 획득합니다.

**매개변수:**
- `ownerId` (선택사항): 락 소유자 ID (트랜잭션 ID 또는 사용자 ID), 기본값: 'unknown'

**동작:**
- 락이 비어있으면 고유 락 ID 생성 및 즉시 획득
- 락이 사용 중이면 큐에 추가하여 대기 (락 ID 생성)
- 타임아웃 설정 (기본 5초)

**반환값:**
- `Promise<string>`: 락 ID 반환
- `Error`: 타임아웃 시 reject

**예외:**
- `Lock acquisition timeout after 5000ms for owner {ownerId}`: 타임아웃 발생

#### `releaseLock(lockId?: string): void`

글로벌 락을 해제합니다.

**매개변수:**
- `lockId` (선택사항): 해제할 락 ID (검증용)

**동작:**
- 락 ID 검증 (제공된 경우)
- 현재 락 해제
- 큐에 대기 중인 다음 트랜잭션에게 락 전달
- 큐가 비어있으면 락 상태를 null로 설정

**예외:**
- `Lock ID mismatch: expected {expectedId}, got {providedId}`: 락 ID 불일치

#### `isLocked(): boolean`

현재 락 상태를 확인합니다.

**반환값:**
- `true`: 락이 사용 중
- `false`: 락이 비어있음

#### `getCurrentLock(): LockInfo | null`

현재 락 정보를 반환합니다.

**반환값:**
```typescript
interface LockInfo {
  lockId: string;
  ownerId: string;
  acquiredAt: number;
}
```
- `LockInfo`: 현재 락 정보
- `null`: 락이 비어있음

#### `getQueueLength(): number`

대기 중인 트랜잭션 수를 반환합니다.

**반환값:**
- `number`: 큐에 대기 중인 트랜잭션 수

#### `getQueueInfo(): QueueItem[]`

대기 중인 트랜잭션 목록을 반환합니다.

**반환값:**
```typescript
interface QueueItem {
  lockId: string;
  ownerId: string;
  waitTime: number;
}
```
- `QueueItem[]`: 대기 중인 트랜잭션들의 정보

#### `getLockStats(): LockStats`

락 통계 정보를 반환합니다.

**반환값:**
```typescript
interface LockStats {
  totalAcquisitions: number;    // 총 락 획득 횟수
  totalReleases: number;        // 총 락 해제 횟수
  totalTimeouts: number;        // 총 타임아웃 횟수
  averageWaitTime: number;      // 평균 대기 시간 (ms)
  queueLength: number;          // 현재 대기 중인 트랜잭션 수
  isLocked: boolean;            // 현재 락 상태
  currentLock: LockInfo | null; // 현재 락 정보
  queue: QueueItem[];           // 대기 중인 트랜잭션 목록
}
```

#### `setLockTimeout(timeout: number): void`

락 타임아웃을 설정합니다.

**매개변수:**
- `timeout`: 타임아웃 시간 (밀리초)

#### `resetLockStats(): void`

락 통계를 초기화합니다.

### TransactionManager 통합

#### 트랜잭션 실행 흐름 (락 ID 기반)

```typescript
async execute(operations: any[]): Promise<TransactionResult> {
  let lockId: string | null = null;
  
  try {
    // 1. 글로벌 락 획득
    lockId = await this._dataStore.acquireLock('transaction-execution');

    // 2. 트랜잭션 시작
    this._beginTransaction('DSL Transaction');

    // 3. DataStore overlay 트랜잭션 시작
    this._dataStore.begin();

    // 4. 모든 operations 실행 및 결과 수집
    const executedOperations: any[] = [];
    for (const operation of operations) {
      const result = await this._executeOperation(operation);
      executedOperations.push(result || operation);
    }

    // 5. overlay 종료 및 커밋
    this._dataStore.end();
    this._dataStore.commit();

    // 6. 성공 결과 반환
    const result = {
      success: true,
      errors: [],
      transactionId: this._currentTransaction!.sid,
      operations: executedOperations
    };

    // 7. 정리
    this._currentTransaction = null;
    return result;

  } catch (error: any) {
    // 에러 발생 시 overlay 롤백
    try { this._dataStore.rollback(); } catch (_) {}
    
    const transactionId = this._currentTransaction?.sid;
    this._currentTransaction = null;

    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      transactionId,
      operations
    };
  } finally {
    // 8. 글로벌 락 해제
    if (lockId) {
      this._dataStore.releaseLock(lockId);
    }
  }
}
```

## 사용 예시

### 1. 기본 사용법 (락 ID 기반)

```typescript
// DataStore 인스턴스 생성
const dataStore = new DataStore();

// 트랜잭션 매니저 생성
const transactionManager = new TransactionManager(dataStore);

// DSL을 통한 트랜잭션 실행 (자동으로 락 관리)
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();
```

### 2. 락 상태 모니터링 (향상된 정보)

```typescript
// 락 상태 확인
console.log('Is locked:', dataStore.isLocked());

// 현재 락 정보 확인
const currentLock = dataStore.getCurrentLock();
if (currentLock) {
  console.log('Current lock owner:', currentLock.ownerId);
  console.log('Lock acquired at:', new Date(currentLock.acquiredAt));
  console.log('Lock ID:', currentLock.lockId);
}

// 큐 정보 확인
console.log('Queue length:', dataStore.getQueueLength());
const queueInfo = dataStore.getQueueInfo();
queueInfo.forEach(item => {
  console.log(`Waiting: ${item.ownerId} (${item.waitTime}ms)`);
});

// 락 통계 확인
const stats = dataStore.getLockStats();
console.log('Lock statistics:', stats);
```

### 3. 타임아웃 설정

```typescript
// 타임아웃을 10초로 설정
dataStore.setLockTimeout(10000);

// 통계 초기화
dataStore.resetLockStats();
```

### 4. 동시 트랜잭션 처리 (락 ID 추적)

```typescript
// 여러 트랜잭션이 동시에 시작되는 경우
const promises = [
  transaction(editor, [create(textNode('inline-text', 'Text 1'))]).commit(),
  transaction(editor, [create(textNode('inline-text', 'Text 2'))]).commit(),
  transaction(editor, [create(textNode('inline-text', 'Text 3'))]).commit()
];

// 순서대로 실행됨 (FIFO)
const results = await Promise.all(promises);

// 각 트랜잭션의 락 정보 확인
results.forEach((result, index) => {
  console.log(`Transaction ${index + 1} completed:`, result.success);
});
```

### 5. 수동 락 관리 (고급 사용법)

```typescript
// 수동으로 락 획득/해제
const lockId = await dataStore.acquireLock('manual-operation');
try {
  // 락이 보호된 작업 수행
  console.log('Performing protected operation...');
} finally {
  // 반드시 락 해제
  dataStore.releaseLock(lockId);
}
```

## 성능 고려사항

### 1. 락 오버헤드

- **락 획득/해제**: 각 트랜잭션마다 락 관리 오버헤드 발생
- **큐 관리**: 대기 중인 트랜잭션들의 메모리 사용량
- **타임아웃 처리**: 타임아웃 감지를 위한 타이머 관리

### 2. 동시성 제한

- **순차 실행**: 한 번에 하나의 트랜잭션만 실행 가능
- **대기 시간**: 나중에 시작된 트랜잭션은 대기해야 함
- **병렬성 없음**: CPU 멀티코어 활용 불가

### 3. 최적화 방안

- **락 범위 최소화**: 필요한 부분만 락으로 보호
- **타임아웃 조정**: 적절한 타임아웃 값 설정
- **통계 모니터링**: 락 성능 지표 추적

## 에러 처리

### 1. 타임아웃 에러

```typescript
try {
  const lockId = await dataStore.acquireLock('my-operation');
  // 작업 수행
  dataStore.releaseLock(lockId);
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('Lock acquisition timeout - too many concurrent transactions');
  } else if (error.message.includes('Lock ID mismatch')) {
    console.log('Lock ID mismatch - attempting to release wrong lock');
  }
}
```

### 2. 락 해제 실패

```typescript
try {
  dataStore.releaseLock(lockId);
} catch (error) {
  if (error.message.includes('Lock ID mismatch')) {
    console.error('Lock ID mismatch:', error.message);
  } else {
    console.error('Failed to release lock:', error);
  }
  // 락 상태 복구 로직
}
```

### 3. 트랜잭션 실패 시 락 해제

```typescript
let lockId: string | null = null;
try {
  lockId = await this._dataStore.acquireLock('transaction-sid');
  // 트랜잭션 실행
} catch (error) {
  // 에러 처리
} finally {
  // 항상 락 해제 (finally 블록 사용)
  if (lockId) {
    this._dataStore.releaseLock(lockId);
  }
}
```

## 테스트 시나리오

### 1. 기본 락 동작 (락 ID 기반)

```typescript
describe('Lock System', () => {
  it('should acquire and release lock with ID', async () => {
    const dataStore = new DataStore();
    
    expect(dataStore.isLocked()).toBe(false);
    
    const lockId = await dataStore.acquireLock('test-owner');
    expect(dataStore.isLocked()).toBe(true);
    expect(lockId).toMatch(/^lock-\d+-[a-z0-9]+$/);
    
    const lockInfo = dataStore.getCurrentLock();
    expect(lockInfo?.ownerId).toBe('test-owner');
    
    dataStore.releaseLock(lockId);
    expect(dataStore.isLocked()).toBe(false);
  });

  it('should handle transaction with lock', async () => {
    const dataStore = new DataStore();
    const editor = { dataStore, _dataStore: dataStore };
    
    const result = await transaction(editor, [
      create(textNode('inline-text', 'Hello'))
    ]).commit();
    
    expect(result.success).toBe(true);
    expect(dataStore.isLocked()).toBe(false); // 락이 자동으로 해제됨
  });
});
```

### 2. 순서 보장 (락 ID 추적)

```typescript
it('should process transactions in order', async () => {
  const dataStore = new DataStore();
  const results: number[] = [];
  
  const promises = [
    dataStore.acquireLock('owner-1').then(lockId => { 
      results.push(1); 
      dataStore.releaseLock(lockId); 
    }),
    dataStore.acquireLock('owner-2').then(lockId => { 
      results.push(2); 
      dataStore.releaseLock(lockId); 
    }),
    dataStore.acquireLock('owner-3').then(lockId => { 
      results.push(3); 
      dataStore.releaseLock(lockId); 
    })
  ];
  
  await Promise.all(promises);
  expect(results).toEqual([1, 2, 3]);
});
```

### 3. 타임아웃 처리 (락 ID 기반)

```typescript
it('should timeout when lock is not released', async () => {
  const dataStore = new DataStore();
  dataStore.setLockTimeout(100); // 100ms 타임아웃
  
  const lockId1 = await dataStore.acquireLock('owner-1');
  
  await expect(dataStore.acquireLock('owner-2')).rejects.toThrow('timeout');
  
  dataStore.releaseLock(lockId1);
});
```

## 확장 가능성

### 1. 세밀한 락 (Fine-grained Locking)

```typescript
// 노드별 락 관리
class NodeLockManager {
  private _nodeLocks = new Map<string, boolean>();
  
  async acquireNodeLock(nodeId: string): Promise<void> {
    // 특정 노드에 대한 락 획득
  }
  
  releaseNodeLock(nodeId: string): void {
    // 특정 노드에 대한 락 해제
  }
}
```

### 2. 우선순위 큐

```typescript
// 우선순위 기반 트랜잭션 처리
class PriorityLockManager {
  private _priorityQueue: Array<{ priority: number; callback: () => void }> = [];
  
  async acquireLock(priority: number = 0): Promise<void> {
    // 우선순위에 따른 락 획득
  }
}
```

### 3. 분산 락

```typescript
// 여러 DataStore 인스턴스 간 락 동기화
class DistributedLockManager {
  async acquireDistributedLock(lockId: string): Promise<void> {
    // 분산 환경에서의 락 관리
  }
}
```

## 실제 구현과의 연동

### TransactionManager에서의 락 사용
```typescript
// TransactionManager.execute()에서 실제 락 사용
async execute(operations: any[]): Promise<TransactionResult> {
  let lockId: string | null = null;
  
  try {
    // 1. 글로벌 락 획득 (고정된 ownerId 사용)
    lockId = await this._dataStore.acquireLock('transaction-execution');
    
    // ... 트랜잭션 실행 ...
    
  } finally {
    // 8. 글로벌 락 해제 (성공/실패 관계없이 항상 실행)
    if (lockId) {
      this._dataStore.releaseLock(lockId);
    }
  }
}
```

### DSL과의 통합
```typescript
// DSL을 통한 트랜잭션 실행 시 자동 락 관리
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

// 내부적으로 TransactionManager.execute()가 호출되어 락이 자동 관리됨
```

## 결론

DataStore 기반의 글로벌 락 시스템 (락 ID 기반)은 다음과 같은 장점을 제공합니다:

1. **순서 보장**: 트랜잭션이 시작된 순서대로 완료
2. **안전성**: 락 ID 검증을 통한 안전한 락 해제
3. **추적성**: 고유 락 ID를 통한 소유자 추적 및 디버깅
4. **일관성**: 데이터 일관성 보장
5. **모니터링**: 상세한 락 통계 및 큐 정보를 통한 성능 모니터링
6. **확장성**: 필요에 따라 세밀한 락으로 확장 가능
7. **디버깅**: 락 소유자 정보를 통한 문제 진단 용이
8. **자동 관리**: DSL을 통한 트랜잭션에서 락이 자동으로 관리됨

이 시스템을 통해 트랜잭션의 순서를 보장하고 데이터 일관성을 유지하면서도, 락 관련 문제를 쉽게 진단하고 해결할 수 있습니다. DSL과의 완벽한 통합으로 개발자는 락 관리에 대해 신경 쓸 필요 없이 트랜잭션을 사용할 수 있습니다.
