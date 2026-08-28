import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * A command a surface offers changes the document when it runs.
 *
 * Written after the fault it would have caught, which had been in the **engine** for months:
 * `find` and `findAndReplace` were registered as `execute: () => true` with `canExecute: () => true`
 * beside them, so 편집 › 찾기 lit up, ran, reported success and drew nothing in every product that
 * offered it. Every other check passed — they ask what a command's schema says it makes and whether
 * anything surfaces it, and none of them can ask whether pressing it does anything.
 */
describe('a command that says it can run and then does nothing', () => {
  const schema = {
    topNode: 'document',
    nodes: new Map([
      ['document', { name: 'document', content: 'paragraph' }],
      ['paragraph', { name: 'paragraph' }]
    ])
  };
  const base = { schema, hasRenderer: () => true };

  it('is a finding', () => {
    const report = conformance({
      ...base,
      reachable: ['insertHeading', 'find'],
      commandChanges: (command) => command !== 'find'
    });
    expect(report.findings.map((one) => one.subject)).toEqual(['find']);
    expect(report.findings[0].detail).toContain('said it could run and then changed nothing');
  });

  it('says nothing about a command that moves the document', () => {
    const report = conformance({
      ...base,
      reachable: ['insertHeading', 'removeBlocks'],
      commandChanges: () => true
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-command-does-something']).toBe(2);
  });

  /**
   * The third answer, and the reason it is not a pass.
   *
   * A probe that cannot put the product into a state where the command says it can run has not
   * checked it — and counting that as a pass is how a probe that quietly stopped setting anything up
   * comes to look like coverage, which is the failure this whole package is shaped around.
   */
  it('counts what it could not ask about, rather than passing it', () => {
    const report = conformance({
      ...base,
      reachable: ['pasteBlocks', 'removeLink', 'insertHeading'],
      commandChanges: (command) => (command === 'insertHeading' ? true : null)
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-command-does-something']).toBe(1);
    expect(report.unanswered['every-command-does-something']).toBe(2);
  });

  it('is exempted by a reason, and the reason goes stale like every other', () => {
    const exempt = {
      exportSite: 'reads the document out as files; a publish that edited the document would be a bug'
    };
    const still = conformance({
      ...base,
      reachable: ['exportSite'],
      commandChanges: () => false,
      exempt
    });
    expect(still.findings).toEqual([]);
    expect(still.staleExemptions).toEqual([]);

    /*
     * And the day `exportSite` starts moving the document, the exemption is what fails — not the
     * check. An exemption here is a claim that the finding is expected, and a claim that stops being
     * true is itself a failure.
     */
    const changed = conformance({ ...base, reachable: ['exportSite'], commandChanges: () => true, exempt });
    expect(changed.findings).toEqual([]);
    expect(changed.staleExemptions.map((one) => one.subject)).toEqual(['exportSite']);
  });

  it('does not run at all when a product has not supplied the probe', () => {
    // Adopting the checks one at a time is the contract; a check with no probe reports nothing and
    // is visible as `examined: 0` rather than as a pass.
    const report = conformance({ ...base, reachable: ['insertHeading'] });
    expect(report.examined['every-command-does-something']).toBeUndefined();
  });
});
