/**
 * Making a paragraph part of a list, and moving it between levels.
 *
 * Word has no list node. A list is paragraphs that point at a numbering
 * definition — `numId` names the definition, `numLevel` says how deep — and the
 * numbers a reader sees are counted at render time by walking the document. That
 * is why this is Word's own and not the shared kit's: the kit's list commands
 * wrap blocks in a list node, which in this schema is a wrapper nothing reads.
 * They reported success and changed nothing.
 *
 * The consequence was that the product could render a list perfectly and had no
 * way to make one. This is that missing half.
 */
import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { childOfType, childrenOf, type DocumentAccess, type DocumentNode } from './document-access';

export type ListKind = 'bullet' | 'ordered';

/**
 * Half an inch, in twips: Word's default tab, and what one press of the indent
 * button moves a paragraph that is not in a list.
 */
export const INDENT_STEP = 720;

/** Word offers nine levels, numbered from zero. */
export const MAX_LIST_LEVEL = 8;

/**
 * What each level of a new list looks like.
 *
 * Word's own defaults, which cycle every three levels — a reader who has seen
 * one Word document already knows what "1. / a. / i." and "• / ○ / ▪" mean, and
 * inventing something else would be novelty for its own sake.
 */
const BULLET_GLYPHS = ['•', '○', '▪'];
const ORDERED_FORMATS = ['decimal', 'lowerLetter', 'lowerRoman'];

/** A numbering definition for a new list of the given kind. */
export function numberingDefinition(kind: ListKind, id: string): DocumentNode {
  const levels: DocumentNode[] = [];
  for (let level = 0; level <= MAX_LIST_LEVEL; level++) {
    const cycle = level % 3;
    levels.push({
      stype: 'numberingLevel',
      attributes:
        kind === 'bullet'
          ? {
              level,
              // A bullet has no counter to format, so its glyph is the whole
              // pattern. `formatCounter` returns nothing for a format it does
              // not know, which is what leaves the glyph standing alone.
              format: 'bullet',
              text: BULLET_GLYPHS[cycle],
              start: 1,
              suffix: 'space'
            }
          : {
              level,
              format: ORDERED_FORMATS[cycle],
              // Its own counter only. A pattern naming the levels above it —
              // `%1.%2.` — is what makes "1.1, 1.2"; a plain list does not want
              // that, and a reader asking for a numbered list means a plain one.
              text: `%${level + 1}.`,
              start: 1,
              // Restart when the level above advances, so a second sub-list
              // begins at one rather than continuing the first.
              ...(level > 0 ? { restartAfterLevel: level - 1 } : {}),
              suffix: 'space'
            }
    });
  }

  return { stype: 'numberingDef', attributes: { id, name: id }, content: levels };
}

/** Every numbering definition in the document, by id. */
function definitionsOf(doc: DocumentAccess): Map<string, DocumentNode> {
  const root = doc.getNode(doc.rootId);
  const found = new Map<string, DocumentNode>();
  for (const resource of childrenOf(doc, childOfType(doc, root, 'resources'))) {
    if (resource.stype !== 'numberingDef') continue;
    const id = resource.attributes?.id;
    if (typeof id === 'string') found.set(id, resource);
  }
  return found;
}

/**
 * Which kind of list a definition describes, read from its first level.
 *
 * The first level is enough: a definition that bulleted its top level and
 * numbered the rest is not something Word's list buttons can make, and a
 * document that contains one is answering a question nobody asked here.
 */
export function definitionKind(doc: DocumentAccess, definition: DocumentNode | undefined): ListKind | null {
  if (!definition) return null;
  for (const level of childrenOf(doc, definition)) {
    if (level.stype !== 'numberingLevel') continue;
    if ((level.attributes?.level ?? 0) !== 0) continue;
    return level.attributes?.format === 'bullet' ? 'bullet' : 'ordered';
  }
  return null;
}

/** The kind of list a block is in, or nothing when it is not in one. */
export function listKindOf(doc: DocumentAccess, block: DocumentNode | undefined): ListKind | null {
  const numId = block?.attributes?.numId;
  if (typeof numId !== 'string') return null;
  return definitionKind(doc, definitionsOf(doc).get(numId));
}

