import type { TaxonomyTerm } from "./types.ts";
export function matchesTerm(
  terms: readonly TaxonomyTerm[],
  selected: readonly string[] | undefined,
  id: string,
): boolean {
  if (!selected?.length) return true;
  const seen = new Set<string>();
  let term = terms.find((t) => t.id === id);
  while (term && !seen.has(term.id)) {
    if (selected.includes(term.id)) return true;
    seen.add(term.id);
    term = terms.find((t) => t.id === term!.parentId);
  }
  return false;
}
export function validateTerms(terms: readonly TaxonomyTerm[], kind: string) {
  const byId = new Map(terms.map((t) => [t.id, t]));
  for (const term of terms) {
    if (!term.name.trim() || term.aliases?.some((a) => !a.trim()))
      throw Error(`Invalid ${kind} label: ${term.id}`);
    const visited = new Set<string>([term.id]);
    let parent = term.parentId;
    while (parent) {
      if (visited.has(parent)) throw Error(`${kind} cycle: ${term.id}`);
      visited.add(parent);
      const next = byId.get(parent);
      if (!next) throw Error(`Unknown ${kind} parent: ${term.id}`);
      parent = next.parentId;
    }
  }
}
export function searchTerms<T extends TaxonomyTerm>(
  terms: readonly T[],
  query: string,
): T[] {
  const normalize = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, "");
  const needle = normalize(query);
  return terms.filter((t) =>
    [t.name, t.id, ...(t.aliases ?? [])].some((s) =>
      normalize(s).includes(needle),
    ),
  );
}
