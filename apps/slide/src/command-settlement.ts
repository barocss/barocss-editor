export interface NativeCommandFailure {
  readonly error: unknown;
  /** Host calls only after explicit recovery; refuses new failures, pending writes or stale owners. */
  acknowledge(isCurrent: () => boolean): boolean;
}
/** Tracks started native commands. Child input delivery must run before this boundary. */
export function createCommandSettlement(owner: () => unknown) {
  const pending = new Set<Promise<void>>();
  let failure: { owner: unknown; error: unknown } | undefined;
  const fail = (error: unknown, captured = owner()) => {
    if (captured === owner()) failure = { owner: captured, error };
  };
  return {
    fail,
    failure(): NativeCommandFailure | undefined {
      const captured = failure;
      if (!captured || captured.owner === undefined || captured.owner !== owner()) return undefined;
      return Object.freeze({ error: captured.error, acknowledge: (isCurrent: () => boolean) => {
        if (failure !== captured || pending.size || captured.owner !== owner() || !isCurrent()) return false;
        failure = undefined;
        return true;
      } });
    },
    /** Return the original Promise: observation must not change caller results or rejection. */
    track<T>(command: Promise<T>): Promise<T> {
      const captured = owner();
      const observed = command.then(() => {}, error => {
        if (owner() === captured) fail(error);
      });
      pending.add(observed);
      void observed.then(() => pending.delete(observed));
      return command;
    },
    async settle(isCurrent: () => boolean): Promise<boolean> {
      const captured = owner();
      const owns = () => captured !== undefined && owner() === captured && isCurrent();
      if (!owns()) return false;
      while (pending.size) {
        await Promise.all([...pending]);
        if (!owns()) return false;
      }
      return owns() && failure?.owner !== captured;
    },
  };
}
