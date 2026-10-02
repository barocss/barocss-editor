import { describe, expect, it } from 'vitest';
import { createProjectComment, createProjectRecord, readProjectRecord, requestProjectWork, setProjectWorkPaused, type Pin } from './connected-work';
const pin: Pin = { id: 'pin', document: { product: 'word', id: 'original' }, revision: 7, text: '{"native":"exact\nbytes"}', title: '설치 안내' };
function fixture() {
  const project = createProjectRecord('Windows 베타 공개', '고객의 설치를 돕는다');
  project.results.push({ id: 'result', name: '고객 설치 안내', document: pin.document, inputs: [pin] });
  return project;
}
const input = { resultId: 'result', target: { kind: 'word-comment' as const, id: 'thread-1', quote: '앱 실행 중' }, pin,
  actor: { kind: 'local' as const, id: 'local-owner', label: 'Local owner' }, body: '앱이 켜져 있을 때의 조치도 안내해주세요.' };
describe('connected project work', () => {
  it('adds feedback without creating work or changing native source', () => {
    const original = fixture(), next = createProjectComment(original, input);
    expect(original.comments).toEqual([]); expect(next.works).toEqual([]);
    expect(next.comments[0]?.pin.text).toBe(pin.text); expect(next.results).toEqual(original.results);
    expect(next.comments[0]?.target).toEqual(input.target);
  });
  it('links an explicit request once, persists exact inputs, and resumes the same work', () => {
    const commentOnly = createProjectComment(fixture(), input), comment = commentOnly.comments[0]!;
    const requested = requestProjectWork(commentOnly, comment.id, '교육자료에도 반영해주세요.');
    const work = requested.works[0]!;
    expect(work.state).toBe('unconnected'); expect(work.reason).toContain('not been applied');
    expect(work.inputs).toEqual([pin]); expect(work.outputs).toEqual(['result']);
    expect(requestProjectWork(requested, comment.id, work.request)).toEqual(requested);
    const paused = setProjectWorkPaused(requested, work.id, true), resumed = setProjectWorkPaused(paused, work.id, false);
    expect(paused.works[0]?.state).toBe('paused'); expect(resumed.works[0]?.id).toBe(work.id);
    expect(resumed.works[0]?.state).toBe('unconnected'); expect(resumed.comments[0]?.workId).toBe(work.id);
    expect(readProjectRecord(JSON.parse(JSON.stringify(resumed)))).toEqual(resumed);
  });
  it('keeps historical opinions and work when a result is unlinked', () => {
    const recorded = createProjectComment(fixture(), input);
    const requested = requestProjectWork(recorded, recorded.comments[0]!.id, '교육자료 갱신');
    const historical = { ...requested, results: [] };
    expect(readProjectRecord(historical).comments).toEqual(requested.comments);
    expect(readProjectRecord(historical).works).toEqual(requested.works);
    expect(() => createProjectComment(historical, input)).toThrow('current result');
    const paused = setProjectWorkPaused(historical, requested.works[0]!.id, true);
    expect(paused.works[0]?.inputs[0]?.text).toBe(pin.text);
    expect(paused.works[0]?.id).toBe(requested.works[0]?.id);
  });
  it('allows one original in different projects and rejects duplicate membership within one', () => {
    const project = fixture(); expect(readProjectRecord(fixture()).results[0]?.document.id).toBe('original');
    project.results.push({ ...project.results[0]!, id: 'other-result' });
    expect(() => readProjectRecord(project)).toThrow('Invalid project');
  });
  it('rejects unsupported completion claims and broken native/work references', () => {
    const project = createProjectComment(fixture(), input);
    expect(() => readProjectRecord({ ...project, completed: true })).toThrow();
    expect(() => readProjectRecord({ ...project, works: [{ id: 'work', state: 'applied' }] })).toThrow();
    const broken = structuredClone(project); broken.comments[0]!.workId = 'missing';
    expect(() => readProjectRecord(broken)).toThrow();
    expect(() => createProjectComment(fixture(), { ...input, target: { kind: 'document', id: 'wrong', quote: '' } })).toThrow();
  });
  it('keeps empty archived projects, draft composition text and old exact pins intact', () => {
    const project = createProjectRecord('빈 프로젝트', ''); project.archived = true; project.drafts['result'] = '작성 중\n한글';
    expect(readProjectRecord(project)).toEqual(project);
    expect(() => createProjectComment(project, input)).toThrow('Archived');
  });
});
