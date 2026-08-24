import { childrenOf, type CanvasAccess, type CanvasNode } from './canvas-access';

/**
 * The document's own **named values**: one place says what a value is, and everything that uses it
 * says its name.
 *
 * ## What this is not, twice over
 *
 * - Not the **theme**. A theme slot is one of a fixed set (six accents, two lights, two darks, two
 *   faces) because that set is PowerPoint's format and round-trips with it. A variable is named by
 *   the author, of any kind, and nothing outside the document knows about it.
 * - Not a **component variable**. That is a question a card asks, answered per placement — "this
 *   card's title" is a fact about the card on slide four, not about the document.
 *
 * Written down because they were conflated twice while this was being designed, and each time the
 * symptom was the same: a value that belongs to one document being offered as though every deck had
 * it, or a document-wide decision being copied onto forty placements.
 *
 * ## How a document names one, and the measurement that fixed the shape
 *
 * `fill: 'var:강조'`, in the attribute where a colour goes — the theme's shape, for the theme's
 * reason: a second attribute beside the first means every reader checks two places and decides
 * which wins, and a document with both has no answer. The prefix makes it unambiguous, since no
 * CSS colour and no font name begins with `var:`.
 *
 * **Measured, with a transaction rather than assumed:** a reference commits into a *string*
 * attribute (`fill`, `name`) and is **refused** in a number or a boolean one (`cornerRadius`,
 * `width`, `visible`) — the type is declared and a reference is a string, so the whole write fails.
 * That is the validator working. So a number or a state reaches a shape through a **card**, where a
 * binding is a declaration and the conversion happens while the parts are resolved, off the
 * document. A bare shape taking a number from a variable needs a per-shape binding declaration,
 * which is in `docs/BACKLOG.md` rather than invented here.
 */

/** What a variable declares about itself, as its readers need it. */
export interface DocumentVar {
  /** The sid, so a panel can write to the node it is drawing. */
  sid: string;
  /** The durable name a reference uses. */
  name: string;
  /** What to write beside the field — the name when it says nothing. */
  label: string;
  kind: 'text' | 'color' | 'number' | 'boolean' | 'choice';
  /** The values a `choice` may take. */
  choices: string[];
  value: string;
}

const VAR_KINDS = ['text', 'color', 'number', 'boolean', 'choice'] as const;

const PREFIX = 'var:';

/** Whether a value names a variable rather than being one. */
export function isVarRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.length > PREFIX.length;
}

/** The name a reference holds, without the prefix. */
export function varNameOf(value: string): string {
  return value.slice(PREFIX.length);
}

/** How a document writes a reference, so nothing builds the string by hand. */
export function varRef(name: string): string {
  return `${PREFIX}${name}`;
}

/**
 * Every variable this document declares, in document order.
 *
 * Order is the author's: a panel draws them in it, and a list that sorted itself would move a row
 * under the reader's pointer the moment they renamed a label.
 */
export function documentVars(doc: CanvasAccess): DocumentVar[] {
  const root = doc.getNode(doc.rootId);
  if (!root) return [];

  const found: DocumentVar[] = [];
  for (const sid of childrenOf(root)) {
    const container = doc.getNode(sid);
    if (container?.stype !== 'variables') continue;

    for (const child of childrenOf(container)) {
      const node = doc.getNode(child);
      const declared = varOf(node, child);
      // A declaration with no name is not one: nothing could refer to it, so it is a row a reader
      // would edit for ever with no effect. The same rule a definition with no `id` follows.
      if (declared) found.push(declared);
    }
  }
  return found;
}

/** One declaration, read from its node. */
function varOf(node: CanvasNode | undefined, sid: string): DocumentVar | undefined {
  const name = node?.attributes?.name;
  if (node?.stype !== 'variable' || typeof name !== 'string' || name.length === 0) return undefined;

  const kind = node.attributes?.kind;
  const label = node.attributes?.label;
  const value = node.attributes?.value;
  const choices = node.attributes?.choices;

  return {
    sid,
    name,
    label: typeof label === 'string' && label.length > 0 ? label : name,
    kind: (VAR_KINDS as readonly string[]).includes(kind as string)
      ? (kind as DocumentVar['kind'])
      : 'text',
    choices: Array.isArray(choices) ? choices.filter((one): one is string => typeof one === 'string') : [],
    value: typeof value === 'string' ? value : ''
  };
}

/** The one a name refers to, or nothing. */
export function documentVar(doc: CanvasAccess, name: string | undefined): DocumentVar | undefined {
  if (!name) return undefined;
  return documentVars(doc).find((one) => one.name === name);
}

/**
 * A value with a variable's name filled in, or the value itself.
 *
 * Anything that is not a reference comes back untouched, which is what keeps every document written
 * before variables reading exactly as it did. A reference nothing declares comes back `undefined`,
 * so a caller draws **nothing** rather than drawing the literal string `var:강조` — the theme's rule,
 * and for the same reason: a missing name is a document that has lost something, and inventing a
 * colour for it hides that.
 */
