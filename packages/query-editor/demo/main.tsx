import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  JqlEditor,
  QueryEditor,
  parseJql,
  parseQuery,
  stringifyJql,
  stringifyQuery,
  type JqlExpression,
  type QueryDocument,
  type QueryOperator,
} from '../src/index';
import '../src/style.css';
import './style.css';

const operators: QueryOperator[] = [
  {
    key: 'from', label: '작성자', description: '작성자 또는 보낸 사람', kind: 'person', multiple: true,
    options: [
      { value: 'minsu', label: '김민수', description: '제품팀' },
      { value: 'jiho', label: '박지호', description: '디자인팀' },
      { value: 'sora', label: '이소라', description: '재무팀' },
    ],
  },
  {
    key: 'in', label: '위치', description: '채널, 폴더 또는 프로젝트', kind: 'location', multiple: true,
    options: [
      { value: 'product', label: '제품 기획', description: '프로젝트' },
      { value: 'design', label: '디자인 시스템', description: '프로젝트' },
      { value: 'finance', label: '재무', description: '폴더' },
    ],
  },
  {
    key: 'type', label: '유형', description: '검색할 결과 유형', kind: 'option', multiple: true,
    options: [
      { value: 'document', label: '문서' },
      { value: 'comment', label: '댓글' },
      { value: 'sheet', label: '스프레드시트' },
    ],
  },
  {
    key: 'has', label: '포함', description: '결과에 포함된 항목', kind: 'option', multiple: true,
    options: [
      { value: 'mention', label: '내 멘션' },
      { value: 'attachment', label: '첨부 파일' },
      { value: 'link', label: '링크' },
    ],
  },
  {
    key: 'status', label: '상태', description: '문서 또는 작업 상태', kind: 'option', multiple: true,
    options: [
      { value: 'draft', label: '초안' },
      { value: 'review', label: '검토 중' },
      { value: 'approved', label: '승인' },
    ],
  },
  { key: 'after', label: '시작일', description: '이 날짜 이후', placeholder: 'YYYY-MM-DD', kind: 'date', multiple: false },
  { key: 'before', label: '종료일', description: '이 날짜 이전', placeholder: 'YYYY-MM-DD', kind: 'date', multiple: false },
];

type Result = {
  title: string;
  excerpt: string;
  from: string;
  location: string;
  type: 'document' | 'comment' | 'sheet';
  status: 'draft' | 'review' | 'approved';
  date: string;
  has: string[];
};

const results: Result[] = [
  { title: '3분기 예산안', excerpt: '팀별 운영 예산과 다음 분기 집행 계획을 정리했습니다.', from: 'sora', location: 'finance', type: 'sheet', status: 'review', date: '2026-09-12', has: ['attachment', 'mention'] },
  { title: '검색 경험 개선안', excerpt: '필터 문법, 자동 완성, 저장된 검색의 우선순위를 검토합니다.', from: 'minsu', location: 'product', type: 'document', status: 'draft', date: '2026-09-16', has: ['mention', 'link'] },
  { title: '컴포넌트 접근성 검토', excerpt: '키보드 탐색과 스크린 리더 안내 문구를 확인했습니다.', from: 'jiho', location: 'design', type: 'comment', status: 'approved', date: '2026-09-15', has: ['link'] },
  { title: '오피스 통합 일정', excerpt: 'Word, Note, Slide 검색을 공통 입력기로 연결하는 일정입니다.', from: 'minsu', location: 'product', type: 'document', status: 'review', date: '2026-09-10', has: ['attachment'] },
  { title: '디자인 토큰 목록', excerpt: '검색 입력기의 색상과 간격 토큰을 추가했습니다.', from: 'jiho', location: 'design', type: 'sheet', status: 'draft', date: '2026-09-08', has: ['attachment', 'link'] },
  { title: '정산 검토 의견', excerpt: '첨부한 영수증과 예산 항목의 연결을 확인해 주세요.', from: 'sora', location: 'finance', type: 'comment', status: 'review', date: '2026-09-17', has: ['attachment', 'mention'] },
];

