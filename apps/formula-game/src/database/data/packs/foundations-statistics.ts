import type { ContentPack } from "../../../content/types.ts";
export const foundationsStatisticsPack = {
  schemaVersion: 1,
  id: "statistics.foundations",
  revision: 2,
  subjects: [],
  domains: [],
  topics: [
    {
      id: "statistics.mean.two-values-topic",
      name: "두 값의 산술평균",
      description: "두 값의 산술평균",
      domainIds: ["applied-statistics"],
    },
    {
      id: "statistics.standardization.z-score-topic",
      name: "표준점수",
      description: "표준점수",
      domainIds: ["applied-statistics"],
    },
  ],
  inputProfiles: [
    {
      id: "statistics.mean.two-values.input",
      symbols: ["a", "b"],
      numbers: ["1", "2", "3", "4"],
      operators: ["(", ")", "+", "−"],
      structures: ["fraction"],
    },
    {
      id: "statistics.standardization.z-score.input",
      symbols: ["x", "μ", "σ"],
      numbers: ["1", "2", "3", "4"],
      operators: ["(", ")", "+", "−"],
      structures: ["fraction"],
    },
  ],
  formulas: [
    {
      id: "statistics.mean.two-values",
      revision: 1,
      status: "published",
      title: "두 값의 산술평균",
      latex: "\\bar{x}=\\frac{a+b}{2}",
      topicIds: ["statistics.mean.two-values-topic"],
      schoolLevels: ["elementary", "university"],
      conditions: ["실수인 두 값 a, b에 같은 가중치를 주어 평균을 구해요."],
      variables: [
        {
          symbol: "a",
          meaning: "첫 번째 값",
        },
        {
          symbol: "b",
          meaning: "두 번째 값",
        },
        {
          symbol: "\\bar{x}",
          meaning: "두 값의 산술평균",
        },
      ],
      prerequisiteIds: [],
      sources: [
        {
          title: "NIST: 위치 측정과 평균",
          url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm",
        },
      ],
      lesson: {
        title: "두 값의 산술평균의 원리",
        introduction:
          "산술평균은 값의 합을 값의 개수로 나눈 수예요. 여기서는 두 값만 다뤄요.",
        steps: [
          {
            text: "두 값 a와 b를 더한 뒤 2로 나눠요.",
            latex: "\\bar{x}=\\frac{a+b}{2}",
          },
          {
            text: "평균의 두 배는 원래 두 값의 합이에요.",
            latex: "2\\bar{x}=a+b",
          },
        ],
      },
    },
    {
      id: "statistics.standardization.z-score",
      revision: 1,
      status: "published",
      title: "표준점수",
      latex: "z=\\frac{x-\\mu}{\\sigma}",
      topicIds: ["statistics.standardization.z-score-topic"],
      schoolLevels: ["university"],
      conditions: ["평균 μ와 표준편차 σ > 0을 사용해 값 x를 표준화해요."],
      variables: [
        {
          symbol: "x",
          meaning: "관측값",
        },
        {
          symbol: "\\mu",
          meaning: "평균",
        },
        {
          symbol: "\\sigma",
          meaning: "표준편차",
        },
        {
          symbol: "z",
          meaning: "표준점수",
        },
      ],
      prerequisiteIds: [],
      sources: [
        {
          title: "OpenStax: 표준점수",
          url: "https://openstax.org/books/introductory-statistics/pages/6-1-the-standard-normal-distribution",
        },
      ],
      lesson: {
        title: "표준점수의 원리",
        introduction:
          "값에서 평균을 빼면 평균보다 얼마나 크거나 작은지 알 수 있어요.",
        steps: [
          {
            text: "값에서 평균을 빼면 평균보다 얼마나 크거나 작은지 알 수 있어요.",
            latex: "x-\\mu",
          },
          {
            text: "그 차이를 표준편차로 나누면 표준편차를 단위로 한 위치가 돼요.",
            latex: "z=\\frac{x-\\mu}{\\sigma}",
          },
          {
            text: "표준화 자체에 정규분포 가정은 필요하지 않아요. x가 평균이면 표준점수는 0이에요.",
            latex: "z=0",
          },
        ],
      },
    },
  ],
  questions: [
    {
      id: "statistics.mean.two-values.sum",
      revision: 1,
      status: "published",
      formulaId: "statistics.mean.two-values",
      difficulty: "basic",
      title: "평균과 합의 관계",
      before: "2\\bar{x}=",
      after: "",
      condition: "실수인 두 값 a, b에 같은 가중치를 주어 평균을 구해요.",
      hint: "두 값의 평균에 2를 곱하면 두 값의 합이 돼요.",
      explanation: "두 값의 평균에 2를 곱하면 두 값의 합이 돼요.",
      inputProfileId: "statistics.mean.two-values.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "a+b",
        accepted: ["a+b", "b+a"],
      },
    },
    {
      id: "statistics.mean.two-values.mean",
      revision: 1,
      status: "published",
      formulaId: "statistics.mean.two-values",
      difficulty: "basic",
      title: "두 값의 평균 완성",
      before: "\\bar{x}=",
      after: "",
      condition: "실수인 두 값 a, b에 같은 가중치를 주어 평균을 구해요.",
      hint: "두 값을 먼저 더하고 2로 나눠요.",
      explanation: "두 값을 먼저 더하고 2로 나눠요.",
      inputProfileId: "statistics.mean.two-values.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "\\frac{a+b}{2}",
        accepted: ["\\frac{a+b}{2}", "\\frac{b+a}{2}"],
      },
    },
    {
      id: "statistics.standardization.z-score.center",
      revision: 1,
      status: "published",
      formulaId: "statistics.standardization.z-score",
      difficulty: "basic",
      title: "평균을 기준으로 옮기기",
      before: "z\\sigma=",
      after: "",
      condition: "평균 μ와 표준편차 σ > 0을 사용해 값 x를 표준화해요.",
      hint: "관측값 x에서 평균 μ를 빼요.",
      explanation: "관측값 x에서 평균 μ를 빼요.",
      inputProfileId: "statistics.standardization.z-score.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "x-\\mu",
        accepted: ["x-\\mu"],
      },
    },
    {
      id: "statistics.standardization.z-score.score",
      revision: 1,
      status: "published",
      formulaId: "statistics.standardization.z-score",
      difficulty: "basic",
      title: "표준점수 완성",
      before: "z=",
      after: "",
      condition: "평균 μ와 표준편차 σ > 0을 사용해 값 x를 표준화해요.",
      hint: "관측값과 평균의 차이를 표준편차로 나눠요.",
      explanation: "관측값과 평균의 차이를 표준편차로 나눠요.",
      inputProfileId: "statistics.standardization.z-score.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "\\frac{x-\\mu}{\\sigma}",
        accepted: ["\\frac{x-\\mu}{\\sigma}"],
      },
    },
  ],
} satisfies ContentPack;
