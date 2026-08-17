import { conformance, describeReport, type ConformanceInput } from './run';

/**
 * Hold a product to every check there is, in one call.
 *
 * A product used to write an assertion per check, which meant a check added
 * here did nothing until every product remembered to assert it — the same
 * "somebody has to remember" this whole package exists to remove. One call
 * instead: new checks apply to every product that already made it.
 *
 * Three things have to hold, and the third is the one a reader would not think
 * to write:
 *
 *   1. nothing was found that was not expected
 *   2. nothing expected has stopped being findable — a stale exemption is a
 *      note that would hide the next finding on the same subject
 *   3. no check examined nothing. A check that looks at an empty set passes,
 *      and a product that wired the harness up wrongly would see three green
 *      ticks and no coverage at all.
 */
export function assertConforms(input: ConformanceInput): void {
  const report = conformance(input);
  const problems: string[] = [];

  if (report.findings.length > 0) {
    problems.push(`${report.findings.length} finding(s) with no exemption`);
  }
  if (report.staleExemptions.length > 0) {
    problems.push(`${report.staleExemptions.length} exemption(s) that no longer exempt anything`);
  }

  const silent = Object.entries(report.examined)
    .filter(([, count]) => count === 0)
    .map(([name]) => name);
  if (silent.length > 0) {
    problems.push(
      `${silent.length} check(s) examined nothing — ${silent.join(', ')}. ` +
        `A check with no subjects passes without checking anything.`
    );
  }

  if (problems.length === 0) return;

  throw new Error(
    `This product does not conform:\n  ${problems.join('\n  ')}\n\n${describeReport(report)}\n`
  );
}
