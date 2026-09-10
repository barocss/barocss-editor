import { createCatalog } from "../content/catalog.ts";
import {
  contentPacks,
  schoolCourses,
  courseUnits,
  derivations,
} from "./manifest.ts";
import { createStaticDatabase } from "./repository.ts";

export const database = createStaticDatabase({
  schemaVersion: 1,
  revision: 2,
  catalog: createCatalog(contentPacks),
  schoolCourses,
  courseUnits,
  derivations,
});
export const catalog = database.getCatalog();
export { contentPacks } from "./manifest.ts";
export { createStaticDatabase, type DatabaseSnapshot } from "./repository.ts";
