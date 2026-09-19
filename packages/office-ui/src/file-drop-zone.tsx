import { useId, useRef, useState } from 'react';
import { FilePick } from './file-pick';
import { Button } from './controls';
import { Icon } from '@barocss/office-icons';

export function fileSizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The browser picker and drop path share validation. Decoding belongs to the host. */
export function FileDropZone({ label, accept, maxBytes, hint, disabled = false, onPick }: {
  label: string; accept: string; maxBytes: number; hint: string; disabled?: boolean;
  onPick: (file: File) => void | Promise<void>;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const depth = useRef(0);
  const id = useId();
  const pick = async (files: File[]) => {
    if (disabled || pending.current || !files.length) return;
    setError('');
    if (files.length !== 1) { setError('파일을 하나씩 선택하세요.'); return; }
    const file = files[0];
    const permitted = accept.split(',').map(value => value.trim().toLowerCase()).filter(Boolean).some(type =>
      type.startsWith('.') ? file.name.toLowerCase().endsWith(type) : type.endsWith('/*') ? file.type.toLowerCase().startsWith(type.slice(0, -1)) : file.type.toLowerCase() === type);
    if (!permitted) { setError(`지원하지 않는 파일 형식입니다. ${hint}`); return; }
    if (!file.size) { setError('빈 파일은 사용할 수 없습니다.'); return; }
    if (file.size > maxBytes) { setError(`${fileSizeLabel(maxBytes)} 이하의 파일을 선택하세요.`); return; }
    pending.current = true; setBusy(true);
    try { await onPick(file); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '파일을 처리하지 못했습니다. 다시 선택하세요.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className="office-file-drop" data-dragging={over || undefined} data-disabled={disabled || busy || undefined} aria-busy={busy} role="group" aria-label={`${label} 놓기 영역`} aria-describedby={id}
    onDragEnter={event => { event.preventDefault(); event.stopPropagation(); if (!disabled && !pending.current && event.dataTransfer.types.includes('Files')) { depth.current++; setOver(true); } }}
    onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = disabled || busy ? 'none' : 'copy'; }}
    onDragLeave={event => { event.preventDefault(); event.stopPropagation(); if (--depth.current <= 0) { depth.current = 0; setOver(false); } }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); depth.current = 0; setOver(false); void pick(Array.from(event.dataTransfer.files)); }}>
    <strong>{busy ? '파일을 처리하고 있습니다' : '파일을 여기에 놓으세요'}</strong>
    <p id={id}>{hint}</p>
    <FilePick accept={accept} ariaLabel={label} disabled={disabled || busy} onPick={file => void pick([file])}>파일 선택</FilePick>
    {busy && <span role="status">처리 중…</span>}
    {error && <p role="alert" className="office-file-error">{error}</p>}
  </div>;
}

export function FileItem({ name, bytes, onRemove, disabled = false }: { name: string; bytes: number; onRemove?: () => void; disabled?: boolean }) {
  return <div className="office-file-item"><span><strong>{name}</strong><small>{fileSizeLabel(bytes)}</small></span>{onRemove && <Button square tone="quiet" ariaLabel={`${name} 제거`} disabled={disabled} onClick={event => { event.preventDefault(); onRemove(); }}><Icon name="close" size={14} /></Button>}</div>;
}
