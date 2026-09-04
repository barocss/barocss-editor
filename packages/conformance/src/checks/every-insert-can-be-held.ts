import type { Check, Finding } from '../types';
import type { CommandProducing } from './every-command-can-be-seen';

/**
 * A node type an insert puts on a page is one a reader can **get hold of**.
 *
 * ## Why this check exists, which is the least comfortable entry in this directory
 *
 * Because the same fault has now been recorded **six times in one list**, and every time it was
 * found by a person using the product rather than by anything here.
 *
 * A page builder keeps one set of the stypes a click may land on. Adding a node type means
 * registering it in two places — the renderer and that set — and only the first one is forced by
 * anything. So the sequence goes: a round adds a node, writes its renderer, checks that it
 * **appears**, and ships. The drawing is perfect. And then:
 *
 * - a quotation, a rule and a code block could be put on a page and not selected — so not moved,
 *   not deleted, not coloured, not typed into
 * - a table drew a real `<table>` and a press anywhere in it selected the *table*, because a cell
 *   was not selectable — no caret could enter, and all eight structural commands greyed
 * - a chart, reported as *차트를 더블클릭해서 선택할 수가 없어* — the whole 차트 group in the panel
 *   unreachable
 * - and then, when this check was finally written and pointed at the product, **three more, live**:
 *   `mediaVideo`, `mediaEmbed` and `form`. A reader could insert a video, an embed or a form and
 *   then neither select it nor find it in the layer list. The form is the one node type that
 *   product genuinely added.
 *
 * `every-node-is-drawn` asks whether a renderer exists. `every-command-can-be-seen` asks whether
 * what a command makes can be drawn. Nothing asked whether a reader can **hold** what was drawn,
 * which is the difference between a block and a picture of one.
 *
 * ## Why the candidate set is `produces` rather than the schema
 *
 * Measured, because the obvious derivation was tried first and is wrong. Asking about every type a
 * document can place gives 42 that are not selectable in the office schema — inline pieces, canvas
 * shapes inside a canvas block, declarations, the document and the page themselves. Forty-two
 * exemptions is forty-two notes, which is the hand-kept list this harness replaced.
 *
 * The right set is the one every instance of the fault came through: **a reader put it there**. So
 * it is the product's own `produces` list — already kept for two other checks, so no third list —
 * and the claim is narrow and true: if a product offers 동영상 in its insert menu, a reader has to
 * be able to hold the video.
 *
 * ## And why `nameable` answers it
 *
 * `nameable` is documented as *the node types a reader can select*, handed over from the product's
 * own selection rule rather than a list written for the harness. This check asks the other
 * direction of that same fact, so it reads the same field: a product that changed its selection
 * rule and forgot one place would be caught by the click it broke.
 *
 * A product that does not pass `nameable` cannot be asked, and every type comes back **unanswered**
 * by name rather than green — see the guard in `run`.
 */
export function everyInsertCanBeHeld(produces: CommandProducing[]): Check {
  return {
    name: 'every-insert-can-be-held',
    describe:
      'a node type an insert command puts on a page is one a reader can select, or is exempt with the reason nothing can point at it',

    run: ({ nameable }) => {
      const held = new Set(nameable ?? []);
      const findings: Finding[] = [];

      /*
       * By node type, not by command: five commands produce a `frame` in the page builder, and five
       * copies of one finding is the shape that teaches a reader to skim. The commands come along in
       * the detail, because *which insert makes this* is what a reader needs to reproduce it.
       */
      const madeBy = new Map<string, string[]>();
      for (const one of produces) {
        madeBy.set(one.produces, [...(madeBy.get(one.produces) ?? []), one.command]);
      }

      /**
       * A product with no selection rule to hand over is **unanswered**, not passed and not failed.
       *
       * Word is the case, and it is a real one rather than a product that has not got round to it: a
       * word processor has no layer list and no click that selects a block. A reader puts a caret
       * somewhere, and a paragraph is not a thing with edges to be dragged. So there is nothing to
       * compare `produces` against and never will be.
       *
       * Saying so by name is the point. Dropping the check when `nameable` is absent would leave a
       * product that *should* answer silently unchecked — which is the failure this harness is
       * shaped against — and reporting zero examined reads as a guard that ran. `unanswered` is the
       * third answer, and this is what it is for.
       */
      if (!nameable) {
        return { findings: [], examined: 0, unanswered: [...madeBy.keys()] };
      }

      for (const [type, commands] of madeBy) {
        if (held.has(type)) continue;
        findings.push({
          check: 'every-insert-can-be-held',
          subject: type,
          detail:
            `\`${commands.join('`, `')}\` put a \`${type}\` in the document and the product's ` +
            `selection rule does not include it — a reader can add one and then not select it, ` +
            `so it cannot be moved, deleted, restyled or reached from the layer list. Add it to ` +
            `the selection rule, or exempt it with the reason nothing can point at one.`
        });
      }

      return { findings, examined: madeBy.size };
    }
  };
}
