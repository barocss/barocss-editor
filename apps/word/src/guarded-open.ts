/** Serial Word-original opening; native ownership and authority stay with the host. */
export function createWordOpenGate() {
  let pending = false;
  return async function request<T, R>({ currentId, targetId, isCurrent, prepare, load, commit, same }: {
    currentId: string; targetId: string;
    isCurrent: () => boolean;
    prepare: () => Promise<boolean>;
    load: () => Promise<T>;
    commit: (loaded: T) => R | Promise<R>;
    same?: () => R | false;
  }): Promise<R | false> {
    if (!isCurrent()) return false;
    if (currentId === targetId) return same?.() ?? false;
    if (pending) return false;
    pending = true;
    try {
      if (!await prepare() || !isCurrent()) return false;
      const loaded = await load();
      if (!isCurrent()) return false;
      return await commit(loaded);
    } catch { return false; }
    finally { pending = false; }
  };
}
