import { useEffect, useRef, useState } from 'react';
import { documentLibrary, type LibraryRow } from '@barocss/shared';
import { readNoteSnapshotFile } from '@barocss/office-note/file';
import { Button } from '@barocss/office-ui';

export interface ServerLocalNoteCopyProps {
  disabled: boolean;
  onSelect: (source: { name: string; snapshotText: string }) => void;
}

const localNotes = documentLibrary({ db: 'barocss-note', store: 'documents' });
const titleOf = (row: LibraryRow) => row.title || '제목 없는 노트';

/** Local records are inspected only after the reader explicitly requests the list. */
export function ServerLocalNoteCopy({ disabled, onSelect }: ServerLocalNoteCopyProps) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<LibraryRow[]>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [prepared, setPrepared] = useState('');
  const request = useRef(0);
  const pending = useRef(false);
  const unavailable = useRef(disabled);
  unavailable.current = disabled;

  useEffect(() => {
    if (disabled) {
      request.current++;
      pending.current = false;
      setExpanded(false);
      setRows(undefined);
      setBusy(false);
      setProblem('');
      setPrepared('');
    }
    return () => { request.current++; };
  }, [disabled]);

  const begin = () => {
    if (unavailable.current || pending.current) return null;
    pending.current = true;
    setBusy(true);
    setProblem('');
    setPrepared('');
    return ++request.current;
  };
  const current = (token: number) => request.current === token && !unavailable.current;
  const finish = (token: number) => {
    if (!current(token)) return;
    pending.current = false;
    setBusy(false);
  };

  const list = async () => {
    const token = begin();
    if (token === null) return;
    setRows(undefined);
    try {
      const found = await localNotes.rows();
      if (current(token)) setRows(found);
    } catch {
      if (current(token)) setProblem('로컬 노트 목록을 읽지 못했습니다. 브라우저의 저장소 접근을 확인하세요.');
    } finally { finish(token); }
  };

  const select = async (row: LibraryRow) => {
    const token = begin();
    if (token === null) return;
    try {
      const source = await localNotes.read(row.name);
      if (!current(token)) return;
      if (!source) {
        setProblem('이 로컬 노트가 없습니다. 목록을 다시 확인하세요.');
        return;
      }
      const read = readNoteSnapshotFile(source.text);
      if ('error' in read) {
        setProblem(`이 로컬 노트의 사본을 준비할 수 없습니다. ${read.error}`);
        return;
      }
      onSelect({ name: source.row.name, snapshotText: source.text });
      setPrepared(`${read.document.attributes.title || '제목 없는 노트'} 사본을 준비했습니다. 서버 저장은 아직 확인되지 않았습니다.`);
    } catch {
      if (current(token)) setProblem('로컬 노트를 읽지 못했습니다. 원본은 이 기기에 유지됩니다.');
    } finally { finish(token); }
  };

  return <div data-server-local-note-copy>
    <Button disabled={disabled || busy} onClick={() => setExpanded(value => !value)}>
      로컬 노트 사본 가져오기
    </Button>
    {expanded && !disabled && <section aria-label="로컬 노트 사본 가져오기">
      <p>이 브라우저의 로컬 노트에는 이전 사용자의 자료가 있을 수 있습니다. 본인이 사용할 수 있는 노트만 선택하세요.</p>
      <p>로컬 원본은 유지합니다. 다른 페이지의 참조는 바꾸지 않습니다. 선택만으로 서버에 업로드하지 않습니다.</p>
      <Button disabled={busy} onClick={() => { void list(); }}>이 기기의 로컬 노트 목록 확인</Button>
      {busy && <p role="status">로컬 노트를 확인하고 있습니다.</p>}
      {problem && <p role="alert">{problem}</p>}
      {prepared && <p role="status">{prepared}</p>}
      {rows?.length === 0 && <p>이 기기에 저장된 로컬 노트가 없습니다.</p>}
      {!!rows?.length && <ul>{rows.map(row => <li key={row.name}>
        <Button disabled={busy} onClick={() => { void select(row); }}>서버 사본 준비 {titleOf(row)}</Button>
      </li>)}</ul>}
    </section>}
  </div>;
}
