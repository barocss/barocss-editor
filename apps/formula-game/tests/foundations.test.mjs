import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "../src/content/index.ts";
import { selectQuestions } from "../src/content/catalog.ts";
import { isCorrect } from "../src/game.ts";
const questions = selectQuestions(catalog).filter(
  (q) => q.grading.normalizer === "math-input-v1",
);
const question = (id) => questions.find((q) => q.id === id);
test("foundation questions accept complete answers and reject missing content", () => {
  assert.equal(questions.length, 16);
  for (const q of questions) {
    for (const answer of q.grading.accepted)
      assert.equal(isCorrect(q, answer), true, q.id);
    for (const answer of ["", "1", "\\frac{}{}", "NaN"])
      assert.equal(isCorrect(q, answer), false, q.id);
  }
});
test("keypad exponent, multiplication and Greek serialization are graded", () => {
  for (const [id, answer] of [
    ["math.coordinates.origin-circle.rearrange", "{r}^{2}−{x}^{2}"],
    ["physics.mechanics.kinetic.twice", "m{v}^{2}"],
    ["physics.circuits.ohm.voltage", "I\\cdot R"],
    ["statistics.standardization.z-score.score", "\\frac{x−μ}{σ}"],
    ["math.area.triangle.area", "\\frac{b\\cdot h}{2}"],
  ])
    assert.equal(isCorrect(question(id), answer), true, id);
});
test("incorrect signs, denominator and exponent scope remain incorrect", () => {
  for (const [id, answer] of [
    ["math.coordinates.origin-circle.rearrange", "r^2+x^2"],
    ["physics.mechanics.kinetic.twice", "(mv)^2"],
    ["statistics.standardization.z-score.score", "\\frac{x+μ}{σ}"],
    ["statistics.standardization.z-score.score", "x-\\frac{μ}{σ}"],
    ["math.area.triangle.area", "\\frac{bh}{4}"],
  ])
    assert.equal(isCorrect(question(id), answer), false, id);
});
