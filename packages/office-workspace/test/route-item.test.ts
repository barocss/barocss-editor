import { describe, expect, it } from 'vitest';
import { resolveWorkspaceItem } from '../src/route-item';

describe('compact Workspace item identity', () => {
  it.each(['note', 'word', 'slides', 'site'] as const)('resolves %s from catalog metadata without a product in the address', product => {
    expect(resolveWorkspaceItem('original', [{ kind: 'document', id: 'original', product }, { kind: 'project', id: 'other' }]))
      .toEqual({ kind: 'document', id: 'original', product });
  });
  it('resolves a project without treating it as a document', () => {
    expect(resolveWorkspaceItem('project', [{ kind: 'project', id: 'project' }, { kind: 'document', id: 'original', product: 'word' }]))
      .toEqual({ kind: 'project', id: 'project' });
  });
  it('refuses a missing item instead of opening a sample or first document', () => {
    expect(() => resolveWorkspaceItem('missing', [{ kind: 'document', id: 'other', product: 'note' }])).toThrow(/not found/i);
  });
  it.each([
    { candidates: [{ kind: 'document', id: 'same', product: 'note' }, { kind: 'document', id: 'same', product: 'word' }] },
    { candidates: [{ kind: 'project', id: 'same' }, { kind: 'document', id: 'same', product: 'slides' }] },
    { candidates: [{ kind: 'project', id: 'same' }, { kind: 'project', id: 'same' }] },
  ] as const)('refuses colliding identities even when an old link names one product', ({ candidates }) => {
    expect(() => resolveWorkspaceItem('same', candidates, { kind: 'document', product: 'note' })).toThrow(/ambiguous/i);
  });
  it('verifies the full original identity retained from an old product link', () => {
    const candidates = [{ kind: 'document', id: 'original', product: 'word' }] as const;
    expect(resolveWorkspaceItem('original', candidates, { kind: 'document', product: 'word' })).toEqual(candidates[0]);
    expect(() => resolveWorkspaceItem('original', candidates, { kind: 'document', product: 'note' })).toThrow(/does not match/i);
    expect(() => resolveWorkspaceItem('original', candidates, { kind: 'project' })).toThrow(/does not match/i);
  });
});
