import { useLayoutEffect, useRef, useState } from 'react';
import { Button, ChoiceSelect, Dialog, DocumentMenu, EditorHeader, Icon, IconButton,
  SecondaryPopup, Toolbar } from '@barocss/office-ui';
import './compact-slide-specimen.css';

type Access = 'writer' | 'viewer' | 'busy' | 'recovery';
type InsertKind = 'textbox' | 'image' | 'table' | 'rectangle';
const pages = [
  { title: '레이아웃 예시', subtitle: '가까운 삽입 도구와 별도의 보기 도구' },
  { title: '표 구성 예시', subtitle: '하단 페이지 도구로 이동합니다' },
  { title: '이미지 예시', subtitle: '필름스트립은 필요할 때만 엽니다' }
];

/** Local UI state only. The host owns real document commands and authority. */
export function CompactSlideSpecimen({ access, onCommand }: {
  access: Access;
  onCommand: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const utilities = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const filmstrip = useRef<HTMLDivElement>(null);
  const stripOrigin = useRef<Element | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState('100');
  const [strip, setStrip] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [items, setItems] = useState<InsertKind[][]>([[], [], []]);
  const writable = access === 'writer';
  const choosePage = (next: number) => {
    if (next < 0 || next >= pages.length || next === page) return;
    setPage(next); onCommand(`slide:page:${next + 1}`);
  };
  const insert = (kind: InsertKind) => {
    if (!writable) return;
    setItems(previous => previous.map((value, index) => index === page ? [...value, kind] : value));
    onCommand(`slide:insert-${kind}`);
  };
  const toggleStrip = () => {
    stripOrigin.current = host.current?.ownerDocument.activeElement ?? null;
    setStrip(value => !value); onCommand('slide:filmstrip');
  };
  useLayoutEffect(() => {
    if (!strip || !stripOrigin.current?.isConnected || host.current?.ownerDocument.activeElement !== stripOrigin.current) return;
    filmstrip.current?.querySelector<HTMLButtonElement>('[data-current]')?.focus({ preventScroll: true });
  }, [strip]);
  const closeStrip = () => {
    setStrip(false);
    navigation.current?.querySelector<HTMLButtonElement>('[data-slide-filmstrip-trigger]')?.focus({ preventScroll: true });
  };
  const showPresentation = () => { setPresenting(true); onCommand('slide:present'); };
  const menus = [{ id: 'file', label: '파일', blocks: [{ id: 'file', items: [
    { id: 'slide:export', label: '내보내기 예시' },
    { id: 'slide:present', label: '프레젠테이션 예시' }
  ] }] }];
  return <div ref={host} className="compact-slide-specimen" data-compact-slide-specimen>
    <EditorHeader compact product="Slides" title="슬라이드 UI 예시"
      menus={<DocumentMenu label="슬라이드 문서 메뉴 예시" triggerLabel="문서" menus={menus} onPick={id => {
        if (id === 'slide:present') showPresentation(); else onCommand(id);
      }} />}
      actions={<span role={access === 'recovery' ? 'alert' : 'status'} data-slide-example-status>
        {access === 'busy' ? '처리 중 UI 예시' : access === 'recovery' ? '복구 필요 UI 예시' : access === 'viewer' ? '읽기 전용 UI 예시' : '서버에 저장하지 않는 UI 예시'}
      </span>} />
    <div className="compact-slide-stage" data-slide-example-stage>
      <div className="compact-slide-insert" data-slide-example-insert>
        <Toolbar variant="compact" surface="floating" label="슬라이드 삽입 도구 예시">
          {(['textbox', 'image', 'table', 'rectangle'] as const).map(kind => <IconButton key={kind}
            label={`${kind === 'textbox' ? '텍스트 상자' : kind === 'image' ? '이미지' : kind === 'table' ? '표' : '도형'} 삽입 예시`}
            disabled={!writable} onClick={() => insert(kind)}><Icon name={`insert-${kind}`} /></IconButton>)}
        </Toolbar>
      </div>
      <div ref={utilities} className="compact-slide-utilities" data-slide-example-utilities>
        <Toolbar variant="compact" surface="floating" label="슬라이드 보기 도구 예시">
          <IconButton label="내보내기 예시" onClick={() => onCommand('slide:export')}><Icon name="export" /></IconButton>
          <IconButton label="프레젠테이션 예시" onClick={showPresentation}><Icon name="present" /></IconButton>
          <SecondaryPopup triggerLabel="슬라이드 추가 보기 예시" label="슬라이드 보기 설정 예시" triggerIcon={<Icon name="expand" />}>
            <div className="compact-slide-detail">
              <strong>보기 설정 예시</strong>
              <Button tone="quiet" onClick={() => onCommand('slide:comments')}><Icon name="comments" />의견 보기 명령 예시</Button>
              <span>실제 문서·의견 데이터는 없습니다.</span>
            </div>
          </SecondaryPopup>
          <ChoiceSelect className="compact-slide-zoom" portalContainer={utilities} ariaLabel="슬라이드 확대 비율 예시"
            value={zoom} onChange={value => { setZoom(value); onCommand(`slide:zoom:${value}`); }}
            options={['75', '100', '125'].map(value => ({ id: value, label: `${value}%` }))} />
        </Toolbar>
      </div>
      <div className="compact-slide-page-position">
        <article className="compact-slide-page" data-slide-example-page style={{ transform: `scale(${Number(zoom) / 100})` }} aria-label={`${page + 1}번 슬라이드 예시`}>
          <span className="compact-slide-page-kicker">LOCAL UI SAMPLE</span>
          <h3>{pages[page].title}</h3><p>{pages[page].subtitle}</p>
          <div className="compact-slide-inserted" aria-live="polite">{items[page].map((kind, index) => <InsertedItem key={index} kind={kind} />)}</div>
          <span className="compact-slide-page-number">{String(page + 1).padStart(2, '0')}</span>
        </article>
      </div>
      {strip && <div ref={filmstrip} className="compact-slide-filmstrip" data-slide-example-filmstrip role="group" aria-label="슬라이드 필름스트립 예시"
        onKeyDown={event => {
          if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
          event.preventDefault(); event.stopPropagation(); closeStrip();
        }}>
        {pages.map((slide, index) => <button key={slide.title} type="button" className="compact-slide-thumbnail"
          aria-label={`${index + 1}번 슬라이드 선택 예시`} aria-pressed={page === index} data-current={page === index || undefined}
          onClick={() => choosePage(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{slide.title}</strong></button>)}
      </div>}
      <div ref={navigation} className="compact-slide-navigation" data-slide-example-navigation>
        <Toolbar variant="compact" surface="floating" shape="pill" label="슬라이드 페이지 도구 예시">
          <IconButton label="이전 슬라이드 예시" disabled={page === 0} onClick={() => choosePage(page - 1)}><Icon name="previous-page" /></IconButton>
          <ChoiceSelect className="compact-slide-page-picker" portalContainer={navigation} ariaLabel="슬라이드 페이지 선택 예시" value={String(page)}
            onChange={value => choosePage(Number(value))} options={pages.map((_, index) => ({ id: String(index), label: `${index + 1} / ${pages.length}` }))} />
          <IconButton label="다음 슬라이드 예시" disabled={page === pages.length - 1} onClick={() => choosePage(page + 1)}><Icon name="next-page" /></IconButton>
          <span className="compact-slide-navigation-separator" aria-hidden="true" />
          <IconButton data={{ 'slide-filmstrip-trigger': 'true' }} label="슬라이드 필름스트립 예시" pressed={strip}
            onClick={toggleStrip}><Icon name="outline" /></IconButton>
        </Toolbar>
      </div>
    </div>
    <p className="compact-slide-caption">3개 페이지와 삽입·보기 상태를 조작하는 로컬 UI 예시입니다. 파일 내보내기와 서버 저장은 실행하지 않습니다.</p>
    <Dialog open={presenting} onOpenChange={setPresenting} title="프레젠테이션 UI 예시" description="현재 예시 페이지를 보여줍니다. 실제 발표 문서를 실행하지 않습니다." className="compact-slide-presentation">
      <div className="compact-slide-presentation-page"><h3>{pages[page].title}</h3><p>{pages[page].subtitle}</p></div>
      <Button onClick={() => setPresenting(false)}>편집 UI 예시로 돌아가기</Button>
    </Dialog>
  </div>;
}
function InsertedItem({ kind }: { kind: InsertKind }) {
  if (kind === 'table') return <table className="compact-slide-item-table"><tbody><tr><td>예시</td><td>표</td></tr></tbody></table>;
  if (kind === 'rectangle') return <span className="compact-slide-item-rectangle" aria-label="삽입된 도형 예시" />;
  if (kind === 'image') return <span className="compact-slide-item-image" aria-label="삽입된 이미지 자리 예시"><Icon name="insert-image" size={24} /></span>;
  return <span className="compact-slide-item-text">삽입된 텍스트 예시</span>;
}
