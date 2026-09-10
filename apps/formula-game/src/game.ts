import { learningStorage } from "./storage.ts";
import type { PlayQuestion as Question } from "./content/types.ts";
export type { PlayQuestion as Question } from "./content/types.ts";
// Bounded whitelist, not a symbolic algebra engine. Keep arbitrary grouping intact.
export function normalizeAnswer(source: string): string {
  return source
    .trim()
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/[×·]/g, "*")
    .replace(/−/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\{([ab])\}(?=\^)/g, "$1")
    .replace(/\^\{([0-9])\}/g, "^$1")
    .replace(/\s+/g, "")
    .replace(/(?<=[0-9ab])\*(?=[ab])/g, "");
}

export function normalizeMathInput(source: string): string {
  return normalizeAnswer(source)
    .replace(/μ/g, "\\mu")
    .replace(/σ/g, "\\sigma")
    .replace(/\{([A-Za-z])\}(?=\^)/g, "$1")
    .replace(/(?<=[0-9A-Za-z])\*(?=[A-Za-z])/g, "");
}
export function isCorrect(q: Question, input: string): boolean {
  const normalize =
    q.grading.normalizer === "polynomial-ab-v1"
      ? normalizeAnswer
      : q.grading.normalizer === "math-input-v1"
        ? normalizeMathInput
        : (s: string) =>
            s
              .trim()
              .replace(/\\(?:left|right)/g, "")
              .replace(/\s+/g, "");
  return q.grading.accepted.some(
    (answer) => normalize(answer) === normalize(input),
  );
}
export interface Attempt {
  questionId: string;
  answer: string;
  correct: boolean;
  hinted: boolean;
}
export interface QuestionProgress {
  attempts: number;
  correct: number;
  lastCorrect: boolean;
  lastHinted: boolean;
  lastSeen: number;
}
export type Progress = Record<string, QuestionProgress>;
export const progressKey = (q: Question) =>
  `${q.id}@${q.revision}:f${q.formula.revision}`;
export const storageKey = "formula-game:progress:v3";
export async function readProgress(): Promise<Progress> {
  const raw = await learningStorage.getItem(storageKey);
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([key, entry]) => {
        if (
          !/^[a-z][a-z0-9.-]*@[1-9][0-9]*:f[1-9][0-9]*$/.test(key) ||
          !entry ||
          typeof entry !== "object"
        )
          return false;
        const p = entry as QuestionProgress;
        return (
          Number.isSafeInteger(p.attempts) &&
          p.attempts > 0 &&
          Number.isSafeInteger(p.correct) &&
          p.correct >= 0 &&
          p.correct <= p.attempts &&
          typeof p.lastCorrect === "boolean" &&
          typeof p.lastHinted === "boolean" &&
          Number.isSafeInteger(p.lastSeen) &&
          p.lastSeen >= 0
        );
      }),
    );
  } catch {
    return {};
  }
}
export function recordAttempts(
  round: readonly Question[],
  attempts: readonly Attempt[],
  current: Progress = {},
  now = Date.now(),
): Progress {
  const progress = { ...current };
  for (const attempt of attempts) {
    const q = round.find((q) => q.id === attempt.questionId);
    if (!q) continue;
    const key = progressKey(q),
      previous = progress[key];
    progress[key] = {
      attempts: (previous?.attempts ?? 0) + 1,
      correct: (previous?.correct ?? 0) + Number(attempt.correct),
      lastCorrect: attempt.correct,
      lastHinted: attempt.hinted,
      lastSeen: now,
    };
  }
  return progress;
}
export async function writeProgress(progress: Progress): Promise<boolean> {
  try {
    await learningStorage.setItem(storageKey, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
export type RoundMode = "learn" | "mix" | "review";
export function getRound(
  bank: readonly Question[],
  count: number,
  mode: RoundMode = "learn",
  progress: Progress = {},
  random: () => number = Math.random,
): Question[] {
  if (!Number.isSafeInteger(count) || count <= 0) return [];
  let pool = bank.filter(
    (q) =>
      mode !== "review" ||
      (progress[progressKey(q)] &&
        (!progress[progressKey(q)].lastCorrect ||
          progress[progressKey(q)].lastHinted)),
  );
  if (mode === "mix") {
    pool = [...pool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  } else {
    pool.sort(
      (a, b) =>
        (progress[progressKey(a)]?.attempts ?? 0) -
          (progress[progressKey(b)]?.attempts ?? 0) ||
        (progress[progressKey(a)]?.lastSeen ?? 0) -
          (progress[progressKey(b)]?.lastSeen ?? 0),
    );
  }
  const spreadFormulas = (items: Question[]) => {
    const seen = new Set<string>(),
      first: Question[] = [],
      rest: Question[] = [];
    for (const q of items) {
      if (seen.has(q.formulaId)) rest.push(q);
      else {
        seen.add(q.formulaId);
        first.push(q);
      }
    }
    return [...first, ...rest];
  };
  // Keep unseen/less-practiced questions ahead of every higher-attempt group.
  // Within a group, show different formulas before another blank of the same one.
  if (mode !== "mix") {
    const groups = new Map<number, Question[]>();
    for (const q of pool) {
      const attempts = progress[progressKey(q)]?.attempts ?? 0;
      const group = groups.get(attempts) ?? [];
      group.push(q);
      groups.set(attempts, group);
    }
    return [...groups.values()].flatMap(spreadFormulas).slice(0, count);
  }
  return spreadFormulas(pool).slice(0, count);
}
