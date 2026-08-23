import type { Schema } from './schema';

/**
 * Checking a whole document against the schema, and saying where it is wrong.
 *
 * ## Why this exists
 *
 * Nothing validated a document that was *loaded*. Operations validate what they
 * write, so a document assembled by editing is checked at every step — and a
 * document handed to `loadDocument` went in exactly as written. The fixtures a
 * product ships are the one place its documents come from, and they were the one
 * place nothing looked.
 *
 * It cost four rounds of debugging on the day this was written. A deck's sample
 * table had its rows directly under `bTable`, where the schema says
 * `(bTableHeader)? bTableBody+ (bTableFooter)?`. It **drew perfectly** — the
 * renderers walk whatever they are given — and every table operation refused it,
 * because they read a table's children as groups and a group's children as rows.
 * The failure surfaced as `mergeTableCells: cell not found in table`, four
 * levels away from the thing that was wrong.
 *
 * ## Why not `Validator.validateDocument`
 *
 * That exists and is one level deep: it checks the top node, then each of its
 * children, and stops. Every document in this repository is a `document →
 * surface → block → …` tree, so "one level deep" is the two nodes least likely
 * to be wrong. The table above is four levels down.
 *
 * ## What a finding says
 *
 * Where, in the path a reader can follow — `document/surface[1]/textFrame[0]` —
 * and what. A validator that reports "content is invalid" and not *whose* leaves
 * the search this exists to end.
 */
export interface TreeFinding {
  /** The path from the root, by node type and index: `document/surface[1]`. */
  path: string;
  /** The node type at that path, or `unknown`. */
  stype: string;
  message: string;
}

interface TreeNode {
  stype?: string;
  /** This repository's field. `attrs` is accepted for callers that use it. */
  attributes?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
  content?: unknown;
  text?: string;
}

/**
 * Every way this document disagrees with the schema, deepest last.
 *
 * Returns findings rather than throwing, and returns *all* of them rather than
 * the first: a fixture with three faults in it should take one run to fix, not
 * three.
 */
export function validateTree(schema: Schema, root: unknown): TreeFinding[] {
  const findings: TreeFinding[] = [];

  const walk = (node: TreeNode | undefined, path: string, depth: number): void => {
    if (!node || depth > 100) return;

    const stype = node.stype;
    if (typeof stype !== 'string' || !schema.hasNodeType(stype)) {
      findings.push({
        path,
        stype: stype ?? 'unknown',
        message: `the schema has no node type \`${stype}\``
      });
      return;
    }

    /**
     * `attributes`, which is the field every document in this repository uses.
     *
     * `Validator.validateNode` reads `node.attrs`, so it has been validating an
     * empty object for every node it was ever given — a required attribute has
     * never been missed by it, because it never saw one.
     */
    const attributes = node.attributes ?? node.attrs ?? {};
    const attributeCheck = schema.validateAttributes(stype, attributes as Record<string, never>);
    for (const error of attributeCheck.errors ?? []) {
      findings.push({ path, stype, message: error });
    }

    const children = Array.isArray(node.content) ? (node.content as TreeNode[]) : [];

    /**
     * A node with `text` is a leaf whatever its content model says.
     *
     * `inline-text` carries its text in a field rather than in children, and
     * asking a content model about a node with no children would report every
     * run in the document as empty.
     */
    if (typeof node.text === 'string' && children.length === 0) return;

    const contentCheck = schema.validateContent(stype, children as never[]);
    for (const error of contentCheck.errors ?? []) {
      findings.push({ path, stype, message: error });
    }

    children.forEach((child, index) => {
      const name = typeof child?.stype === 'string' ? child.stype : 'unknown';
      walk(child, `${path}/${name}[${index}]`, depth + 1);
    });
  };

  const rootNode = root as TreeNode | undefined;
  walk(rootNode, typeof rootNode?.stype === 'string' ? rootNode.stype : 'unknown', 0);
  return findings;
}

/** The findings as one message, for a caller that wants to report them at once. */
export function describeFindings(findings: TreeFinding[]): string {
  return findings.map((finding) => `${finding.path}: ${finding.message}`).join('\n');
}
