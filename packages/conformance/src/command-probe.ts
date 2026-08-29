/**
 * **Every command a product registers, run over a real document, and asked six questions.**
 *
 * ## Why this is here and not in a test file
 *
 * It was written as one, in `packages/extensions`, and it found eleven faults on its first
 * afternoon — including two that lost a reader's words. Every one of them was in the **shared**
 * command layer, which is the layer three products stand on.
 *
 * But a product registers its own commands too. Word registers **164** and only about 136 come from
 * the shared kit; the rest are its revisions, comments, tables, shapes, maths and fields. None of
 * those had ever been asked whether they can be undone. The probe was answering six questions about
 * one package and nothing about the products, which is the same shape as the fault it was written to
 * find: **a mechanism that exists and is wired in one place**.
 *
 * So it lives here, where `every-command-does-something` lives, and a product wires it in a few
 * lines. The next product built on this engine inherits all six by writing a document fixture and a
 * payload table.
 *
 * ## The six
 *
 * | question | why it is not one of the others |
 * | --- | --- |
 * | **moves the document** | the command does something at all |
 * | **gives it back** | undo replays an *inverse* |
 * | **does it again** | redo replays the *original*, against a document undo rewrote |
 * | **still a valid tree** | operations validate what they write, not what they add up to |
 * | **selection is alive** | a command that removes what the caret was in has to leave it somewhere |
 * | **a toggle undoes itself** | pressing it twice is pressing nothing |
 *
 * ## Only one direction is worth asking
 *
 * Every fault found by this has been a `canExecute` **looser** than its `execute` — a control that
 * lights up and does nothing. The opposite was measured and came back 0, and always will:
 * `Editor.executeCommand` consults `canExecute` before running anything, so the tight direction is
 * structurally true. That check is not here; the reason is, because it explains why every guard
 * fault in this repository points the same way.
 */

/**
 * What the probe needs of an editor — the public surface it actually touches.
 *
 * Exported so a product's own tables can be typed by it rather than by `any`: the engine counts
 * casts of the editor (`editor-is-typed`) and a probe that made every caller reach for the escape hatch
 * would be adding to that count once per product.
 */
export type ProbeEditor = {
  exportDocument: (sid: string) => unknown;
  getRootId: () => string;
  canExecuteCommand: (name: string, payload?: unknown) => boolean;
  executeCommand: (name: string, payload?: unknown) => Promise<unknown> | unknown;
  selection?: unknown;
  selectionManager?: { setSelection: (s: unknown) => void; clearSelection?: () => void };
  dataStore?: { getNode: (sid: string) => unknown; getActiveSchema?: () => unknown };
};

export type ProbeStore = { getNode: (sid: string) => unknown };

export interface CommandProbeInput {
  /**
   * A **new** editor and document for every command.
   *
   * One each is the expensive-looking choice and it is what makes the answers trustworthy: sharing
   * one would make each command's answer depend on what the command before it did, and the order is
   * alphabetical rather than meaningful.
   */
  fresh: () => { editor: ProbeEditor; store: ProbeStore };
  /** The commands to ask about — a product's own registry, sorted. */
  names: string[];
  /**
   * What a **surface** would send beyond a selection: a colour, a size, an address.
   *
   * Not cheating. A colour command asks `canExecute` before the reader has picked a colour — that is
   * deliberate and documented, because a control has to know whether to be enabled before it knows
   * what it will send. A command with no entry runs with nothing, and one that then says yes and
   * does nothing is a finding either way: either its guard is looser than its execute, or the table
   * owes it an entry.
   */
  says?: Record<string, Record<string, unknown>>;
  /** Commands that want a node of some kind, and the key each calls it. */
  wantsNode?: Record<string, { stype: string; keys: string[] }>;
  /**
   * States a command needs to have happened first, by name: an edit, an undo, a search, a menu.
   *
   * A command with nothing to do is not a command that does nothing, and a probe that cannot tell
   * them apart turns a working history into two findings.
   */
  before?: Record<string, (editor: ProbeEditor) => Promise<void> | void>;
  /**
   * Anything else a command needs, **read out of the document it will run on**.
   *
   * `says` is a constant and `wantsNode` is the common shorthand for *the first node of a kind*;
   * this is for the rest, and there is always a rest. A merge wants two cells and the **second** one;
   * a column removal wants the column as well as the block it is in; a split wants the one cell in
   * the table that is actually **merged**, because the operation declines every other. Each of those
   * is a fact about one command and about the fixture it is running over, so it belongs to the
   * product rather than here — the alternative is this package knowing what `mergeCells` is.
   */
  derive?: (name: string, editor: ProbeEditor, store: ProbeStore) => Record<string, unknown> | undefined;
  /** Whether the document is still a tree the schema describes — the product's validator. */
  validates?: (editor: ProbeEditor) => boolean;
}

