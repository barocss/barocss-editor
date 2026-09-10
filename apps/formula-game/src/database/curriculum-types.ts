export interface SchoolCourse {
  subjectId: string;
  learningLevelId: string;
  id: string;
  name: string;
  school: string;
  edition: string;
  sourceUrl: string;
}
export interface CourseUnit {
  id: string;
  courseId: string;
  name: string;
  formulaIds: string[];
  questionIds?: string[];
}
