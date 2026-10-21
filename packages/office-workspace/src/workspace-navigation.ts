let beforeLeave: (() => Promise<boolean>) | undefined;
let beforeLeaveEpoch = 0;
let navigation: symbol | undefined;

/** The header and file tree share one transition, including feedback and catalog awaits. */
export function beginWorkspaceNavigation(): (() => void) | undefined {
  if (navigation) return undefined;
  const lease = Symbol('workspace navigation');
  navigation = lease;
  return () => { if (navigation === lease) navigation = undefined; };
}

/** Product feedback remains owned by its mounted header; the tree uses the same boundary. */
export function registerWorkspaceBeforeLeave(prepare: () => Promise<boolean>): () => void {
  beforeLeave = prepare;
  const registered = ++beforeLeaveEpoch;
  return () => {
    if (beforeLeave !== prepare || registered !== beforeLeaveEpoch) return;
    beforeLeave = undefined; beforeLeaveEpoch++;
  };
}
export async function prepareWorkspaceBeforeLeave(): Promise<boolean> {
  const prepare = beforeLeave, registered = beforeLeaveEpoch;
  return (!prepare || await prepare()) && beforeLeave === prepare && beforeLeaveEpoch === registered;
}
