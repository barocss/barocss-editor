import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCorrect,
  normalizeAnswer,
  readProgress,
  writeProgress,
  recordAttempts,
  getRound,
  progressKey,
  storageKey,
} from "../src/game.ts";
import { catalog } from "../src/content/index.ts";
import { selectQuestions } from "../src/content/catalog.ts";
import { polynomial } from "./polynomial.mjs";
const questions = selectQuestions(catalog, { domainId: "algebra" });
const question = (id) => questions.find((q) => q.id === "math.algebra." + id);
test("every allowed answer completes an exact polynomial identity", async () => {
  for (const q of questions) {
    assert.ok(q.grading.accepted.includes(q.grading.answer));
    for (const answer of q.grading.accepted) {
      const [left, right] = `${q.before}(${answer})${q.after}`.split("=");
      assert.deepEqual(
        polynomial(left),
        polynomial(right),
        q.id + ": " + answer,
      );
      assert.equal(isCorrect(q, answer), true, q.id + ": " + answer);
    }
  }
});
test("editor exponent serialization and allowed ordering are recognized", async () => {
  assert.equal(isCorrect(question("sum"), "2 \\cdot b \\cdot a"), true);
  assert.equal(isCorrect(question("reverse"), "{a}^{2}+{b}^{2}"), true);
  assert.equal(isCorrect(question("cube"), "{a}^{2}+ab+{b}^{2}"), true);
  assert.equal(isCorrect(question("cube-middle"), "3{a}^{2}b+3a{b}^{2}"), true);
});
test("wrong signs, incomplete answers and regrouping stay incorrect", async () => {
  for (const q of questions)
    for (const value of ["", " ", "NaN", "<script>", "a^{2+b}"])
      assert.equal(isCorrect(q, value), false);
  assert.equal(isCorrect(question("sum"), "-2ab"), false);
  assert.equal(isCorrect(question("difference"), "b-a"), false);
  assert.equal(isCorrect(question("reverse"), "a^2-b^2"), false);
  assert.equal(isCorrect(question("cube-sum"), "a^2+ab+b^2"), false);
  assert.equal(normalizeAnswer("a^{2+b}"), "a^{2+b}");
});
test("question records survive additions, isolate revisions and keep legacy scores untouched", async () => {
  const data = new Map([
    ["formula-game:progress:v2", '{"intro":{"best":4,"rounds":1}}'],
  ]);
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const q = question("sum"),
    key = progressKey(q);
  const first = recordAttempts(
    [q],
    [{ questionId: q.id, answer: "2ab", correct: true, hinted: false }],
    {},
    100,
  );
  assert.equal(first[key].attempts, 1);
  assert.equal(await writeProgress(first), true);
  assert.deepEqual(await readProgress(), first);
  assert.equal(
    data.get("formula-game:progress:v2"),
    '{"intro":{"best":4,"rounds":1}}',
  );
  const revised = { ...q, revision: 2 };
  const second = recordAttempts(
    [revised],
    [{ questionId: q.id, answer: "ab", correct: false, hinted: true }],
    first,
    200,
  );
  assert.equal(second[key].correct, 1);
  assert.equal(second[progressKey(revised)].correct, 0);
  assert.notEqual(
    progressKey({ ...q, formula: { ...q.formula, revision: 2 } }),
    key,
  );
  assert.equal(Object.keys(second).length, 2);
  assert.equal(getRound([q, revised], 5, "review", second).length, 1);
  for (const invalid of ["null", "[]", '"bad"', "oops", '{"x":{}}']) {
    data.set(storageKey, invalid);
    assert.deepEqual(await readProgress(), {});
  }
  globalThis.localStorage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  await assert.rejects(readProgress(), /blocked/);
  const inMemory = recordAttempts(
    [q],
    [{ questionId: q.id, correct: true, hinted: false }],
    first,
    300,
  );
  assert.equal(inMemory[key].attempts, 2);
  assert.equal(await writeProgress(inMemory), false);
});
test("round size is independent of catalog size and unseen questions come first", async () => {
  assert.equal(getRound(questions, 10).length, 10);
  assert.equal(getRound(questions, 100).length, 20);
  assert.equal(
    new Set(getRound(questions, 20, "mix", {}, () => 0.25).map((q) => q.id))
      .size,
    20,
  );
  assert.equal(new Set(getRound(questions, 5).map((q) => q.formulaId)).size, 5);
  const q = questions[0];
  const progress = {
    [progressKey(q)]: {
      attempts: 1,
      correct: 1,
      lastCorrect: true,
      lastHinted: false,
      lastSeen: 100,
    },
  };
  assert.notEqual(getRound(questions, 1, "learn", progress)[0].id, q.id);
  assert.equal(getRound(questions, 5, "review", progress).length, 0);
  progress[progressKey(q)].lastHinted = true;
  assert.equal(getRound(questions, 5, "review", progress)[0].id, q.id);
  assert.deepEqual(getRound([], 5), []);
});

test("unseen priority wins over formula diversity", async () => {
  const bank = [
    questions[0],
    { ...questions[1], formulaId: questions[2].formulaId },
    questions[2],
  ];
  const q = bank[0];
  const progress = {
    [progressKey(q)]: {
      attempts: 1,
      correct: 1,
      lastCorrect: true,
      lastHinted: false,
      lastSeen: 1,
    },
  };
  assert.ok(
    getRound(bank, 2, "learn", progress).every((item) => item.id !== q.id),
  );
});
