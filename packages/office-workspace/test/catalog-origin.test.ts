import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyLibraryOrigin, readLibraryOrigin, saveLibraryOrigin, workspaceReturnURL } from '../src/catalog-origin';

afterEach(() => vi.unstubAllGlobals());
describe('Workspace library return context', () => {
  it('restores exact query, product, folder, view and scroll without crossing Workspaces', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const origin = { query: '발표 최종', product: 'site' as const, view: 'favorites' as const, folder: 'A/B', scroll: 436 };
    saveLibraryOrigin('one', origin);
    expect(readLibraryOrigin('one')).toEqual(origin);
    expect(readLibraryOrigin('two')).toEqual(emptyLibraryOrigin());
    expect(workspaceReturnURL('one')).toBe('/?workspace=one&view=library');
    expect(workspaceReturnURL('one', 'p')).toBe('/?workspace=one&project=p');
  });
  it('rejects malformed or unknown presentation state and tolerates unavailable storage', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => '{"query":5,"view":"admin","product":"private","scroll":-1,"folder":{}}' });
    expect(readLibraryOrigin('one')).toEqual(emptyLibraryOrigin());
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('unavailable'); } });
    expect(readLibraryOrigin('one')).toEqual(emptyLibraryOrigin());
  });
});
