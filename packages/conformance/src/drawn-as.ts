/**
 * What tag a product draws a node type as, taken from the product itself.
 *
 * The check that asks whether a drawing can hold the drawings inside it needs
 * one fact per node type: the element it comes out as. A product could simply
 * *state* it, and that is precisely what this harness exists not to accept — a
 * stated fact is a note, and the operation roster is the standing proof that a
 * note outlives the thing it describes.
 *
 * So it is taken from the renderer. Every renderer here is a component: a
 * function from a node's data to a template tree. Called with an empty node of
 * the type, it returns that tree, and the root of the tree carries the tag. No
 * DOM, no render pass, and nothing to keep in step — a renderer that changes
 * which element it draws changes this answer in the same commit.
 *
 * A renderer that will not run on an empty node, or draws through an external
 * component with no template to read, returns null. The check skips those rather
 * than guessing, and its `examined` count is what makes the skipping visible.
 *
 * ## Called the way a renderer is called
 *
 * `(props, node, ctx)`, which is the signature the DSL passes. This used to call
 * with one argument, and every component that reads its `node` — which is every
 * interesting one, since that is where a node's own attributes are — threw on
 * `undefined` and came back as `null`. It looked like a harness that could not
 * ask, and it was a harness asking wrongly: Word's table cells were skipped by
 * both drawing checks, so the `<thead><th>` fault the second one exists to catch
 * was invisible to it. The `examined` counts said so and nobody read them as a
 * warning, which is the argument for having them.
 */

interface TemplateLike {
  type?: string;
  tag?: unknown;
  component?: (
    props: unknown,
    node?: unknown,
    ctx?: unknown
  ) => TemplateLike | null | undefined;
}

interface RegistryLike {
  get: (nodeType: string) => { template?: TemplateLike } | undefined;
}

interface BuiltNode {
  type?: string;
  tag?: unknown;
  children?: unknown;
}

/** The tag `nodeType` is drawn as, or null when the product cannot be asked. */
export function drawnTagFrom(registry: RegistryLike): (nodeType: string) => string | null {
  return (nodeType: string): string | null => {
    let template: TemplateLike | undefined | null;
    try {
      template = registry.get(nodeType)?.template;
    } catch {
      return null;
    }
    if (!template) return null;

    if (typeof template.component === 'function') {
      try {
        // An empty node of the type: no attributes, no content, and no
        // environment. A renderer that needs more than that to name its element
        // is one this cannot ask, and says so by throwing, which is caught here.
        const node = {
          sid: 'conformance:0',
          stype: nodeType,
          attributes: {},
          content: []
        };
        const built = template.component(node, node, { env: {} });
        const tag = built?.tag;
        return typeof tag === 'string' ? tag : null;
      } catch {
        return null;
      }
    }

    return typeof template.tag === 'string' ? template.tag : null;
  };
}

/**
 * The element a node type's children land in — the tag around its content slot.
 *
 * A renderer draws a *tree*, and containment is decided by where the slot sits
 * rather than by the root. `bTableHeader` draws a `<thead>` holding a `<tr>` and
 * puts the cells in the `<tr>`: the header is a `<thead>` and it *holds* in a
 * `<tr>`, and only the second answer says whether a `<th>` is legally placed.
 *
 * Written after the containment checks reported the fix for a real fault as
 * being the fault: the header had grown its `<tr>`, the cells were correctly
 * inside it, and a check reading only the root tag still saw `thead > th`.
 *
 * Falls back to the root when there is no slot to find, which is the right
 * answer for the overwhelming majority of renderers — one element with the
 * content directly inside it.
 */
export function contentTagFrom(registry: RegistryLike): (nodeType: string) => string | null {
  const rootTag = drawnTagFrom(registry);

  return (nodeType: string): string | null => {
    let template: TemplateLike | undefined | null;
    try {
      template = registry.get(nodeType)?.template;
    } catch {
      return null;
    }
    if (!template) return null;

    let built: BuiltNode | null | undefined = template as BuiltNode;
    if (typeof template.component === 'function') {
      try {
        const node = { sid: 'conformance:0', stype: nodeType, attributes: {}, content: [] };
        built = template.component(node, node, { env: {} }) as BuiltNode;
      } catch {
        return null;
      }
    }

    /** The nearest element above a slot, depth first. */
    const holder = (candidate: BuiltNode | null | undefined, depth: number): string | null => {
      if (!candidate || depth > 32) return null;

      const children = Array.isArray(candidate.children) ? (candidate.children as BuiltNode[]) : [];
      const hasSlot = children.some((child) => child?.type === 'slot');
      if (hasSlot && typeof candidate.tag === 'string') return candidate.tag;

      for (const child of children) {
        const found = holder(child, depth + 1);
        if (found) return found;
      }
      return null;
    };

    return holder(built, 0) ?? rootTag(nodeType);
  };
}