const people: Record<string, string> = { minsu: '김민수', jiho: '박지호', sora: '이소라' };
const locations: Record<string, string> = { product: '제품 기획', design: '디자인 시스템', finance: '재무' };
const types: Record<Result['type'], string> = { document: '문서', comment: '댓글', sheet: '스프레드시트' };
const statuses: Record<Result['status'], string> = { draft: '초안', review: '검토 중', approved: '승인' };

function matchesFilter(result: Result, key: string, value: string): boolean {
  if (key === 'from') return result.from === value;
  if (key === 'in') return result.location === value;
  if (key === 'type') return result.type === value;
  if (key === 'status') return result.status === value;
  if (key === 'has') return result.has.includes(value);
  if (key === 'after') return result.date >= value;
  if (key === 'before') return result.date <= value;
  return true;
}

function matches(result: Result, query: QueryDocument): boolean {
  const text = query.text.trim().toLocaleLowerCase();
  if (text && !`${result.title} ${result.excerpt}`.toLocaleLowerCase().includes(text)) return false;
  const groups = new Map<string, typeof query.filters[number][]>();
  for (const filter of query.filters) groups.set(filter.key, [...(groups.get(filter.key) ?? []), filter]);
  return [...groups.values()].every(filters => {
    const included = filters.filter(filter => !filter.negated);
    const excluded = filters.filter(filter => filter.negated);
    return (!included.length || included.some(filter => matchesFilter(result, filter.key, filter.value)))
      && excluded.every(filter => !matchesFilter(result, filter.key, filter.value));
  });
}

function countJqlClauses(expression?: JqlExpression): number {
  if (!expression) return 0;
  if (expression.type === 'clause') return 1;
  if (expression.type === 'logical') return countJqlClauses(expression.left) + countJqlClauses(expression.right);
  return countJqlClauses(expression.expression);
}

