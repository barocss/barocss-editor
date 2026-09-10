import { writeFileSync } from "node:fs";
import { catalog } from "../src/content/index.ts";
import { selectQuestions } from "../src/content/catalog.ts";
const cell = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const table = (headers, rows) =>
  [headers, headers.map(() => "---"), ...rows]
    .map((row) => "| " + row.map(cell).join(" | ") + " |")
    .join("\n");
const names = (items, ids) =>
  ids.map((id) => items.find((t) => t.id === id)?.name ?? id).join(", ");
const result = [
  "# 과목·학습 수준·분야 목록",
  "",
  "이 문서는 분류 데이터에서 생성한다. `npm run catalog:report`로 갱신한다.",
  "",
  "제품의 초기 분류다. 모든 학문 분야나 교육과정을 빠짐없이 수록한 목록은 아니다. 빈 분류도 유지한다. 문제 수는 현재 공개된 문제 기준이다.",
  "",
];
for (const [title, items, key] of [
  ["과목", catalog.subjects, "subjectId"],
  ["학습 수준", catalog.learningLevels, "schoolLevel"],
  ["분야", catalog.domains, "domainId"],
]) {
  result.push(
    `## ${title} (${items.length})`,
    "",
    table(
      ["ID", "이름", "상위 분류", "관련 과목", "별칭", "문제 수"],
      items.map((t) => [
        t.id,
        t.name,
        t.parentId ?? "",
        names(catalog.subjects, t.subjectIds ?? []),
        (t.aliases ?? []).join(", "),
        selectQuestions(catalog, { [key]: t.id }).length,
      ]),
    ),
    "",
  );
}
result.push(
  "## 문제 연결",
  "",
  "문제 → 공식 → 주제 → 분야 → 과목으로 연결한다. 학습 수준은 공식에서 상속한다. 문제의 classification을 지정하면 해당 문제의 주제와 수준을 더 좁힌다.",
  "",
  table(
    ["문제 ID", "공식 ID", "주제 ID", "학습 수준 ID"],
    catalog.questions.map((q) => {
      const f = catalog.formulas.find((f) => f.id === q.formulaId);
      const c = q.classification ?? f;
      return [
        q.id,
        q.formulaId,
        c.topicIds.join(", "),
        c.schoolLevels.join(", "),
      ];
    }),
  ),
  "",
);
writeFileSync(
  new URL("../docs/taxonomy-catalog.md", import.meta.url),
  result.join("\n"),
);
console.log(
  `Catalog report: ${catalog.subjects.length} subjects, ${catalog.learningLevels.length} levels, ${catalog.domains.length} domains, ${catalog.questions.length} questions.`,
);
