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
 */

interface TemplateLike {
  type?: string;
  tag?: unknown;
  component?: (data: unknown) => TemplateLike | null | undefined;
}

interface RegistryLike {
  get: (nodeType: string) => { template?: TemplateLike } | undefined;
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
        // An empty node of the type: no attributes, no content. A renderer that
        // needs more than that to name its element is one this cannot ask, and
        // says so by throwing, which is caught here.
        const built = template.component({
          sid: 'conformance:0',
          stype: nodeType,
          attributes: {},
          content: []
        });
        const tag = built?.tag;
        return typeof tag === 'string' ? tag : null;
      } catch {
        return null;
      }
    }

    return typeof template.tag === 'string' ? template.tag : null;
  };
}
