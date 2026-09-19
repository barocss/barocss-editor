import { useState } from 'react';
import { FileDropZone, FileItem, MediaSelect, PropertyToggle } from '@barocss/office-ui';

const swatch = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" rx="8" fill="${color}"/></svg>`)}`;
export function FileSpecimens() {
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [failure, setFailure] = useState(false);
  const [media, setMedia] = useState('cover');
  return <>
    <div className="ds-search-examples"><div>
      <FileDropZone label="예시 그림 파일" accept="image/png,image/jpeg,image/webp,image/gif" maxBytes={1024 * 1024} hint="PNG, JPEG, WebP, GIF · 최대 1MB" disabled={disabled} onPick={async picked => {
        if (failure) throw new Error('파일을 처리하지 못했습니다. 다시 선택하세요.');
        setFile(picked); setCount(value => value + 1);
      }} />
      {file && <FileItem name={file.name} bytes={file.size} disabled={disabled} onRemove={() => setFile(null)} />}
      <p role="status">파일 처리 횟수: {count}</p>
    </div><div><h3>문서 이미지</h3>
      <MediaSelect ariaLabel="예시 문서 이미지" value={media} onChange={setMedia} disabled={disabled} options={[
        { id: 'cover', label: '제품 소개 표지', src: swatch('#2563eb'), description: '160 × 90' },
        { id: 'chart', label: '팀 실적 차트', src: swatch('#15803d'), description: '160 × 90' },
        { id: 'missing', label: '미리보기를 읽을 수 없는 이미지', src: 'data:image/png;base64,invalid', description: '원본 참조 유지' },
      ]} />
    </div></div>
    <div className="ds-selection-controls"><PropertyToggle ariaLabel="파일 UI 비활성" label="비활성" value={disabled} onChange={setDisabled} /><PropertyToggle ariaLabel="파일 처리 실패 예시" label="처리 실패 예시" value={failure} onChange={setFailure} /></div>
    <p>파일 선택과 드래그는 같은 형식·크기 검사를 사용합니다. 같은 파일을 다시 선택할 수 있습니다. 문서 이미지는 원본 참조를 선택하며 파일을 업로드하지 않습니다.</p>
  </>;
}
