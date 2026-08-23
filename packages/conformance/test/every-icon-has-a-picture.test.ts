import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * The icon a control asks for, and whether anything draws it.
 *
 * The interesting part is what this catches that a browser cannot: both products
 * already assert that nothing **on screen** fell back to drawing its own name, and a
 * control on a tab nobody opened is declared exactly like a visible one.
 */
describe('every icon has a picture', () => {
  const schema = {
    topNode: 'document',
    nodes: new Map([['document', { name: 'document' }]])
  };

  const run = (asked?: string[], drawn?: (name: string) => boolean, exempt?: Record<string, string>) =>
    conformance({
      schema: schema as never,
      hasRenderer: () => true,
      iconsAsked: asked,
      iconDrawn: drawn,
      exempt,
      only: ['every-icon-has-a-picture']
    });

  it('abstains, visibly, when a product has not adopted it', () => {
    const report = run();
    expect(report.findings).toEqual([]);
    // Nought examined: a check with no subjects passes without checking anything, and
    // this is the number that says so.
    expect(report.examined['every-icon-has-a-picture']).toBe(0);
  });

  it('says nothing when every act has a picture', () => {
    const report = run(['bold', 'italic'], () => true);
    expect(report.findings).toEqual([]);
    expect(report.examined['every-icon-has-a-picture']).toBe(2);
  });

  it('names the act whose button would show a word instead', () => {
    const report = run(['bold', 'merge-cells'], (name) => name === 'bold');
    expect(report.findings.map((finding) => finding.subject)).toEqual(['merge-cells']);
    expect(report.findings[0].detail).toContain('merge-cells');
  });

  it('counts an act once however many controls perform it', () => {
    // A toolbar and a context menu both offering 복제 is one missing picture, not two.
    const report = run(['duplicate', 'duplicate'], () => false);
    expect(report.findings).toHaveLength(1);
    expect(report.examined['every-icon-has-a-picture']).toBe(1);
  });

  it('takes one exemption for the whole family', () => {
    const report = run(['a', 'b'], () => false, {
      icon: 'the letter icons of the legacy floating toolbar, which is not the suite’s chrome'
    });
    expect(report.findings).toEqual([]);
    expect(report.staleExemptions).toEqual([]);
  });
});
