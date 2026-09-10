import { viewerStorageKey, validViewer } from "./storage.ts";
import { learningStorage } from "./storage.ts";
import type { FormulaDefinition, PlayQuestion } from "./content/types.ts";
import type { Attempt } from "./game.ts";
import { progressKey } from "./game.ts";
export interface SeenQuestion {
  key: string;
  firstSeen: number;
  lastSeen: number;
  question: Pick<
    PlayQuestion,
    | "id"
    | "revision"
    | "formulaId"
    | "title"
    | "before"
    | "after"
    | "condition"
    | "hint"
    | "explanation"
  > & { answer: string; formula: FormulaDefinition };
  lastAttempt?: Attempt & { answeredAt: number };
}
export type History = Record<string, SeenQuestion>;
export async function getViewerId(): Promise<string> {
  const saved = await learningStorage.getItem(viewerStorageKey);
  if (validViewer(saved)) return saved;
  const viewer = `guest-${crypto.randomUUID()}`;
  await learningStorage.setItem(viewerStorageKey, viewer);
  return viewer;
}
export const historyStorageKey = (userId: string) =>
  `formula-game:history:v1:${encodeURIComponent(userId)}`;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");
const timestamp = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function validRecord(v: unknown): v is SeenQuestion {
  if (
    !object(v) ||
    typeof v.key !== "string" ||
    !timestamp(v.firstSeen) ||
    !timestamp(v.lastSeen) ||
    !object(v.question)
  )
    return false;
  const q = v.question;
  if (
    ![
      "id",
      "formulaId",
      "title",
      "before",
      "after",
      "condition",
      "hint",
      "explanation",
      "answer",
    ].every((k) => typeof q[k] === "string") ||
    !Number.isSafeInteger(q.revision) ||
    Number(q.revision) < 1 ||
    !object(q.formula)
  )
    return false;
  const f = q.formula;
  if (
    !["id", "title", "latex"].every((k) => typeof f[k] === "string") ||
    !Number.isSafeInteger(f.revision) ||
    Number(f.revision) < 1 ||
    !strings(f.conditions) ||
    !Array.isArray(f.variables) ||
    !f.variables.every(
      (v) =>
        object(v) &&
        typeof v.symbol === "string" &&
        typeof v.meaning === "string" &&
        (v.unit === undefined || typeof v.unit === "string"),
    ) ||
    !Array.isArray(f.sources) ||
    !f.sources.every(
      (s) =>
        object(s) &&
        typeof s.title === "string" &&
        typeof s.url === "string" &&
        s.url.startsWith("https://"),
    )
  )
    return false;
  if (v.key !== `${q.id}@${q.revision}:f${f.revision}` || f.id !== q.formulaId)
    return false;
  if (f.lesson !== undefined) {
    const l = f.lesson;
    if (
      !object(l) ||
      typeof l.title !== "string" ||
      typeof l.introduction !== "string" ||
      !Array.isArray(l.steps) ||
      !l.steps.every(
        (s) =>
          object(s) &&
          typeof s.text === "string" &&
          (s.latex === undefined || typeof s.latex === "string"),
      ) ||
      (l.diagram !== undefined && l.diagram !== "pythagorean-area")
    )
      return false;
    if (
      l.history !== undefined &&
      (!object(l.history) ||
        typeof l.history.title !== "string" ||
        typeof l.history.text !== "string" ||
        typeof l.history.sourceUrl !== "string" ||
        !l.history.sourceUrl.startsWith("https://"))
    )
      return false;
  }
  if (v.lastAttempt !== undefined) {
    const a = v.lastAttempt;
    if (
      !object(a) ||
      a.questionId !== q.id ||
      typeof a.answer !== "string" ||
      typeof a.correct !== "boolean" ||
      typeof a.hinted !== "boolean" ||
      !timestamp(a.answeredAt)
    )
      return false;
  }
  return true;
}
export async function readHistory(userId: string): Promise<History> {
  const raw = await learningStorage.getItem(historyStorageKey(userId));
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!object(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, SeenQuestion] =>
          validRecord(entry[1]) && entry[1].key === entry[0],
      ),
    );
  } catch {
    return {};
  }
}
export async function writeHistory(
  userId: string,
  history: History,
): Promise<boolean> {
  try {
    await learningStorage.setItem(
      historyStorageKey(userId),
      JSON.stringify(history),
    );
    return true;
  } catch {
    return false;
  }
}
export function recordSeen(
  history: History,
  q: PlayQuestion,
  now = Date.now(),
): History {
  const key = progressKey(q),
    old = history[key];
  const snapshot = {
    id: q.id,
    revision: q.revision,
    formulaId: q.formulaId,
    title: q.title,
    before: q.before,
    after: q.after,
    condition: q.condition,
    hint: q.hint,
    explanation: q.explanation,
    answer: q.grading.answer,
    formula: q.formula,
  };
  return {
    ...history,
    [key]: {
      key,
      firstSeen: old?.firstSeen ?? now,
      lastSeen: now,
      question: structuredClone(snapshot),
      ...(old?.lastAttempt ? { lastAttempt: old.lastAttempt } : {}),
    },
  };
}
export function recordAnswer(
  history: History,
  q: PlayQuestion,
  attempt: Attempt,
  now = Date.now(),
): History {
  if (attempt.questionId !== q.id) return history;
  const next = recordSeen(history, q, now),
    key = progressKey(q);
  return {
    ...next,
    [key]: { ...next[key], lastAttempt: { ...attempt, answeredAt: now } },
  };
}
