import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database, createStaticDatabase } from "../src/database/index.ts";

test("static database resolves questions, curriculum and proof input profiles", () => {
  assert.equal(database.listQuestions().length, 37);
  assert.equal(database.getCatalog().formulas.length, 19);
  const q = database.getQuestion("math.area.triangle.area");
  assert.equal(q.formula.id, "math.area.triangle");
  assert.deepEqual(q.inputProfile.structures, ["fraction"]);
  assert.equal(database.listQuestions({ subjectId: "physics" }).length, 4);
  assert.equal(database.getCurriculum().courses.length, 4);
  assert.equal(database.getDerivationQuestions("pythagorean-area").length, 4);
  assert.equal(database.getQuestion("missing"), undefined);
  assert.throws(
    () => database.getDerivationQuestions("missing"),
    /Unknown derivation/,
  );
});
test("JSON export reloads without source imports and matches the current authoring data", async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL("../data/formula-game.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(snapshot, database.exportSnapshot());
  const reloaded = createStaticDatabase(snapshot);
  assert.deepEqual(reloaded.listQuestions(), database.listQuestions());
  assert.deepEqual(
    reloaded.getDerivationQuestions("pythagorean-area"),
    database.getDerivationQuestions("pythagorean-area"),
  );
});
test("query consumers and imported objects cannot mutate database contents", () => {
  const snapshot = database.exportSnapshot();
  const isolated = createStaticDatabase(snapshot);
  snapshot.catalog.formulas[0].title = "changed outside";
  assert.notEqual(isolated.getCatalog().formulas[0].title, "changed outside");
  assert.throws(() => {
    isolated.getCatalog().formulas[0].title = "mutate";
  }, TypeError);
  isolated.exportSnapshot().catalog.questions.length = 0;
  assert.equal(isolated.listQuestions().length, 37);
});
test("database additions become queryable while drafts stay out of play", () => {
  const snapshot = database.exportSnapshot();
  const original = snapshot.catalog.questions.find(
    (q) => q.id === "math.area.triangle.area",
  );
  snapshot.catalog.questions.push({ ...original, id: "test.triangle.new" });
  snapshot.catalog.questions.push({
    ...original,
    id: "test.triangle.draft",
    status: "draft",
  });
  const next = createStaticDatabase(snapshot);
  assert.equal(next.listQuestions().length, 38);
  assert.equal(
    next.getQuestion("test.triangle.new").formulaId,
    original.formulaId,
  );
  assert.equal(next.getQuestion("test.triangle.draft"), undefined);
});
test("broken category, curriculum and derivation links fail before use", () => {
  const mutations = [
    (s) => {
      s.schemaVersion = 2;
    },
    (s) => {
      s.catalog.questions[0].inputProfileId = "missing";
    },
    (s) => {
      s.catalog.domains[0].subjectIds = ["missing"];
    },
    (s) => {
      s.courseUnits[0].formulaIds = ["missing"];
    },
    (s) => {
      s.derivations[0].steps[0].grading.accepted = [];
    },
    (s) => {
      s.derivations[0].steps[0].inputProfileId = "missing";
    },
    (s) => {
      s.derivations[0].steps[1].id = s.derivations[0].steps[0].id;
    },
    (s) => {
      s.derivations[0].formulaId = "missing";
    },
  ];
  for (const mutate of mutations) {
    const snapshot = database.exportSnapshot();
    mutate(snapshot);
    assert.throws(() => createStaticDatabase(snapshot));
  }
});
