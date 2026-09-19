import { useId, useState } from 'react';
import { Choice, RibbonTabs, PanelHeader } from '@barocss/office-ui';
import { Filmstrip, type FilmstripProps } from './filmstrip';
import { LayerPanel } from './layer-panel';

/** Deck navigation and object navigation share one stable workspace column. */
export function SlideSidebar(props: FilmstripProps & { editingSlide?: string }) {
  const [tab, setTab] = useState<'slides' | 'layers'>('slides');
  const panelId = useId();
  return (
    <aside className="sl-sidebar" aria-label="슬라이드 탐색">
      <PanelHeader title="탐색" />
      <RibbonTabs label="탐색 방식" value={tab} onChange={setTab} panelId={panelId}
        variant="panel" options={[{ id: 'slides', label: '슬라이드' }, { id: 'layers', label: '레이어' }]} />
      <div className="sl-sidebar-context">
        {tab === 'slides' ? <span>전체 슬라이드 <strong>{props.slides.length}</strong></span> :
          <Choice ariaLabel="레이어를 볼 슬라이드" value={props.editingSlide ?? props.current ?? ''} onChange={props.onSelect}>
            {props.slides.map(slide => <option key={slide.sid} value={slide.sid}>
              {slide.number} · {slide.name || '제목 없음'}
            </option>)}
          </Choice>}
      </div>
      <div className="sl-sidebar-content" id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${tab}`}>
        <div className="sl-sidebar-page" hidden={tab !== 'slides'}>
          <Filmstrip {...props} thumbnailWidth={176} />
        </div>
        <div className="sl-sidebar-page" hidden={tab !== 'layers'}>
          <LayerPanel editor={props.editor} slideSid={props.editingSlide ?? props.current} open embedded onToggle={() => setTab('slides')} />
        </div>
      </div>
    </aside>
  );
}
