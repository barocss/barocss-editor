import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInlineLatex,
  splitMathText,
} from "../src/math-text.ts";

test("작성자가 표시한 수식 구간을 분리한다", () => {
  assert.deepEqual(splitMathText("저항 $R > 0$과 옴 $\\Omega$"), [
    { type: "text", value: "저항 " },
    { type: "math", value: "R > 0" },
    { type: "text", value: "과 옴 " },
    { type: "math", value: "\\Omega" },
  ]);
});

test("기존 문제의 변수와 수학 기호도 수식으로 인식한다", () => {
  const parts = splitMathText(
    "a, b는 실수이고 a²+2ab+b²을 사용해요.",
    ["a", "b"],
  );
  assert.deepEqual(
    parts.filter((part) => part.type === "math").map((part) => part.value),
    ["a, b", "a^2+2ab+b^2"],
  );
});

test("유니코드 수학 기호를 KaTeX 문법으로 바꾼다", () => {
  assert.equal(
    normalizeInlineLatex("σ ≥ 0, 90°"),
    "\\sigma  \\ge  0, 90^{\\circ}",
  );
});
