import { database } from "../src/database/index.ts";
const catalog = database.getCatalog();
const questions = database.listQuestions();
const { courses, units } = database.getCurriculum();
console.log(
  `Static DB valid: ${catalog.subjects.length} subjects, ${catalog.learningLevels.length} levels, ${catalog.domains.length} domains, ${catalog.formulas.length} formulas, ${questions.length} published questions, ${courses.length} courses, ${units.length} units, ${database.listDerivations().length} derivations.`,
);
