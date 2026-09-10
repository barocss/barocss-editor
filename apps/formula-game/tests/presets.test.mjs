import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, contentPacks } from "../src/content/index.ts";
import { createCatalog, selectQuestions } from "../src/content/catalog.ts";
import {
  newPreset,
  emptyScope,
  presetQuestions,
  scopeLabels,
  readPresets,
  writePresets,
  presetStorageKey,
  upsertPreset,
  removePreset,
} from "../src/presets.ts";
const scope = (value = {}) => ({ ...emptyScope(), ...value });
const preset = (scopes = [scope()]) => newPreset({ name: "내 연습", scopes });
function storage() {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  return data;
}
test("options in one dimension are alternatives; dimensions are intersected", async () => {
  const p = preset([
    scope({
      subjectIds: ["math"],
      schoolLevels: ["middle", "high"],
      domainIds: ["algebra", "geometry"],
    }),
  ]);
  assert.equal(presetQuestions(catalog, p).length, 25);
  const empty = preset([
    scope({ subjectIds: ["physics"], domainIds: ["algebra"] }),
  ]);
  assert.equal(presetQuestions(catalog, empty).length, 0);
  const middle = preset([
    scope({
      subjectIds: ["math"],
      schoolLevels: ["middle"],
      domainIds: ["algebra"],
    }),
  ]);
  assert.deepEqual(
    presetQuestions(catalog, middle).map((q) => q.id),
    selectQuestions(catalog, {
      subjectId: "math",
      schoolLevel: "middle",
      domainId: "algebra",
    }).map((q) => q.id),
  );
});
test("multiple scopes are combined without duplicated questions", async () => {
  const p = preset([
    scope({ domainIds: ["geometry"] }),
    scope({ domainIds: ["geometry", "algebra"] }),
  ]);
  assert.equal(presetQuestions(catalog, p).length, 29);
  assert.equal(new Set(presetQuestions(catalog, p).map((q) => q.id)).size, 29);
});
test("empty saved combinations gain future matching content automatically", async () => {
  const p = preset([
    scope({
      subjectIds: ["statistics"],
      schoolLevels: ["university"],
      domainIds: ["regression"],
    }),
  ]);
  assert.equal(presetQuestions(catalog, p).length, 0);
  const q = selectQuestions(catalog)[0];
  const pack = {
    schemaVersion: 1,
    id: "test.stats",
    revision: 1,
    subjects: [],
    domains: [],
    topics: [
      {
        id: "test.stats",
        name: "응용통계 테스트",
        description: "Fixture",
        domainIds: ["regression"],
      },
    ],
    inputProfiles: [],
    formulas: [
      {
        ...q.formula,
        id: "test.stats",
        topicIds: ["test.stats"],
        schoolLevels: ["university"],
        prerequisiteIds: [],
      },
    ],
    questions: [{ ...q, id: "test.stats.question", formulaId: "test.stats" }],
  };
  assert.equal(
    presetQuestions(createCatalog([...contentPacks, pack]), p).length,
    1,
  );
});
test("learning levels can be introduced by data and unknown saved IDs never broaden a filter", async () => {
  const q = selectQuestions(catalog)[0];
  const pack = {
    schemaVersion: 1,
    id: "test.level",
    revision: 1,
    learningLevels: [{ id: "specialist", name: "특수 전문 과정" }],
    subjects: [],
    domains: [],
    topics: [],
    inputProfiles: [],
    formulas: [
      {
        ...q.formula,
        id: "test.level",
        schoolLevels: ["specialist"],
        prerequisiteIds: [],
      },
    ],
    questions: [{ ...q, id: "test.level.question", formulaId: "test.level" }],
  };
  const expanded = createCatalog([...contentPacks, pack]);
  assert.equal(
    presetQuestions(expanded, preset([scope({ schoolLevels: ["specialist"] })]))
      .length,
    1,
  );
  const missing = preset([scope({ domainIds: ["removed-domain"] })]);
  assert.equal(presetQuestions(catalog, missing).length, 0);
  assert.match(scopeLabels(catalog, missing.scopes[0])[0], /찾을 수 없는/);
});
test("presets persist per user, edit in place, remove and restore without touching study history", async () => {
  const data = storage();
  data.set("formula-game:progress:v3", "keep");
  const p = preset();
  let state = upsertPreset({ items: [] }, p);
  state = { ...state, lastUsedId: p.id };
  assert.equal(await writePresets("alice", state), true);
  assert.deepEqual(await readPresets("alice"), state);
  assert.equal((await readPresets("bob")).items.length, 0);
  state = upsertPreset(state, { ...p, name: "이름 변경" });
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].name, "이름 변경");
  const removed = removePreset(state, p.id);
  assert.equal(removed.items.length, 0);
  assert.equal(removed.lastUsedId, undefined);
  assert.equal(upsertPreset(removed, p).items.length, 1);
  assert.equal(data.get("formula-game:progress:v3"), "keep");
});
test("malformed settings are rejected and storage failure is surfaced", async () => {
  const data = storage(),
    key = presetStorageKey("alice");
  for (const invalid of ["null", "[]", "oops", '{"items":[{}]}']) {
    data.set(key, invalid);
    assert.equal((await readPresets("alice")).items.length, 0);
    assert.equal((await readPresets("alice")).lastUsedId, undefined);
  }
  const p = preset();
  data.set(key, JSON.stringify({ items: [p, p], lastUsedId: "missing" }));
  assert.equal((await readPresets("alice")).items.length, 1);
  assert.equal((await readPresets("alice")).lastUsedId, undefined);
  assert.equal(
    upsertPreset({ items: [] }, { ...p, count: -1 }).items.length,
    0,
  );
  globalThis.localStorage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("full");
    },
  };
  assert.equal(await writePresets("alice", { items: [p] }), false);
  await assert.rejects(readPresets("alice"), /blocked/);
});
