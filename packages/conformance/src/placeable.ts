/**
 * Which node types can actually appear in a document.
 *
 * The check that asks "is this drawn" first asked "is this a resource", by
 * group. That is a heuristic and it had a hole exactly where a heuristic has
 * one: `numberingLevel` carries **no group at all**, deliberately — the schema
 * says "a level is only ever reachable through numberingDef's content
 * expression, never as a free-standing block or resource" — so the check
 * demanded a renderer for it and the product had to write an exemption it
 * should never have needed.
 *
 * The real question is reachability. A node can appear in a document if the
 * content expressions lead to it from the top node without going through a
 * definition on the way. `numberingLevel` is reachable only through
 * `numberingDef`, which lives in `resources`, so nothing can place one and
 * nothing should draw one. No group required, no exemption, and no heuristic.
 *
 * This also answers a question the group check could only guess at: a node in
 * a group nobody's content expression mentions is unreachable however it is
 * grouped.
 */

export interface NodeShape {
  name: string;
  group?: string;
  content?: string;
}

/**
 * The names a content expression refers to.
 *
 * Expressions are small — `block+`, `docMeta? surface+ resources?`,
 * `(descTerm descDef)+`, `(inline-image|bTable|codeBlock)+ bFigcaption?`,
 * `block+ | scene*`. Every name in one is either a node type or a group, and
 * the operators between them say how many and in what order, which this does
 * not care about: the question is only *which* types can appear, not how many.
 */
export function namesIn(expression: string | undefined): string[] {
  if (!expression) return [];
  return [...new Set(expression.match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? [])];
}

/**
 * Every node type that can appear somewhere in a document.
 *
 * Walked from the top node. A name in an expression is a node type or a group,
 * and a group stands for every node in it — which is what makes `block+` reach
 * every block there is.
 *
 * `stopAt` is where the walk refuses to continue: the resources region, whose
 * children are definitions referenced by id rather than placed. Everything
 * beyond it is reachable *as a definition* and never as content, which is
 * exactly the distinction the group heuristic was reaching for.
 */
export function placeableTypes(
  nodes: Map<string, NodeShape>,
  topNode: string,
  stopAt: ReadonlySet<string> = new Set(['resources'])
): Set<string> {
  const byGroup = new Map<string, string[]>();
  for (const [name, node] of nodes) {
    if (!node.group) continue;
    const members = byGroup.get(node.group) ?? [];
    members.push(name);
    byGroup.set(node.group, members);
  }

  const placeable = new Set<string>();
  const queue: string[] = [topNode];

  while (queue.length > 0) {
    const name = queue.pop()!;
    if (placeable.has(name)) continue;

    const node = nodes.get(name);
    if (!node) continue;
    placeable.add(name);

    // A definitions region is where content stops being content.
    if (stopAt.has(name)) continue;

    for (const reference of namesIn(node.content)) {
      // A name is a node type, a group, or neither — a stray word in an
      // expression refers to nothing and is ignored rather than guessed at.
      if (nodes.has(reference)) {
        queue.push(reference);
        continue;
      }
      for (const member of byGroup.get(reference) ?? []) queue.push(member);
    }
  }

  return placeable;
}
