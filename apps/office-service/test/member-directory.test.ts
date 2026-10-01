import { describe, expect, it } from 'vitest';
import { validateDirectoryProvision } from '../src/member-directory-admin.js';

const input = { tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  memberId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', displayLabel: '가상 구성원',
  sourceCategory: 'company_roster' as const, sourceRef: 'roster:synthetic-v1',
  approvalRef: 'approval:synthetic-1', actorRef: 'operator:synthetic-1', expectedRevision: null };
describe('private roster approval contract', () => {
  it('retains Unicode and text labels without turning them into authority', () => {
    expect(validateDirectoryProvision({ ...input, displayLabel: '<가상 구성원>' }).displayLabel)
      .toBe('<가상 구성원>');
    expect(validateDirectoryProvision({ ...input, displayLabel: 'Cafe\u0301' }).displayLabel).toBe('Café');
  });
  it('refuses unapproved, ambiguous, injected and unbounded manifests before database work', () => {
    for (const change of [{ displayLabel: '' }, { displayLabel: ' leading' }, { displayLabel: 'trailing ' },
      { displayLabel: 'line\nfeed' }, { displayLabel: 'a'.repeat(121) }, { approvalRef: '' },
      { sourceRef: 'private?token=secret' }, { actorRef: '' }, { sourceCategory: 'browser_input' },
      { expectedRevision: 0 }, { expectedRevision: 1.5 }, { expectedRevision: 2147483647 },
      { memberId: 'email@example.test' }, { role: 'owner' }]) {
      expect(() => validateDirectoryProvision({ ...input, ...change } as never)).toThrow();
    }
  });
});
