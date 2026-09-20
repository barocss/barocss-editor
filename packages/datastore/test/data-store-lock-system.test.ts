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
      dataStore.setLockTimeout(100); // 100ms timeout
      
      await dataStore.acquireLock();
      
      await expect(dataStore.acquireLock()).rejects.toThrow('timeout');
    });

    it('should not timeout when lock is released in time', async () => {
      dataStore.setLockTimeout(1000);
      
      const lockId1 = await dataStore.acquireLock('owner-1');
      
      // Release lock after 50ms
      setTimeout(() => {
        dataStore.releaseLock(lockId1);
      }, 50);
      
      // Attempt to acquire after lock release
      const lockId2 = await dataStore.acquireLock('owner-2');
      expect(lockId2).toMatch(/^lock-\d+-[a-z0-9]+$/);
    });
  });

  describe('Transaction Ordering', () => {
    it('should process transactions in order (FIFO)', async () => {
      const results: number[] = [];
      const store = dataStore;
      const promises = Array.from({ length: 3 }, async (_, i) => {
        const lockId = await store.acquireLock();
        results.push(i + 1);
        await new Promise<void>(resolve => {
          setTimeout(() => {
            store.releaseLock(lockId);
            resolve();
          }, 50);
        });
      });

      await Promise.all(promises);
      expect(results).toEqual([1, 2, 3]);
      expect(store.isLocked()).toBe(false);
      expect(store.getQueueLength()).toBe(0);
    });

    it('should handle concurrent lock acquisitions', async () => {
      const results: number[] = [];
      const promises = Array.from({ length: 5 }, (_, i) =>
        dataStore.acquireLock(`owner-${i + 1}`).then(lockId => {
          results.push(i + 1);
          return lockId;
        })
      );

      for (let i = 0; i < promises.length; i++) {
        const lockId = await promises[i];
        // Let already-resolved acquisitions run before checking exclusivity.
        await Promise.resolve();
        expect(results).toEqual(Array.from({ length: i + 1 }, (_, j) => j + 1));
        expect(dataStore.getCurrentLock()).toMatchObject({
          lockId,
          ownerId: `owner-${i + 1}`
        });
        expect(dataStore.getQueueLength()).toBe(promises.length - i - 1);
        dataStore.releaseLock(lockId);
      }

      await Promise.all(promises);
      expect(dataStore.isLocked()).toBe(false);
      expect(dataStore.getQueueLength()).toBe(0);
      expect(dataStore.getLockStats()).toMatchObject({
        totalAcquisitions: 5,
        totalReleases: 5,
        totalTimeouts: 0
      });
    });
  });

  describe('Lock Statistics', () => {
    it('should track lock statistics correctly', async () => {
      const initialStats = dataStore.getLockStats();
      expect(initialStats.totalAcquisitions).toBe(0);
      expect(initialStats.totalReleases).toBe(0);
      expect(initialStats.totalTimeouts).toBe(0);
      
      // Acquire/release lock
      const lockId = await dataStore.acquireLock('test-owner');
      dataStore.releaseLock(lockId);
      
      const stats = dataStore.getLockStats();
      expect(stats.totalAcquisitions).toBe(1);
      expect(stats.totalReleases).toBe(1);
      expect(stats.totalTimeouts).toBe(0);
    });

    it('should track timeout statistics', async () => {
      // Isolate from previous tests' timers (e.g. releaseLock from "should not timeout when lock is released in time")
      await new Promise(r => setTimeout(r, 60));
      dataStore.setLockTimeout(50); // 50ms timeout
      
      // Acquire first lock (don't release)
      await dataStore.acquireLock();
      
      // Second acquire times out (await rejection so timeout callback runs)
      await expect(dataStore.acquireLock()).rejects.toThrow(/timeout/);
      
      const stats = dataStore.getLockStats();
      expect(stats.totalTimeouts).toBe(1);
      
      // Release first lock
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
      
      // Acquire first lock
      await dataStore.acquireLock();
      
      // Attempt to acquire second lock (added to queue)
      const promise2 = dataStore.acquireLock();
      expect(dataStore.getQueueLength()).toBe(1);
      
      // Attempt to acquire third lock (added to queue)
      const promise3 = dataStore.acquireLock();
      expect(dataStore.getQueueLength()).toBe(2);
      
      // Release first lock
      dataStore.releaseLock();
      await promise2;
      expect(dataStore.getQueueLength()).toBe(1);
      
      // Release second lock
      dataStore.releaseLock();
      await promise3;
      expect(dataStore.getQueueLength()).toBe(0);
    });
  });

  describe('Lock ID System', () => {
    it('should validate lock ID on release', async () => {
      const lockId = await dataStore.acquireLock('test-owner');
      
      // Attempt to release with wrong lock ID
      expect(() => dataStore.releaseLock('wrong-sid')).toThrow('Lock ID mismatch');
      
      // Release with correct lock ID
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
      // Acquire first lock
      const lockId1 = await dataStore.acquireLock('owner-1');
      
      // Attempt second lock (added to queue)
      const promise2 = dataStore.acquireLock('owner-2');
      
      // Check queue information
      const queueInfo = dataStore.getQueueInfo();
      expect(queueInfo).toHaveLength(1);
      expect(queueInfo[0].ownerId).toBe('owner-2');
      // waitTime can be 0 (if executed too quickly)
      
      // Release first lock
      dataStore.releaseLock(lockId1);
      await promise2;
      
      // Verify queue is empty
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
      
      // Second release is ignored
      expect(() => dataStore.releaseLock()).not.toThrow();
    });
  });

  describe('Integration with DataStore Operations', () => {
    it('should work with node operations', async () => {
      await dataStore.acquireLock();
      
      // Create node
      const node = { sid: 'node-1', stype: 'paragraph', text: 'Hello' };
      dataStore.setNode(node);
      
      expect(dataStore.getNode('node-1')).toBeDefined();
      
      dataStore.releaseLock();
    });

    it('should maintain data consistency during concurrent operations', async () => {
      const results: any[] = [];
      
      // Attempt to create multiple nodes concurrently
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
      
      // Verify all nodes are created successfully
      expect(results).toHaveLength(3);
      expect(results.every(node => node !== undefined)).toBe(true);
    });
  });
});