export function resolveVarValue(doc: CanvasAccess, value: unknown): string | undefined {
  if (!isVarRef(value)) return typeof value === 'string' ? value : undefined;
  return documentVar(doc, varNameOf(value))?.value || undefined;
}

/**
 * How many places in the document name this variable.
 *
 * What a panel says before a reader deletes one — "3곳에서 씁니다" — and what makes the refusal
 * honest rather than a shrug. Counted rather than remembered: a number kept on the declaration
 * would have to be maintained by a write on every shape that took the colour, which is derived
 * state in the document and the fault this repository keeps finding.
 *
 * Both ways a name is used are counted, because both break when it goes: a **reference** in an
 * attribute (`fill: 'var:강조'`, including inside a paint or a gradient stop) and a card's
 * **binding** that names it.
 *
 * A binding inside a card that declares the same name is **not** a use of this variable — the card
 * is looked in first, so that binding was never pointing here. Answered from the walk rather than
 * by asking `canvas-component.ts`, which would make the two files import each other for one
 * question either of them can answer alone.
 */
export function varUses(doc: CanvasAccess, name: string): number {
  let count = 0;

  const inValue = (value: unknown, depth = 0): number => {
    if (isVarRef(value)) return varNameOf(value) === name ? 1 : 0;
    if (depth > 3) return 0;
    // A paint, an effect, a gradient's stops: a reference inside one is as much a reference as an
    // attribute holding one, which is the same traversal the theme's resolution has to do.
    if (Array.isArray(value)) {
      return (value as unknown[]).reduce<number>((sum, one) => sum + inValue(one, depth + 1), 0);
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).reduce<number>(
        (sum, one) => sum + inValue(one, depth + 1),
        0
      );
    }
    return 0;
  };

  const walk = (sid: string, depth: number, shadowed: boolean) => {
    if (depth > 32) return;
    const node = doc.getNode(sid);
    if (!node) return;

    if (node.stype === 'componentBind') {
      if (!shadowed && node.attributes?.var === name) count += 1;
    } else {
      for (const value of Object.values(node.attributes ?? {})) count += inValue(value);
    }

    /** Inside a card that declares this name, a binding of it means the card's, not the document's. */
    const inside =
      shadowed ||
      (node.stype === 'component' &&
        childrenOf(node).some((child) => {
          const declaration = doc.getNode(child);
          return declaration?.stype === 'componentVar' && declaration.attributes?.name === name;
        }));

    for (const child of childrenOf(node)) walk(child, depth + 1, inside);
  };

  walk(doc.rootId, 0, false);
  return count;
}

/**
 * One thing a **shape** takes from a variable: which of its attributes, and which variable.
 *
 * A card says this with a `componentBind` node; a shape says it in a list on itself (`varBinds`) —
 * the schema's comment has the three shapes that were measured and why this is the one left. What
 * they have in common is the important part: a **declaration**, so the reference never has to sit in
 * a typed attribute and be refused by the validator.
 */
export interface VarBind {
  /** The attribute to write — or the reserved word `text`, because words are content. */
  attr: string;
  /** The variable's name. */
  var: string;
}

/**
 * The attributes a binding **cannot draw its way into**, so they are *written* instead.
 *
 * ## Counted, then decided
 *
 * A bound value resolved at draw time is drawn at one number while `getNode` answers another — and
 * the geometry readers are `boxOf` in **31 places across 14 files**, plus six direct reads: the
 * overlay's outline and handles, the guides, the snapping, alignment, group bounds, the audit's
 * "off the edge" check, hit testing. Every one of them would have to learn to ask the resolution,
 * and every new one would be silently wrong until somebody noticed.
 *
 * So a bound **size** is written into the document by the pass that already settles derived
 * geometry (`canvas-layout-commands.ts`), which means all 37 readers and every writer keep working
 * unchanged. That is derived state in the document — the fault this repository keeps finding — and
 * it is the *same* trade the arrangement already made, for the same reason and with the same
 * convergence rule: answer only what differs, and a pass that agrees writes nothing.
 *
 * ## What is still refused, and why it is a different question
 *
 * `x`, `y` and `rotation`. Not because the mechanism could not carry them — it could, identically —
 * but because of what the reader would then meet: a shape they cannot **move**. A size a variable
 * owns is a card that is always 3000 wide; a *position* a variable owns is a box that snaps back
 * when you drag it, and that wants its own measurement about what a drag on it should mean.
 */
export const DRAWN_BY_WRITE = new Set(['width', 'height']);

/** What a binding may not name at all — see `DRAWN_BY_WRITE` for the ones written instead. */
export const UNBINDABLE = new Set(['x', 'y', 'rotation']);

