import type { ContentPack } from "../../../content/types.ts";
import { subjects } from "../taxonomy/subjects.ts";
import { learningLevels } from "../taxonomy/learning-levels.ts";
import { domains } from "../taxonomy/domains.ts";
export const taxonomyPack = {
  schemaVersion: 1,
  id: "taxonomy",
  revision: 3,
  subjects,
  learningLevels,
  domains,
  topics: [],
  inputProfiles: [],
  formulas: [],
  questions: [],
} satisfies ContentPack;
