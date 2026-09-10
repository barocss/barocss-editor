import {
  createCatalog,
  selectQuestions,
  type CatalogFilter,
} from "../content/catalog.ts";
import type { Catalog, PlayQuestion } from "../content/types.ts";
import type { SchoolCourse, CourseUnit } from "./curriculum-types.ts";
import type { DerivationDefinition } from "./derivation-types.ts";
import { validateCurriculum } from "./validate-curriculum.ts";

export interface DatabaseSnapshot {
  schemaVersion: 1;
  revision: number;
  catalog: Catalog;
  schoolCourses: SchoolCourse[];
  courseUnits: CourseUnit[];
  derivations: DerivationDefinition[];
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** One validated, immutable content snapshot. User records stay in their own store. */
export function createStaticDatabase(source: DatabaseSnapshot) {
  if (
    source.schemaVersion !== 1 ||
    !Number.isSafeInteger(source.revision) ||
    source.revision < 1
  )
    throw new Error("Unsupported database schema or revision");
  const data = structuredClone(source);
  const asPack = (catalog: Catalog) => ({
    ...catalog,
    id: "database.snapshot",
    schemaVersion: 1 as const,
    revision: data.revision,
  });
  data.catalog = createCatalog([asPack(data.catalog)]);
  validateCurriculum(data.catalog, data.schoolCourses, data.courseUnits);
  const ids = new Set<string>();
  for (const derivation of data.derivations) {
    if (
      !/^[a-z][a-z0-9.-]*$/.test(derivation.id) ||
      ids.has(derivation.id) ||
      !Number.isSafeInteger(derivation.revision) ||
      derivation.revision < 1 ||
      !derivation.title.trim() ||
      !derivation.steps.length
    )
      throw new Error(`Invalid derivation: ${derivation.id}`);
    ids.add(derivation.id);
    const formula = data.catalog.formulas.find(
      (f) => f.id === derivation.formulaId,
    );
    if (
      !formula ||
      formula.status !== "published" ||
      derivation.steps.some((step) => step.formulaId !== formula.id)
    )
      throw new Error(`Invalid derivation formula: ${derivation.id}`);
  }
  // Apply the same ID, answer and input-profile checks to ordinary questions and proof steps.
  const proofSteps = data.derivations.flatMap((d) =>
    d.steps.map((step) => ({
      ...step,
      condition:
        step.condition ||
        data.catalog.formulas
          .find((f) => f.id === d.formulaId)!
          .conditions.join(" "),
    })),
  );
  createCatalog([
    asPack({
      ...data.catalog,
      questions: [...data.catalog.questions, ...proofSteps],
    }),
  ]);
  freeze(data);
  const questions = selectQuestions(data.catalog);
  const byQuestion = new Map(questions.map((q) => [q.id, freeze(q)]));
  return {
    getCatalog: () => data.catalog,
    getCurriculum: () => ({
      courses: data.schoolCourses,
      units: data.courseUnits,
    }),
    listQuestions: (filter: CatalogFilter = {}): PlayQuestion[] =>
      selectQuestions(data.catalog, filter),
    getQuestion: (id: string) => byQuestion.get(id),
    getFormula: (id: string) =>
      data.catalog.formulas.find(
        (f) => f.id === id && f.status === "published",
      ),
    getInputProfile: (id: string) =>
      data.catalog.inputProfiles.find((p) => p.id === id),
    listDerivations: () => data.derivations,
    getDerivation: (id: string) => data.derivations.find((d) => d.id === id),
    getDerivationQuestions: (id: string): PlayQuestion[] => {
      const definition = data.derivations.find((d) => d.id === id);
      if (!definition) throw new Error(`Unknown derivation: ${id}`);
      return definition.steps.map((step) => ({
        ...step,
        formula: data.catalog.formulas.find(
          (f) => f.id === definition.formulaId,
        )!,
        inputProfile: data.catalog.inputProfiles.find(
          (p) => p.id === step.inputProfileId,
        )!,
      }));
    },
    exportSnapshot: (): DatabaseSnapshot => structuredClone(data),
  };
}
