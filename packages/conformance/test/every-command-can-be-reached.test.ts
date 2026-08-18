import { describe, it, expect } from 'vitest';
import { conformance } from '../src/run';

/**
 * A command the product adds is one a reader can run.
 *
 * Written after the failure it would have caught: three clipboard commands
 * registered, working, tested and reachable by nothing — no key, no button —
 * for a day, with every check passing. The harness could see what a toolbar
 * offered and had no way to see what a key map did.
 */
describe('a command nothing surfaces', () => {
  const schema = {
    topNode: 'document',
    nodes: new Map([['document', { name: 'document', content: 'paragraph' }],
                    ['paragraph', { name: 'paragraph' }]])
  };
  const base = { schema, hasRenderer: () => true };

  it('is a finding', () => {
    const report = conformance({
      ...base,
      own: ['groupBoxes', 'copyBoxes'],
      reachable: ['groupBoxes']
    });
    expect(report.findings.map((f) => f.subject)).toEqual(['copyBoxes']);
    expect(report.findings[0].detail).toContain('a reader cannot run it');
  });

  it('says nothing when the toolbar or a key has it', () => {
    const report = conformance({
      ...base,
      own: ['groupBoxes', 'copyBoxes'],
      reachable: ['groupBoxes', 'copyBoxes']
    });
    expect(report.findings).toEqual([]);
  });

  /**
   * The shared kit's hundred and twenty commands are not the product's to
   * surface. `moveCursorLeft` is the editor's behaviour and belongs on no
   * toolbar, which is why the subject is measured as a difference rather than
   * taken as the whole list.
   */
  it('asks only about the commands the product adds', () => {
    const report = conformance({
      ...base,
      own: ['groupBoxes'],
      reachable: ['groupBoxes'],
      commands: ['groupBoxes', 'moveCursorLeft', 'deleteWordBackward']
    });
    expect(report.findings).toEqual([]);
    expect(report.examined['every-command-can-be-reached']).toBe(1);
  });

  it('takes an exemption for a command reached some other way', () => {
    const exempt = { setBoxStyle: 'the properties panel' };
    const report = conformance({
      ...base,
      own: ['setBoxStyle'],
      reachable: [],
      exempt
    });
    expect(report.findings).toEqual([]);
    expect(report.staleExemptions).toEqual([]);
  });

  it('reports the exemption once the command is surfaced', () => {
    const report = conformance({
      ...base,
      own: ['setBoxStyle'],
      reachable: ['setBoxStyle'],
      exempt: { setBoxStyle: 'the properties panel' }
    });
    expect(report.staleExemptions).toEqual([
      { subject: 'setBoxStyle', reason: 'the properties panel' }
    ]);
  });

  it('abstains, visibly, when a product does not say what it adds', () => {
    const report = conformance(base as never);
    expect(report.examined['every-command-can-be-reached']).toBeUndefined();
  });
});
