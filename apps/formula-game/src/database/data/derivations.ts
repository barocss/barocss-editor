import type { QuestionDefinition } from "../../content/types.ts";
import type { DerivationDefinition } from "../derivation-types.ts";
function step(
  id: string,
  title: string,
  before: string,
  answer: string,
  accepted: string[],
  hint: string,
  explanation: string,
): QuestionDefinition {
  return {
    id: `proof.pythagorean.${id}`,
    revision: 1,
    status: "published",
    formulaId: "math.geometry.pythagorean",
    difficulty: "basic",
    title,
    before,
    after: "",
    condition: "",
    hint,
    explanation,
    inputProfileId: "algebra-ab",
    grading: {
      type: "accepted-answers",
      normalizer: "polynomial-ab-v1",
      answer,
      accepted,
    },
  };
}
export const pythagoreanDerivation: DerivationDefinition = {
  id: "pythagorean-area",
  revision: 1,
  formulaId: "math.geometry.pythagorean",
  title: "피타고라스 정리",
  introduction:
    "변의 길이가 a, b이고 빗변이 c인 같은 직각삼각형 네 개를 놓았어요. 큰 정사각형에서 삼각형의 넓이를 빼면 무엇이 남을까요?",
  steps: [
    step(
      "outer",
      "큰 정사각형의 넓이를 전개해요",
      "(a+b)^2=",
      "a^2+2ab+b^2",
      [
        "a^2+2ab+b^2",
        "a^2+b^2+2ab",
        "2ab+a^2+b^2",
        "2ab+b^2+a^2",
        "b^2+a^2+2ab",
        "b^2+2ab+a^2",
      ],
      "(a+b)를 두 번 곱해요. a² 항, ab 항, b² 항을 모아보세요.",
      "큰 정사각형의 한 변은 a+b예요. 넓이를 전개하면 ab 항이 두 번 나와요.",
    ),
    step(
      "triangles",
      "삼각형 네 개의 넓이를 모아요",
      "4\\times\\frac{ab}{2}=",
      "2ab",
      ["2ab", "2ba", "ab+ab"],
      "직각삼각형 하나의 넓이는 밑변 × 높이 ÷ 2예요. 네 개를 더해요.",
      "네 개의 넓이를 합하면 2ab예요.",
    ),
    step(
      "subtract",
      "가운데 정사각형만 남겨요",
      "c^2=(a+b)^2-",
      "2ab",
      ["2ab", "2ba", "ab+ab"],
      "전체 넓이에서 방금 구한 삼각형 네 개의 넓이를 빼세요.",
      "가운데 정사각형의 한 변은 빗변 c예요. 남은 넓이는 c²예요.",
    ),
    step(
      "simplify",
      "같은 항을 지우고 정리해요",
      "c^2=a^2+2ab+b^2-2ab=",
      "a^2+b^2",
      ["a^2+b^2", "b^2+a^2", "aa+bb", "bb+aa"],
      "+2ab와 −2ab를 더하면 0이에요. 남는 두 항을 써보세요.",
      "두 직각변의 제곱을 더하면 빗변의 제곱이 돼요. 넓이로 공식을 유도했어요.",
    ),
  ],
};

export const derivations = [pythagoreanDerivation];
