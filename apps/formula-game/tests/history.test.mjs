import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readHistory,
  writeHistory,
  recordSeen,
  recordAnswer,
  historyStorageKey,
} from "../src/history.ts";
import { selectQuestions } from "../src/content/catalog.ts";
import { catalog } from "../src/content/index.ts";
import { progressKey, isCorrect } from "../src/game.ts";
import { polynomial } from "./polynomial.mjs";
import katex from "katex";
const questions = selectQuestions(catalog);
const q = questions.find(
  (q) => q.id === "math.geometry.pythagorean.missing-square",
);
const storage = () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  return data;
};
test("viewing without submitting records a question and repeated views remain one entry", async () => {
  const first = recordSeen({}, q, 100);
  const next = recordSeen(first, q, 200);
  const entry = next[progressKey(q)];
  assert.equal(Object.keys(next).length, 1);
  assert.equal(entry.firstSeen, 100);
  assert.equal(entry.lastSeen, 200);
  assert.equal(entry.lastAttempt, undefined);
  assert.equal(Object.keys(first).length, 1);
  assert.equal(first[progressKey(q)].lastSeen, 100);
});
test("history is isolated by user and survives reload with the last submitted answer", async () => {
  storage();
  const seen = recordSeen({}, q, 100);
  await writeHistory("user-a", seen);
  assert.deepEqual(await readHistory("user-a"), seen);
  assert.deepEqual(await readHistory("user-b"), {});
  const answered = recordAnswer(
    seen,
    q,
    { questionId: q.id, answer: "b", correct: false, hinted: true },
    200,
  );
  await writeHistory("user-a", answered);
  const attempt = (await readHistory("user-a"))[progressKey(q)].lastAttempt;
  assert.equal(attempt.answer, "b");
  assert.equal(attempt.hinted, true);
  await writeHistory("user-b", recordSeen({}, questions[0], 300));
  assert.deepEqual(await readHistory("user-a"), answered);
  assert.equal(Object.keys(await readHistory("user-b")).length, 1);
});
test("saved formula explanation remains available after content is revised or retired", async () => {
  storage();
  const copy = structuredClone(q);
  const seen = recordSeen({}, copy, 100);
  copy.formula.lesson.introduction = "Changed";
  copy.formula.status = "retired";
  assert.notEqual(
    seen[progressKey(q)].question.formula.lesson.introduction,
    "Changed",
  );
  const revised = { ...q, revision: q.revision + 1 };
  const next = recordSeen(seen, revised, 200);
  await writeHistory("user-a", next);
  const restored = await readHistory("user-a");
  assert.equal(Object.keys(restored).length, 2);
  assert.equal(
    restored[progressKey(q)].question.formula.title,
    "피타고라스 정리",
  );
  assert.equal(restored[progressKey(q)].question.formula.status, "published");
});
test("corrupt records are ignored and blocked storage is reported without losing in-memory data", async () => {
  const data = storage();
  const key = historyStorageKey("user-a");
  for (const value of ["null", "[]", "oops", '{"bad":{}}']) {
    data.set(key, value);
    assert.deepEqual(await readHistory("user-a"), {});
  }
  const seen = recordSeen({}, q, 100);
  const corrupted = structuredClone(seen);
  corrupted[progressKey(q)].question.formula.lesson.steps = [{ text: {} }];
  data.set(key, JSON.stringify(corrupted));
  assert.deepEqual(await readHistory("user-a"), {});
  const unsafe = structuredClone(seen);
  unsafe[progressKey(q)].question.formula.lesson.history.sourceUrl =
    "javascript:alert(1)";
  data.set(key, JSON.stringify(unsafe));
  assert.deepEqual(await readHistory("user-a"), {});
  globalThis.localStorage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("full");
    },
  };
  assert.equal(await writeHistory("user-a", seen), false);
  assert.equal(Object.keys(seen).length, 1);
  await assert.rejects(readHistory("user-a"), /blocked/);
});
test("all published formulas have readable lessons and valid LaTeX", async () => {
  for (const f of catalog.formulas.filter((f) => f.status === "published")) {
    assert.ok(f.lesson?.steps.length, f.id);
    for (const latex of [
      f.latex,
      ...f.lesson.steps.map((s) => s.latex).filter(Boolean),
    ])
      assert.doesNotThrow(
        () => katex.renderToString(latex, { throwOnError: true, trust: false }),
        f.id,
      );
  }
});
test("Pythagorean content uses a right-triangle premise and a valid area argument", async () => {
  assert.match(q.condition, /직각/);
  assert.match(q.formula.lesson.history.text, /단정/);
  assert.equal(isCorrect(q, "{b}^{2}"), true);
  assert.equal(isCorrect(q, "b"), false);
  assert.equal(isCorrect(q, "-b^2"), false);
  assert.deepEqual(polynomial("(a+b)^2-2ab"), polynomial("a^2+b^2"));
});
