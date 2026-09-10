import type { Catalog } from "../content/types.ts";
import { schoolCourses, courseUnits } from "./data/curriculum.ts";
export function validateCurriculum(
  catalog: Catalog,
  courses = schoolCourses,
  units = courseUnits,
) {
  if (
    new Set(courses.map((c) => c.id)).size !== courses.length ||
    new Set(units.map((u) => u.id)).size !== units.length
  )
    throw new Error("Duplicate curriculum ID");
  for (const course of courses) {
    if (
      !catalog.subjects.some((s) => s.id === course.subjectId) ||
      !catalog.learningLevels.some((l) => l.id === course.learningLevelId)
    )
      throw new Error(`Invalid course classification: ${course.id}`);
  }
  for (const unit of units) {
    if (!courses.some((c) => c.id === unit.courseId))
      throw new Error(`Unknown course: ${unit.courseId}`);
    for (const id of unit.questionIds ?? [])
      if (
        !catalog.questions.some(
          (q) => q.id === id && unit.formulaIds.includes(q.formulaId),
        )
      )
        throw new Error(`Invalid curriculum question: ${id}`);
    for (const id of unit.formulaIds)
      if (!catalog.formulas.some((f) => f.id === id))
        throw new Error(`Unknown curriculum formula: ${id}`);
  }
}
