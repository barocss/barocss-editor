import { describe, it, expect, vi } from 'vitest';
import { getStandardSchemaDefinition } from '../src/standard-schema';
import { getOfficeSchemaDefinition } from '../src/office-schema';

/**
 * **Every standard node is accounted for, one way or the other.**
 *
 * Office takes what it offers from the standard schema by **name**, which is right — its document
 * roots differently and it genuinely does not offer everything. What was wrong is what happened to a
 * name in neither list: it disappeared, in silence, and no check in this repository could see it.
 * Every check here asks about the nodes a product *declares*, so a node no product declares is a node
 * nothing asks about — a fourth kind of blind spot next to the three `operation-harness` names.
 *
 * Found by asking why `emoji` and `mathInline` are built in three layers and reachable from none.
 * They turned out to be **deliberate**, said in prose above the list; the fault was that the prose
 * was the only place it was said.
 */
describe('what office takes from the standard schema', () => {
  it('takes or explains every node, and never both', () => {
    const standard = getStandardSchemaDefinition() as never as { nodes: Record<string, unknown> };
    const office = getOfficeSchemaDefinition() as never as { nodes: Record<string, unknown> };

    /*
     * `document` is the one name deliberately not carried: the standard schema roots at `block+` and
     * office at `surface+`, so a file can hold several pages. Office declares its own.
     */
    const unaccounted = Object.keys(standard.nodes).filter(
      (name) => name !== 'document' && !office.nodes[name]
    );

    /*
     * Twenty-three, and each one has a reason in `OFFICE_LEAVES_BEHIND`. The list is not asserted
     * here — `getOfficeSchemaDefinition` throws when a name is in neither list, so building the
     * schema at all is the check. What this holds is that the two lists stay a **partition**: every
     * standard node either arrives or is explained, and none is both.
     */
    expect(unaccounted.length).toBeGreaterThan(0);
    for (const name of unaccounted) {
      expect(office.nodes[name]).toBeUndefined();
    }
  });

  it('refuses to build when a standard node is in neither list', async () => {
    /*
     * The check that matters, exercised rather than described. A node added to the standard schema
     * tomorrow fails here — at the moment somebody is in a position to say whether office offers it —
     * rather than vanishing and being noticed a year later by somebody wondering why an extension
     * they wrote does nothing.
     *
     * The standard schema is stubbed rather than edited: `getStandardSchemaDefinition` builds a fresh
     * object each call, so there is nothing to add a node *to*.
     */
    vi.resetModules();
    vi.doMock('../src/standard-schema', async () => {
      const real = await vi.importActual<typeof import('../src/standard-schema')>('../src/standard-schema');
      return {
        ...real,
        getStandardSchemaDefinition: () => {
          const said = real.getStandardSchemaDefinition() as never as { nodes: Record<string, unknown> };
          said.nodes['시험용노드'] = { name: '시험용노드', group: 'inline', atom: true } as never;
          return said as never;
        }
      };
    });

    const fresh = await import('../src/office-schema');
    expect(() => fresh.getOfficeSchemaDefinition()).toThrowError(/neither takes nor explains/);

    vi.doUnmock('../src/standard-schema');
    vi.resetModules();
  });
});
