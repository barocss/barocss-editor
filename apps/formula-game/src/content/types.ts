export type SchoolLevel = string;
export interface TaxonomyTerm {
  id: string;
  name: string;
  aliases?: readonly string[];
  parentId?: string;
}
export type LearningLevel = TaxonomyTerm;
export type Difficulty = "intro" | "basic" | "applied" | "challenge";
export type ContentStatus = "draft" | "published" | "retired";
export type Subject = TaxonomyTerm;
export interface Domain extends TaxonomyTerm {
  subjectIds: readonly string[];
}
export interface Topic {
  id: string;
  name: string;
  description: string;
  domainIds: readonly string[];
}
export interface FormulaLesson {
  title: string;
  introduction: string;
  steps: readonly { text: string; latex?: string }[];
  diagram?: "pythagorean-area";
  history?: { title: string; text: string; sourceUrl: string };
}
export interface FormulaDefinition {
  lesson?: FormulaLesson;
  id: string;
  revision: number;
  status: ContentStatus;
  title: string;
  latex: string;
  topicIds: readonly string[];
  schoolLevels: readonly SchoolLevel[];
  conditions: readonly string[];
  variables: readonly { symbol: string; meaning: string; unit?: string }[];
  prerequisiteIds: readonly string[];
  sources: readonly { title: string; url: string }[];
}
export interface InputProfile {
  id: string;
  symbols: readonly string[];
  numbers: readonly string[];
  operators: readonly string[];
  structures: readonly ("square" | "fraction" | "root")[];
}
export interface QuestionDefinition {
  classification?: {
    topicIds: readonly string[];
    schoolLevels: readonly SchoolLevel[];
  };
  id: string;
  revision: number;
  status: ContentStatus;
  formulaId: string;
  difficulty: Difficulty;
  title: string;
  before: string;
  after: string;
  condition: string;
  hint: string;
  explanation: string;
  inputProfileId: string;
  grading: {
    type: "accepted-answers";
    normalizer: "polynomial-ab-v1" | "latex-layout-v1" | "math-input-v1";
    answer: string;
    accepted: readonly string[];
  };
}
export interface ContentPack {
  learningLevels?: readonly LearningLevel[];
  schemaVersion: 1;
  id: string;
  revision: number;
  subjects: readonly Subject[];
  domains: readonly Domain[];
  topics: readonly Topic[];
  inputProfiles: readonly InputProfile[];
  formulas: readonly FormulaDefinition[];
  questions: readonly QuestionDefinition[];
}
export interface Catalog {
  learningLevels: readonly LearningLevel[];
  subjects: readonly Subject[];
  domains: readonly Domain[];
  topics: readonly Topic[];
  inputProfiles: readonly InputProfile[];
  formulas: readonly FormulaDefinition[];
  questions: readonly QuestionDefinition[];
}
export interface PlayQuestion extends QuestionDefinition {
  formula: FormulaDefinition;
  inputProfile: InputProfile;
}