function App() {
  const [mode, setMode] = useState<'filters' | 'jql'>('filters');
  const [query, setQuery] = useState<QueryDocument>(() => parseQuery(''));
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [jqlSource, setJqlSource] = useState('project = PRODUCT AND status IN ("To Do", "In Progress") ORDER BY updated DESC');
  const [jqlSubmitted, setJqlSubmitted] = useState<string | null>(null);
  const filtered = useMemo(() => results.filter(result => matches(result, query)), [query]);
  const jqlResult = useMemo(() => parseJql(jqlSource), [jqlSource]);
  const jqlClauseCount = countJqlClauses(jqlResult.document.expression);
  const apply = (source: string) => {
    setQuery(parseQuery(source, operators));
    setSubmitted(source);
  };
  return <main>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Barocss Query Editor 홈"><span aria-hidden="true">B</span> Barocss</a>
      <nav aria-label="데모 메뉴"><a href="#playground">Playground</a><a href="#api">API</a></nav>
      <span className="version">v0.1.0</span>
    </header>

    <section className="intro" id="top">
      <p className="eyebrow">STRUCTURED SEARCH INPUT</p>
      <h1>검색어와 필터를<br />하나의 흐름으로.</h1>
      <p className="lede">자유롭게 입력하고, 정확하게 좁히세요. 제품에 종속되지 않는 검색 입력 컴포넌트입니다.</p>
      <div className="syntax" aria-label="지원하는 검색 문법">
        <code>from:</code><code>in:</code><code>type:</code><code>has:</code><code>status:</code><code>after:</code>
      </div>
    </section>

    <section className="playground" id="playground" aria-labelledby="playground-title">
      <div className="playground-heading">
        <div><p className="section-number">01 / PLAYGROUND</p><h2 id="playground-title">직접 검색해 보세요</h2></div>
        <p><kbd>↑</kbd><kbd>↓</kbd>로 이동하고 <kbd>Enter</kbd>로 선택합니다.</p>
      </div>
      <div className="search-stage">
        <div className="mode-switch" aria-label="검색 방식">
          <button type="button" aria-pressed={mode === 'filters'} onClick={() => setMode('filters')}><strong>필터 검색</strong><span>Slack 방식</span></button>
          <button type="button" aria-pressed={mode === 'jql'} onClick={() => setMode('jql')}><strong>JQL</strong><span>Jira 고급 검색</span></button>
        </div>
        {mode === 'filters' ? <>
          <QueryEditor value={query} operators={operators} label="업무 자료 검색"
            placeholder="검색어 또는 from:, in:, type: 입력…"
            onChange={setQuery} onSubmit={(_, source) => setSubmitted(source)} />
          <div className="presets" aria-label="검색 예시">
            <span>빠른 예시</span>
            <button type="button" onClick={() => apply('from:minsu status:review')}>민수 · 검토 중</button>
            <button type="button" onClick={() => apply('in:finance has:attachment')}>재무 · 첨부 파일</button>
            <button type="button" onClick={() => apply('type:comment -has:attachment')}>첨부 없는 댓글</button>
          </div>
        </> : <JqlEditor value={jqlSource}
          onChange={source => { setJqlSource(source); setJqlSubmitted(null); }}
          onSubmit={(source, result) => { if (result.valid) setJqlSubmitted(source); }} />}
      </div>

      {mode === 'filters' ? <>
        <div className="result-bar">
          <p><strong>{filtered.length}</strong>개의 결과</p>
          <code>{stringifyQuery(query) || '모든 업무 자료'}</code>
          {submitted !== null && <span role="status">검색 실행됨</span>}
        </div>
        <div className="result-list" aria-live="polite">
          {filtered.map((result, index) => <article key={result.title}>
          <div className="result-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="result-main">
            <div className="result-title"><span className={`type type-${result.type}`}>{types[result.type]}</span><h3>{result.title}</h3></div>
            <p>{result.excerpt}</p>
            <div className="metadata"><span>{people[result.from]}</span><span>{locations[result.location]}</span><span>{result.date}</span></div>
          </div>
          <span className={`status status-${result.status}`}>{statuses[result.status]}</span>
          </article>)}
          {!filtered.length && <div className="no-results"><strong>일치하는 자료가 없습니다.</strong><span>필터를 제거하거나 다른 검색어를 입력하세요.</span></div>}
        </div>
      </> : <div className="jql-result" aria-live="polite">
        <div className="jql-result__metric"><span>조건</span><strong>{jqlClauseCount}</strong></div>
        <div className="jql-result__metric"><span>정렬</span><strong>{jqlResult.document.orderBy.length}</strong></div>
        <div className="jql-result__status" data-valid={jqlResult.valid || undefined}>
          <strong>{jqlResult.valid ? '실행 가능한 JQL입니다.' : '문법을 먼저 수정하세요.'}</strong>
          <span>{jqlSubmitted ? 'Jira 검색 어댑터로 전달할 준비가 됐습니다.' : '제안을 선택하거나 Ctrl + Enter로 실행하세요.'}</span>
        </div>
      </div>}
    </section>

    <section className="api" id="api">
      <p className="section-number">02 / DATA CONTRACT</p>
      <div><h2>검색 실행은<br />호스트가 소유합니다.</h2><p>Query Editor는 입력과 구조화만 담당합니다. 검색 API, 권한, 저장 방식은 제품에 맞게 연결하세요.</p></div>
      <pre><code>{JSON.stringify(mode === 'filters' ? query : {
        source: jqlSource,
        normalized: jqlResult.valid ? stringifyJql(jqlResult.document) : null,
        document: jqlResult.document,
        diagnostics: jqlResult.diagnostics,
      }, null, 2)}</code></pre>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