/** An id no definition is using yet. */
export function freeNumberingId(doc: DocumentAccess, kind: ListKind): string {
  const taken = definitionsOf(doc);
  for (let n = 1; ; n++) {
    const id = `${kind}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * The list a new one should join, if the paragraph before it is already in one
 * of the same kind.
 *
 * Turning the paragraph under an existing numbered list into a numbered
 * paragraph means continuing that list — a reader who sees "1. 2." and makes the
 * next line numbered expects "3.". Starting a second list there would restart at
 * one and look like a bug. An isolated paragraph gets a list of its own, so that
 * two unrelated lists do not share a counter.
 */
export function listToJoin(
  doc: DocumentAccess,
  block: DocumentNode | undefined,
  kind: ListKind
): string | null {
  if (!block?.parentId) return null;
  const parent = doc.getNode(block.parentId);
  const siblings = childrenOf(doc, parent);
  const index = siblings.findIndex((sibling) => sibling.sid === block.sid);
  if (index <= 0) return null;

  const previous = siblings[index - 1];
  const numId = previous?.attributes?.numId;
  if (typeof numId !== 'string') return null;
  return definitionKind(doc, definitionsOf(doc).get(numId)) === kind ? numId : null;
}

export class WordListExtension implements Extension {
  name = 'wordLists';
  // After the shared kit, so that these replace its list commands rather than
  // sitting beside them. Theirs cannot work here and reported success anyway.
  priority = 40;

  onCreate(editor: Editor): void {
    const register = (name: string, run: (ed: Editor, selection: ModelSelection) => Promise<boolean>) =>
      (editor as any).registerCommand({
        name,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
          const selection = payload?.selection ?? ed.selection;
          return selection ? await run(ed, selection) : false;
        },
        canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
          this._blocks(ed, payload?.selection ?? ed.selection).length > 0
      });

    register('toggleBulletList', (ed, selection) => this._toggleList(ed, 'bullet', selection));
    register('toggleOrderedList', (ed, selection) => this._toggleList(ed, 'ordered', selection));
    register('indentText', (ed, selection) => this._shift(ed, selection, 1));
    register('outdentText', (ed, selection) => this._shift(ed, selection, -1));
    register('indentFirstLine', (ed, selection) => this._shiftFirstLine(ed, selection, 1));
    register('outdentFirstLine', (ed, selection) => this._shiftFirstLine(ed, selection, -1));
    register('insertTab', (ed, selection) => this._insertTab(ed, selection));

    /**
     * Which of the three things Tab means here.
     *
     * Word gives Tab one meaning per place: a level in a list, a first-line
     * indent at the start of a paragraph, and a tab character everywhere else.
     * Deciding that in the keymap rather than inside one command is how the rest
     * of this app scopes keys — see `inTable`, which scopes Tab to cell
     * navigation — and it keeps each command something a button can run too.
     */
    const track = () => {
      const selection = editor.selection;
      (editor as any).setContext('inList', this._numbered(editor, selection));
      (editor as any).setContext('atBlockStart', this._atBlockStart(editor, selection));
    };
    editor.on('editor:selection.model', track);
    editor.on('editor:content.change', track);
    track();
  }

  /** Whether the caret is in a paragraph that points at a numbering definition. */
  private _numbered(editor: Editor, selection: ModelSelection | null | undefined): boolean {
    return this._blocks(editor, selection).some(
      (block) => typeof block.attributes?.numId === 'string'
    );
  }

  /**
   * Whether the caret sits before everything in its block.
   *
   * Offset zero of the block's first run, and nothing selected — which is the
   * one place Word reads Tab as an instruction about the paragraph rather than
   * as a character. Anywhere else, including offset zero of the *second* run,
   * is inside the text.
   */
  private _atBlockStart(editor: Editor, selection: ModelSelection | null | undefined): boolean {
    if (!selection || selection.collapsed !== true || selection.startOffset !== 0) return false;
    const doc = this._doc(editor);
    const [block] = this._blocks(editor, selection);
    if (!block) return false;

    const firstRun = (node: DocumentNode | undefined): string | null => {
      if (!node) return null;
      if (typeof node.text === 'string') return node.sid ?? null;
      for (const child of childrenOf(doc, node)) {
        const found = firstRun(child);
        if (found) return found;
      }
      return null;
    };
    return firstRun(block) === selection.startNodeId;
  }

  /** The document as the resolvers read it. */
  private _doc(editor: Editor): DocumentAccess {
    const store: any = (editor as any).dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: (editor as any).getRootId?.() };
  }

  /**
   * The blocks a selection would change.
   *
   * Numbering is a block property, so a selection across three paragraphs makes
   * all three list items — which is what selecting three paragraphs and pressing
   * the list button means.
   */
  private _blocks(editor: Editor, selection: ModelSelection | null | undefined): DocumentNode[] {
    const doc = this._doc(editor);
    const store: any = (editor as any).dataStore;
    if (!store || !selection || !doc.rootId) return [];

    const blockOf = (sid: string): DocumentNode | null => {
      let current: DocumentNode | undefined = doc.getNode(sid);
      for (let depth = 0; current && depth < 64; depth++) {
        if (current.stype && typeof current.text !== 'string' && current.stype !== 'inline-text') {
          return current;
        }
        current = current.parentId ? doc.getNode(current.parentId) : undefined;
      }
      return null;
    };

    // Both ends have to exist before a range can be walked; an undo leaves a
    // selection pointing at nodes it removed.
    if (!doc.getNode(selection.startNodeId)) return [];
    let sids: string[] = [selection.startNodeId];
    if (selection.endNodeId && doc.getNode(selection.endNodeId)) {
      try {
        sids = store.getNodesInRange?.(selection.startNodeId, selection.endNodeId) ?? sids;
      } catch {
        sids = [selection.startNodeId];
      }
    }

    const blocks: DocumentNode[] = [];
    for (const sid of sids) {
      const block = blockOf(sid);
      if (block?.sid && !blocks.some((other) => other.sid === block.sid)) blocks.push(block);
    }
    return blocks;
  }

  /**
   * Turn the selected blocks into a list of this kind, or out of one.
   *
   * Out only when every selected block is already in a list of that kind. A
   * selection of one bulleted and one plain paragraph is not a bulleted
   * selection, and the press that follows should finish the job rather than
   * undo half of it.
   */
  private async _toggleList(
    editor: Editor,
    kind: ListKind,
    selection: ModelSelection
  ): Promise<boolean> {
    const doc = this._doc(editor);
    const blocks = this._blocks(editor, selection);
    if (blocks.length === 0) return false;

    const allInKind = blocks.every((block) => listKindOf(doc, block) === kind);
    if (allInKind) {
      return await this._commit(
        editor,
        blocks.map((block) => ({
          type: 'setAttrs',
          payload: { nodeId: block.sid, attrs: { numId: null, numLevel: null } }
        }))
      );
    }

    const joined = listToJoin(doc, blocks[0], kind);
    const numId = joined ?? freeNumberingId(doc, kind);

    const operations: any[] = [];
    if (!joined) {
      const root = doc.getNode(doc.rootId);
      const resources = childOfType(doc, root, 'resources');
      // A definition has to live somewhere the resolver looks, and it only
      // looks in resources.
      if (!resources?.sid) return false;
      operations.push({
        type: 'addChild',
        payload: { parentId: resources.sid, child: numberingDefinition(kind, numId) }
      });
    }

    for (const block of blocks) {
      const level = block.attributes?.numLevel;
      operations.push({
        type: 'setAttrs',
        payload: {
          nodeId: block.sid,
          attrs: { numId, numLevel: typeof level === 'number' ? level : 0 }
        }
      });
    }

    return await this._commit(editor, operations);
  }

  /**
   * Indent or outdent.
   *
   * Two different edits behind one button, because they are one action to a
   * reader. A list item moves between levels; anything else moves by half an
   * inch. Outdenting past the first level leaves the list altogether, which is
   * what Word does and what makes the button a way out of a list rather than a
   * dead end.
   */
  private async _shift(
    editor: Editor,
    selection: ModelSelection,
    direction: 1 | -1
  ): Promise<boolean> {
    const blocks = this._blocks(editor, selection);
    if (blocks.length === 0) return false;

    const operations: any[] = [];
    for (const block of blocks) {
      const attributes = block.attributes ?? {};
      const numbered = typeof attributes.numId === 'string';

      if (numbered) {
        const level = typeof attributes.numLevel === 'number' ? attributes.numLevel : 0;
        const next = level + direction;
        if (next < 0) {
          operations.push({
            type: 'setAttrs',
            payload: { nodeId: block.sid, attrs: { numId: null, numLevel: null } }
          });
        } else if (next <= MAX_LIST_LEVEL) {
          operations.push({
            type: 'setAttrs',
            payload: { nodeId: block.sid, attrs: { numLevel: next } }
          });
        }
        continue;
      }

      const indent = typeof attributes.indentLeft === 'number' ? attributes.indentLeft : 0;
      const next = Math.max(0, indent + direction * INDENT_STEP);
      if (next !== indent) {
        operations.push({
          type: 'setAttrs',
          payload: { nodeId: block.sid, attrs: { indentLeft: next } }
        });
      }
    }

    return operations.length > 0 ? await this._commit(editor, operations) : false;
  }

  /**
   * The first line's own indent, which is what Word's Tab sets at the start of a
   * paragraph.
   *
   * Not the same thing as the paragraph's indent: `indentLeft` moves every line
   * and `indentFirstLine` moves only the first, which is the ordinary shape of a
   * body paragraph in a printed document. Pressing Tab before the first word
   * used to move the whole paragraph, and there was no way at all to ask for the
   * first line alone.
   *
   * A hanging indent is the same measurement with the opposite sign, and Word
   * keeps them mutually exclusive — so taking one off means clearing both rather
   * than driving `indentFirstLine` negative.
   */
  private async _shiftFirstLine(
    editor: Editor,
    selection: ModelSelection,
    direction: 1 | -1
  ): Promise<boolean> {
    const operations: unknown[] = [];

    for (const block of this._blocks(editor, selection)) {
      const attributes = block.attributes ?? {};
      const hanging = typeof attributes.indentHanging === 'number' ? attributes.indentHanging : 0;
      const first = typeof attributes.indentFirstLine === 'number' ? attributes.indentFirstLine : 0;

      // A hanging indent goes the other way, and shrinks before the first line
      // starts growing.
      if (hanging > 0 && direction > 0) {
        const next = Math.max(0, hanging - INDENT_STEP);
        operations.push({
          type: 'setAttrs',
          payload: { nodeId: block.sid, attrs: { indentHanging: next || null } }
        });
        continue;
      }

      const next = first + direction * INDENT_STEP;
      if (next === first) continue;
      operations.push({
        type: 'setAttrs',
        payload: {
          nodeId: block.sid,
          attrs:
            next > 0
              ? { indentFirstLine: next, indentHanging: null }
              : { indentFirstLine: null, indentHanging: next < 0 ? -next : null }
        }
      });
    }

    return operations.length > 0 ? await this._commit(editor, operations) : false;
  }

  /**
   * A tab, as a character in the text.
   *
   * The schema has had a `tab` node all along — an inline atom, with a renderer
   * and the whole tab-stop layout behind it, and seven of them in the sample
   * document — and nothing could put one in. Tab moved the paragraph instead,
   * wherever in it the caret happened to be.
   */
  private async _insertTab(editor: Editor, selection: ModelSelection): Promise<boolean> {
    if (selection.type !== 'range' || selection.collapsed !== true) return false;
    const store: any = (editor as any).dataStore;
    const run = store?.getNode?.(selection.startNodeId);
    if (!run || typeof run.text !== 'string' || !run.parentId) return false;

    const parent = store.getNode(run.parentId);
    const siblings: string[] = Array.isArray(parent?.content) ? parent.content : [];
    const at = siblings.indexOf(run.sid);
    if (at < 0) return false;

    const offset = typeof selection.startOffset === 'number' ? selection.startOffset : 0;
    const text: string = run.text;

    /**
     * A tab is a node, so the run it lands inside has to give way to it: the
     * text before it stays, the text after it becomes a run of its own, and the
     * tab goes between them. At either end there is nothing to split.
     */
    const operations: unknown[] = [];
    if (offset > 0 && offset < text.length) {
      operations.push({ type: 'splitTextNode', payload: { nodeId: run.sid, splitPosition: offset } });
    }
    const position = offset === 0 ? at : at + 1;
    operations.push({
      type: 'addChild',
      payload: { parentId: parent.sid, child: { stype: 'tab' }, position }
    });

    return await this._commit(editor, operations);
  }

  /**
   * One transaction, because it is one edit: undo puts every block back, and a
   * selection half turned into a list is a state no reader should see.
   */
  private async _commit(editor: Editor, operations: unknown[]): Promise<boolean> {
    // Where the caret was, so it can be put back. Adding a child moves the
    // selection into it, which is right for content and wrong here: a numbering
    // definition lives in resources, out of the flow, and is never somewhere to
    // type. Left alone, pressing the list button moved the caret inside the
    // definition it had just written, and the next press of indent applied to
    // that instead of to the paragraph.
    const before = editor.selection;

    const result = await transaction(editor, operations as never).commit();
    if (!result.success) return false;

    if (before) {
      const store: any = (editor as any).dataStore;
      const live = (sid: string | undefined) => !sid || !!store?.getNode?.(sid);
      if (live(before.startNodeId) && live(before.endNodeId)) {
        (editor as any).updateSelection(before);
      }
    }
    return true;
  }
}

export function createWordListCommands(): WordListExtension {
  return new WordListExtension();
}
