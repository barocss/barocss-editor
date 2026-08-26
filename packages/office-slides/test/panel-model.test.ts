import { describe, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import { SLIDES_PANEL, slidesPanelAttrs, slidesPanelCommands, slidesPanelRows } from '../src/panel-model';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSlidesEditor } from '../src/slides-kit';

/**
 * The deck's panel declaration, held to what a declaration can be wrong about.
 *
 * The conformance harness asks the two questions that matter — which commands the panel reaches and
 * which attributes it can set — and can only ask them because this file's subject exists. What it
 * cannot ask is whether the declaration is *coherent*: a row naming a command nobody registers, or a
 * node type the schema does not have, appears nowhere and disagrees with nothing.
 *
 * **And one thing it cannot ask at all**, which is worth saying plainly: the deck's panel is not yet
 * drawn from this file. The site's is — `inspector.tsx` maps over its model, so there is nothing to
 * drift from — and `properties.tsx` is 2,863 lines that still draw their own rows. So the guard here
 * is a *check* rather than a construction: `tests/panel-model.spec.ts` opens the deck and asserts
 * that every row declared below is a control the panel actually draws. A check catches drift; only
 * mapping over the model makes drift impossible, and that is the next step rather than this one.
 */
describe('what the deck’s panel declares', () => {
  const schema = createSchema('slides', getSlidesSchemaDefinition());
  const commands = new Set(createSlidesEditor().commandNames() as string[]);

  it('names only commands the product registers', () => {
    // A row wired to a name nobody registered is a control that does nothing when pressed — and the
    // harness counts it as *reachable*, which is worse than not declaring it.
    expect(slidesPanelCommands().filter((name) => !commands.has(name))).toEqual([]);
  });

  it('names only node types the schema has', () => {
    const missing = SLIDES_PANEL.flatMap((row) => row.on ?? []).filter((type) => !schema.nodes.has(type));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('sets only attributes those node types declare', () => {
    /*
     * This is what found `playback`, which is not an attribute of anything: the 재생 row writes
     * `startsWith`, and `autoplay`, `controls`, `loop` and `muted` — the media's own — are offered
     * nowhere. A declaration written from memory is exactly this shape of wrong.
     */
    /** Anything the schema declares anywhere: a node type, or an attribute of one. */
    const known = (name: string) =>
      schema.nodes.has(name) || [...schema.nodes.values()].some((one) => (one as any)?.attrs?.[name]);

    const wrong: string[] = [];
    for (const row of SLIDES_PANEL) {
      /*
       * A row that writes into a node the selection **owns** names something the schema has
       * somewhere, not an attribute of the selected type: a slide's transition is `effect` on a
       * `motion` node the slide owns, and a film's `startsWith` is on its step. Four of them here,
       * against the site's one — a deck's panel is partly about time, and time is kept in nodes.
       */
      if (row.writes === 'child') {
        if (!known(row.attr)) wrong.push(`${row.group} › ${row.ariaLabel} writes ${row.attr}, which the schema has nowhere`);
        continue;
      }
      const types = row.on ?? [...schema.nodes.keys()];
      const anywhere = types.some((type) => (schema.nodes.get(type) as any)?.attrs?.[row.attr]);
      if (!anywhere) wrong.push(`${row.group} › ${row.ariaLabel} sets ${row.attr}`);
    }
    expect(wrong).toEqual([]);
  });

  it('calls no two rows the same thing', () => {
    // An accessible name has to be unique in the panel, or a test and a screen reader are both
    // pointing at whichever came first.
    const names = SLIDES_PANEL.map((row) => row.ariaLabel);
    expect(new Set(names).size).toBe(names.length);
  });

  it('asks the schema where a row belongs, rather than a list', () => {
    /*
     * The lists this replaced were wrong in **27 places** — a `너비` offered on a connector, which
     * has none; a `선 색` hidden from a line, which has one. Every entry was either a control that
     * writes nothing or a control a reader cannot reach, and the deck's own panel had been asking
     * the schema all along (`declares('layoutMode')`). The declaration that replaced it regressed,
     * and this is the check that says so.
     */
    const declares = (stype: string, attr: string) => !!(schema.nodes.get(stype) as any)?.attrs?.[attr];
    const on = (stype: string) => slidesPanelRows(stype, undefined, declares).map((row) => row.attr);

    expect(on('connector')).toContain('bend');
    expect(on('rectangle')).not.toContain('bend');
    // A connector has no box: no x, no width — and it does have a stroke, which the list denied it.
    expect(on('connector')).not.toContain('width');
    expect(on('connector')).toContain('stroke');
    expect(on('line')).toContain('strokeWidth');
    // A group is a z-order over other shapes and paints nothing itself.
    expect(on('group')).not.toContain('fills');
    expect(on('rectangle')).toContain('fills');
  });

  it('keeps a row the schema cannot answer for', () => {
    /*
     * Three kinds of row have no attribute to ask about: one that writes a node, one that writes
     * nothing, and any row at all when a product has no schema to hand. The first version asked
     * anyway and `stype` is not an attribute of anything, so the 종류 row vanished from every
     * panel in the site builder — caught by a browser test rather than by this file, which is the
     * argument for having both.
     */
    const declares = () => false;
    expect(slidesPanelRows('rectangle', undefined, declares).map((row) => row.attr)).toContain('motionTrack');
  });

  it('counts the attributes a row writes without naming, as well as the ones it does', () => {
    /*
     * Some rows write more than one, and that is a product decision rather than an omission: the
     * destination picker writes `goTo`, `goToKind` and `goToDeck` together because a reader chooses
     * one thing and the command works out which of the three it was. Three rows would be two
     * controls nobody wants.
     */
    const settable = slidesPanelAttrs();
    expect(settable).toContain('goTo');
    expect(settable).toContain('goToKind');
    expect(settable).toContain('goToDeck');
    expect(settable).toContain('cropLeft');
    // And the flat fallbacks the paint stack writes when a shape is using them.
    expect(settable).toContain('gradientFrom');
    expect(settable).toContain('shadowBlur');
  });
});
