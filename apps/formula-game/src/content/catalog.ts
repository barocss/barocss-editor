import { matchesTerm, validateTerms } from "./taxonomy.ts";
import type {
  Catalog,
  ContentPack,
  PlayQuestion,
  SchoolLevel,
  Difficulty,
} from "./types.ts";
export const difficulties: { id: Difficulty; name: string }[] = [
  { id: "intro", name: "입문" },
  { id: "basic", name: "기본" },
  { id: "applied", name: "응용" },
  { id: "challenge", name: "도전" },
];
// Content is checked before it can enter the playable catalog.
export function createCatalog(packs: readonly ContentPack[]): Catalog {
  const ids = (items: readonly { id: string }[], kind: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (!/^[a-z][a-z0-9.-]*$/.test(item.id) || seen.has(item.id))
        throw Error(`${kind}: invalid or duplicate ID ${item.id}`);
      seen.add(item.id);
    }
    return seen;
  };
  ids(packs, "pack");
  const revision = (item: { id: string; revision: number }) => {
    if (!Number.isSafeInteger(item.revision) || item.revision < 1)
      throw Error(`Invalid revision: ${item.id}`);
  };
  for (const pack of packs) {
    if (pack.schemaVersion !== 1) throw Error(`Unsupported schema: ${pack.id}`);
    revision(pack);
  }
  const catalog: Catalog = {
    learningLevels: packs.flatMap((p) => p.learningLevels ?? []),
    subjects: packs.flatMap((p) => p.subjects),
    domains: packs.flatMap((p) => p.domains),
    topics: packs.flatMap((p) => p.topics),
    inputProfiles: packs.flatMap((p) => p.inputProfiles),
    formulas: packs.flatMap((p) => p.formulas),
    questions: packs.flatMap((p) => p.questions),
  };
  const learningLevels = ids(catalog.learningLevels, "learning level");
  const subjects = ids(catalog.subjects, "subject"),
    domains = ids(catalog.domains, "domain");
  const topics = ids(catalog.topics, "topic"),
    profiles = ids(catalog.inputProfiles, "input profile");
  const formulas = ids(catalog.formulas, "formula");
  ids(catalog.questions, "question");
  const references = (
    values: readonly string[],
    known: Set<string>,
    id: string,
    nonempty = true,
  ) => {
    if (
      (nonempty && !values.length) ||
      values.some((v) => !known.has(v)) ||
      new Set(values).size !== values.length
    )
      throw Error(`Invalid reference: ${id}`);
  };
  const status = (item: { id: string; status: string }) => {
    if (!["draft", "published", "retired"].includes(item.status))
      throw Error(`Invalid status: ${item.id}`);
  };
  validateTerms(catalog.subjects, "subject");
  validateTerms(catalog.learningLevels, "learning level");
  validateTerms(catalog.domains, "domain");
  for (const d of catalog.domains) references(d.subjectIds, subjects, d.id);
  for (const t of catalog.topics) references(t.domainIds, domains, t.id);
  for (const p of catalog.inputProfiles) {
    if (
      !p.symbols.length ||
      [...p.symbols, ...p.numbers, ...p.operators].some((v) => !v.trim()) ||
      p.structures.some((s) => !["square", "fraction", "root"].includes(s))
    )
      throw Error(`Invalid input profile: ${p.id}`);
  }
  const formulaMap = new Map(catalog.formulas.map((f) => [f.id, f]));
  for (const f of catalog.formulas) {
    if (f.lesson) {
      const l = f.lesson;
      if (
        !l.title.trim() ||
        !l.introduction.trim() ||
        !l.steps.length ||
        l.steps.some((step) => !step.text.trim()) ||
        (l.diagram && l.diagram !== "pythagorean-area") ||
        (l.history &&
          (!l.history.title.trim() ||
            !l.history.text.trim() ||
            !l.history.sourceUrl.startsWith("https://")))
      )
        throw Error(`Invalid lesson: ${f.id}`);
    }
    revision(f);
    status(f);
    references(f.topicIds, topics, f.id);
    references(f.prerequisiteIds, formulas, f.id, false);
    if (
      !f.schoolLevels.length ||
      f.schoolLevels.some((s) => !learningLevels.has(s))
    )
      throw Error(`Invalid school level: ${f.id}`);
    if (
      !f.title.trim() ||
      !f.latex.trim() ||
      !f.conditions.length ||
      f.conditions.some((c) => !c.trim()) ||
      !f.variables.length ||
      f.variables.some((v) => !v.symbol.trim() || !v.meaning.trim()) ||
      !f.sources.length ||
      f.sources.some((s) => !s.title.trim() || !/^https:\/\//.test(s.url))
    )
      throw Error(`Incomplete formula: ${f.id}`);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw Error(`Prerequisite cycle: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    formulaMap.get(id)!.prerequisiteIds.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  catalog.formulas.forEach((f) => visit(f.id));
  for (const q of catalog.questions) {
    revision(q);
    status(q);
    references([q.formulaId], formulas, q.id);
    references([q.inputProfileId], profiles, q.id);
    if (q.classification) {
      const f = formulaMap.get(q.formulaId)!;
      references(q.classification.topicIds, new Set(f.topicIds), q.id);
      references(q.classification.schoolLevels, learningLevels, q.id);
      if (
        q.classification.schoolLevels.some(
          (id) => !matchesTerm(catalog.learningLevels, f.schoolLevels, id),
        )
      )
        throw Error(`Question level outside formula: ${q.id}`);
    }
    if (
      q.status === "published" &&
      formulaMap.get(q.formulaId)!.status !== "published"
    )
      throw Error(`Unpublished formula: ${q.id}`);
    if (!difficulties.some((d) => d.id === q.difficulty))
      throw Error(`Invalid difficulty: ${q.id}`);
    if (
      q.grading.type !== "accepted-answers" ||
      !["polynomial-ab-v1", "latex-layout-v1", "math-input-v1"].includes(
        q.grading.normalizer,
      )
    )
      throw Error(`Unsupported grader: ${q.id}`);
    if (
      !q.grading.answer.trim() ||
      !q.grading.accepted.includes(q.grading.answer) ||
      q.grading.accepted.some((a) => !a.trim())
    )
      throw Error(`Missing accepted answer: ${q.id}`);
    if (
      !(q.before + q.after).trim() ||
      !q.title.trim() ||
      !q.hint.trim() ||
      !q.condition.trim() ||
      !q.explanation.trim()
    )
      throw Error(`Incomplete question: ${q.id}`);
  }
  return catalog;
}
export interface CatalogFilter {
  subjectIds?: readonly string[];
  domainIds?: readonly string[];
  schoolLevels?: readonly string[];
  topicIds?: readonly string[];
  subjectId?: string;
  domainId?: string;
  schoolLevel?: SchoolLevel;
  topicId?: string;
  difficulty?: Difficulty;
}
export function selectQuestions(
  catalog: Catalog,
  filter: CatalogFilter = {},
): PlayQuestion[] {
  const topics = new Set(
    catalog.topics
      .filter(
        (t) =>
          (!filter.topicId || t.id === filter.topicId) &&
          (!filter.topicIds?.length || filter.topicIds.includes(t.id)) &&
          t.domainIds.some((id) => {
            const d = catalog.domains.find((d) => d.id === id)!;
            return (
              matchesTerm(
                catalog.domains,
                filter.domainId ? [filter.domainId] : undefined,
                d.id,
              ) &&
              matchesTerm(catalog.domains, filter.domainIds, d.id) &&
              (!filter.subjectIds?.length ||
                d.subjectIds.some((id) =>
                  matchesTerm(catalog.subjects, filter.subjectIds, id),
                )) &&
              (!filter.subjectId ||
                d.subjectIds.some((id) =>
                  matchesTerm(catalog.subjects, [filter.subjectId!], id),
                ))
            );
          }),
      )
      .map((t) => t.id),
  );
  const formulas = new Map(
    catalog.formulas
      .filter((f) => f.status === "published")
      .map((f) => [f.id, f]),
  );
  const profiles = new Map(catalog.inputProfiles.map((p) => [p.id, p]));
  return catalog.questions
    .filter((q) => {
      const f = formulas.get(q.formulaId);
      if (
        q.status !== "published" ||
        !f ||
        (filter.difficulty && q.difficulty !== filter.difficulty)
      )
        return false;
      const classification = q.classification ?? f;
      return (
        classification.topicIds.some((id) => topics.has(id)) &&
        classification.schoolLevels.some(
          (id) =>
            matchesTerm(
              catalog.learningLevels,
              filter.schoolLevel ? [filter.schoolLevel] : undefined,
              id,
            ) && matchesTerm(catalog.learningLevels, filter.schoolLevels, id),
        )
      );
    })
    .map((q) => ({
      ...q,
      formula: formulas.get(q.formulaId)!,
      inputProfile: profiles.get(q.inputProfileId)!,
    }));
}
