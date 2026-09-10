export interface LearningStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const browserStorage: LearningStorage = {
  async getItem(key) {
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
};

// Keep snapshots in submission order. A failed write must not block later saves.
export function orderedStorage(backend: LearningStorage): LearningStorage {
  const pending = new Map<string, Promise<void>>();
  return {
    async getItem(key) {
      await pending.get(key)?.catch(() => {});
      return backend.getItem(key);
    },
    setItem(key, value) {
      const write = (pending.get(key) ?? Promise.resolve())
        .catch(() => {})
        .then(() => backend.setItem(key, value));
      pending.set(key, write);
      const cleanup = () => {
        if (pending.get(key) === write) pending.delete(key);
      };
      void write.then(cleanup, cleanup);
      return write;
    },
  };
}

let active = orderedStorage(browserStorage);
// Configure once, before loading user data. Tests can supply an async backend.
export function configureLearningStorage(backend: LearningStorage) {
  active = orderedStorage(backend);
}
export const learningStorage: LearningStorage = {
  getItem: (key) => active.getItem(key),
  setItem: (key, value) => active.setItem(key, value),
};

export const viewerStorageKey = "formula-game:viewer:v1";
export const migrationStorageKey = "formula-game:migration:browser-to-sdk:v1";
export const validViewer = (value: string | null): value is string =>
  value !== null && /^guest-[a-z0-9-]+$/.test(value);

type LegacyStorage = Pick<Storage, "length" | "key" | "getItem">;
export async function migrateBrowserLearning(
  native: LearningStorage,
  legacy: LegacyStorage,
): Promise<void> {
  if (await native.getItem(migrationStorageKey)) return;
  const nativeViewer = await native.getItem(viewerStorageKey);
  const oldViewer = legacy.getItem(viewerStorageKey);
  // Never attach one local learner's records to another learner's identity.
  if (validViewer(oldViewer) && (!nativeViewer || nativeViewer === oldViewer)) {
    const user = encodeURIComponent(oldViewer);
    const exact = new Set([
      `formula-game:history:v1:${user}`,
      `formula-game:presets:v1:${user}`,
      "formula-game:progress:v3",
    ]);
    const entries: [string, string][] = [];
    for (let i = 0; i < legacy.length; i++) {
      const key = legacy.key(i);
      if (
        !key ||
        !(
          exact.has(key) ||
          key.startsWith(`formula-game:derivation:v1:${user}:`)
        )
      )
        continue;
      const value = legacy.getItem(key);
      if (value !== null) entries.push([key, value]);
    }
    for (const [key, value] of entries) {
      if ((await native.getItem(key)) === null)
        await native.setItem(key, value);
    }
    // Commit identity last so an interrupted migration can be retried.
    if (!nativeViewer) await native.setItem(viewerStorageKey, oldViewer);
  }
  await native.setItem(migrationStorageKey, "1");
  // Retain the browser copy. Never clear the user's storage.
}
