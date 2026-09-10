import type { SchoolCourse, CourseUnit } from "../curriculum-types.ts";
const ebs = "https://www.ebsmath.co.kr/siteMap";
const goe =
  "https://www.goe.go.kr/resource/old/BBSMSTR_000000030224/BBS_202503100916461641.pdf";
export const schoolCourses: SchoolCourse[] = [
  {
    id: "kr-ebs-m2",
    subjectId: "math",
    learningLevelId: "middle-2",
    name: "중학교 2학년 수학",
    school: "중학교",
    edition: "EBSMath 학습 분류",
    sourceUrl: ebs,
  },
  {
    id: "kr-ebs-m3",
    subjectId: "math",
    learningLevelId: "middle-3",
    name: "중학교 3학년 수학",
    school: "중학교",
    edition: "EBSMath 학습 분류",
    sourceUrl: ebs,
  },
  {
    id: "kr-2022-common1",
    subjectId: "math",
    learningLevelId: "high",
    name: "공통수학1",
    school: "고등학교",
    edition: "2022 개정",
    sourceUrl: goe,
  },
  {
    id: "kr-2022-common2",
    subjectId: "math",
    learningLevelId: "high",
    name: "공통수학2",
    school: "고등학교",
    edition: "2022 개정",
    sourceUrl: goe,
  },
];
const algebra = (ids: string[]) => ids.map((id) => `math.algebra.${id}`);
export const courseUnits: CourseUnit[] = [
  {
    id: "kr-ebs-m2-expressions",
    courseId: "kr-ebs-m2",
    name: "식의 계산",
    formulaIds: algebra(["distributive"]),
  },
  {
    id: "kr-ebs-m2-pythagorean",
    courseId: "kr-ebs-m2",
    name: "피타고라스 정리",
    formulaIds: ["math.geometry.pythagorean"],
  },
  {
    id: "kr-ebs-m3-products",
    courseId: "kr-ebs-m3",
    name: "다항식의 곱셈과 인수분해",
    questionIds: algebra([
      "square-coefficient",
      "difference-factor",
      "sum",
      "difference",
      "reverse",
      "subtract",
      "factor-square",
      "scaled-square",
      "scaled-difference",
      "shifted-product",
    ]),
    formulaIds: algebra([
      "square-sum",
      "square-difference",
      "difference-squares",
      "two-binomials",
    ]),
  },
  {
    id: "kr-2022-common1-polynomials",
    courseId: "kr-2022-common1",
    name: "다항식",
    formulaIds: algebra([
      "distributive",
      "square-sum",
      "square-difference",
      "difference-squares",
      "square-gap",
      "two-binomials",
      "cube-difference",
      "cube-sum",
      "square-pair",
      "cube-expansion",
    ]),
  },
  {
    id: "kr-2022-common2-coordinates",
    courseId: "kr-2022-common2",
    name: "도형의 방정식",
    formulaIds: [
      "math.coordinates.origin-distance",
      "math.coordinates.origin-circle",
    ],
  },
  {
    id: "kr-2022-common2-sets",
    courseId: "kr-2022-common2",
    name: "집합과 명제",
    formulaIds: [],
  },
  {
    id: "kr-2022-common2-functions",
    courseId: "kr-2022-common2",
    name: "함수와 그래프",
    formulaIds: [],
  },
];
