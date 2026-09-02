/**
 * **글 고치기** — the mode in which a reader may change the words and nothing else.
 *
 * ## Why this is a mode and not a permission, and why that is said out loud
 *
 * The third thing work needs, and it is *not* collaboration — that is deferred and the order was
 * agreed. This is the half that is not about two people editing at once: in real work the owner of
 * the layout and the owner of the words are different people, and today changing a word comes with
 * permission to break the layout.
 *
 * There are no accounts, so *this person may only write* cannot be enforced and **must not be
 * claimed**. What can honestly be built is a mode a reader chooses, the way they choose preview.
 * Which is what Webflow's Editor and a locked Notion page are, and it is genuinely useful: most of
 * the damage a writer does to a layout is done by accident, and a mode stops all of it.
 *
 * The day this product has accounts the mode becomes the shape a permission is expressed in. Nothing
 * here changes; what changes is who may leave it.
 *
 * ## Why the list is of commands
 *
 * `stateableIn` is the precedent — a list of what may change in a state, read by the panel so a row
 * that cannot apply is not drawn. This one has to be **commands** rather than attributes, because
 * what a writer is refused is mostly *acts*: adding a block, deleting one, dragging one. An attribute
 * list would have to be a list of everything except, which is a list that goes stale on the day
 * somebody adds a paint attribute and forgets.
 *
 * Read by four surfaces, which is the whole point of declaring it once: the panel draws only rows
 * whose command a writer may run, the toolbar greys the rest, the key map does not answer a chord for
 * one, and a **check** can ask the question that matters — *is there a way to change the layout from
 * inside writing mode?* — which no amount of hiding controls answers on its own.
 */

/**
 * The commands a writer may run.
 *
 * Everything here is **words or the thing words are about**. A title and a description are words, and
 * the person who writes the words writes those too; a picture's file is what a paragraph is about,
 * and a link's destination is what its text promises.
 *
 * Typing is not in the list and cannot be: it is not a command in this product — the caret and
 * `beforeinput` are, which is `office-text`'s business and the reason a writer's main gesture needs
 * no permission here at all.
 */
export const WRITER_COMMANDS: readonly string[] = [
  /* The page's own words: what it is called, what it says it is, where it answers. */
  'setPageInfo',
  /* A picture's file and the words that stand in for it — see `addPicture` and `alt`. */
  'setBlockFormat.picture',
  /*
   * Where a link goes — a page of this site or an address out of it. The two commands this product
   * actually has, rather than the one it sounded like it should: a link to a page stores the page's
   * durable id and a link out stores a URL, and telling them apart is what makes renaming a page
   * move its links instead of breaking them.
   */
  'linkToPage',
  'linkToAddress',
  /* Undo and redo, which belong to whoever is doing the changing. */
  'undo',
  'redo',
  /* Looking: none of these change the document at all. */
  'exportPage',
  'exportSite'
];

/**
 * Whether a writer may run this command.
 *
 * `setBlockFormat` is the one that cannot be answered by name alone: it is this product's 24-field
 * command and it writes a heading's level *and* a section's padding. So the list carries a
 * `command.stype` form for it, and this is where that is read — a writer may set a **picture's**
 * fields and nothing else through it.
 *
 * Written as a function rather than a set membership because the answer is genuinely two questions,
 * and a caller that had to know that would be a caller that gets it wrong on the surface nobody
 * checked.
 */
export function writerMayRun(command: string | undefined, stype?: string): boolean {
  if (!command) return false;
  if (WRITER_COMMANDS.includes(command)) return true;
  return !!stype && WRITER_COMMANDS.includes(`${command}.${stype}`);
}

/**
 * The attributes a writer may set on a block of this kind — which is *nothing* unless the block is a
 * picture.
 *
 * A separate answer from `writerMayRun` because the panel asks a different question: not *may this
 * command run* but *is this row worth drawing*. A picture's row for its file is; its row for its
 * corner radius is not, and both go through the same command.
 */
export const WRITER_ATTRS: readonly string[] = ['src', 'alt', 'name', 'description', 'path'];

/** Whether a writer may change this attribute — see `WRITER_ATTRS`. */
export function writerMaySet(attr: string | undefined): boolean {
  return !!attr && WRITER_ATTRS.includes(attr);
}
