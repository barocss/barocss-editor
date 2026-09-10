import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configureLearningStorage,
  orderedStorage,
  migrateBrowserLearning,
  viewerStorageKey,
  migrationStorageKey,
} from "../src/storage.ts";
import {
  createLearningLoader,
  loadLearningState,
} from "../src/learning-state.ts";
import {
  writeHistory,
  recordAnswer,
  historyStorageKey,
} from "../src/history.ts";
import {
  newPreset,
  emptyScope,
  writePresets,
  presetStorageKey,
} from "../src/presets.ts";
import { recordAttempts, writeProgress, storageKey } from "../src/game.ts";
import { writeDerivation, derivationStorageKey } from "../src/derivations.ts";
import { database } from "../src/database/index.ts";

function memory(entries = []) {
  const data = new Map(entries);
  return {
    data,
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
}
function legacy(entries) {
  const data = new Map(entries);
  return {
    data,
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
  };
}
const viewer = "guest-existing";
const hKey = historyStorageKey(viewer);
const pKey = presetStorageKey(viewer);
const definition = database.listDerivations()[0];
const steps = database.getDerivationQuestions(definition.id);
const dKey = derivationStorageKey(
  viewer,
  definition,
  steps[0].formula.revision,
);
const legacyEntries = [
  [viewerStorageKey, viewer],
  [hKey, "history"],
  [pKey, "presets"],
  [storageKey, "progress"],
  [dKey, "steps"],
];

test("migration preserves identity, copies learning data only, and keeps browser copies", async () => {
  const browser = legacy([
    ...legacyEntries,
    ["other-app", "private"],
    [historyStorageKey("guest-other"), "other"],
  ]);
  const native = memory([[pKey, "newer native presets"]]);
  await migrateBrowserLearning(native, browser);
  assert.equal(native.data.get(viewerStorageKey), viewer);
  assert.equal(native.data.get(hKey), "history");
  assert.equal(native.data.get(storageKey), "progress");
  assert.equal(native.data.get(dKey), "steps");
  assert.equal(native.data.get(pKey), "newer native presets");
  assert.equal(native.data.has("other-app"), false);
  assert.equal(native.data.has(historyStorageKey("guest-other")), false);
  assert.equal(browser.data.size, 7);
  native.data.delete(hKey);
  await migrateBrowserLearning(native, browser);
  assert.equal(
    native.data.has(hKey),
    false,
    "completed migration must not resurrect old data",
  );
});

test("migration never attaches browser data to a different native learner", async () => {
  const native = memory([[viewerStorageKey, "guest-native"]]);
  await migrateBrowserLearning(native, legacy(legacyEntries));
  assert.deepEqual(
    [...native.data.keys()],
    [viewerStorageKey, migrationStorageKey],
  );
  assert.equal(native.data.get(viewerStorageKey), "guest-native");
});

test("an interrupted migration is retryable at every write without losing either copy", async () => {
  for (let failAt = 1; failAt <= 6; failAt++) {
    const native = memory();
    const browser = legacy(legacyEntries);
    let writes = 0;
    const interrupted = {
      getItem: native.getItem,
      async setItem(key, value) {
        if (++writes === failAt) throw Error("native unavailable");
        await native.setItem(key, value);
      },
    };
    await assert.rejects(
      migrateBrowserLearning(interrupted, browser),
      /unavailable/,
    );
    assert.equal(native.data.has(migrationStorageKey), false);
    assert.deepEqual([...browser.data], legacyEntries);
    await migrateBrowserLearning(native, browser);
    for (const [key, value] of legacyEntries)
      assert.equal(native.data.get(key), value);
    assert.equal(native.data.get(migrationStorageKey), "1");
  }
});

test("queued saves retain submission order, recover after failure, and reads wait for saves", async () => {
  let release;
  const first = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  const backend = memory();
  const store = orderedStorage({
    getItem: backend.getItem,
    async setItem(key, value) {
      calls.push(value);
      if (value === "first") await first;
      if (value === "failed") throw Error("full");
      await backend.setItem(key, value);
    },
  });
  const a = store.setItem("history", "first");
  const b = store.setItem("history", "failed");
  const rejected = assert.rejects(b, /full/);
  const c = store.setItem("history", "latest");
  const read = store.getItem("history");
  await store.setItem("unrelated", "independent");
  assert.deepEqual(calls, ["first", "independent"]);
  release();
  await Promise.all([a, rejected, c]);
  assert.equal(await read, "latest");
  assert.deepEqual(calls, ["first", "independent", "failed", "latest"]);
});

test("SDK-shaped async backend restores settings, answers, progress, explanations and proof steps", async () => {
  const native = memory([[viewerStorageKey, viewer]]);
  configureLearningStorage(native);
  globalThis.localStorage = {
    getItem() {
      throw Error("browser must not be read");
    },
    setItem() {
      throw Error("browser must not be written");
    },
  };
  const q = database.listQuestions()[0];
  const attempt = {
    questionId: q.id,
    answer: q.grading.answer,
    correct: true,
    hinted: false,
  };
  const history = recordAnswer({}, q, attempt, 100);
  const preset = newPreset({ name: "저장 검증", scopes: [emptyScope()] });
  const presets = { items: [preset], lastUsedId: preset.id };
  const progress = recordAttempts([q], [attempt], {}, 100);
  const answers = steps.slice(0, 2).map((q) => q.grading.answer);
  assert.deepEqual(
    await Promise.all([
      writeHistory(viewer, history),
      writePresets(viewer, presets),
      writeProgress(progress),
      writeDerivation(dKey, answers),
    ]),
    [true, true, true, true],
  );
  // A new adapter simulates reopening the app against the same native store.
  configureLearningStorage(native);
  assert.deepEqual(await loadLearningState(), {
    viewerId: viewer,
    history,
    presets,
    progress,
    derivations: { [definition.id]: answers },
  });
});

test("load failure cannot return empty learning data; retry retains existing records", async () => {
  const native = memory([
    [viewerStorageKey, viewer],
    [hKey, "{}"],
  ]);
  let fail = true;
  let prepared = 0;
  configureLearningStorage({
    async getItem(key) {
      if (fail && key === hKey) throw Error("read unavailable");
      return native.getItem(key);
    },
    setItem: native.setItem,
  });
  const load = createLearningLoader(async () => {
    prepared++;
  });
  const first = load();
  assert.equal(load(), first, "StrictMode shares one initialization");
  await assert.rejects(first, /unavailable/);
  assert.deepEqual(
    [...native.data],
    [
      [viewerStorageKey, viewer],
      [hKey, "{}"],
    ],
  );
  fail = false;
  const loaded = await load();
  assert.equal(loaded.viewerId, viewer);
  assert.equal(prepared, 2);
  assert.equal(await load(), loaded);
});

test("failed native saves are reported and never fall back to browser storage", async () => {
  let browserWrites = 0;
  globalThis.localStorage = {
    setItem() {
      browserWrites++;
    },
  };
  configureLearningStorage({
    async getItem() {
      throw Error("native failed");
    },
    async setItem() {
      throw Error("native failed");
    },
  });
  assert.equal(await writeHistory(viewer, {}), false);
  assert.equal(await writePresets(viewer, { items: [] }), false);
  assert.equal(await writeProgress({}), false);
  assert.equal(await writeDerivation(dKey, []), false);
  await assert.rejects(loadLearningState(), /native failed/);
  assert.equal(browserWrites, 0);
});