export interface CommandAnswers {
  /** Whether running each command moved the document: `null` when no state let it run. */
  moved: Map<string, boolean | null>;
  /** Moved the document and could not be put back. */
  undone: string[];
  /** Moved the document and could not be done again. */
  unredone: string[];
  /** Left a document the schema will not accept. */
  broken: string[];
  /** Left the selection naming a node that is gone. */
  ghost: string[];
  /** A `toggle…` that is not its own inverse. */
  notSelfInverse: string[];
  /** What each `insert…` put in the document, by node type — observed, not declared. */
  made: Map<string, string[]>;
  /**
   * Commands whose guard says **yes** in some state where the run then refuses.
   *
   * Not the same question as `moved`. That one stops at the first state a command can run in and
   * reports what happened there, so a command that works from a caret and declines over a held box
   * comes back as *works*. This asks every state and keeps the disagreements — which is the fault
   * class this whole harness is named after, and the one the deck found by hand: *"measured on a
   * deck with a box held, both toggles lit up and did nothing."*
   */
  saysYesAndDeclines: string[];
}

/**
 * A document as a **string that means the same thing** — what two of these can be compared by.
 *
 * Straight `JSON.stringify` is not it, and the difference is not cosmetic. Undo a `toggleBold` and
 * the run comes back carrying `marks: []` where it had no `marks` key at all: the same document by
 * every reading, and a different string. Measured before this existed, **45** commands that move the
 * document looked like commands that cannot be undone — a finding so large it can only be the probe.
 */
const meaning = (node: unknown, keepSids = true): unknown => {
  if (Array.isArray(node)) return node.map((one) => meaning(one, keepSids));
  if (!node || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'metadata') continue;
    if (!keepSids && (key === 'sid' || key === 'parentId')) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (!Array.isArray(value) && typeof value === 'object' && Object.keys(value as object).length === 0) continue;
    out[key] = meaning(value, keepSids);
  }
  return out;
};

const asWritten = (editor: ProbeEditor) =>
  JSON.stringify(meaning(editor.exportDocument(editor.getRootId()) ?? ''));

/**
 * The same, **without the identity of the nodes** — which is what a *redo* has to be compared by.
 *
 * The two history questions are not one mechanism asked twice, and the difference is exactly here.
 *
 * **Undo** is *put it back*, and back means the same nodes: a selection, a comment anchor or a link
 * points at a sid, and an undo that returned an equivalent document made of new nodes would break
 * every one of them. That strictness caught a `deleteNode` returning an empty paragraph.
 *
 * **Redo** is *do it again*, and doing it again makes new nodes exactly as doing it the first time
 * did. Compared strictly, 15 commands looked broken — every insert and every block toggle — and
 * every one had reproduced the document perfectly with fresh sids.
 */
const asMeant = (editor: ProbeEditor) =>
  JSON.stringify(meaning(editor.exportDocument(editor.getRootId()) ?? '', false));

/**
 * How many of each node type the document holds right now.
 *
 * **Counted, not collected.** The set of types was the first measurement and it lied: a fixture rich
 * enough to let a command run holds one of most things already, so an insert that added one *more*
 * of something present showed as adding nothing at all — thirteen commands, all fine.
 */
