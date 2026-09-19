import { useRef, useState } from 'react';
import { Button, FileItem, FilePick, SearchSelect, StatusIndicator, StatusNotice, type SearchOption } from '@barocss/office-ui';

/** Asset ownership and decoding stay in Site; the controls share the Office UI. */
export function PictureProperty({ value, options, ariaLabel, disabled, onSelect, onPick }: {
  value: string;
  options: SearchOption[];
  ariaLabel: string;
  disabled: boolean;
  onSelect: (id: string) => Promise<unknown>;
  onPick: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File>();
  const [retry, setRetry] = useState<(() => Promise<unknown>)>();
  const pending = useRef(false);
  const apply = async (action: () => Promise<unknown>) => {
    if (disabled || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setRetry(undefined);
    try {
      if (await action() === false) throw new Error('그림을 적용하지 못했습니다. 대상을 확인하고 다시 시도하세요.');
      setFile(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '파일을 읽지 못했습니다. 다시 시도하세요.');
      setRetry(() => action);
    } finally { pending.current = false; setBusy(false); }
  };
  return <div className="st-picture-property">
    <SearchSelect ariaLabel={ariaLabel} value={value} options={options} disabled={disabled || busy}
      onChange={id => { setFile(undefined); void apply(() => onSelect(id)); }} />
    <FilePick accept="image/*" ariaLabel="그림 파일 넣기" disabled={disabled || busy}
      onPick={next => { setFile(next); void apply(() => onPick(next)); }}>파일 넣기</FilePick>
    {file && <FileItem name={file.name} bytes={file.size} />}
    {busy && <StatusIndicator busy>그림을 적용하고 있습니다.</StatusIndicator>}
    {error && <StatusNotice tone="danger" title="그림을 적용하지 못했습니다"
      actions={retry && <Button disabled={disabled || busy} onClick={() => void apply(retry)}>다시 시도</Button>}>{error}</StatusNotice>}
  </div>;
}
