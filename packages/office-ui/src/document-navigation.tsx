import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@barocss/office-icons';
import { Button, IconButton, TextField } from './controls';
import { FloatingSurface, type FloatingSurfaceProps } from './floating';
import { MenuAction } from './menu-action';
import './document-navigation.css';

/** Search results belong to the host. This row only displays and navigates them. */
export function SearchResultNavigation({ query, current, count, onStep, disabled = false, children, countClassName }: {
  query: string; current: number; count: number; onStep: (direction: 1 | -1) => void;
  disabled?: boolean; children?: ReactNode; countClassName?: string;
}) {
  return <div className="ou-document-navigation-results">
    <span className={countClassName} role="status" aria-live="polite" aria-atomic="true">
      {query ? count ? `${Math.max(0, Math.min(current, count - 1)) + 1} / ${count}` : '검색 결과 없음' : '검색어를 입력하세요'}
    </span>
    {children}
    <IconButton label="이전 검색 결과" disabled={disabled || !count} onClick={() => onStep(-1)}><Icon name="previous" size={15} /></IconButton>
    <IconButton label="다음 검색 결과" disabled={disabled || !count} onClick={() => onStep(1)}><Icon name="next" size={15} /></IconButton>
  </div>;
}

export type DocumentNavigationMode = 'find' | 'outline';
export interface DocumentNavigationProps {
  mode: DocumentNavigationMode; at: DOMRect | null; query: string; current: number; count: number;
  caseSensitive: boolean; headings: { id: string; label: string; level: number }[]; activeHeading?: string;
  onMode: (mode: DocumentNavigationMode) => void; onQuery: (query: string) => void;
  onCaseSensitive: (value: boolean) => void; onStep: (direction: 1 | -1) => void;
  onHeading: (id: string) => void; onClose: () => void; onDismiss: FloatingSurfaceProps['onDismiss'];
}
/** Shared navigation chrome; the host supplies its own search and document outline. */
export function DocumentNavigation({ mode, at, query, current, count, caseSensitive, headings, activeHeading, onMode, onQuery, onCaseSensitive, onStep, onHeading, onClose, onDismiss }: DocumentNavigationProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode !== 'find' || !at) return;
    // FloatingSurface is hidden until its layout pass has placed it.
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [mode, !!at]);
  return <FloatingSurface open at={at} prefer="below" align="end" variant="panel" role="region" aria-label="문서 탐색" className="ou-document-navigation" onDismiss={onDismiss} data-document-navigation onKeyDown={event => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); onMode('find'); input.current?.focus(); input.current?.select(); }
  }}>
    <div className="ou-document-navigation-header">
      <Button tone="quiet" pressed={mode === 'find'} onClick={() => onMode('find')}>찾기</Button>
      <Button tone="quiet" pressed={mode === 'outline'} onClick={() => onMode('outline')}>목차</Button>
      <IconButton label="문서 탐색 닫기" onClick={onClose}><Icon name="close" size={15} /></IconButton>
    </div>
    {mode === 'find' ? <>
      <TextField inputRef={input} value={query} onChange={onQuery} type="search" ariaLabel="본문에서 찾기" placeholder="현재 본문에서 찾기" onKeys={event => {
        if (event.key === 'Enter') { event.preventDefault(); onStep(event.shiftKey ? -1 : 1); }
      }} />
      <SearchResultNavigation query={query} current={current} count={count} onStep={onStep}>
        <Button tone="quiet" pressed={caseSensitive} ariaLabel="대소문자 구분" onClick={() => onCaseSensitive(!caseSensitive)}>Aa</Button>
      </SearchResultNavigation>
    </> : <nav aria-label="본문 목차" className="ou-document-navigation-outline">
      {headings.length ? headings.map(heading => <MenuAction key={heading.id} role="button" preserveFocus={false} selected={activeHeading === heading.id} aria-current={activeHeading === heading.id ? 'location' : undefined} data-heading-level={heading.level} style={{ paddingLeft: 8 + (heading.level - 1) * 12 }} onClick={() => onHeading(heading.id)}>{heading.label}</MenuAction>) : <p role="status">제목 블록을 추가하면 목차에 표시됩니다.</p>}
    </nav>}
  </FloatingSurface>;
}