const kinds = (editor: ProbeEditor, store: ProbeStore): Map<string, number> => {
  const out = new Map<string, number>();
  const walk = (sid: string) => {
    const node = store.getNode(sid) as { stype?: string; content?: unknown[] } | undefined;
    if (!node) return;
    if (node.stype) out.set(node.stype, (out.get(node.stype) ?? 0) + 1);
    for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
  };
  walk(editor.getRootId());
  return out;
};

/** The sids of every node of a kind, in document order — and every run, for `inline-text`. */
export const everyNode = (editor: ProbeEditor, store: ProbeStore, stype: string): string[] => {
  const out: string[] = [];
  const walk = (sid: string) => {
    const node = store.getNode(sid) as { stype?: string; text?: string; content?: unknown[] } | undefined;
    if (!node) return;
    if (node.stype === stype) out.push(sid);
    if (stype === 'inline-text' && typeof node.text === 'string') out.push(sid);
    for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
  };
  walk(editor.getRootId());
  return [...new Set(out)];
};

/** Ask every command every question, over a fresh document each time. */
export async function askEveryCommand(input: CommandProbeInput): Promise<CommandAnswers> {
  const answers: CommandAnswers = {
    moved: new Map(),
    undone: [],
    unredone: [],
    broken: [],
    ghost: [],
    notSelfInverse: [],
    made: new Map(),
    saysYesAndDeclines: []
  };

  for (const name of input.names) {
    answers.moved.set(name, await ask(name, input, answers));
  }
  return answers;
}

