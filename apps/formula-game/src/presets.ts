import { learningStorage } from "./storage.ts";
import type { Catalog, Difficulty, PlayQuestion } from "./content/types.ts";
import { selectQuestions, difficulties } from "./content/catalog.ts";
import type { RoundMode } from "./game.ts";
import {
  courseIncludesQuestion,
  courseUnits,
  schoolCourses,
} from "./curriculum.ts";
export interface StudyScope {
  courseId?: string;
  unitIds?: string[];
  subjectIds: string[];
  schoolLevels: string[];
  domainIds: string[];
  topicIds: string[];
}
export interface StudyPreset {
  id: string;
  name: string;
  scopes: StudyScope[];
  difficulty?: Difficulty;
  count: number;
  mode: RoundMode;
  createdAt: number;
  updatedAt: number;
}
export interface PresetState {
  items: StudyPreset[];
  lastUsedId?: string;
}
export const emptyScope = (): StudyScope => ({
  subjectIds: [],
  schoolLevels: [],
  domainIds: [],
  topicIds: [],
});
export function newPreset(seed: Partial<StudyPreset> = {}): StudyPreset {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "",
    scopes: [emptyScope()],
    count: 5,
    mode: "learn",
    createdAt: now,
    updatedAt: now,
    ...structuredClone(seed),
  };
}
export function presetQuestions(
  catalog: Catalog,
  preset: StudyPreset,
): PlayQuestion[] {
  const result = new Map<string, PlayQuestion>();
  for (const scope of preset.scopes)
    for (const q of selectQuestions(catalog, {
      ...scope,
      difficulty: preset.difficulty,
    }))
      if (
        !scope.courseId ||
        courseIncludesQuestion(scope.courseId, scope.unitIds, q)
      )
        result.set(q.id, q);
  return [...result.values()];
}
export function scopeLabels(catalog: Catalog, scope: StudyScope): string[] {
  const schoolLabels = scope.courseId
    ? [
        schoolCourses.find((c) => c.id === scope.courseId)?.name ??
          `찾을 수 없는 과목 (${scope.courseId})`,
        ...(scope.unitIds?.length
          ? scope.unitIds.map(
              (id) =>
                courseUnits.find((u) => u.id === id)?.name ??
                `찾을 수 없는 단원 (${id})`,
            )
          : ["등록된 단원 전체"]),
      ]
    : [];
  return [
    ...schoolLabels,
    ...[
      [scope.subjectIds, catalog.subjects],
      [scope.schoolLevels, catalog.learningLevels],
      [scope.domainIds, catalog.domains],
      [scope.topicIds, catalog.topics],
    ].flatMap(([ids, items]) =>
      (ids as string[]).map(
        (id) =>
          (items as { id: string; name: string }[]).find((i) => i.id === id)
            ?.name ?? `찾을 수 없는 조건 (${id})`,
      ),
    ),
  ];
}
export const presetStorageKey = (userId: string) =>
  `formula-game:presets:v1:${encodeURIComponent(userId)}`;
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const idArray = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.every((id) => typeof id === "string" && /^[a-z][a-z0-9.-]*$/.test(id)) &&
  new Set(v).size === v.length;
export function validPreset(v: unknown): v is StudyPreset {
  if (
    !obj(v) ||
    typeof v.id !== "string" ||
    !/^[a-z0-9-]+$/.test(v.id) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 60 ||
    !Array.isArray(v.scopes) ||
    !v.scopes.length
  )
    return false;
  if (
    !v.scopes.every(
      (s) =>
        obj(s) &&
        (s.courseId === undefined ||
          (typeof s.courseId === "string" &&
            /^[a-z][a-z0-9.-]*$/.test(s.courseId))) &&
        (s.unitIds === undefined ||
          (typeof s.courseId === "string" && idArray(s.unitIds))) &&
        ["subjectIds", "schoolLevels", "domainIds", "topicIds"].every((k) =>
          idArray(s[k]),
        ),
    )
  )
    return false;
  return (
    [5, 10, 20].includes(Number(v.count)) &&
    typeof v.count === "number" &&
    ["learn", "mix", "review"].includes(String(v.mode)) &&
    (v.difficulty === undefined ||
      difficulties.some((d) => d.id === v.difficulty)) &&
    typeof v.createdAt === "number" &&
    Number.isSafeInteger(v.createdAt) &&
    v.createdAt >= 0 &&
    typeof v.updatedAt === "number" &&
    Number.isSafeInteger(v.updatedAt) &&
    v.updatedAt >= v.createdAt
  );
}
export async function readPresets(userId: string): Promise<PresetState> {
  const raw = await learningStorage.getItem(presetStorageKey(userId));
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!obj(value) || !Array.isArray(value.items)) return { items: [] };
    const ids = new Set<string>();
    const items = value.items.filter((item): item is StudyPreset => {
      if (!validPreset(item) || ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    });
    return {
      items,
      lastUsedId:
        typeof value.lastUsedId === "string" && ids.has(value.lastUsedId)
          ? value.lastUsedId
          : undefined,
    };
  } catch {
    return { items: [] };
  }
}
export async function writePresets(
  userId: string,
  state: PresetState,
): Promise<boolean> {
  try {
    await learningStorage.setItem(
      presetStorageKey(userId),
      JSON.stringify(state),
    );
    return true;
  } catch {
    return false;
  }
}
export function upsertPreset(
  state: PresetState,
  preset: StudyPreset,
): PresetState {
  if (!validPreset(preset)) return state;
  return {
    ...state,
    items: state.items.some((p) => p.id === preset.id)
      ? state.items.map((p) =>
          p.id === preset.id ? structuredClone(preset) : p,
        )
      : [...state.items, structuredClone(preset)],
  };
}
export function removePreset(state: PresetState, id: string): PresetState {
  return {
    items: state.items.filter((p) => p.id !== id),
    lastUsedId: state.lastUsedId === id ? undefined : state.lastUsedId,
  };
}
