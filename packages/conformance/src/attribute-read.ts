/**
 * Whether a product's renderer **reads** an attribute, asked by rendering twice.
 *
 * ## Why this is not a list
 *
 * The first product kept the answer in its backlog: a section headed "Attributes the
 * schema declares and nothing reads", with a line each and a date — *"Re-measured
 * 2026-08-18, and five came off."* A person had to go and look, one attribute at a
 * time, and until they did the list said something that had stopped being true.
 *
 * That is the operation roster's failure exactly: fourteen notes claiming an
 * operation declared no inverse, about operations that had since been given one, and
 * the checks they silenced stayed off for months looking like coverage. A note rots.
 *
 * ## The trick is the same one `drawnAs` uses
 *
 * Take the answer from the product rather than from a claim about it. Render a node
 * of the type with the attribute absent, render it again with the attribute set to
 * something distinctive, and compare. **If the two are the same, nothing read it.**
 *
 * No parsing, no source scanning, and nothing to keep in step: a renderer that
 * starts reading an attribute changes this answer in the same commit.
 *
 * ## What it cannot see, and why that is not fatal
 *
 * An attribute read by something that is not a renderer looks unread here. Word's
 * `outlineLevel` is read by its contents page; a paginator reads section attributes;
 * a command reads `locked`. Those need an exemption saying where — and unlike the
 * hand-kept list, **that exemption is checked**: the day a renderer starts drawing
 * the attribute, the claim is stale and the harness says so.
 *
 * So the list stops being a thing a person maintains and becomes a thing a person
 * *decides*, once, in a place that cannot quietly go out of date.
 */

interface TemplateLike {
  type?: string;
  tag?: unknown;
  component?: (props: unknown, node?: unknown, ctx?: unknown) => unknown;
}

interface RegistryLike {
  get: (nodeType: string) => { template?: TemplateLike } | undefined;
}

/** What an attribute declares about itself, as much of it as this needs. */
export interface AttrShape {
  type?: string;
  default?: unknown;
  required?: boolean;
  /** The fixed set of values, when the attribute has one. */
  options?: readonly string[];
  /** The range, when the attribute has one. */
  min?: number;
  max?: number;
}

/** What `probeValues` answers for a type it must not invent a value for. */
export const UNPROBEABLE = Symbol('unprobeable');

/**
 * Values distinctive enough that a renderer reading the attribute must draw
 * differently — **every** one worth trying, not one.
 *
 * ## Why a list and not a value
 *
 * An attribute is read if *some* legal value changes the drawing, and picking one
 * value picks wrong. Measured twice:
 *
 * - `gradientKind`'s set is `linear | radial`, and the probe took the first. Absent
 *   already draws as linear, so the two agreed and the check called it unread on six
 *   node types — about the value the renderers switch on.
 * - A boolean is asymmetric in the same way: `visible: true` beside no `visible` at
 *   all is the same drawing, and only `false` is the reading.
 *
 * ## Scalars only, and the reason is a false finding
 *
 * An `array` or an `object` has a *shape* the schema does not describe, and any value
 * invented here may be one the product is right to ignore. Measured: an empty array
 * for a shape's `fills` draws exactly like no `fills` at all — `paintsOf` falls back
 * to the legacy single `fill` either way — so the check reported `fills` as unread
 * about a renderer whose whole job is drawing them.
 *
 * So those abstain. A wrong answer from a check is worse than no answer: the first
 * costs a person an afternoon proving the tool wrong.
 */
export function probeValues(
  shape: AttrShape | undefined,
  name = 'x'
): unknown[] | typeof UNPROBEABLE {
  // One of a fixed set: every value in it, because which one the renderer switches on
  // is the thing being asked about. The set is the schema's — see `options`.
  if (shape?.options?.length) return [...shape.options];

  switch (shape?.type) {
    case 'number': {
      /**
       * Inside the declared range, when there is one.
       *
       * Low in it on purpose: a picture's four crops are each a fraction of the
       * picture, and four values near the top of the range crop it out of existence —
       * so the drawing comes back the same as no crop at all and every one of them
       * looks unread. Spread by name for the reason below.
       */
      if (typeof shape.min === 'number' && typeof shape.max === 'number') {
        const span = shape.max - shape.min;
        const within = shape.min + span * (0.1 + (hash(name) % 4) / 10);
        return [within === shape.default ? shape.min + span * 0.5 : within];
      }

      /**
       * A **different** number for every attribute, and that is the point.
       *
       * One value for all of them made every attribute that falls back to another of
       * the same type invisible. Measured: a shape's `cornerRadius` and its four
       * per-corner values were all 4242, so taking any one away left the drawing
       * identical — the corner fell back to a radius that happened to be the same
       * number — and the check reported all five as unread. The same for a picture's
       * four crops.
       *
       * Away from 0 and 1 as well: both are common defaults and one of them is a
       * falsy value a renderer may be skipping rather than reading.
       */
      const spread = 4000 + (hash(name) % 900);
      return [shape.default === spread ? spread + 1000 : spread];
    }
    case 'boolean':
      // Both, because a boolean's reading is usually one-sided: a renderer asks
      // `=== false` or `=== true`, and the other value looks exactly like absent.
      return [true, false];
    case 'array':
    case 'object':
    case 'custom':
      return UNPROBEABLE;
    default:
      // A string, or a type this does not know. Named after the attribute for the
      // same reason the numbers are spread, and readable in a diff by eye.
      return [`probe-${name}`];
  }
}

