import { describe, it, expect } from 'vitest';
import { conformance, describeReport } from '@barocss/conformance';
import { createSchema } from '@barocss/schema';
import { getGlobalRegistry } from '@barocss/dsl';
import { getSlidesSchemaDefinition } from '../src/slides-schema';

/**
 * Slides, held to the same checks as Word — before it has any renderers.
 *
 * This is what the harness is for. A second product gets the checks the first
 * one had to discover, on its first day, and its failures are its work list
 * rather than a surprise found in a browser months later.
 *
 * So this test does not assert conformance. It asserts the *shape* of not
 * conforming: the harness sees the product, the numbers are the ones expected,
 * and the list of undrawn node types is the list of renderers still to write.
 * When that list is empty this becomes `assertConforms` like Word's.
 */
describe('Slides, before it draws anything', () => {
  const schema = createSchema('slides', getSlidesSchemaDefinition());
  const registry = getGlobalRegistry();

  const report = () =>
    conformance({
      schema: schema as never,
      hasRenderer: (nodeType) => registry.has(nodeType)
    });

  it('is seen by the harness at all', () => {
    // The guard against a product wiring this up wrongly and reading a green
    // tick as coverage: a check that examines nothing passes.
    expect(report().examined['every-node-is-drawn']).toBeGreaterThan(50);
  });

  it('has the scene nodes still to draw, and that is the work list', () => {
    const undrawn = new Set(report().findings.map((finding) => finding.subject));

    // The nodes a slide is made of. Every one of them is what
    // `packages/office-slides` exists to draw, and none is a surprise.
    for (const scene of ['textFrame', 'frame', 'group', 'rectangle', 'ellipse', 'line']) {
      expect(undrawn.has(scene), `${scene} should still be undrawn`).toBe(true);
    }
  });

  it('names what is left, so the count only goes down', () => {
    const result = report();
    // A ratchet, like the operation harness's four. 64 of 64 today, because
    // Slides has registered no renderers at all — the honest number for a
    // product on its first day. It may fall and must not rise: a node type
    // added to the schema without a renderer shows up here, and a renderer
    // written without this number coming down means it drew something the
    // schema does not declare.
    expect(
      result.findings.length,
      `\n${describeReport(result)}\n`
    ).toBeLessThanOrEqual(64);
  });
});
