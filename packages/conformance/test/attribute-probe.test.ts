import { describe, expect, it } from 'vitest';
import { attributeReadFrom } from '../src/attribute-read';

/**
 * The probe itself, rather than the check that uses it.
 *
 * Everything here is a regression of the same kind of mistake: **the probe reporting a working
 * mechanism as unread.** That is the expensive direction — a missed gap costs nothing until somebody
 * looks, and a false finding costs a person an afternoon proving the tool wrong.
 */
describe('teaching the probe a shape', () => {
  /**
   * A renderer of the shape this harness actually meets: attribute functions that are handed the
   * node, and a style built out of several attributes at once.
   *
   * `paint` is the product's own `paintsOf` in miniature — a **list** when there is one, and a flat
   * pair as the fallback — because that is the combination that made the fix necessary.
   */
  const registry = {
    get: () => ({
      template: {
        component: (node: { attributes: Record<string, unknown> }) => {
          const a = node.attributes ?? {};
          const fills = Array.isArray(a.fills) ? a.fills : undefined;
          const paint = fills
            ? `list(${fills.length})`
            : a.from && a.to
              ? `pair(${String(a.from)}→${String(a.to)})`
              : undefined;
          return { tag: 'div', style: { background: paint, opacity: a.opacity } };
        }
      }
    })
  };

  const shapes = {
    shape: {
      fills: { type: 'array' as const },
      from: { type: 'string' as const },
      to: { type: 'string' as const },
      opacity: { type: 'number' as const }
    }
  };
  const attrs = (type: string) => (shapes as Record<string, never>)[type];

  it('cannot ask about an array until it is told what one looks like', () => {
    // No teacher: the probe has no value to invent, so the answer is "cannot be asked" rather than
    // a guess. `every-attribute-is-read` counts these, which is how the blind spot stays visible.
    const read = attributeReadFrom(registry as never, attrs as never);
    expect(read('shape', 'fills')).toBeNull();
  });

  it('answers once it is', () => {
    const read = attributeReadFrom(registry as never, attrs as never, {}, (_type, attr) =>
      attr === 'fills' ? [[{ color: '#f00' }]] : undefined
    );
    expect(read('shape', 'fills')).toBe(true);
  });

  it('keeps a taught value out of every other attribute’s question', () => {
    /*
     * The fix, and the measurement behind it.
     *
     * A taught value is taught because the schema cannot describe it, and a value of that shape is
     * usually a whole sub-system in one attribute — which **supersedes** the flat attributes it
     * replaces. The first time a deck was taught what a `fills` is, every render in the
     * everything-set carried a gradient, so `paintsOf` never reached its fallback branch and
     * `gradientFrom`, `gradientTo`, `gradientAngle`, `gradientKind` and three `shadow*` attributes
     * on six shape types each — **fourteen attributes the product plainly reads** — came back
     * unread. Teaching the harness one thing had made it wrong about seven others.
     *
     * `from` and `to` here are that fallback pair, and they must still read as read.
     */
    const read = attributeReadFrom(registry as never, attrs as never, {}, (_type, attr) =>
      attr === 'fills' ? [[{ color: '#f00' }]] : undefined
    );

    expect(read('shape', 'from')).toBe(true);
    expect(read('shape', 'to')).toBe(true);
    // And the attribute that has nothing to do with any of it is unaffected either way.
    expect(read('shape', 'opacity')).toBe(true);
  });

  it('still says no when nothing reads the taught attribute', () => {
    // The answer a product then turns into an exemption naming what *does* read it — which is the
    // whole value of asking: a written decision instead of a question nobody put.
    const bare = { get: () => ({ template: { component: () => ({ tag: 'div' }) } }) };
    const read = attributeReadFrom(bare as never, attrs as never, {}, () => [[{ color: '#f00' }]]);
    expect(read('shape', 'fills')).toBe(false);
  });
});
