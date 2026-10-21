import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, ChoiceSelect, ColorPalette, DocumentMenu, EditorHeader, FloatingSurface, Icon, MenuAction, NumberField,
  observeElementAnchor, SecondaryPopup, Toolbar, ToolbarGroup, ToolbarToggle } from '@barocss/office-ui';
import './compact-specimens.css';
import { CompactSlideSpecimen } from './compact-slide-specimen';

type Subject = 'idle' | 'text' | 'table' | 'object';
type Access = 'writer' | 'viewer' | 'busy' | 'recovery';
const longTitle = '공통 편집 UI 예시 — 긴 문서 이름은 줄여 보여도 전체 이름을 읽을 수 있습니다 · 공통 메뉴와 선택 도구의 동작 및 입력 상태를 확인하는 문서 · 밝은 테마와 어두운 테마에서 파일·편집·삽입·서식·검토 메뉴와 상세 도구의 상태를 확인합니다';

/** Both gallery routes use this actual shared composition, without any editor model. */
export function CompactSpecimens() {
  const [product, setProduct] = useState('document');
  const [subject, setSubject] = useState<Subject>('idle');
  const [access, setAccess] = useState<Access>('writer');
  const [longName, setLongName] = useState(false);
  const [bold, setBold] = useState(false), [italic, setItalic] = useState(false), [style, setStyle] = useState('body');
  const [color, setColor] = useState<string | null>(null), [width, setWidth] = useState(160), [height, setHeight] = useState(96);
  const [align, setAlign] = useState('left'), [rows, setRows] = useState(2), [last, setLast] = useState('명령 실행 없음');
  const [actionOpen, setActionOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const primaryChrome = useRef<HTMLDivElement>(null);
  const [linkDraft, setLinkDraft] = useState('https://example.com/unaccepted');
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [prefer, setPrefer] = useState<'above' | 'below'>('above');
  const writable = access === 'writer';
  const select = (next: Subject) => { if(next!==subject) setLinkDraft('https://example.com/unaccepted'); setSubject(next); setMoreOpen(false); setActionOpen(false); };
  useEffect(() => {
    const host = workspace.current;
    if (!host || subject === 'idle' || !writable) { setAnchor(null); return; }
    const target = host.querySelector<HTMLElement>(`[data-compact-target="${subject}"]`);
    const canvas = host.querySelector<HTMLElement>('[data-compact-document]');
    if (target && canvas) {
      const content = target.getBoundingClientRect(), viewport = canvas.getBoundingClientRect();
      // Only scroll the example canvas. Selecting a lower target must not scroll the whole gallery.
      if (content.bottom > viewport.bottom - 20) canvas.scrollTop += content.bottom - viewport.bottom + 20;
      else if (content.top < viewport.top + 64) canvas.scrollTop -= viewport.top + 64 - content.top;
    }
    return observeElementAnchor(host, () => host.querySelector<HTMLElement>(`[data-compact-target="${subject}"]`), (_, at) => {
      // A hidden or retired target cannot keep an actionable selection surface alive.
      if (!at) { setSubject('idle'); setMoreOpen(false); setActionOpen(false); }
      // The viewport-aware shared placer also needs the host's persistent header boundary.
      setPrefer(at && canvas && at.top - 48 - 8 < canvas.getBoundingClientRect().top ? 'below' : 'above');
      setAnchor(previous => previous?.x === at?.x && previous?.y === at?.y && previous?.width === at?.width && previous?.height === at?.height ? previous : at);
    });
  }, [subject, writable]);
  const menus = [
    { id:'file', label:'파일', blocks:[{id:'main',items:[{id:'new',label:'새 예시',disabled:!writable},{id:'export',label:'내보내기 예시',hint:'⌘⇧S'}]}]},
    { id:'edit', label:'편집', blocks:[{id:'main',items:[{id:'undo',label:'실행 취소 예시',hint:'⌘Z',disabled:!writable},{id:'find',label:'찾기 예시',hint:'⌘F'}]}]},
    { id:'insert', label:'삽입', blocks:[{id:'main',items:[{id:'table',label:'표 예시',disabled:!writable}]}]},
    { id:'format', label:'서식', blocks:[{id:'main',items:[{id:'paragraph',label:'문단 설정 예시',disabled:!writable}]}]},
    { id:'review', label:'검토', blocks:[{id:'main',items:[{id:'comments',label:'의견 보기 예시'}]}]}
  ];
  return <div data-compact-specimens data-compact-specimen>
    <div className="compact-example-controls">
      <ChoiceSelect ariaLabel="작업 화면 예시" value={product} onChange={value=>{setProduct(value);select('idle');}} options={[
        {id:'document',label:'문서 화면'},{id:'slides',label:'슬라이드 화면'}]} />
      <ChoiceSelect ariaLabel="편집 대상 예시" value={subject} onChange={value=>select(value as Subject)} options={[
        {id:'idle',label:'선택 없음'},{id:'text',label:'글 선택'},{id:'table',label:'표 선택'},{id:'object',label:'객체 선택'}]} />
      <ChoiceSelect ariaLabel="현재 권한·상태 예시" value={access} onChange={value=>{setAccess(value as Access);select('idle');}} options={[
        {id:'writer',label:'작성자'},{id:'viewer',label:'읽기 전용'},{id:'busy',label:'처리 중'},{id:'recovery',label:'복구 필요'}]} />
      <Button pressed={longName} onClick={()=>setLongName(value=>!value)}>긴 제목 예시</Button>
      <span>대상을 눌러 선택하세요. UI 동작만 확인하는 예시입니다.</span>
    </div>
    {product==='slides' ? <CompactSlideSpecimen access={access} onCommand={setLast} /> : <div ref={workspace} data-compact-workspace className="compact-example-workspace">
      <EditorHeader compact product="Word" title={longName ? longTitle : '작업 계획'}
        menus={<DocumentMenu label="예시 문서 메뉴" triggerLabel="문서" menus={menus} onPick={setLast} />}
        actions={<><span role={access==='recovery'?'alert':'status'} data-compact-status>{access==='busy'?'처리 중인 상태 예시':access==='recovery'?'저장 실패·복구가 필요한 예시':access==='viewer'?'읽기 전용 UI 예시':'서버에 저장하지 않는 UI 예시'}</span>
          {access==='recovery'&&<Button onClick={()=>{setAccess('writer');setLast('복구 재시도 예시');}}>재시도 예시</Button>}
          <SecondaryPopup triggerLabel="상세 도구 예시" triggerIcon={<Icon name="expand" />} label="상세 도구 입력 예시" keepMounted><DetailFields disabled={!writable} /></SecondaryPopup>
        </>} />
      <div data-compact-document className="compact-example-canvas" onPointerDown={event=>{if(event.target===event.currentTarget) select('idle');}}>
        <article className="compact-example-page" aria-label="공통 편집 문서 예시">
          <div className="compact-example-page-meta">팀 문서 · UI 예시</div>
          <h3>작업 계획</h3>
          <p className="compact-example-intro">이번 작업의 목표와 진행 상태를 정리합니다.</p>
          <p className="compact-example-paragraph">우선 <button type="button" className="compact-example-target compact-example-text" data-compact-text data-compact-target="text" data-selected={subject==='text'&&writable ? 'true' : undefined}
            aria-label="예시 글 선택" aria-pressed={subject==='text'&&writable} onClick={()=>writable&&select('text')}
            style={{fontWeight:bold?'bold':'normal',fontStyle:italic?'italic':'normal',color:color ? `#${color}` : undefined}}>핵심 요구와 완료 기준</button>을 확인합니다.<br />선택한 내용에 필요한 도구만 가까이 표시합니다.</p>
          <table data-compact-table className="compact-example-table" style={{textAlign:align as 'left'|'center'|'right'}}><thead><tr><th>작업</th><th>진행 상태</th></tr></thead>
            <tbody>{Array.from({length:rows},(_,i)=><tr key={i}><td>{i===0?<button type="button" className="compact-example-target compact-example-cell" data-compact-target="table" data-selected={subject==='table'&&writable ? 'true' : undefined}
              aria-label="예시 표 셀 선택" aria-pressed={subject==='table'&&writable} onClick={()=>writable&&select('table')}>화면 구성</button>: `예시 행 ${i+1}`}</td><td>{i===0?'검토 중':'준비 중'}</td></tr>)}</tbody></table>
          <div className="compact-example-object-row"><button type="button" data-compact-object data-compact-target="object" data-selected={subject==='object'&&writable ? 'true' : undefined}
            className="compact-example-target compact-example-object" aria-label="예시 객체 선택" aria-pressed={subject==='object'&&writable} onClick={()=>writable&&select('object')} style={{width,height}}>
            <Icon name="insert-image" size={24} /><span>화면 구성</span>
            {subject==='object'&&writable&&['nw','ne','sw','se'].map(corner=><span key={corner} aria-hidden="true" className={`compact-example-handle ${corner}`} />)}
          </button><p>참고 이미지<br /><span>객체를 선택하면 크기 도구를 표시합니다.</span></p></div>
          <p className="compact-example-note">이 문서는 선택과 도구 배치를 확인하는 예시입니다. 서버에 저장하지 않습니다.</p>
        </article>
      </div>
      <div className="compact-example-footer"><span>{subject==='idle'?'선택 없음':subject==='text'?'글 선택':subject==='table'?'표 셀 선택':'객체 선택'}</span><span data-compact-last-command aria-live="polite">마지막 예시 명령: {last}</span></div>
      {subject!=='idle'&&writable&&<FloatingSurface key={subject} compact open at={anchor} portalRoot={workspace.current} prefer={prefer} align="start" gap={8} role="group" data-compact-floating
        ownedElements={[primaryChrome, workspace.current?.querySelector(`[data-compact-target="${subject}"]`) ?? null]} onDismiss={reason=>{if(reason==='escape') workspace.current?.querySelector<HTMLElement>(`[data-compact-target="${subject}"]`)?.focus({preventScroll:true});select('idle');}}>
        <Toolbar elementRef={primaryChrome} variant="compact" label="선택한 대상 예시 도구" data-compact-primary data-compact-subject={subject}>
          {subject==='text'?<>
            <ToolbarGroup id="style"><ChoiceSelect portalContainer={primaryChrome} value={style} ariaLabel="스타일 예시" options={[{id:'body',label:'본문'},{id:'heading',label:'제목'}]} onChange={setStyle} /></ToolbarGroup>
            <ToolbarToggle id="bold-example" label="굵게 예시" state={bold?'on':'off'} onActivate={()=>setBold(v=>!v)}><Icon name="bold" /></ToolbarToggle>
            <ToolbarToggle id="italic-example" label="기울임 예시" state={italic?'on':'off'} onActivate={()=>setItalic(v=>!v)}><Icon name="italic" /></ToolbarToggle>
            <SecondaryPopup triggerLabel="링크 예시" triggerIcon={<Icon name="type-url" />} label="링크 입력 예시" keepMounted><DraftField value={linkDraft} onChange={setLinkDraft} /></SecondaryPopup>
            <ColorPalette id="compact-text-color" label="글 색 예시" icon={<Icon name="font-color" />} value={color} swatches={[{value:'#1456cc',label:'파랑'},{value:'#c53c4a',label:'빨강'},{value:'#20252d',label:'잉크'}]} onPick={setColor} />
          </>:subject==='object'?<>
            <NumberField className="compact-example-width" prefix="W" value={width} ariaLabel="객체 너비 예시" onCommit={v=>v!=null&&setWidth(v)} min={32} suffix="px" />
            <ToolbarToggle id="object-fit" label="맞춤 예시" state="off" onActivate={()=>setLast('객체 맞춤 예시')}><Icon name="zoom-fit" /></ToolbarToggle>
          </>:<>
            <ToolbarGroup id="table-align">{['left','center','right'].map(value=><ToolbarToggle key={value} id={`align-${value}`} label={`표 ${value} 정렬 예시`} state={align===value?'on':'off'} onActivate={()=>setAlign(value)}><Icon name={value==='left'?'align-left':value==='center'?'align-center':'align-right'} /></ToolbarToggle>)}</ToolbarGroup>
          </>}
          <SecondaryPopup triggerLabel="추가 서식 예시" label="추가 서식 입력 예시" open={moreOpen} onOpenChange={setMoreOpen} className="compact-example-more" keepMounted>{owner=><>
            <div className="compact-example-popup-title">{subject==='text'?'글':subject==='table'?'표 셀':'객체'} · 추가 도구</div>
            <DraftFields owner={owner} subject={subject} linkDraft={linkDraft} onLinkDraft={setLinkDraft} height={height} onHeight={setHeight} rows={rows} onRows={setRows} />
            <div className="compact-example-popup-actions"><span>선택한 대상 작업</span><SecondaryPopup triggerLabel="추가 작업 예시" triggerIcon={<Icon name="copy" />} label="추가 작업 메뉴 예시" variant="menu" open={actionOpen} onOpenChange={setActionOpen}>
              <MenuAction onClick={()=>{setLast('선택 복사 예시');setActionOpen(false);setMoreOpen(false);}}>선택 복사 예시</MenuAction>
              <MenuAction onClick={()=>{setLast('선택 제거 예시');setActionOpen(false);setMoreOpen(false);}}>선택 제거 예시</MenuAction>
            </SecondaryPopup></div>
          </>}</SecondaryPopup>
        </Toolbar>
      </FloatingSurface>}
    </div>}
    {product==='slides'&&<p className="compact-example-command" data-compact-last-command aria-live="polite">마지막 예시 명령: {last}</p>}
  </div>;
}
function DraftField({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  return <label>미적용 링크 초안<input className="office-field" aria-label="미적용 링크 초안" value={value} onChange={e=>onChange(e.currentTarget.value)} /></label>;
}
function DraftFields({owner,subject,linkDraft,onLinkDraft,height,onHeight,rows,onRows}:{owner:RefObject<HTMLElement|null>;subject:Subject;linkDraft:string;onLinkDraft:(value:string)=>void;height:number;onHeight:(n:number)=>void;rows:number;onRows:(n:number)=>void}) {
  const [font,setFont]=useState('original'),[secondaryColor,setSecondaryColor]=useState<string|null>(null);
  return <div className="compact-example-fields">
    {subject==='text'&&<>
    <DraftField value={linkDraft} onChange={onLinkDraft} />
    <ChoiceSelect portalContainer={owner} ariaLabel="추가 글꼴 예시" value={font} onChange={setFont} options={[{id:'original',label:'기본 글꼴'},{id:'other',label:'다른 글꼴'}]} />
    <ColorPalette id="secondary-colour" label="추가 색 예시" icon={<Icon name="font-color" />} value={secondaryColor} swatches={[{value:'#1456cc',label:'파랑'},{value:'#c53c4a',label:'빨강'}]} onPick={setSecondaryColor} />
    </>}
    {subject==='object'&&<label>객체 높이<NumberField value={height} ariaLabel="객체 높이 예시" onCommit={v=>v!=null&&onHeight(v)} suffix="px" /></label>}
    {subject==='table'&&<Button onClick={()=>onRows(rows+1)}>행 추가 예시</Button>}
    <Button disabled>사용 불가 작업 예시</Button>
  </div>;
}
function DetailFields({disabled}:{disabled:boolean}) {
  const [value,setValue]=useState(1);
  return <div className="compact-example-fields">
    <div className="compact-example-popup-title">문서 상세 도구</div>
    <label>간격<NumberField value={value} ariaLabel="상세 간격 예시" disabled={disabled} onCommit={v=>v!=null&&setValue(v)} /></label>
    <Button disabled={disabled} onClick={()=>setValue(v=>v+1)}>간격 늘리기 예시</Button>
    <span>상세 도구를 열어도 본문 시작 위치는 같습니다.</span>
  </div>;
}
