import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, FilePick, TaskStatus, TaskStatusRegion, type TaskPhase } from '@barocss/office-ui';

/**
 * **Saving a document to a file, opening one, and starting a new one** — for any product.
 *
 * ## What was here before
 *
 * `office-slides` wrote this first as `file-actions.tsx`, 183 lines, and it is good. Reading it,
 * four things in it are about **decks**: how a deck's title is found, which file format to use,
 * what a new deck *is*, and the string `'slides'` handed to `loadDocument`. Everything else — the
 * blob, the anchor, Safari's revoke, asking only when there is work to lose, showing the refusal
 * a reader can act on — is true of every document this engine holds.
 *
 * Word had none of it. `apps/word/src/main.tsx` loaded the sample on every reload, so a reader
 * could write a page and it was gone when they came back. The roadmap's diagram said the rest:
 * **`[ 서비스 ] 거의 비어 있다`**.
 *
 * ## Why the browser's own download and no dialog of ours
 *
 * An `<a download>` with a blob is the whole of saving in a web app: the browser asks where,
 * remembers the folder, and shows the file in its own downloads list. A dialog of ours would be a
 * second, worse version of a thing the reader already knows — and the File System Access API,
 * which *would* give a real "save over the file I opened", is Chromium-only. Worth adding behind a
 * check later; not worth being the only way to save.
 *
 * ## Opening replaces the document, so it asks first
 *
 * `loadDocument` is not an edit — it is a new document, and it takes the history with it, so there
 * is no undo back to what was on screen. That is the one thing here a reader could lose work to,
 * so it asks, and **only when there is work**: a reader who has changed nothing is not made to
 * confirm anything.
 */

/** The three acts, handed to whoever drew the control that asks for them. */
export interface DocumentFileActions {
  create: () => void;
  save: () => void;
  /** Ask the browser for a file. The reading happens here when one comes back. */
  open: () => void;
}

/** What a product says about its own documents. Four things, and they are the four that differ. */
export interface DocumentFileKind {
  /** `loadDocument`'s session id — `'word'`, `'slides'`. */
  session: string;
  /** The file's text, from an exported tree. */
  text: (document: unknown, savedAt?: string) => string;
  /** Reading one, and saying which of the four things is wrong with it. */
  read: (source: string) => { document: unknown; version: number } | { error: string };
  /** What a reader sees in their downloads folder, from what the document is called. */
  fileName: (editor: Editor) => string;
  /** What a new document *is* — a fact about documents, not about this chrome. */
  starter: () => unknown;
  /** The accepted extensions for the picker, as an `accept` attribute. */
  accept?: string;
  /** What the picker calls the file, for a screen reader — 슬라이드 파일, 문서 파일. */
  ariaLabel?: string;
  /** The product's class prefix for the file picker container. */
  prefix?: string;
}

export interface FileActionsProps {
  editor: Editor | null;
  kind: DocumentFileKind;
  onOpened?: () => void;
  /** Publish mounted child editors into the document before taking the file snapshot. */
  beforeSave?: () => boolean | void | Promise<boolean | void>;
  /** Optional product confirmation. False means cancellation, not a save failure. */
  confirmReplace?: () => boolean | Promise<boolean>;
  beforeReplace?: () => Promise<boolean>;
  ref?: Ref<DocumentFileActions>;
}

/**
 * The picker, and nothing else drawn.
 *
 * A **ref** rather than three props passed down, because the thing that has to stay mounted is the
 * picker's hidden input: a file cannot be handed to a browser by any amount of clicking a button,
 * so the input has to exist in the DOM whether or not there is a button beside it. Where the
 * reader *asks* — a menubar, a toolbar — is the product's, and that is exactly what an imperative
 * handle is for.
 */
