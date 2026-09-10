import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentPacks as allPacks,
  catalog as liveCatalog,
} from "../src/content/index.ts";
import { createCatalog, selectQuestions } from "../src/content/catalog.ts";
import {
  getRound,
  isCorrect,
  recordAttempts,
  progressKey,
} from "../src/game.ts";
const contentPacks = allPacks.slice(0, 3);
const catalog = createCatalog(contentPacks);
const fixture = () => ({
  schemaVersion: 1,
  id: "physics.electricity",
  revision: 1,
  subjects: [],
  domains: [],
  topics: [
    {
      id: "physics.ohm",
      name: "옴의 법칙",
      description: "전압과 전류",
      domainIds: ["circuits"],
    },
  ],
  inputProfiles: [
    {
      id: "ohm",
      symbols: ["I", "R"],
      numbers: ["1", "2"],
      operators: ["(", ")", "×"],
      structures: ["fraction"],
    },
  ],
  formulas: [
    {
      id: "physics.ohm",
      revision: 1,
      status: "published",
      title: "옴의 법칙",
      latex: "V=IR",
      topicIds: ["physics.ohm"],
      schoolLevels: ["high", "university"],
      conditions: ["일정한 온도의 옴성 도체"],
      variables: [
        { symbol: "V", meaning: "전압", unit: "V" },
        { symbol: "I", meaning: "전류", unit: "A" },
        { symbol: "R", meaning: "저항", unit: "Ω" },
      ],
      prerequisiteIds: [],
      sources: [{ title: "Test fixture only", url: "https://example.com/ohm" }],
    },
  ],
  questions: [
    {
      id: "physics.ohm.product",
      revision: 1,
      status: "published",
      formulaId: "physics.ohm",
      difficulty: "intro",
      title: "전압 관계식",
      before: "V=",
      after: "",
      condition: "일정한 온도의 옴성 도체",
      hint: "전류와 저항의 곱",
      explanation: "V=IR",
      inputProfileId: "ohm",
      grading: {
        type: "accepted-answers",
        normalizer: "latex-layout-v1",
        answer: "IR",
        accepted: ["IR", "RI", "I\\times R"],
      },
    },
  ],
});
test("published catalog separates canonical formulas from blank variants", async () => {
  const questions = selectQuestions(catalog);
  assert.equal(liveCatalog.questions.length, 37);
  assert.equal(liveCatalog.formulas.length, 19);
  assert.equal(questions.length, 21);
  assert.equal(new Set(questions.map((q) => q.formulaId)).size, 11);
  assert.equal(selectQuestions(catalog, { subjectId: "physics" }).length, 0);
  assert.ok(selectQuestions(catalog, { schoolLevel: "high" }).length > 0);
  assert.equal(
    selectQuestions(catalog, { subjectId: "math", domainId: "circuits" })
      .length,
    0,
  );
  assert.equal(selectQuestions(catalog, { difficulty: "intro" }).length, 5);
});
test("another subject pack works through the same selectors, keypad metadata and grader", async () => {
  const extended = createCatalog([...contentPacks, fixture()]);
  assert.equal(selectQuestions(extended).length, 22);
  const physics = selectQuestions(extended, {
    subjectId: "physics",
    schoolLevel: "university",
    domainId: "circuits",
  });
  assert.equal(physics.length, 1);
  assert.equal(
    selectQuestions(extended, { subjectId: "electronics" }).length,
    1,
  );
  const [q] = getRound(physics, 5);
  assert.deepEqual(q.inputProfile.symbols, ["I", "R"]);
  assert.equal(isCorrect(q, "I R"), true);
  assert.equal(isCorrect(q, "I+R"), false);
  const old = selectQuestions(catalog)[0],
    key = progressKey(old);
  const previous = {
    [key]: {
      attempts: 2,
      correct: 1,
      lastCorrect: true,
      lastHinted: false,
      lastSeen: 1,
    },
  };
  const next = recordAttempts(
    [q],
    [{ questionId: q.id, answer: "IR", correct: true, hinted: false }],
    previous,
    2,
  );
  assert.deepEqual(next[key], previous[key]);
});
test("catalog grows past fixed round sizes without game changes", async () => {
  const pack = fixture();
  pack.questions = Array.from({ length: 64 }, (_, i) => ({
    ...pack.questions[0],
    id: `physics.ohm.variant-${i}`,
  }));
  const bank = selectQuestions(createCatalog([...contentPacks, pack]), {
    subjectId: "physics",
  });
  assert.equal(bank.length, 64);
  assert.equal(getRound(bank, 20).length, 20);
});
test("drafts and retired questions cannot be played", async () => {
  for (const status of ["draft", "retired"]) {
    const pack = fixture();
    pack.questions[0].status = status;
    assert.equal(
      selectQuestions(createCatalog([...contentPacks, pack]), {
        subjectId: "physics",
      }).length,
      0,
    );
  }
});
test("invalid additions fail fast with IDs in the error", async () => {
  for (const mutate of [
    (p) => p.questions.push(p.questions[0]),
    (p) => (p.questions[0].formulaId = "missing"),
    (p) => (p.questions[0].inputProfileId = "missing"),
    (p) => (p.formulas[0].status = "draft"),
    (p) => (p.formulas[0].prerequisiteIds = ["physics.ohm"]),
    (p) => (p.questions[0].grading.normalizer = "eval"),
    (p) => (p.questions[0].revision = 0),
    (p) => (p.questions[0].grading.accepted = []),
    (p) => (p.topics[0].domainIds = ["missing"]),
    (p) => (p.inputProfiles[0].structures = ["matrix"]),
  ]) {
    const pack = fixture();
    mutate(pack);
    assert.throws(() => createCatalog([...contentPacks, pack]));
  }
});
