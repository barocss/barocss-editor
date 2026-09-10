import { database } from "./database/index.ts";
const { courses: schoolCourses, units: courseUnits } = database.getCurriculum();
export { schoolCourses, courseUnits };
export type { SchoolCourse, CourseUnit } from "./database/curriculum-types.ts";
// Explicit mappings keep school courses separate from academic domain tags.
export function courseIncludesQuestion(
  courseId: string,
  unitIds: string[] | undefined,
  question: { id: string; formulaId: string },
  units = courseUnits,
): boolean {
  return units.some(
    (u) =>
      u.courseId === courseId &&
      (!unitIds?.length || unitIds.includes(u.id)) &&
      u.formulaIds.includes(question.formulaId) &&
      (!u.questionIds || u.questionIds.includes(question.id)),
  );
}
export { validateCurriculum } from "./database/validate-curriculum.ts";
