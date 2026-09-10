import type { ContentPack } from "../../../content/types.ts";
export const foundationsPhysicsPack = {
  schemaVersion: 1,
  id: "physics.foundations",
  revision: 3,
  subjects: [],
  domains: [],
  topics: [
    {
      id: "physics.circuits.ohm-topic",
      name: "옴의 법칙",
      description: "옴의 법칙",
      domainIds: ["circuits"],
    },
    {
      id: "physics.mechanics.kinetic-topic",
      name: "운동 에너지",
      description: "운동 에너지",
      domainIds: ["dynamics"],
    },
  ],
  inputProfiles: [
    {
      id: "physics.circuits.ohm.input",
      symbols: ["I", "R", "V"],
      numbers: ["1", "2", "3", "4"],
      operators: ["(", ")", "+", "−"],
      structures: ["fraction"],
    },
    {
      id: "physics.mechanics.kinetic.input",
      symbols: ["m", "v", "K"],
      numbers: ["1", "2", "3", "4"],
      operators: ["(", ")", "+", "−"],
      structures: ["square", "fraction"],
    },
  ],
  formulas: [
    {
      id: "physics.circuits.ohm",
      revision: 1,
      status: "published",
      title: "옴의 법칙",
      latex: "V=IR",
      topicIds: ["physics.circuits.ohm-topic"],
      schoolLevels: ["high", "university"],
      conditions: [
        "전압 $V$, 전류 $I$, 저항 $R$(단위: 옴 $\\Omega$)을 사용해요. 온도가 일정하고 저항 $R > 0$이 일정한 옴성 도체를 다뤄요.",
      ],
      variables: [
        {
          symbol: "V",
          meaning: "전압",
          unit: "볼트(V)",
        },
        {
          symbol: "I",
          meaning: "전류",
          unit: "암페어(A)",
        },
        {
          symbol: "R",
          meaning: "저항",
          unit: "옴(Ω)",
        },
      ],
      prerequisiteIds: [],
      sources: [
        {
          title: "OpenStax: 옴의 법칙",
          url: "https://openstax.org/books/university-physics-volume-2/pages/9-4-ohms-law",
        },
      ],
      lesson: {
        title: "옴의 법칙의 원리",
        introduction:
          "옴성 도체에서는 전압과 전류가 비례해요. 비례상수가 저항이에요.",
        steps: [
          {
            text: "전류 $I$에 저항 $R$을 곱하면 전압 $V$예요.",
            latex: "V=IR",
          },
          {
            text: "양변을 저항으로 나누면 전류를 구할 수 있어요.",
            latex: "I=\\frac{V}{R}",
          },
        ],
      },
    },
    {
      id: "physics.mechanics.kinetic",
      revision: 1,
      status: "published",
      title: "운동 에너지",
      latex: "K=\\frac{mv^2}{2}",
      topicIds: ["physics.mechanics.kinetic-topic"],
      schoolLevels: ["high", "university"],
      conditions: [
        "질량 m이 일정하고 속력 v가 빛의 속력보다 매우 작은 물체의 병진 운동을 다뤄요.",
      ],
      variables: [
        {
          symbol: "m",
          meaning: "질량 (kg), m > 0",
        },
        {
          symbol: "v",
          meaning: "속력 (m/s), v ≥ 0",
        },
        {
          symbol: "K",
          meaning: "운동 에너지 (J)",
        },
      ],
      prerequisiteIds: [],
      sources: [
        {
          title: "OpenStax: 운동 에너지",
          url: "https://openstax.org/books/university-physics-volume-1/pages/7-2-kinetic-energy",
        },
      ],
      lesson: {
        title: "운동 에너지의 원리",
        introduction:
          "고전역학에서 병진 운동 에너지는 질량과 속력의 제곱에 비례해요.",
        steps: [
          {
            text: "질량 m과 속력의 제곱 v²을 곱한 값의 절반이 운동 에너지예요.",
            latex: "K=\\frac{mv^2}{2}",
          },
          {
            text: "속력이 두 배면 제곱 항이 네 배가 돼요.",
            latex: "\\frac{m(2v)^2}{2}=4K",
          },
        ],
      },
    },
  ],
  questions: [
    {
      id: "physics.circuits.ohm.voltage",
      revision: 1,
      status: "published",
      formulaId: "physics.circuits.ohm",
      difficulty: "basic",
      title: "전압 관계식 완성",
      before: "V=",
      after: "",
      condition:
        "전압 $V$, 전류 $I$, 저항 $R$(단위: 옴 $\\Omega$)을 사용해요. 온도가 일정하고 저항 $R > 0$이 일정한 옴성 도체를 다뤄요.",
      hint: "전류 $I$와 저항 $R$을 곱해요.",
      explanation: "전류 $I$와 저항 $R$을 곱해요.",
      inputProfileId: "physics.circuits.ohm.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "IR",
        accepted: ["IR", "RI"],
      },
    },
    {
      id: "physics.circuits.ohm.current",
      revision: 1,
      status: "published",
      formulaId: "physics.circuits.ohm",
      difficulty: "basic",
      title: "전류 관계식 완성",
      before: "I=",
      after: "",
      condition:
        "전압 $V$, 전류 $I$, 저항 $R$(단위: 옴 $\\Omega$)을 사용해요. 온도가 일정하고 저항 $R > 0$이 일정한 옴성 도체를 다뤄요.",
      hint: "전압을 저항으로 나누면 전류가 돼요.",
      explanation: "전압을 저항으로 나누면 전류가 돼요.",
      inputProfileId: "physics.circuits.ohm.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "\\frac{V}{R}",
        accepted: ["\\frac{V}{R}"],
      },
    },
    {
      id: "physics.mechanics.kinetic.speed",
      revision: 1,
      status: "published",
      formulaId: "physics.mechanics.kinetic",
      difficulty: "basic",
      title: "속력의 제곱 찾기",
      before: "K=\\frac{m}{2}",
      after: "",
      condition:
        "질량 m이 일정하고 속력 v가 빛의 속력보다 매우 작은 물체의 병진 운동을 다뤄요.",
      hint: "질량은 한 번 곱하고, 속력은 제곱해요.",
      explanation: "질량은 한 번 곱하고, 속력은 제곱해요.",
      inputProfileId: "physics.mechanics.kinetic.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "v^2",
        accepted: ["v^2", "vv"],
      },
    },
    {
      id: "physics.mechanics.kinetic.twice",
      revision: 1,
      status: "published",
      formulaId: "physics.mechanics.kinetic",
      difficulty: "basic",
      title: "운동 에너지 식 완성",
      before: "2K=",
      after: "",
      condition:
        "질량 m이 일정하고 속력 v가 빛의 속력보다 매우 작은 물체의 병진 운동을 다뤄요.",
      hint: "양변에 2를 곱하면 질량과 속력 제곱의 곱이 남아요.",
      explanation: "양변에 2를 곱하면 질량과 속력 제곱의 곱이 남아요.",
      inputProfileId: "physics.mechanics.kinetic.input",
      grading: {
        type: "accepted-answers",
        normalizer: "math-input-v1",
        answer: "mv^2",
        accepted: ["mv^2", "v^2m", "mvv"],
      },
    },
  ],
} satisfies ContentPack;
