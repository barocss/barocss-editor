import { everyNodeIsDrawn } from './checks/every-node-is-drawn';
import { everyCommandCanBeSeen, type CommandProducing } from './checks/every-command-can-be-seen';
import { everyCommandMakesSomethingReal } from './checks/every-command-makes-something-real';
import type { Check, Exemptions, Report, Subject } from './types';

/** The checks that need nothing from the product but its schema and renderers. */
export const CHECKS: Check[] = [everyNodeIsDrawn];

export interface ConformanceInput {
  /** The product's schema — anything with a `nodes` map. */
  schema: Subject['schema'];
  /** Whether the product draws a node type. */
  hasRenderer: Subject['hasRenderer'];
  /**
   * Findings the product expects, and why.
   *
   * Keyed by subject. The reason is the whole value of the entry: it is what a
   * reader needs to decide whether the exemption still applies, and it is what
   * separates a decision from an oversight.
   */
  exempt?: Exemptions;
  /**
   * What each command a reader can run puts in the document.
   *
   * Passed in because the engine cannot see it — a command is a function, and
   * guessing the node from the command's name would be a check that lies in
   * both directions. A product that gives this gets the check that would have
   * caught ten invisible node types; one that does not, does not.
   */
  produces?: CommandProducing[];
  /** Run a subset, for a product adopting the harness one check at a time. */
  only?: string[];
}

/**
 * Hold a product to the checks.
 *
 * The shape of the result is the argument for the whole thing. A finding the
 * product expected is not silently dropped — it is *matched* against an
 * exemption, and an exemption that matches nothing comes back as a failure of
 * its own.
 *
 * That is not fussiness. The operation roster allowed exemptions with written
 * reasons, fourteen of the reasons went stale, and the checks they were
 * silencing stayed off for operations that would have passed — for months,
 * looking exactly like coverage. An exemption is a claim about the code, and a
 * claim nothing verifies is the thing this harness exists to find.
 */
export function conformance(input: ConformanceInput): Report {
  const exempt = input.exempt ?? {};
  const all = [
    ...CHECKS,
    // The schema question first: a command whose node the schema does not know
    // cannot work at all, while one whose node is undrawn works invisibly.
    ...(input.produces
      ? [everyCommandMakesSomethingReal(input.produces), everyCommandCanBeSeen(input.produces)]
      : [])
  ];
  const checks = input.only ? all.filter((check) => input.only!.includes(check.name)) : all;

  const subject: Subject = { schema: input.schema, hasRenderer: input.hasRenderer };

  const findings = [];
  const examined: Record<string, number> = {};
  const matched = new Set<string>();

  for (const check of checks) {
    const result = check.run(subject);
    examined[check.name] = result.examined;

    for (const finding of result.findings) {
      if (finding.subject in exempt) {
        matched.add(finding.subject);
        continue;
      }
      findings.push(finding);
    }
  }

  // An exemption for something that no longer needs one. Reported rather than
  // ignored: see above.
  const staleExemptions = Object.entries(exempt)
    .filter(([subjectName]) => !matched.has(subjectName))
    .map(([subjectName, reason]) => ({ subject: subjectName, reason }));

  return { findings, staleExemptions, examined };
}

/**
 * The report as something a failing test can print.
 *
 * A conformance failure is a list, and a list read out of an object diff is a
 * list nobody reads.
 */
export function describeReport(report: Report): string {
  const lines: string[] = [];

  if (report.findings.length > 0) {
    lines.push(`${report.findings.length} finding(s):`);
    for (const finding of report.findings) {
      lines.push(`  · [${finding.check}] ${finding.subject} — ${finding.detail}`);
    }
  }

  if (report.staleExemptions.length > 0) {
    lines.push(
      '',
      `${report.staleExemptions.length} exemption(s) that no longer exempt anything.`,
      'Each was written as a reason to expect a finding, and the finding is gone —',
      'so the reason is now a note that would hide the next one. Delete them:'
    );
    for (const stale of report.staleExemptions) {
      lines.push(`  · ${stale.subject} — "${stale.reason}"`);
    }
  }

  const counted = Object.entries(report.examined)
    .map(([name, count]) => `${name}: ${count}`)
    .join(', ');
  lines.push('', `examined — ${counted}`);

  return lines.join('\n');
}
