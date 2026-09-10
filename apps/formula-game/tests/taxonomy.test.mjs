import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, contentPacks } from "../src/content/index.ts";
import { createCatalog, selectQuestions } from "../src/content/catalog.ts";
import { matchesTerm, searchTerms } from "../src/content/taxonomy.ts";
test("independent registries cover multiple disciplines and support aliases and parent selections", () => {
  assert.equal(catalog.subjects.length, 19);
  assert.equal(catalog.learningLevels.length, 22);
  assert.equal(catalog.domains.length, 75);
  assert.equal(
    searchTerms(catalog.domains, "linear algebra")[0].id,
    "linear-algebra",
  );
  assert.equal(searchTerms(catalog.learningLevels, "중2")[0].id, "middle-2");
  assert.ok(
    matchesTerm(catalog.domains, ["probability-statistics"], "regression"),
  );
  assert.equal(
    matchesTerm(catalog.domains, ["regression"], "probability-statistics"),
    false,
  );
  assert.equal(matchesTerm(catalog.domains, ["missing"], "regression"), false);
});
test("a question narrows inherited levels without disappearing from the parent level", () => {
  const result = selectQuestions(catalog, {
    subjectId: "math",
    domainId: "geometry",
    schoolLevel: "middle-2",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "math.geometry.pythagorean.missing-square");
  assert.equal(
    selectQuestions(catalog, { domainId: "geometry", schoolLevel: "middle-1" })
      .length,
    0,
  );
  assert.equal(
    selectQuestions(catalog, { domainId: "geometry", schoolLevel: "middle" })
      .length,
    1,
  );
  assert.equal(
    selectQuestions(catalog, { subjectId: "physics", domainId: "geometry" })
      .length,
    0,
  );
});
test("invalid references, taxonomy cycles and invalid question classification fail before publishing", () => {
  const base = () => structuredClone(contentPacks);
  let packs = base();
  packs[0].domains[0].parentId = "missing";
  assert.throws(() => createCatalog(packs), /parent/);
  packs = base();
  packs[0].learningLevels[0].parentId = "elementary-1";
  assert.throws(() => createCatalog(packs), /cycle/);
  packs = base();
  packs[0].subjects[0].name = " ";
  assert.throws(() => createCatalog(packs), /label/);
  packs = base();
  packs[2].questions[0].classification.schoolLevels = ["university"];
  assert.throws(() => createCatalog(packs), /outside formula/);
  packs = base();
  packs[2].questions[0].classification.topicIds = ["math.algebra.identities"];
  assert.throws(() => createCatalog(packs), /reference/);
});
test("hundreds of new taxonomy entries and a cross-subject domain work without selector changes", () => {
  const packs = structuredClone(contentPacks);
  packs[0].domains.push(
    ...Array.from({ length: 300 }, (_, i) => ({
      id: `extra-${i}`,
      name: `추가 분야 ${i}`,
      subjectIds: ["math"],
    })),
  );
  packs[0].domains.push({
    id: "geometry-applied",
    name: "응용 기하",
    parentId: "geometry",
    subjectIds: ["math", "physics"],
  });
  packs[2].topics[0].domainIds = ["geometry-applied"];
  const extended = createCatalog(packs);
  assert.equal(searchTerms(extended.domains, "추가 분야").length, 300);
  assert.equal(
    selectQuestions(extended, { domainId: "geometry", subjectId: "physics" })
      .length,
    1,
  );
  assert.equal(
    selectQuestions(extended, { domainId: "geometry", subjectId: "chemistry" })
      .length,
    0,
  );
});
