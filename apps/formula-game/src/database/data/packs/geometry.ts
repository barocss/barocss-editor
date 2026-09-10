import type { ContentPack } from "../../../content/types.ts";
export const geometryPack = {
  schemaVersion: 1,
  id: "math.geometry.right-triangle",
  revision: 2,
  subjects: [],
  domains: [],
  topics: [
    {
      id: "math.geometry.right-triangle",
      name: "직각삼각형과 피타고라스",
      description: "세 변의 관계를 넓이로 이해해요.",
      domainIds: ["geometry"],
    },
  ],
  inputProfiles: [],
  formulas: [
    {
      id: "math.geometry.pythagorean",
      revision: 1,
      status: "published",
      title: "피타고라스 정리",
      latex: "c^2=a^2+b^2",
      topicIds: ["math.geometry.right-triangle"],
      schoolLevels: ["middle", "high"],
      conditions: [
        "a와 b는 직각을 이루는 두 변의 길이이고, c는 빗변의 길이이다.",
        "세 길이는 양수이며, 직각삼각형에서 성립한다.",
      ],
      variables: [
        {
          symbol: "a",
          meaning: "직각을 이루는 한 변의 길이",
        },
        {
          symbol: "b",
          meaning: "직각을 이루는 다른 변의 길이",
        },
        {
          symbol: "c",
          meaning: "직각의 맞은편 빗변의 길이",
        },
      ],
      prerequisiteIds: [],
      sources: [
        {
          title: "UBC: 넓이와 도형 분할을 이용한 증명",
          url: "https://personal.math.ubc.ca/~cass/courses/m308-7b/pythagorasdissection.html",
        },
        {
          title: "MacTutor: 피타고라스의 생애와 사료",
          url: "https://mathshistory.st-andrews.ac.uk/Biographies/Pythagoras/",
        },
      ],
      lesson: {
        title: "네 개의 삼각형으로 넓이를 비교해요",
        introduction:
          "직각삼각형 네 개를 큰 정사각형의 모서리에 놓아 보세요. 가운데 남는 도형은 한 변이 c인 정사각형이에요.",
        diagram: "pythagorean-area",
        steps: [
          {
            text: "큰 정사각형의 한 변은 a+b이므로 넓이는 다음과 같아요.",
            latex: "(a+b)^2",
          },
          {
            text: "직각삼각형 한 개의 넓이는 ab/2예요. 네 개를 빼면 가운데 넓이 c²가 남아요.",
            latex: "c^2=(a+b)^2-4\\times\\frac{ab}{2}",
          },
          {
            text: "합의 제곱을 전개하면 2ab가 없어져요.",
            latex: "c^2=a^2+2ab+b^2-2ab=a^2+b^2",
          },
        ],
        history: {
          title: "피타고라스가 직접 이렇게 증명했을까요?",
          text: "피타고라스 자신의 저술은 전해지지 않아요. 그가 실제로 사용한 증명이라고 단정하기는 어려워요. 여기서는 넓이를 이용한 증명을 설명해요. 직각삼각형의 이런 관계는 피타고라스 이전 바빌로니아에서도 알려져 있었어요.",
          sourceUrl:
            "https://mathshistory.st-andrews.ac.uk/Biographies/Pythagoras/",
        },
      },
    },
  ],
  questions: [
    {
      id: "math.geometry.pythagorean.missing-square",
      revision: 2,
      classification: {
        topicIds: ["math.geometry.right-triangle"],
        schoolLevels: ["middle-2", "high"],
      },
      status: "published",
      formulaId: "math.geometry.pythagorean",
      difficulty: "basic",
      title: "빗변의 제곱을 만들어요",
      before: "c^2=a^2+",
      after: "",
      condition: "a, b는 직각을 이루는 두 변, c는 빗변의 길이예요.",
      hint: "다른 직각변의 길이도 제곱해요.",
      explanation:
        "빗변의 제곱은 두 직각변의 제곱을 더한 값이에요. 빈칸에는 b²가 들어가요.",
      inputProfileId: "algebra-ab",
      grading: {
        type: "accepted-answers",
        normalizer: "polynomial-ab-v1",
        answer: "b^2",
        accepted: ["b^2", "bb"],
      },
    },
  ],
} satisfies ContentPack;
