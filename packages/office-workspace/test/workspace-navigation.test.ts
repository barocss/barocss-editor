import { describe, expect, it } from 'vitest';
import { beginWorkspaceNavigation, prepareWorkspaceBeforeLeave, registerWorkspaceBeforeLeave } from '../src/workspace-navigation';

describe('the shared Workspace transition boundary', () => {
  it('allows only one target while feedback or catalog work is pending and retires old releases', () => {
    const first = beginWorkspaceNavigation(); expect(first).toBeDefined();
    expect(beginWorkspaceNavigation()).toBeUndefined();
    first!();
    const next = beginWorkspaceNavigation(); expect(next).toBeDefined();
    first!(); expect(beginWorkspaceNavigation()).toBeUndefined();
    next!();
  });
  it('waits for the mounted feedback and refuses its failed draft flush', async () => {
    let finish: (saved: boolean) => void = () => {};
    const remove = registerWorkspaceBeforeLeave(() => new Promise(resolve => { finish = resolve; }));
    let settled = false;
    const result = prepareWorkspaceBeforeLeave().then(value => { settled = true; return value; });
    await Promise.resolve(); expect(settled).toBe(false);
    finish(false); expect(await result).toBe(false); remove();
  });
  it('refuses a completed flush after the feedback owner changes', async () => {
    let finish: (saved: boolean) => void = () => {};
    const old = registerWorkspaceBeforeLeave(() => new Promise(resolve => { finish = resolve; }));
    const result = prepareWorkspaceBeforeLeave();
    const current = registerWorkspaceBeforeLeave(async () => true);
    old(); finish(true); expect(await result).toBe(false);
    expect(await prepareWorkspaceBeforeLeave()).toBe(true); current();
    expect(await prepareWorkspaceBeforeLeave()).toBe(true);
  });
});
