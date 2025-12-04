import { DataStore } from '../src/data-store';
import { createSchema } from '@barocss/schema';

describe('DataStore Lock System', () => {
  let dataStore: DataStore;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('basic', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'paragraph+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'text+' },
        text: { name: 'text', group: 'inline', attrs: { content: { type: 'string', required: true } } }
      }
    });
    dataStore.registerSchema(schema);
  });

  describe('Basic Lock Operations', () => {
    it('should acquire and release lock with ID', async () => {
      expect(dataStore.isLocked()).toBe(false);
      
      const lockId = await dataStore.acquireLock('test-owner');
      expect(dataStore.isLocked()).toBe(true);
      expect(lockId).toMatch(/^lock-\d+-[a-z0-9]+$/);
      
      const lockInfo = dataStore.getCurrentLock();
      expect(lockInfo).toBeDefined();
      expect(lockInfo?.ownerId).toBe('test-owner');
      expect(lockInfo?.lockId).toBe(lockId);
      
      dataStore.releaseLock(lockId);
      expect(dataStore.isLocked()).toBe(false);
    });

    it('should return queue length', () => {
      expect(dataStore.getQueueLength()).toBe(0);
    });

    it('should provide enhanced lock statistics', () => {
      const stats = dataStore.getLockStats();
      expect(stats).toHaveProperty('totalAcquisitions');
      expect(stats).toHaveProperty('totalReleases');
      expect(stats).toHaveProperty('totalTimeouts');
      expect(stats).toHaveProperty('averageWaitTime');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isLocked');
      expect(stats).toHaveProperty('currentLock');
      expect(stats).toHaveProperty('queue');
    });
  });

  describe('Lock Timeout', () => {
    it('should timeout when lock is not released', async () => {
      dataStore.setLockTimeout(100); // 100ms 타임아웃
      
      await dataStore.acquireLock();
      
      await expect(dataStore.acquireLock()).rejects.toThrow('timeout');
    });

    it('should not timeout when lock is released in time', async () => {
      dataStore.setLockTimeout(1000);
      
      const lockId1 = await dataStore.acquireLock('owner-1');
      
      // 50ms 후에 락 해제
      setTimeout(() => {
        dataStore.releaseLock(lockId1);
      }, 50);
      
      // 락 해제 후 획득 시도
      const lockId2 = await dataStore.acquireLock('owner-2');
      expect(lockId2).toMatch(/^lock-\d+-[a-z0-9]+$/);
    });
  });

  describe('Transaction Ordering', () => {
    it('should process transactions in order (FIFO)', async () => {
      const results: number[] = [];
      
      // 첫 번째 트랜잭션
      const promise1 = dataStore.acquireLock().then(() => {
        results.push(1);
        setTimeout(() => dataStore.releaseLock(), 50);
      });
      
      // 두 번째 트랜잭션
      const promise2 = dataStore.acquireLock().then(() => {
        results.push(2);
        setTimeout(() => dataStore.releaseLock(), 50);
      });
      
      // 세 번째 트랜잭션
      const promise3 = dataStore.acquireLock().then(() => {
        results.push(3);
        setTimeout(() => dataStore.releaseLock(), 50);
      });
      
      await Promise.all([promise1, promise2, promise3]);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should handle concurrent lock acquisitions', async () => {
      const startTime = Date.now();
      const results: number[] = [];
      
      // 동시에 여러 락 획득 시도
      const promises = Array.from({ length: 5 }, (_, i) => 
        dataStore.acquireLock().then(() => {
          results.push(i + 1);
          setTimeout(() => dataStore.releaseLock(), 10);
        })
      );
      
      await Promise.all(promises);
      
      // 순서대로 실행되었는지 확인
      expect(results).toEqual([1, 2, 3, 4, 5]);
      
      // 총 실행 시간이 순차 실행 시간과 비슷한지 확인
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeGreaterThan(40); // 5 * 10ms = 50ms 이상
    });
  });

  describe('Lock Statistics', () => {
    it('should track lock statistics correctly', async () => {
      const initialStats = dataStore.getLockStats();
      expect(initialStats.totalAcquisitions).toBe(0);
      expect(initialStats.totalReleases).toBe(0);
      expect(initialStats.totalTimeouts).toBe(0);
      
      // 락 획득/해제
      const lockId = await dataStore.acquireLock('test-owner');
      dataStore.releaseLock(lockId);
      
      const stats = dataStore.getLockStats();
      expect(stats.totalAcquisitions).toBe(1);
      expect(stats.totalReleases).toBe(1);
      expect(stats.totalTimeouts).toBe(0);
    });

    it.skip('should track timeout statistics', async () => {
      // TODO: 타임아웃 로직 수정 후 활성화
      dataStore.setLockTimeout(50); // 50ms 타임아웃
      
      // 첫 번째 락 획득 (해제하지 않음)
      await dataStore.acquireLock();
      
      // 두 번째 락 획득 시도 (타임아웃 발생)
      const promise = dataStore.acquireLock();
      
      // 타임아웃 발생 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 타임아웃이 발생했는지 확인
      await expect(promise).rejects.toThrow('timeout');
      
      const stats = dataStore.getLockStats();
      expect(stats.totalTimeouts).toBe(1);
      
      // 첫 번째 락 해제
      dataStore.releaseLock();
    });

    it('should reset statistics', async () => {
      await dataStore.acquireLock();
      dataStore.releaseLock();
      
      let stats = dataStore.getLockStats();
      expect(stats.totalAcquisitions).toBe(1);
      
      dataStore.resetLockStats();
      
      stats = dataStore.getLockStats();
      expect(stats.totalAcquisitions).toBe(0);
      expect(stats.totalReleases).toBe(0);
      expect(stats.totalTimeouts).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should maintain correct queue length', async () => {
      expect(dataStore.getQueueLength()).toBe(0);
      
      // 첫 번째 락 획득
      await dataStore.acquireLock();
      
      // 두 번째 락 획득 시도 (큐에 추가됨)
      const promise2 = dataStore.acquireLock();
      expect(dataStore.getQueueLength()).toBe(1);
      
      // 세 번째 락 획득 시도 (큐에 추가됨)
      const promise3 = dataStore.acquireLock();
      expect(dataStore.getQueueLength()).toBe(2);
      
      // 첫 번째 락 해제
      dataStore.releaseLock();
      await promise2;
      expect(dataStore.getQueueLength()).toBe(1);
      
      // 두 번째 락 해제
      dataStore.releaseLock();
      await promise3;
      expect(dataStore.getQueueLength()).toBe(0);
    });
  });

  describe('Lock ID System', () => {
    it('should validate lock ID on release', async () => {
      const lockId = await dataStore.acquireLock('test-owner');
      
      // 잘못된 락 ID로 해제 시도
      expect(() => dataStore.releaseLock('wrong-sid')).toThrow('Lock ID mismatch');
      
      // 올바른 락 ID로 해제
      expect(() => dataStore.releaseLock(lockId)).not.toThrow();
    });

    it('should track lock owner information', async () => {
      const lockId = await dataStore.acquireLock('transaction-123');
      
      const lockInfo = dataStore.getCurrentLock();
      expect(lockInfo).toBeDefined();
      expect(lockInfo?.ownerId).toBe('transaction-123');
      expect(lockInfo?.lockId).toBe(lockId);
      expect(lockInfo?.acquiredAt).toBeGreaterThan(0);
      
      dataStore.releaseLock(lockId);
    });

    it('should track queue information', async () => {
      // 첫 번째 락 획득
      const lockId1 = await dataStore.acquireLock('owner-1');
      
      // 두 번째 락 시도 (큐에 추가됨)
      const promise2 = dataStore.acquireLock('owner-2');
      
      // 큐 정보 확인
      const queueInfo = dataStore.getQueueInfo();
      expect(queueInfo).toHaveLength(1);
      expect(queueInfo[0].ownerId).toBe('owner-2');
      // waitTime은 0일 수 있음 (너무 빨리 실행되는 경우)
      
      // 첫 번째 락 해제
      dataStore.releaseLock(lockId1);
      await promise2;
      
      // 큐가 비어있는지 확인
      expect(dataStore.getQueueLength()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle lock release without acquisition', () => {
      expect(() => dataStore.releaseLock()).not.toThrow();
    });

    it('should handle multiple lock releases', async () => {
      const lockId = await dataStore.acquireLock('test-owner');
      dataStore.releaseLock(lockId);
      
      // 두 번째 해제는 무시됨
      expect(() => dataStore.releaseLock()).not.toThrow();
    });
  });

  describe('Integration with DataStore Operations', () => {
    it('should work with node operations', async () => {
      await dataStore.acquireLock();
      
      // 노드 생성
      const node = { sid: 'node-1', stype: 'paragraph', text: 'Hello' };
      dataStore.setNode(node);
      
      expect(dataStore.getNode('node-1')).toBeDefined();
      
      dataStore.releaseLock();
    });

    it('should maintain data consistency during concurrent operations', async () => {
      const results: any[] = [];
      
      // 동시에 여러 노드 생성 시도
      const promises = Array.from({ length: 3 }, (_, i) => 
        dataStore.acquireLock().then(() => {
          const id = `node-${i}`;
          const node = { sid: id, stype: 'paragraph', text: `Text ${i}` };
          dataStore.setNode(node);
          results.push(dataStore.getNode(id));
          dataStore.releaseLock();
        })
      );
      
      await Promise.all(promises);
      
      // 모든 노드가 정상적으로 생성되었는지 확인
      expect(results).toHaveLength(3);
      expect(results.every(node => node !== undefined)).toBe(true);
    });
  });
});
