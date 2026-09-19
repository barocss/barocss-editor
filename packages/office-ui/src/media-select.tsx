import { useState } from 'react';
import { SearchSelect } from './search-select';

export interface MediaOption { id: string; label: string; src: string; description?: string }

function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="office-media-missing">미리보기 없음</span> : <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** Select an existing document asset. It does not upload or copy it. */
export function MediaSelect({ options, value, onChange, ariaLabel, disabled }: {
  options: MediaOption[]; value: string; onChange: (id: string) => void; ariaLabel: string; disabled?: boolean;
}) {
  const selected = options.find(option => option.id === value);
  return <div className="office-media-select">
    {selected && <div className="office-media-preview" aria-label={`${selected.label} 미리보기`}><Thumbnail key={selected.src} src={selected.src} /></div>}
    <SearchSelect ariaLabel={ariaLabel} value={value} onChange={onChange} disabled={disabled} placeholder="이미지 선택" options={[
      { id: '', label: '없음' },
      ...options.map(option => ({ ...option, leading: <span className="office-media-thumbnail"><Thumbnail key={option.src} src={option.src} /></span> })),
    ]} />
  </div>;
}