export function FileActions({ editor, kind, onOpened, beforeSave, confirmReplace, beforeReplace, ref }: FileActionsProps) {
  type Task = { phase: TaskPhase; title: string; description: string; action: 'save' | 'open' | 'create' };
  const [task, setTask] = useState<Task>();
  const [picker, setPicker] = useState<HTMLInputElement | null>(null);
  const busy = useRef(false);
  const currentEditor = useRef(editor);
  currentEditor.current = editor;

  // The ref closes the gap before React commits the disabled state.
  const begin = (action: Task['action'], title: string, description: string) => {
    if (!editor || busy.current) return false;
    busy.current = true;
    setTask({ action, phase: 'running', title, description });
    return true;
  };
  const fail = (action: Task['action'], error: unknown) => setTask({ action, phase: 'error', title: '파일 작업 실패',
    description: error instanceof Error ? error.message : '파일을 처리하지 못했습니다. 다시 시도하세요.' });
  const guardDocument = (rootId: string | undefined) => {
    if (currentEditor.current !== editor || editor?.getRootId?.() !== rootId) throw new Error('작업 중 문서가 변경되었습니다. 현재 문서에서 다시 시도하세요.');
  };
  const mayReplace = async () => {
    if (confirmReplace && !await confirmReplace()) return false;
    if (beforeReplace) {
      if (!await beforeReplace()) throw new Error('현재 자료를 저장하지 못했습니다. 다시 시도하세요.');
      return true;
    }
    if (await beforeSave?.() === false) throw new Error('마지막 입력을 반영하지 못했습니다.');
    return confirmReplace ? true : !editor?.canUndo() || window.confirm('저장하지 않은 변경이 사라집니다. 계속할까요?');
  };
  const save = async () => {
    if (!begin('save', '파일 준비 중', '현재 문서의 마지막 입력을 반영합니다.')) return;
    const rootId = editor?.getRootId?.();
    try {
      if (await beforeSave?.() === false) throw new Error('마지막 입력을 반영하지 못했습니다. 다시 저장하세요.');
      guardDocument(rootId);
      const tree = editor!.exportDocument();
      if (!tree) throw new Error('출력할 문서를 찾지 못했습니다.');
      const name = kind.fileName(editor!);
      const text = kind.text(tree, new Date().toISOString());
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      try {
        const link = document.createElement('a');
        link.href = url; link.download = name; link.click();
      } finally {
        // Safari must be allowed to start reading the blob before it is revoked.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setTask({ action: 'save', phase: 'success', title: '다운로드 요청됨', description: `${name} · 완료 여부는 브라우저 다운로드 목록에서 확인하세요.` });
    } catch (error) { fail('save', error); }
    finally { busy.current = false; }
  };
  const openFile = async (file: File) => {
    if (!begin('open', '파일 읽는 중', file.name)) return;
    const rootId = editor?.getRootId?.();
    try {
      const read = kind.read(await file.text());
      guardDocument(rootId);
      if ('error' in read) throw new Error(read.error);
      if (!await mayReplace()) { setTask({ action: 'open', phase: 'cancelled', title: '파일 열기 취소됨', description: '현재 문서를 유지합니다.' }); return; }
      guardDocument(rootId);
      editor!.loadDocument(read.document, kind.session);
      onOpened?.();
      setTask({ action: 'open', phase: 'success', title: '파일 열기 완료', description: file.name });
    } catch (error) { fail('open', error); }
    finally { busy.current = false; }
  };
  const create = async () => {
    if (!begin('create', '새 문서 준비 중', '현재 문서의 변경 사항을 확인합니다.')) return;
    const rootId = editor?.getRootId?.();
    try {
      if (!await mayReplace()) { setTask({ action: 'create', phase: 'cancelled', title: '새 문서 만들기 취소됨', description: '현재 문서를 유지합니다.' }); return; }
      guardDocument(rootId);
      editor!.loadDocument(kind.starter(), kind.session);
      onOpened?.();
      setTask({ action: 'create', phase: 'success', title: '새 문서 준비 완료', description: '문서를 편집할 수 있습니다.' });
    } catch (error) { fail('create', error); }
    finally { busy.current = false; }
  };
  const open = () => { if (!busy.current) picker?.click(); };
  useImperativeHandle(ref, () => ({ create, save, open }));
  const prefix = kind.prefix ?? 'w';
  return <>
    <span className={`${prefix}-file-picker`} ref={host => setPicker(host?.querySelector('input') ?? null)}>
      <FilePick title="파일 열기" accept={kind.accept ?? '.json,application/json'} ariaLabel={kind.ariaLabel ?? '문서 파일'}
        disabled={!editor || task?.phase === 'running'} onPick={file => void openFile(file)}>열기</FilePick>
    </span>
    {task && <TaskStatusRegion label="파일 작업 상태">
      <TaskStatus title={task.title} phase={task.phase} description={task.description} onDismiss={() => setTask(undefined)}
        actions={task.phase === 'error' ? <Button tone="quiet" onClick={task.action === 'save' ? () => void save() : task.action === 'open' ? open : () => void create()}>{task.action === 'open' ? '다른 파일 선택' : '다시 시도'}</Button> : undefined} />
    </TaskStatusRegion>}
  </>;
}
