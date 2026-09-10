import type { QuestionDefinition } from "../content/types.ts";
export interface DerivationDefinition {
  id: string;
  revision: number;
  formulaId: string;
  title: string;
  introduction: string;
  steps: QuestionDefinition[];
}
