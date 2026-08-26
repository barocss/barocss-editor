import { everyNodeIsDrawn } from './checks/every-node-is-drawn';
import { everyDrawingCanHoldWhatItContains } from './checks/every-drawing-can-hold-what-it-contains';
import { everyDrawingKeepsItsChildren } from './checks/every-drawing-keeps-its-children';
import { everyDrawingCanBeNamed } from './checks/every-drawing-can-be-named';
import { everyAttributeIsRead } from './checks/every-attribute-is-read';
import { everyPropertyCanBeEdited } from './checks/every-property-can-be-edited';
import { everyIconHasAPicture } from './checks/every-icon-has-a-picture';
import { everyCommandCanBeSeen, type CommandProducing } from './checks/every-command-can-be-seen';
import { everyCommandMakesSomethingReal } from './checks/every-command-makes-something-real';
import { everyInsertIsAccountedFor } from './checks/every-insert-is-accounted-for';
import { everyCommandCanBeReached } from './checks/every-command-can-be-reached';
import type { Check, Exemptions, Ratchets, Report, Subject } from './types';

/** The checks that need nothing from the product but its schema and renderers. */
export const CHECKS: Check[] = [
  everyNodeIsDrawn,
  everyDrawingCanHoldWhatItContains,
  everyDrawingKeepsItsChildren,
  everyDrawingCanBeNamed,
  everyAttributeIsRead,
  everyPropertyCanBeEdited,
  everyIconHasAPicture
];