/** The bindings a node declares, read defensively — a document is an author's. */
export function varBindsOf(node: CanvasNode | undefined): VarBind[] {
  const held = node?.attributes?.varBinds;
  if (!Array.isArray(held)) return [];

  const found: VarBind[] = [];
  for (const entry of held) {
    if (!entry || typeof entry !== 'object') continue;
    const attr = (entry as { attr?: unknown }).attr;
    const name = (entry as { var?: unknown }).var;
    if (typeof attr !== 'string' || !attr || typeof name !== 'string' || !name) continue;
    found.push({ attr, var: name });
  }
  return found;
}

/**
 * A value as the attribute needs it: a number where a number goes, `false` where a state is off.
 *
 * The same conversion a card's binding does (`canvas-instance.ts`), and for the same reason: the
 * document keeps a variable's value as a string — one shape to write, diff and check — and an
 * attribute that means a length has to be a number by the time it is drawn.
 *
 * `true` is written as **absent**, because that is what the drawing says: `visible: true` beside no
 * `visible` at all is the same drawing, which is the asymmetry the conformance probe finds in every
 * boolean.
 */
function asAttribute(value: string): { skip: boolean; value?: unknown } {
  if (value === 'true') return { skip: true };
  if (value === 'false') return { skip: false, value: false };

  const asNumber = Number(value);
  if (value.trim() !== '' && Number.isFinite(asNumber)) return { skip: false, value: asNumber };
  return { skip: false, value };
}

/**
 * The node's attributes with its bindings written in, or **nothing** when there is no binding.
 *
 * Answering `undefined` rather than a copy is what keeps this cheap enough to ask on every read: a
 * deck with no bindings pays one array check per node and copies nothing.
 *
 * A binding naming a variable the document does not declare leaves the attribute **alone** — the
 * shape keeps whatever it says, rather than losing it. That differs from a `var:` reference in an
 * attribute, which resolves to nothing and draws nothing, and the difference is honest: there the
 * document says "this value *is* the variable", here it says "take it from the variable if there is
 * one". The deck's own check reports both.
 */
export function boundAttrs(
  doc: CanvasAccess,
  node: CanvasNode | undefined
): Record<string, unknown> | undefined {
  const binds = varBindsOf(node).filter(
    (bind) =>
      bind.attr !== 'text' &&
      !UNBINDABLE.has(bind.attr) &&
      // A size is *written* into the document rather than drawn (see `DRAWN_BY_WRITE`), so
      // resolving it here as well would make the drawing disagree with what every reader of the
      // geometry answers — which is the whole thing that decision avoids.
      !DRAWN_BY_WRITE.has(bind.attr)
  );
  if (binds.length === 0) return undefined;

  const attrs = { ...((node?.attributes ?? {}) as Record<string, unknown>) };
  let touched = false;

  for (const bind of binds) {
    const found = documentVar(doc, bind.var);
    if (!found || found.value === '') continue;

    const written = asAttribute(found.value);
    touched = true;
    if (written.skip) delete attrs[bind.attr];
    else attrs[bind.attr] = written.value;
  }

  return touched ? attrs : undefined;
}

/**
 * The words a node takes from a variable, when it takes its words from one.
 *
 * `text` is not an attribute — the characters are *content* — so this is answered separately and
 * applied where a node's children are resolved. A text frame bound to 회사이름 draws the company
 * name and holds none of it, exactly as a card's bound part does.
 */
export function boundText(doc: CanvasAccess, node: CanvasNode | undefined): string | undefined {
  const bind = varBindsOf(node).find((one) => one.attr === 'text');
  if (!bind) return undefined;
  const found = documentVar(doc, bind.var);
  return found && found.value !== '' ? found.value : undefined;
}

/**
 * The geometry a shape's bindings decide, and **only what differs** from what it holds.
 *
 * The convergence rule the arrangement follows, for the same reason: this is read by a reaction that
 * runs on every document change, so a pass whose answer is already in the document must write
 * nothing or it would feed itself for ever.
 *
 * A variable holding something that is not a number is ignored rather than guessed at: `"넓게"` in a
 * width is a document saying something this cannot act on, and writing 0 would collapse the shape.
 */
export function boundGeometry(
  doc: CanvasAccess,
  node: CanvasNode | undefined
): Record<string, number> | undefined {
  const binds = varBindsOf(node).filter((bind) => DRAWN_BY_WRITE.has(bind.attr));
  if (binds.length === 0) return undefined;

  const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
  const differs: Record<string, number> = {};

  for (const bind of binds) {
    const found = documentVar(doc, bind.var);
    if (!found) continue;

    const asNumber = Number(found.value);
    if (found.value.trim() === '' || !Number.isFinite(asNumber) || asNumber < 0) continue;
    if (attrs[bind.attr] === asNumber) continue;
    differs[bind.attr] = asNumber;
  }

  return Object.keys(differs).length > 0 ? differs : undefined;
}

/** Whether this shape's size is a variable's answer rather than the reader's. */
export function sizeIsBound(node: CanvasNode | undefined): boolean {
  return varBindsOf(node).some((bind) => DRAWN_BY_WRITE.has(bind.attr));
}
