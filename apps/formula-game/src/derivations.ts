import { learningStorage } from "./storage.ts";
import type { Catalog, PlayQuestion } from "./content/types.ts";
import type { DerivationDefinition } from "./database/derivation-types.ts";
import { pythagoreanDerivation } from "./database/data/derivations.ts";
import { isCorrect } from "./game.ts";
export { pythagoreanDerivation };
export type { DerivationDefinition };
export function derivationQuestions(
  catalog: Catalog,
  definition = pythagoreanDerivation,
): PlayQuestion[] {
  const formula = catalog.formulas.find((f) => f.id === definition.formulaId);
  if (!formula) throw new Error("Unknown derivation formula");
  return definition.steps.map((s) => {
    const inputProfile = catalog.inputProfiles.find(
      (p) => p.id === s.inputProfileId,
    );
    if (!inputProfile || s.formulaId !== formula.id)
      throw new Error("Invalid derivation step");
    return { ...s, formula, inputProfile };
  });
}
export function advanceDerivation(
  questions: PlayQuestion[],
  answers: string[],
  input: string,
): string[] {
  const current = questions[answers.length];
  return current && isCorrect(current, input) ? [...answers, input] : answers;
}
export const derivationStorageKey = (
  user: string,
  definition: DerivationDefinition,
  formulaRevision: number,
) =>
  `formula-game:derivation:v1:${encodeURIComponent(user)}:${definition.id}@${definition.revision}:f${formulaRevision}`;
export async function readDerivation(
  key: string,
  questions: PlayQuestion[],
): Promise<string[]> {
  const raw = await learningStorage.getItem(key);
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data) || data.length > questions.length) return [];
    const answers: string[] = [];
    for (const answer of data) {
      if (
        typeof answer !== "string" ||
        !isCorrect(questions[answers.length], answer)
      )
        break;
      answers.push(answer);
    }
    return answers;
  } catch {
    return [];
  }
}
export async function writeDerivation(
  key: string,
  answers: string[],
): Promise<boolean> {
  try {
    await learningStorage.setItem(key, JSON.stringify(answers));
    return true;
  } catch {
    return false;
  }
}
