import { taxonomyPack } from "./data/packs/taxonomy.ts";
import { algebraPack } from "./data/packs/algebra.ts";
import { geometryPack } from "./data/packs/geometry.ts";
import { foundationsMathPack } from "./data/packs/foundations-math.ts";
import { foundationsPhysicsPack } from "./data/packs/foundations-physics.ts";
import { foundationsStatisticsPack } from "./data/packs/foundations-statistics.ts";
// Register each new pack here. Taxonomy IDs are declared once and referenced by later packs.
export const contentPacks = [
  taxonomyPack,
  algebraPack,
  geometryPack,
  foundationsMathPack,
  foundationsPhysicsPack,
  foundationsStatisticsPack,
];

export { schoolCourses, courseUnits } from "./data/curriculum.ts";
export { derivations } from "./data/derivations.ts";