async function ask(
  name: string,
  input: CommandProbeInput,
  answers: CommandAnswers
): Promise<boolean | null> {
  const { editor, store } = input.fresh();
  const runs = everyNode(editor, store, 'inline-text');

  const said: Record<string, unknown> = { ...(input.says?.[name] ?? {}) };
  const wants = input.wantsNode?.[name];
  if (wants) {
    const found = everyNode(editor, store, wants.stype);
    for (const key of wants.keys) if (found[0]) said[key] = found[0];
  }

  Object.assign(said, input.derive?.(name, editor, store) ?? {});

  const at = (sid: string, from: number, to: number) => () =>
    editor.selectionManager?.setSelection({
      type: 'range', startNodeId: sid, startOffset: from, endNodeId: sid, endOffset: to, collapsed: from === to
    });

  /**
   * **Every run in the document**, as a range and as a caret.
   *
   * One run was the first version, and it made a whole class of command unaskable for a reason that
   * had nothing to do with the command: `removeHeading` needs the caret in a **heading**,
   * `splitListItem` in a **list item**, `nextCell` in a **cell**. Eleven commands sat in the *could
   * not be asked* column because of where a single caret happened to be, which reads exactly like
   * eleven commands nobody had got round to.
   */
  const states = [...runs.map((run) => at(run, 0, 3)), ...runs.map((run) => at(run, 1, 1))];

  /**
   * And the two states a **builder** has, asked separately and on an editor of their own.
   *
   * A node held, and nothing held. Half the products on this engine spend most of their time in one
   * of those — a deck with a box selected, a page builder with a card — and the fault this harness
   * is named after was found by hand in exactly that state: *"measured on a deck with a box held,
   * both toggles lit up and did nothing."*
   *
   * Separately, because the loop above stops at the first state a command can run in: a command that
   * works from a caret would never be asked about a held box. And on its own editor, because asking
   * means *running*, and running a command twice over one document compounds the edits.
   */
  const askBuilderStates = async () => {
    const { editor: builder, store: theirs } = input.fresh();
    const block = everyNode(builder, theirs, 'paragraph')[0];

    const shapes = [
      () => {
        if (block) builder.selectionManager?.setSelection({ type: 'node', nodeIds: [block] });
      },
      () => builder.selectionManager?.clearSelection?.()
    ];

    for (const shape of shapes) {
      try {
        shape();
      } catch {
        continue;
      }
      if (builder.canExecuteCommand(name, said) !== true) continue;

      const was = asWritten(builder);
      try {
        await builder.executeCommand(name, said);
      } catch {
        // A throw is an answer too, and the answer is *the document did not move*.
      }
      if (asWritten(builder) === was && !answers.saysYesAndDeclines.includes(name)) {
        answers.saysYesAndDeclines.push(name);
      }
    }
  };

  /*
   * Whether the guard ever said yes. It separates the two answers that used to be one: a command
   * that declined everywhere is **dead** (`false`), and one no state could even ask is **unanswered**
   * (`null`). Before the loop kept going past a refusal those were the same line.
   */
  let asked = false;

  await askBuilderStates();

  for (const set of states) {
    set();
    await input.before?.[name]?.(editor);
    /*
     * And again after the selection moved, because three commands take the **span** they act on
     * rather than reading the editor's — so their payload is the state rather than a constant.
     */
    Object.assign(said, input.derive?.(name, editor, store) ?? {});
    if (editor.canExecuteCommand(name, said) !== true) continue;
    asked = true;

    const before = asWritten(editor);
    const wasKinds = kinds(editor, store);
    try {
      await editor.executeCommand(name, said);
    } catch {
      // A throw is an answer too, and the answer is *the document did not move*.
    }

    const after = asWritten(editor);
    if (after === before) {
      /*
       * The guard said yes and the run refused. Kept and the loop continues, because a command that
       * declines from one state and works from another is *both* — and it is the first half a
       * reader meets: a control that lights up over what they are holding.
       */
      if (!answers.saysYesAndDeclines.includes(name)) answers.saysYesAndDeclines.push(name);
      continue;
    }
    const afterMeant = asMeant(editor);

    /*
     * And what an `insert…` actually put there — observed rather than declared. `produces` in the
     * conformance input is a written claim a product keeps up to date; this is the document saying
     * what appeared, which cannot go stale and cannot be wrong about a schema it read from.
     */
    if (name.startsWith('insert')) {
      const now = kinds(editor, store);
      answers.made.set(
        name,
        [...now].filter(([type, count]) => count > (wasKinds.get(type) ?? 0)).map(([type]) => type)
      );
    }

    // Still a document this schema describes — the tree, not the node an operation wrote.
    if (input.validates && !input.validates(editor)) answers.broken.push(name);

    /*
     * And the selection still names nodes that exist. A command that removes what the caret was in
     * has to leave the caret somewhere; a selection pointing at a deleted sid is a panel describing
     * something nobody can see.
     */
    const sel = editor.selection as Record<string, unknown> | undefined;
    for (const key of ['startNodeId', 'endNodeId']) {
      const sid = sel?.[key];
      if (typeof sid === 'string' && !store.getNode(sid)) answers.ghost.push(`${name}(${key})`);
    }
    for (const sid of (sel?.nodeIds ?? []) as string[]) {
      if (!store.getNode(sid)) answers.ghost.push(`${name}(nodeIds)`);
    }

    // And back — the cheapest question here, and the one that found the worst fault.
    await editor.executeCommand('undo', {});
    if (asWritten(editor) !== before) answers.undone.push(name);

    // And forward again, against a document the undo has just rewritten.
    await editor.executeCommand('redo', {});
    if (asMeant(editor) !== afterMeant) answers.unredone.push(name);

    /*
     * And a toggle is its own inverse: doing it twice is doing nothing. Over a **fresh** editor
     * rather than this one, because by here the document has been undone and redone and the point is
     * the pair of presses on their own.
     */
    if (name.startsWith('toggle')) {
      const { editor: twice, store: other } = input.fresh();
      const otherRuns = everyNode(twice, other, 'inline-text');
      const put = () =>
        twice.selectionManager?.setSelection({
          type: 'range', startNodeId: otherRuns[1] ?? otherRuns[0], startOffset: 0,
          endNodeId: otherRuns[1] ?? otherRuns[0], endOffset: 3, collapsed: false
        });
      put();
      if (twice.canExecuteCommand(name, said) === true) {
        const start = asWritten(twice);
        await twice.executeCommand(name, said);
        put();
        await twice.executeCommand(name, said);
        if (asWritten(twice) !== start) answers.notSelfInverse.push(name);
      }
    }

    return true;
  }
  return asked ? false : null;
}
