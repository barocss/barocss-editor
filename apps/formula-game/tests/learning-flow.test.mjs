import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { catalog } from "../src/content/index.ts";
import {
  newPreset,
  emptyScope,
  presetQuestions,
  validPreset,
  scopeLabels,
} from "../src/presets.ts";
import {
  schoolCourses,
  courseUnits,
  courseIncludesQuestion,
  validateCurriculum,
} from "../src/curriculum.ts";
import {
  advanceDerivation,
  derivationQuestions,
  derivationStorageKey,
  pythagoreanDerivation,
  readDerivation,
  writeDerivation,
} from "../src/derivations.ts";
import { polynomial } from "./polynomial.mjs";
const questions = derivationQuestions(catalog);
const preset = (courseId) =>
  newPreset({
    name: "학교 연습",
    scopes: [{ ...emptyScope(), courseId, unitIds: [] }],
  });
test("school courses have valid explicit mappings and do not confuse academic algebra with high-school algebra", async () => {
  validateCurriculum(catalog);
  assert.equal(presetQuestions(catalog, preset("kr-2022-common1")).length, 20);
  const middle = presetQuestions(catalog, preset("kr-ebs-m3"));
  assert.equal(middle.length, 10);
  assert.ok(!middle.some((q) => /cube|fourth/.test(q.id)));
  assert.equal(presetQuestions(catalog, preset("kr-2022-common2")).length, 4);
  assert.equal(presetQuestions(catalog, preset("unknown")).length, 0);
  assert.throws(() =>
    validateCurriculum(catalog, schoolCourses, [
      ...courseUnits,
      { id: "bad", courseId: "missing", name: "bad", formulaIds: [] },
    ]),
  );
});
test("unit filters survive storage validation, union deduplicates, and new linked content is included", async () => {
  const p = preset("kr-ebs-m2");
  p.scopes[0].unitIds = ["kr-ebs-m2-pythagorean"];
  p.scopes.push({
    ...emptyScope(),
    courseId: "kr-ebs-m2",
    unitIds: ["kr-ebs-m2-pythagorean"],
  });
  assert.equal(presetQuestions(catalog, p).length, 1);
  assert.ok(validPreset(p));
  assert.ok(scopeLabels(catalog, p.scopes[0]).includes("피타고라스 정리"));
  p.scopes[0].unitIds = ["missing"];
  p.scopes.pop();
  assert.equal(presetQuestions(catalog, p).length, 0);
  assert.ok(validPreset(p));
  assert.equal(
    validPreset({ ...p, scopes: [{ ...emptyScope(), unitIds: ["orphan"] }] }),
    false,
  );
  const future = { id: "new-question", formulaId: "new-formula" };
  assert.equal(
    courseIncludesQuestion("kr-2022-common2", [], future, [
      ...courseUnits,
      {
        id: "new-unit",
        courseId: "kr-2022-common2",
        name: "추가 단원",
        formulaIds: ["new-formula"],
      },
    ]),
    true,
  );
});
test("a derivation only advances with a correct current line and stops after the final line", async () => {
  let state = [];
  assert.equal(advanceDerivation(questions, state, "a^2+b^2"), state);
  for (const q of questions) {
    const prev = state;
    assert.equal(advanceDerivation(questions, state, "wrong"), prev);
    state = advanceDerivation(questions, state, q.grading.answer);
    assert.equal(state.length, prev.length + 1);
    for (const answer of q.grading.accepted) {
      assert.deepEqual(polynomial(answer), polynomial(q.grading.answer));
      katex.renderToString(
        q.before + (q.before.endsWith("-") ? `(${answer})` : answer),
        { throwOnError: true },
      );
    }
  }
  assert.equal(advanceDerivation(questions, state, "a^2+b^2"), state);
  assert.deepEqual(
    polynomial("(a+b)^2-2ab"),
    polynomial(questions.at(-1).grading.answer),
  );
});
test("derivation resumes per user and version, keeps only valid sequential answers, and handles storage failure", async () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  const key = derivationStorageKey("guest-a", pythagoreanDerivation, 1);
  const answers = questions.slice(0, 2).map((q) => q.grading.answer);
  assert.ok(await writeDerivation(key, answers));
  assert.deepEqual(await readDerivation(key, questions), answers);
  assert.deepEqual(
    await readDerivation(
      derivationStorageKey("guest-b", pythagoreanDerivation, 1),
      questions,
    ),
    [],
  );
  assert.deepEqual(
    await readDerivation(
      derivationStorageKey(
        "guest-a",
        { ...pythagoreanDerivation, revision: 2 },
        1,
      ),
      questions,
    ),
    [],
  );
  data.set(key, JSON.stringify([answers[0], "wrong", "2ab"]));
  assert.deepEqual(await readDerivation(key, questions), [answers[0]]);
  data.set(key, "{");
  assert.deepEqual(await readDerivation(key, questions), []);
  globalThis.localStorage.setItem = () => {
    throw Error("full");
  };
  assert.equal(await writeDerivation(key, answers), false);
});
