/**
 * **What a publish left behind**, and the one question a reader actually asks about it.
 *
 * ## The four things work needs, and which of them this answers
 *
 * Asked as the second thing this product needs before anybody can use it at work: *어디로 가는지,
 * 누가 눌렀는지, 무엇이 나갔는지, 어떻게 되돌리는지.*
 *
 * - **Where** is `document.publishTo`, a connection's name — the reference shape again, because a
 *   deploy target is exactly what a `service` already is. The *sending* stays the app's, which is
 *   the division `publish-commands.ts` has stated since it was written.
 * - **What and when** is a `publish` record: the instant, how many pages, and a digest of the
 *   document at the time.
 * - **Who** stays empty until this product has accounts. A name invented by the tool would be a lie
 *   in a record whose entire value is being trustworthy.
 * - **Rolling back** is *not* answered, and that is a decision rather than an omission: a copy of
 *   every published page in the document would multiply the file by the number of publishes, and a
 *   document that grows every time a reader presses a button is one they stop pressing.
 *
 * ## Why the digest is of the document
 *
 * Because of the question it has to answer: **is what is live the same as what I have?** Comparing
 * outputs means rendering the whole site to find out; comparing documents is a string against a
 * string. And what a reader changes is the document — a publish that produced identical HTML from an
 * edited document is a publish they still want to know about.
 */

/** What this needs of a node: its type, its attributes and its children — `export-html.ts`'s shape. */
type Node = Record<string, any>;

/** One publish, as a reader reads it. */
export interface PublishRecord {
  sid: string;
  /** When, as an ISO instant. */
  at: string;
  pages: number;
  digest: string;
  /** The connection it was sent to, by name — empty when the files were handed to the reader. */
  to?: string;
  /** Who pressed it. Empty until there are accounts. */
  by?: string;
}

type Access = { rootId: string; getNode: (sid: string) => Node | undefined };

/**
 * A digest of the document, which is what a publish records and what *am I behind* compares against.
 *
 * A 32-bit FNV-1a over the exported document, written as hex. Not a cryptographic hash and not
 * pretending to be one: what it has to do is change when the document changes and be the same string
 * on two machines reading one file. Sixteen million pages of a site would collide before a reader's
 * two versions of one page do.
 *
 * The **exported** document rather than the store's nodes, because that is what a file holds: sids
 * are minted per session, so hashing them would say a document had changed the moment it was
 * reopened.
 */
export function digestOf(exported: unknown): string {
  const said = JSON.stringify(what(exported));
  let hash = 0x811c9dc5;
  for (let at = 0; at < said.length; at += 1) {
    hash ^= said.charCodeAt(at);
    /* FNV's prime, as shifts, because 16777619 in JS floats loses the low bits. */
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * **What a reader changed** — the document with the two things that are not their work taken out.
 *
 * Both were measured, and both made the answer useless in the same way:
 *
 * - **The `publishes` box itself.** Recording a publish changes the document, so a digest taken
 *   before the record was written stopped matching the moment it was — a site was *behind* one
 *   instant after being published, every time.
 * - **Every `sid`.** They are minted per session, so two editors reading one file produced different
 *   digests and a reader who merely reopened their site was told it had changed. A reader who is told
 *   that once learns to ignore the answer.
 * - **`metadata`.** Which holds `loadedAt` — *when this document was opened* — so the same file read
 *   thirteen milliseconds apart hashed differently. Found by diffing two readings of one sample and
 *   looking at the first character that differed, which is the only way anybody finds this.
 *
 * What is left is the site: its pages, their words, its components, its widths.
 */
function what(exported: unknown): unknown {
  if (Array.isArray(exported)) return exported.map(what);
  if (!exported || typeof exported !== 'object') return exported;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(exported as Record<string, unknown>)) {
    if (key === 'sid' || key === 'metadata') continue;
    if (key === 'content' && Array.isArray(value)) {
      out[key] = value
        .filter((one) => (one as { stype?: unknown })?.stype !== 'publishes')
        .map(what);
      continue;
    }
    out[key] = what(value);
  }
  return out;
}

/** The `publishes` box, which a document that has never published does not have. */
export function publishesBox(doc: Access): string | undefined {
  const root = doc.getNode(doc.rootId);
  return ((root?.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .find((sid) => doc.getNode(sid)?.stype === 'publishes');
}

/**
 * Every publish this document remembers, newest **last** — the order they were written, which is the
 * order they happened.
 */
export function publishesOf(doc: Access): PublishRecord[] {
  const box = publishesBox(doc);
  if (!box) return [];
  return ((doc.getNode(box)?.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .map((sid) => ({ sid, node: doc.getNode(sid) }))
    .filter(({ node }) => node?.stype === 'publish')
    .map(({ sid, node }) => {
      const attrs = (node!.attributes ?? {}) as Record<string, unknown>;
      return {
        sid,
        at: String(attrs.at ?? ''),
        pages: Number.isFinite(Number(attrs.pages)) ? Number(attrs.pages) : 0,
        digest: String(attrs.digest ?? ''),
        to: typeof attrs.to === 'string' && attrs.to ? attrs.to : undefined,
        by: typeof attrs.by === 'string' && attrs.by ? attrs.by : undefined
      };
    });
}

/** The most recent publish, or nothing — which is a site nobody has published yet. */
export function lastPublish(doc: Access): PublishRecord | undefined {
  const all = publishesOf(doc);
  return all[all.length - 1];
}

/**
 * **Whether what is live is what the reader has.**
 *
 * Three answers rather than two, because *never published* is not *behind*: a site nobody has
 * published has nothing wrong with it, and a builder that told a reader they were behind on the day
 * they started would be a builder that cried wolf on day one.
 */
export function publishState(
  doc: Access,
  /** The document as a file would hold it — see `digestOf`. */
  exported: unknown
): { state: 'never' | 'current' | 'behind'; last?: PublishRecord } {
  const last = lastPublish(doc);
  if (!last) return { state: 'never' };
  return { state: last.digest === digestOf(exported) ? 'current' : 'behind', last };
}

/**
 * What a reader reads about it, in their own words.
 *
 * Here rather than in the app because it is the *product's* sentence — the same reason the fault list
 * says what is wrong rather than handing the app a code — and because two surfaces will want it: the
 * rail's foot and whatever a publish dialog turns out to be.
 */
export function publishSaid(state: 'never' | 'current' | 'behind', last?: PublishRecord): string {
  if (state === 'never') return '아직 발행하지 않았습니다';
  const when = last?.at ? last.at.slice(0, 16).replace('T', ' ') : '';
  return state === 'current' ? `${when}에 발행한 것과 같습니다` : `${when} 이후로 바뀐 것이 있습니다`;
}