/** Enough of a hash to spread the numbers apart; nothing depends on which. */
function hash(name: string): number {
  let sum = 0;
  for (let at = 0; at < name.length; at += 1) sum = (sum * 31 + name.charCodeAt(at)) % 100000;
  return sum;
}

/**
 * Whether the product's renderer reads `attr` on `nodeType`.
 *
 * `null` when the product cannot be asked — a renderer that will not run on a bare
 * node, or a node type with no renderer at all. The check skips those and its
 * `examined` count is what keeps the skipping visible.
 */
export function attributeReadFrom(
  registry: RegistryLike,
  attrs: (nodeType: string) => Record<string, AttrShape> | undefined,
  /**
   * The environment the product renders in, when its renderers need one.
   *
   * Not optional in spirit. Word resolves a block's every piece of formatting through
   * a style resolver that arrives on the environment — `formatFor` opens with
   * `if (!styles) return {}` — so with no environment a paragraph draws no formatting
   * at all and **483 of 597 attributes came back unread**, about the resolver that
   * reads every one of them. The renders were fully evaluable, so nothing looked
   * wrong; they were simply answers to a question nobody had been asked.
   *
   * A product hands over what it renders with, and the answer comes from the product
   * — which is the same rule as everywhere else here.
   */
  env: unknown = {},
  /**
   * What a value of this attribute looks like, when the shape alone cannot say.
   *
   * `array`, `object` and `custom` are `UNPROBEABLE`: there is no useful value to
   * invent for them, so the probe has no candidate to draw with, and the answer comes
   * back **null** — "cannot be asked" — and the check skips it. Measured on the site
   * builder: 21 of 344 attribute slots, six distinct names, and one of them is
   * `overrides`, which is that product's entire responsive mechanism. The check would
   * have said nothing at all if a renderer stopped reading it.
   *
   * A shape cannot be guessed but a **product** knows it: a `varBinds` is
   * `[{ attr, var }]`, an `overrides` is `{ mobile: { … } }`. So the product hands one
   * over, which is the same rule as `env` above and as everything else here — the
   * answer comes from the product.
   *
   * Return `undefined` to leave an attribute where it was: unanswerable, and counted
   * as such rather than guessed at.
   */
  probes?: (nodeType: string, attr: string) => unknown[] | undefined
): (nodeType: string, attr: string) => boolean | null {
  return (nodeType: string, attr: string): boolean | null => {
    let template: TemplateLike | undefined;
    try {
      template = registry.get(nodeType)?.template;
    } catch {
      return null;
    }
    if (typeof template?.component !== 'function') return null;

    /**
     * One render, as text, and whether anything in it could not be evaluated.
     *
     * The second half matters as much as the first. A renderer's attribute functions
     * are handed the node, and Word's are handed a *document* as well — a paragraph's
     * style, a list's numbering, a section's columns all resolve through the
     * environment. With no environment those throw, and a throw that is written down
     * as `[uncallable]` makes two different renders identical: **483 of Word's 597
     * attributes came back unread**, about renderers that plainly read them.
     *
     * So an unevaluable render is not evidence of anything. `asked` is false for it,
     * and the answer becomes "cannot say" rather than "nothing reads it" — the same
     * distinction the whole harness turns on, since a wrong finding costs a person an
     * afternoon proving the tool wrong.
     */
    const draw = (attributes: Record<string, unknown>): { text: string; asked: boolean } | null => {
      try {
        const node = { sid: 'conformance:0', stype: nodeType, attributes, content: [] };
        const built = template!.component!(node, node, { env });
        /**
         * The whole tree as text, not just its tag.
         *
         * An attribute usually lands in a style or another attribute rather than
         * changing the element — `visible` becomes `display: none`, a fill becomes a
         * background — so comparing tags would call almost everything unread.
         *
         * A function in the tree (`style: (d) => …`) is not called by the DSL until it
         * draws, so the replacer calls them here.
         */
        const text = JSON.stringify(built, replacerFor(node, env));
        if (text === undefined) return null;
        return { text, asked: !text.includes(UNCALLABLE) };
      } catch {
        return null;
      }
    };

    const shapes = attrs(nodeType) ?? {};

    /** What to ask about **this** attribute: the product's value if it taught one, the schema's otherwise. */
    const told = probes?.(nodeType, attr);
    const candidates = told && told.length > 0 ? told : probeValues(shapes[attr], attr);
    if (candidates === UNPROBEABLE) return null;

    /**
     * Every other attribute set, so an attribute that only matters **in combination**
     * is still visible: a `strokeWidth` with no `stroke` draws nothing, because
     * silence means no stroke; a `shadowBlur` is not a shadow without a
     * `shadowColor`; a gradient's angle needs its two ends. Asking each attribute
     * alone on a bare node reported a third of a product's attributes as unread.
     */
    /*
     * Built from what the schema can derive, and from what a product taught **when the taught value
     * is a scalar** — which is the narrower version of a rule that used to exclude every taught
     * value, and the reason for both halves is worth keeping.
     *
     * ## Why taught values were excluded
     *
     * A taught value is often taught because the schema cannot describe it — an `array` or an
     * `object` — and a value of that shape is usually a whole sub-system in one attribute, which
     * *supersedes* the flat attributes it replaces. Measured the first time a deck was taught what a
     * `fills` is: `paintsOf` takes the list branch whenever there is a list, so every render in this
     * combination carried a gradient, and `gradientFrom`, `gradientTo`, `gradientAngle`,
     * `gradientKind` and the three `shadow*` attributes on six shape types each — **fourteen
     * attributes the product plainly reads** — came back unread. Teaching the harness one thing had
     * made it wrong about seven others.
     *
     * ## Why a scalar is different, and has to be included
     *
     * A string does not supersede anything; it is usually the *switch that turns the others on*. A
     * frame reads `alignItems`, `justifyContent`, `gap` and `columns` only when its `layoutMode` says
     * `row`, `column` or `grid` — and the schema's first option is `none`, which is the value that
     * switches the family off, so all four came back unread. A text box reads `horizontalAlign` and
     * `zOrder` only for a `wrapType` that floats or leaves the flow, and an invented string floats
     * nothing. In both cases the filler was setting the one attribute that made the rest impossible.
     *
     * So: a taught **array or object** answers its own question and stays out of everybody else's,
     * exactly as before; a taught **scalar** joins the filler, because a product teaching one is
     * telling the probe what a working document looks like. The `alone` question below still sees a
     * superseded attribute, and it still only works when the superseding one is absent.
     */
    const all: Record<string, unknown> = {};
    for (const [name, shape] of Object.entries(shapes)) {
      const taught = probes?.(nodeType, name);
      const scalar =
        taught && taught.length > 0 && (typeof taught[0] === 'string' || typeof taught[0] === 'number')
          ? taught[0]
          : undefined;
      if (scalar !== undefined) {
        all[name] = scalar;
        continue;
      }
      const values = probeValues(shape, name);
      if (values !== UNPROBEABLE) all[name] = values[0];
    }

    const bare = draw({});
    const { [attr]: _gone, ...without } = all;
    const holed = draw(without);
    if (bare === null || holed === null) return null;

    /**
     * Asked **two ways** for every candidate value, and read means any answer is yes.
     *
     * ### Alone, on a bare node
     *
     * The only question that sees an attribute another attribute *supersedes*.
     * Measured: a shape's `cornerRadius` beside four per-corner values changes
     * nothing, because the corners win — true of that combination, and a lie about
     * the attribute.
     *
     * ### Put back into a node with everything else set
     *
     * The combination question above.
     *
     * Neither is the attribute's question. Both, over every legal value, are.
     */
    let asked = false;
    for (const value of candidates) {
      const alone = draw({ [attr]: value });
      const restored = draw({ ...without, [attr]: value });
      if (alone === null || restored === null) continue;

      // A difference is a difference however it was produced: if the drawing changed,
      // something read the attribute, and an unevaluable *part* of the tree cannot
      // make that untrue.
      if (alone.text !== bare.text || restored.text !== holed.text) return true;

      // No difference, and both renders were fully evaluated — so this value really
      // does change nothing.
      asked ||= (alone.asked && bare.asked) || (restored.asked && holed.asked);
    }

    // Nothing changed, and nothing could be properly asked: the product cannot answer,
    // which is not the same as answering no.
    return asked ? false : null;
  };
}

/**
 * Calls the attribute functions a template holds, so their answers are compared.
 *
 * A renderer's `style` and `data-*` are usually functions of the node — that is how
 * the DSL passes a node's own values in — and `JSON.stringify` drops a function
 * entirely. Without this every attribute that lands in a style would look unread,
 * which is most of them.
 */
const UNCALLABLE = '[uncallable]';

function replacerFor(node: unknown, env: unknown) {
  return (_key: string, value: unknown): unknown => {
    if (typeof value !== 'function') return value;
    try {
      // The node *and* the environment, which is what the DSL hands them: Word's
      // attribute functions are `(d, env) => …` and half of what they answer comes
      // from the second one.
      return (value as (data: unknown, env: unknown) => unknown)(node, env);
    } catch {
      // A function that needs more than the node — an environment, a document — is
      // one this cannot evaluate. Named rather than dropped, so a render containing
      // one can be recognised as unaskable instead of quietly compared.
      return UNCALLABLE;
    }
  };
}
