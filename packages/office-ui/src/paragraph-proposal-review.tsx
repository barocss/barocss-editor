import type { MouseEvent } from 'react';

export interface ParagraphProposalReviewProps {
  state: 'empty' | 'ready' | 'stale' | 'rejected' | 'unavailable';
  original: string;
  before: string;
  after: string;
  proposal: string;
  source: string;
  interpretation: string;
  assumption: string;
  reason: string;
  limitation: string;
  onPreview: () => void;
  onReject: () => void;
}
const keepSelection = (event: MouseEvent) => event.preventDefault();

/** Pure presentation. Source text and proposed additional criteria are separate statements. */
export function ParagraphProposalReview(props: ParagraphProposalReviewProps) {
  const status = { empty: '검토할 문단을 선택하세요.', ready: '제안됨 · 아직 수락하지 않음',
    stale: '대상이 바뀌었습니다. 이전 제안은 사용할 수 없습니다.', rejected: '제안을 거절했습니다. 원문은 그대로입니다.',
    unavailable: '이 문서의 일반 텍스트 문단 하나를 전체 선택하세요.' }[props.state];
  return <aside className="w-paragraph-proposal" aria-label="문단 제안 검토" data-proposal-state={props.state}>
    <header><span>고정 응답 예시</span><h2>원문과 근거를 함께 검토</h2>
      <p>실제 AI 분석을 하지 않았습니다. 모든 ID, 버전, 작성자, 날짜와 승인 상태는 가상 예시입니다.</p></header>
    <p>REQ-01@v1 · 작성자: 가상 작성자 · 2026-10-01 · 가상 초안</p>
    <button type="button" onMouseDown={keepSelection} onClick={props.onPreview}>선택 문단 제안 보기</button>
    <p role="status">{status}</p>
    <section><h3>주변 문맥</h3><p>{props.before}</p><p>{props.after}</p></section>
    <section><h3>원문 · 변경되지 않음</h3><p data-proposal-original>{props.original}</p></section>
    <section><h3>근거 원문 · DEC-01@v1</h3><p>{props.source}</p>
      <p>가상 결정 기록 · 작성자: 가상 작성자 · 2026-10-01 · 가상 기록 · 승인 미확인. 제안의 수락 상태와 다릅니다.</p></section>
    {props.state !== 'empty' && <>
      <section><h3>해석</h3><p>{props.interpretation}</p></section>
      <section><h3>고정 제안 · 미수락</h3><p data-proposal-replacement>{props.proposal}</p></section>
      <section><h3>새 기준과 가정 · 사람의 판단 필요</h3><p>{props.assumption}</p></section>
      <section><h3>변경 이유</h3><p>{props.reason}</p></section>
      <div><button type="button" onMouseDown={keepSelection} onClick={props.onReject} disabled={props.state !== 'ready'}>제안 거절</button>
        <button type="button" disabled>적용 불가 · 미리 보기 전용</button></div>
    </>}
    <p>{props.limitation}</p>
  </aside>;
}