export interface ConformanceInput {
  /** The product's schema — anything with a `nodes` map. */
  schema: Subject['schema'];
  /** Whether the product draws a node type. */
  hasRenderer: Subject['hasRenderer'];
  /**
   * The tag the product draws a node type as, by rendering one.
   *
   * Feeds the check that asks whether a drawing can hold the drawings inside
   * it. Leave it out and that check abstains rather than guessing.
   */
  drawnAs?: Subject['drawnAs'];
  /**
   * The element a node type's children land in, when that is not the element the
   * node itself draws as. See `Subject.holdsIn`.
   */
  holdsIn?: Subject['holdsIn'];
  /**
   * What the product calls a node type, for the list a reader reads beside the
   * canvas. Leave it out and that check abstains rather than guessing.
   */
  nameOf?: Subject['nameOf'];
  /**
   * Whether setting an attribute changes what the product draws, by drawing it
   * twice. Leave it out and that check abstains rather than guessing.
   */
  attributeRead?: Subject['attributeRead'];
  /**
   * The icon names the product's controls ask for, and whether the suite draws each.
   *
   * Both or neither: the check abstains without them, and its `examined` count is
   * what keeps the abstaining visible.
   */
  iconsAsked?: Subject['iconsAsked'];
  iconDrawn?: Subject['iconDrawn'];
  /**
   * Findings the product expects, and why.
   *
   * Keyed by subject, or by the family a check groups findings into — see
   * `Finding.family`, which exists so that a fact about an attribute is written
   * once rather than once per node type that declares it.
   *
   * The reason is the whole value of the entry: it is what a reader needs to
   * decide whether the exemption still applies, and it is what separates a
   * decision from an oversight.
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
  /**
   * Every command the product registers.
   *
   * Only used to ask whether the `produces` list is complete — a command named
   * `insert…` that is not in it is covered by no command check at all. Give it
   * and the gap narrows; leave it out and the checks are only as good as
   * somebody's memory.
   */
  commands?: string[];
  /**
   * The commands this product adds, as opposed to the shared kit's.
   *
   * Measured rather than listed: a product builds an editor with its own
   * extensions and one without them, and hands over the difference. Almost every
   * command a product registers belongs to the shared editing kit — a hundred
   * and twenty of them in a deck — and demanding a button for `moveCursorLeft`
   * would be nonsense.
   */
  own?: string[];
  /**
   * Every attribute a reader can **set**, from the product's own declarations — see .
   *
   * Here as well as on the subject because the two command lists are here too: what a reader can
   * reach and what a reader can change are the same kind of fact about a product, and both come out
   * of the same declarations.
   */
  editable?: string[];
  /**
   * The commands a reader can actually run: toolbar controls and key bindings.
   *
   * Both come from the product's own declarations, so this cannot drift from
   * what the app installs — which is the whole reason a deck's key map is data
   * in the package rather than a handler in the host.
   */
  reachable?: string[];
  /**
   * Findings a check is allowed while the product works them off, by check name.
   *
   * For adopting a check that finds hundreds at once — see `Ratchets` for why this is
   * a count rather than hundreds of written reasons, and why going *below* the count
   * fails as well.
   */
  ratchet?: Ratchets;
  /** Run a subset, for a product adopting the harness one check at a time. */
  only?: string[];
  /**
   * Checks this product has **not adopted**, named.
   *
   * A check with no subjects fails, on purpose: *"a check that is quietly doing nothing stays
   * visible"*. That rule is right and it makes adding a check to the harness break every product
   * that cannot answer it yet — which is the correct pressure, but it needs somewhere to land other
   * than a broken build.
   *
   * `only` is the wrong shape for it: a product listing every check it *does* run would silently
   * skip the next one added, forever. Naming what is deferred is the other way round — a new check
   * arrives, and every product either answers it or says out loud that it does not.
   *
   * Measured the day `every-property-can-be-edited` was added: the site could answer it because its
   * panel had just become a declaration, and Word and the deck could not because theirs are still
   * React trees. That is a real difference between the three products and it belongs on the record,
   * not in a silence.
   *
   * A deferral that turns out to be unnecessary — the check examined something after all — is
   * reported like a stale exemption, so it cannot outlive the reason for it.
   */
  notYet?: string[];
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
      : []),
    ...(input.commands ? [everyInsertIsAccountedFor(input.commands, input.produces ?? [])] : []),
    // Asked last and answered first in practice: a command nothing surfaces is
    // one nobody can run, whatever the checks above say about what it makes.
    ...(input.own ? [everyCommandCanBeReached(input.own, input.reachable ?? [])] : [])
  ];
  const checks = input.only ? all.filter((check) => input.only!.includes(check.name)) : all;

  const subject: Subject = {
    schema: input.schema,
    hasRenderer: input.hasRenderer,
    drawnAs: input.drawnAs,
    holdsIn: input.holdsIn,
    nameOf: input.nameOf,
    attributeRead: input.attributeRead,
    editable: input.editable,
    iconsAsked: input.iconsAsked,
    iconDrawn: input.iconDrawn
  };

  const findings = [];
  const examined: Record<string, number> = {};
  const unanswered: Record<string, number> = {};
  const matched = new Set<string>();
  const ratchet: Ratchets = input.ratchet ?? {};
  const ratcheted: Report['ratcheted'] = [];

  for (const check of checks) {
    const result = check.run(subject);
    examined[check.name] = result.examined;
    if (result.unanswered) unanswered[check.name] = result.unanswered;

    /**
     * A check the product is still working off: counted, not reported.
     *
     * The families rather than the subjects, because that is the size the work is
     * done at — one reason covers an attribute wherever it appears, and a list of
     * three hundred subjects is not a work list anybody reads.
     */
    if (check.name in ratchet) {
      const unexpected = result.findings.filter(
        (finding) =>
          !(finding.subject in exempt) && !(finding.family && finding.family in exempt)
      );
      for (const finding of result.findings) {
        if (finding.subject in exempt) matched.add(finding.subject);
        else if (finding.family && finding.family in exempt) matched.add(finding.family);
      }
      ratcheted.push({
        check: check.name,
        allowed: ratchet[check.name],
        found: unexpected.length,
        families: [...new Set(unexpected.map((finding) => finding.family ?? finding.subject))].sort()
      });
      continue;
    }

    for (const finding of result.findings) {
      /**
       * The subject first, then the family it belongs to.
       *
       * The subject is the more specific claim, so it wins — a decision about one
       * node is not overruled by a decision about the attribute everywhere.
       */
      const key =
        finding.subject in exempt
          ? finding.subject
          : finding.family && finding.family in exempt
            ? finding.family
            : undefined;
      if (key !== undefined) {
        matched.add(key);
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

  /*
   * What the product said it has not adopted, and whether that is still true. A check named here
   * that examined something after all is a deferral outliving its reason — reported, not swept up.
   */
  const deferred = (input.notYet ?? []).map((check) => ({ check, examined: examined[check] ?? 0 }));

  return { findings, staleExemptions, examined, unanswered, ratcheted, deferred };
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

  for (const entry of report.ratcheted) {
    if (entry.found === entry.allowed) continue;
    lines.push(
      '',
      entry.found > entry.allowed
        ? `${entry.check}: ${entry.found} finding(s), and ${entry.allowed} were allowed. Something that used to hold no longer does.`
        : `${entry.check}: ${entry.found} finding(s), and ${entry.allowed} were allowed. Lower the ratchet to ${entry.found} — a number that is not the truth leaves room to break things quietly.`,
      `  ${entry.families.join(', ')}`
    );
  }

  /*
   * And what could not be asked, beside what was — because a skipped question reads as
   * an answered one, which is the failure this whole harness is named after.
   */
  const counted = Object.entries(report.examined)
    .map(([name, count]) => {
      const blind = report.unanswered?.[name] ?? 0;
      return blind > 0 ? `${name}: ${count} (${blind} unanswered)` : `${name}: ${count}`;
    })
    .join(', ');
  lines.push('', `examined — ${counted}`);

  // And what the product said it cannot answer yet, so a deferral is read beside the coverage rather
  // than found by noticing a check missing from the line above.
  const deferred = (report.deferred ?? []).map((one) => one.check);
  if (deferred.length > 0) lines.push(`not adopted — ${deferred.join(', ')}`);

  return lines.join('\n');
}
