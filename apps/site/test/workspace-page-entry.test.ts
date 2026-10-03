import { describe, expect, it } from 'vitest';
import { resolveWorkspacePageEntry } from '../src/workspace-page-entry';

const home = { sid: 'runtime-home', id: 'native-home', path: '/' };
const second = { sid: 'runtime-second', id: 'native-second', path: '/about' };

describe('Workspace Site page entry', () => {
  it('restores durable native identity after reordering and runtime SID replacement', () => {
    const pages = [{ ...second, sid: 'new-second' }, { ...home, sid: 'new-home' }];
    const before = JSON.stringify(pages);
    expect(resolveWorkspacePageEntry(pages, second.id)).toBe('new-second');
    expect(JSON.stringify(pages)).toBe(before);
  });

  it('refuses stale, empty and SID-only remembered values instead of opening the home or first page', () => {
    for (const remembered of ['missing', '', ' ', second.sid]) {
      expect(resolveWorkspacePageEntry([home, second], remembered)).toBeUndefined();
    }
  });

  it('refuses a duplicated remembered native identity even when paths differ', () => {
    expect(resolveWorkspacePageEntry([home, second, { ...second, sid: 'duplicate', path: '/other' }], second.id)).toBeUndefined();
  });

  it('opens only the unique canonical home without a remembered identity', () => {
    expect(resolveWorkspacePageEntry([second, home], null)).toBe(home.sid);
    expect(resolveWorkspacePageEntry([second], null)).toBeUndefined();
    expect(resolveWorkspacePageEntry([], null)).toBeUndefined();
    expect(resolveWorkspacePageEntry([{ ...home, path: '/index' }], null)).toBeUndefined();
  });

  it('requires a uniquely identified home and never guesses from page order', () => {
    expect(resolveWorkspacePageEntry([home, { ...second, path: '/' }], null)).toBeUndefined();
    expect(resolveWorkspacePageEntry([{ ...home, id: '' }], null)).toBeUndefined();
    expect(resolveWorkspacePageEntry([{ ...home, id: ' ' }], null)).toBeUndefined();
    expect(resolveWorkspacePageEntry([home, { ...second, id: home.id }], null)).toBeUndefined();
  });
});
