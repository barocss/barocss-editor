export interface ClientWriterLock { release(): void }
export interface ClientLockManager {
  request(name: string, options: { ifAvailable: true }, callback: (lock: object | null) => Promise<void>): Promise<unknown>;
}

/** A stable outbox client has one live browser writer, independent of server auth. */
export function acquireClientWriter(clientId: string, manager: ClientLockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks): Promise<ClientWriterLock> {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(clientId)) return Promise.reject(new Error('Invalid client identity.'));
  if (!manager) return Promise.reject(new Error('Exclusive client locking is unavailable. This client remains closed.'));
  let releaseHeld: () => void = () => {};
  const held = new Promise<void>(resolve => { releaseHeld = resolve; });
  return new Promise<ClientWriterLock>((resolve, reject) => {
    void manager.request(`wonffice-sheet-client:${clientId}`, { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('This client is already open in another tab. Open a second screen for a new session.')); return; }
      let released = false;
      resolve({ release: () => { if (!released) { released = true; releaseHeld(); } } });
      await held;
    }).catch(reject);
  });
}
