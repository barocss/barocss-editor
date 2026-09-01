import type { Check, Finding } from '../types';

/**
 * A panel row **writes the attribute it names** when a reader uses it.
 *
 * ## The hole this closes, which was found by a browser and not by this harness
 *
 * `every-property-can-be-edited` asks whether an attribute the product draws has a row somewhere. It
 * is answered from the panel's own declaration — real data, not a claim — and it is still one step
 * short of the question a reader asks, because a row names a **command**, and the command decides
 * what it accepts.
 *
 * Measured, on a product that had just grown nine attributes: six of them were declared in the
 * schema, drawn by the renderer, and offered by a panel row — and the command every one of those
 * rows named kept a whitelist of the fields it would write, and none of the six was on it. So six
 * controls drew, lit up, accepted a value, and threw it away. `every-property-can-be-edited` passed
 * on all six, correctly and uselessly: the row existed.
 *
 * The lesson generalises past a whitelist. **An attribute has to be in four places to be alive** —
 * declared, drawn, offered, and accepted — and this harness could see three of them.
 *
 * ## Why the running is the product's
 *
 * `every-command-does-something`'s reason, exactly: what a row needs before it can be used is a fact
 * about that product — which node types it appears on, what has to be selected, whether a value has
 * to differ from the one already there. A harness guessing at that would guess differently for each
 * product it is pointed at.
 *
 * So the probe answers three ways, and the third is the one that keeps the check honest:
 *
 * - `true` — it wrote, and the document moved.
 * - `false` — it ran and **the document is unchanged**. A finding.
 * - `null` — the product could not get into a state where this row is offered at all. Counted, not
 *   guessed at, so a probe that has quietly stopped setting anything up shows as a check that has
 *   stopped asking rather than as a page of passes.
 *
 * ## What is legitimately exempt
 *
 * A row whose value is the one already there — a probe should pick a different one, and if it
 * genuinely cannot (a toggle already on, a choice with one option) that is `null` rather than a
 * fault. And a row that writes something other than the document: a preview switch, a width a reader
 * is *looking* at. Each is an exemption with a reason, and a reason that stops being true fails the
 * way every claim here does.
 */
export function everyRowWritesWhatItNames(
  /** Every row the product's panels declare, as `attr` and the words a reader sees. */
  rows: { attr: string; label: string; command?: string }[],
  /** Whether using it moves the document; `null` when the product cannot get into a state to try. */
  probe: (row: { attr: string; label: string; command?: string }) => boolean | null
): Check {
  return {
    name: 'every-row-writes-what-it-names',
    describe: 'a panel row writes the attribute it names, through the command it names',

    run: () => {
      const findings: Finding[] = [];
      let examined = 0;
      const unanswered: string[] = [];
      const seen = new Set<string>();

      for (const row of rows) {
        // One finding per attribute, not per node type it appears on — `every-attribute-is-read`'s
        // shape, and for its reason: a whitelist that forgot a field forgot it once.
        if (seen.has(row.attr)) continue;
        seen.add(row.attr);

        /*
         * A row that names **no command** is not a row this check is about. 종류 and 편집 중인 폭 are
         * a label and a note — they show a reader what is selected and what width they are editing,
         * and writing is not what they are for. Counting them as *could not be asked* put two rows
         * in the blind column that were never in the question, which is the same dishonesty in the
         * other direction: a number that says a guard has holes it does not have.
         */
        if (!row.command) continue;

        const wrote = probe(row);
        if (wrote === null) {
          unanswered.push(`${row.label} (${row.attr})`);
          continue;
        }
        examined += 1;
        if (wrote) continue;

        findings.push({
          check: 'every-row-writes-what-it-names',
          subject: row.attr,
          family: row.attr,
          detail:
            `the row **${row.label}** offers \`${row.attr}\`${row.command ? ` through \`${row.command}\`` : ''} ` +
            `and using it changed nothing. A control that accepts a value and throws it away is the ` +
            `worst kind, because it looks exactly like a value the reader chose. Usually the command ` +
            `named by the row does not accept this field — an attribute has to be declared, drawn, ` +
            `offered *and accepted* to be alive.`
        });
      }

      return { findings, examined, unanswered };
    }
  };
}
