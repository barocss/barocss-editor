import type { LearningLevel } from "../../../content/types.ts";
export const learningLevels: readonly LearningLevel[] = [
  {
    id: "elementary",
    name: "초등",
    aliases: ["초등학교"],
  },
  {
    id: "middle",
    name: "중등",
    aliases: ["중학교"],
  },
  {
    id: "high",
    name: "고등",
    aliases: ["고등학교"],
  },
  {
    id: "university",
    name: "대학",
    aliases: ["대학교", "학부"],
  },
  {
    id: "graduate",
    name: "대학원",
    aliases: [],
  },
  {
    id: "professional",
    name: "전문·실무",
    aliases: ["직무"],
  },
  {
    id: "elementary-1",
    name: "초등 1학년",
    parentId: "elementary",
    aliases: ["초1"],
  },
  {
    id: "elementary-2",
    name: "초등 2학년",
    parentId: "elementary",
    aliases: ["초2"],
  },
  {
    id: "elementary-3",
    name: "초등 3학년",
    parentId: "elementary",
    aliases: ["초3"],
  },
  {
    id: "elementary-4",
    name: "초등 4학년",
    parentId: "elementary",
    aliases: ["초4"],
  },
  {
    id: "elementary-5",
    name: "초등 5학년",
    parentId: "elementary",
    aliases: ["초5"],
  },
  {
    id: "elementary-6",
    name: "초등 6학년",
    parentId: "elementary",
    aliases: ["초6"],
  },
  {
    id: "middle-1",
    name: "중등 1학년",
    parentId: "middle",
    aliases: ["중1"],
  },
  {
    id: "middle-2",
    name: "중등 2학년",
    parentId: "middle",
    aliases: ["중2"],
  },
  {
    id: "middle-3",
    name: "중등 3학년",
    parentId: "middle",
    aliases: ["중3"],
  },
  {
    id: "high-1",
    name: "고등 1학년",
    parentId: "high",
    aliases: ["고1"],
  },
  {
    id: "high-2",
    name: "고등 2학년",
    parentId: "high",
    aliases: ["고2"],
  },
  {
    id: "high-3",
    name: "고등 3학년",
    parentId: "high",
    aliases: ["고3"],
  },
  {
    id: "university-foundation",
    name: "대학 기초",
    parentId: "university",
  },
  {
    id: "university-major",
    name: "대학 전공",
    parentId: "university",
  },
  {
    id: "graduate-masters",
    name: "석사",
    parentId: "graduate",
  },
  {
    id: "graduate-doctoral",
    name: "박사",
    parentId: "graduate",
  },
];
