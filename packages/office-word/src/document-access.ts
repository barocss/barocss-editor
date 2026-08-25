/**
 * The slice of a document the product runtime needs.
 *
 * The resolvers below read structure but never write, so they take this instead
 * of a DataStore. That keeps them usable against a plain object tree (tests, a
 * .docx importer, a server-side renderer) and makes it obvious that resolving a
 * style cannot mutate the document.
 */
export interface DocumentNode {
  sid?: string;
  stype?: string;
  text?: string;
  parentId?: string;
  content?: (string | DocumentNode)[];
  attributes?: Record<string, unknown>;
  marks?: { stype?: string; range?: [number, number]; attrs?: Record<string, unknown> }[];
}

export interface DocumentAccess {
  getNode(id: string): DocumentNode | undefined;
  /** Root node id — a `document` in the Office schema. */
  rootId: string;
}

/** Children of a node as nodes, resolving stored ids. */
export function childrenOf(doc: DocumentAccess, node: DocumentNode | undefined): DocumentNode[] {
  /*
   * Read once, into a name.
   *
   * `content` is a **resolved** property — a placement answers with its definition's parts — so
   * `if (!node.content)` followed by `for (node.content)` asks the store twice for one answer, and
   * two reads of one thing is also two chances for them to disagree. Measured: 60 of the 520
   * resolutions in a render of the sample deck were this function asking twice.
   */
  const kids = node?.content;
  if (!kids) return [];
  const out: DocumentNode[] = [];
  for (const child of kids) {
    const resolved = typeof child === 'string' ? doc.getNode(child) : child;
    if (resolved) out.push(resolved);
  }
  return out;
}

/** First child of a given type, if present. */
export function childOfType(
  doc: DocumentAccess,
  node: DocumentNode | undefined,
  stype: string
): DocumentNode | undefined {
  return childrenOf(doc, node).find((child) => child.stype === stype);
}

/**
 * The document's own settings.
 *
 * Not in the index below, and cannot be: that indexes resources by the `id`
 * their author gave them, and settings are the one resource nothing points at —
 * there is only ever one, and it is about the document rather than referenced by
 * it.
 */
export function documentSettings(doc: DocumentAccess): DocumentNode | undefined {
  const resources = childOfType(doc, doc.getNode(doc.rootId), 'resources');
  return childOfType(doc, resources, 'docSettings');
}

/**
 * Every resource definition in the document, indexed by `id`.
 *
 * Resources are looked up constantly during resolution — a style chain may walk
 * several, and numbering resolves once per numbered paragraph — so this is built
 * once and passed around rather than searched each time.
 */
export function indexResources(doc: DocumentAccess): Map<string, DocumentNode> {
  const root = doc.getNode(doc.rootId);
  const resources = childOfType(doc, root, 'resources');
  const index = new Map<string, DocumentNode>();
  for (const resource of childrenOf(doc, resources)) {
    const id = resource.attributes?.id;
    if (typeof id === 'string') index.set(id, resource);
  }
  return index;
}

/**
 * Blocks in document order, depth first.
 *
 * Numbering has to see paragraphs in reading order — a counter is meaningless
 * otherwise — and that order includes blocks nested in tables, content controls
 * and text boxes.
 */
export function* walkBlocks(
  doc: DocumentAccess,
  node: DocumentNode | undefined,
  depth = 0
): Generator<DocumentNode> {
  if (!node || depth > 64) return;
  for (const child of childrenOf(doc, node)) {
    if (child.stype === 'resources' || child.stype === 'docMeta') continue;
    yield child;
    yield* walkBlocks(doc, child, depth + 1);
  }
}
