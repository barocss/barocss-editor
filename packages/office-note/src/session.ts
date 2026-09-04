import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createNoteEditor } from './note-kit';
import { getNoteSchemaDefinition } from './note-schema';

/** What a store hands back, and all this needs of one. */
type Node = { stype?: unknown; text?: unknown; attributes?: Record<string, unknown>; content?: unknown[]; marks?: unknown[] };
type Access = { getNode: (sid: string) => Node | undefined };

/**
 * **독립된 에디팅 상태** — a note's own store, its own schema and its own history.
 *
 * ## The bug this is the fix for, not a refactor
 *
 * A body was edited by a second **view** over the host's editor. One editor means one selection, and
 * a selection is applied by *every* view: the site's boards were told the caret is at `site:597`, a
 * node they do not draw, so they searched their own DOM for it and gave up out loud —
 * `[EditorViewDOM] selection retry exceeded` on every click into a body. Read exactly right from the
 * outside: *난 분명 office-note 를 드래그 했는데 office-site 의 editor 가 selection 을 넣는 느낌이야.*
 *
 * Two editors over one store is not the answer and was measured: `Editor`'s constructor makes an
 * empty document and **writes it into the store it was given**, so the second one erases the first.
 *
 * So: a store of its own, loaded with a copy of the body.
 *
 * ## And then the copy has to go back
 *
 * Which is the price, and it is worth naming rather than hiding. The site keeps a body as nodes in
 * its own document — that is what lets a card draw one, the reference index see it and the orphan
 * check work — so a session that edits a copy has to write the copy home.
 *
 * `mirror` is that, on an idle delay rather than per keystroke: a designer watching a card wants it
 * to follow, and a subtree replaced on every character is a transaction per character in the host's
 * history. A pause is when the card catches up.
 */
export interface NoteSession {
  /** The editor to hand `NoteEditor` — its own selection, its own history. */
  editor: Editor;
  /** What every sid in this body is prefixed with — see `NoteOptions.session`. */
  session: string;
  /** Where the body lives inside it. */
  rootId: string;
  /** Stop mirroring and let go of the store. */
  close: () => void;
}

/**
 * The body's blocks as a plain tree — what crosses between the two documents.
 *
 * **Without sids.** A sid belongs to the store that minted it, and carrying one across would make
 * two documents claim the same node. The stypes, the attributes, the text and the marks are the
 * shared vocabulary; the identity is not.
 */
export function noteTreeOf(doc: Access, sid: string): Record<string, unknown> | undefined {
  const node = doc.getNode(sid);
  if (!node) return undefined;

  const copy = (one: Node): Record<string, unknown> => ({
    stype: one.stype,
    ...(one.text !== undefined ? { text: one.text } : {}),
    ...(one.attributes ? { attributes: { ...one.attributes } } : {}),
    ...(one.marks ? { marks: JSON.parse(JSON.stringify(one.marks)) } : {}),
    content: ((one.content ?? []) as unknown[])
      .map((child) => (typeof child === 'string' ? doc.getNode(child) : undefined))
      .filter((child): child is Node => !!child)
      .map(copy)
  });

  return { stype: 'note', content: ((node.content ?? []) as unknown[])
    .map((child) => (typeof child === 'string' ? doc.getNode(child) : undefined))
    .filter((child): child is Node => !!child)
    .map(copy) };
}

/**
 * Open a body in a session of its own.
 *
 * `from` is the host's document and `sid` the node whose children are the body. What comes back is
 * an editor a `NoteEditor` can be handed, and a `close` the host calls when the surface goes.
 */
export function openNote(
  from: Access,
  sid: string,
  options: NoteOptions = {}
): NoteSession {
  return start(noteTreeOf(from, sid) ?? { stype: 'note', content: [] }, options);
}

/**
 * Open a body a host already has **as a tree** — the other kind of host.
 *
 * `openNote` reads out of a store, because a site keeps a body as nodes in its own document. A CMS
 * keeps one as a row in a database and hands over what it parsed; an app testing this package hands
 * over a literal. Neither has sids to walk, and `noteTreeOf` walks sids — so the first thing written
 * against this package from outside drew an **empty body**, silently, because every child was
 * filtered out as *not a string*.
 *
 * Found by `apps/note` on its first run, which is what that app is for.
 */
export function openNoteTree(tree: unknown, options: NoteOptions = {}): NoteSession {
  return start(tree, options);
}

interface NoteOptions {
  /**
   * **이 노트의 이름** — what every sid in it is prefixed with.
   *
   * A sid is `${session}:${n}`, and the session used to be the word `note` for every body on the
   * page. Twelve notes therefore all minted `note:1`, `note:2` … and only a **static** counter in
   * `DataStore` kept them apart — which worked within one page and not between two. A body saved
   * from one page load and a body saved from another both start near `note:1`, so a host holding
   * both — a site with two bodies in `resources`, a CMS with a list of posts — has two different
   * nodes under one name.
   *
   * Reported as *sid 가 가장 큰 문제인데, instance 별로 달라야해*, and measured on this app: seven of
   * twelve sessions shared a root id, because that one was `doc-${Date.now()}`.
   *
   * Minted when not given. **Given** is better when the host has a durable name for this body — a
   * post's id, a row's key — because then the sids are the same every time it is opened, which is
   * what makes a comment, a bookmark or a diff able to point into one.
   */
  session?: string;
    /**
     * Write the body home. Called with the blocks as a tree, on a pause — see `after`.
     *
     * A callback rather than this package writing into the host's store: whose document that is, and
     * what a transaction there costs, is the host's business. `office-note` knows about a body.
     */
    onChange?: (blocks: unknown[]) => void;
  /** How long a pause is, in milliseconds. */
  after?: number;
}

function start(tree: unknown, options: NoteOptions): NoteSession {
  const schema = createSchema('note', getNoteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor = createNoteEditor({ dataStore: store, schema, editable: true });

  /* One name per body — see `NoteOptions.session` for what sharing one costs. */
  const session = options.session ?? DataStore.mintSessionId('note');
  editor.loadDocument(tree, session);

  /* Always a string after `loadDocument` — the engine types it optional for a store with no root. */
  const rootId = editor.getRootId() ?? '';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const told = () => {
    if (!options.onChange) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const doc = { getNode: (one: string) => store.getNode(one) as Node | undefined };
      const said = noteTreeOf(doc, rootId);
      options.onChange?.((said?.content as unknown[]) ?? []);
    }, options.after ?? 350);
  };

  editor.on('editor:content.change' as never, told);

  return {
    editor,
    session,
    rootId,
    close: () => {
      if (timer) clearTimeout(timer);
      editor.off('editor:content.change' as never, told);
      editor.destroy?.();
    }
  };
}
