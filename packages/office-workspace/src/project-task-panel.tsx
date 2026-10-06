import { useState } from 'react';
import { Button, useOfficeLocale } from '@barocss/office-ui';
import type { ProjectRecord } from '@barocss/shared';
import type { ProjectDocument, ProjectRepository } from './project-ui';
import { ConnectedWorkControl } from './connected-work-control';

/** A presentation of existing work/comment/pin IDs, not a second task store. */
export function ProjectTaskPanel({ record, revision, repository, documents, busy, onOpen }: {
  record: ProjectRecord; revision: number; repository: ProjectRepository; documents: ProjectDocument[]; busy: boolean;
  onOpen(document: ProjectDocument): void;
}) {
  const { t } = useOfficeLocale();
  const [selectedId, setSelectedId] = useState<string>();
  const notes = record.results.filter(result => result.document.product === 'note');
  const tasks = record.works.filter(work => record.comments.some(comment => comment.id === work.commentId && comment.pin.document.product === 'note'));
  // Always resolve the selected ID in the current authorized record. A stale ID
  // cannot name a work or original in another project/account generation.
  const partialRequests = record.comments.filter(comment => comment.pin.document.product === 'note' && !tasks.some(work => work.commentId === comment.id));
  const selected = tasks.find(work => work.id === selectedId);
  const comment = record.comments.find(one => one.id === selected?.commentId);
  const original = comment && documents.find(one => one.product === 'note' && one.id === comment.pin.document.id && !one.unavailable);
  if (!notes.length && !tasks.length) return null;
  return <section className="ow-note-tasks" aria-label={t('workspace.task.list')}>
    <header><div><h2>{t('workspace.task.list')}</h2><p>{t('workspace.task.listDescription')}</p></div></header>
    <div className="ow-note-task-layout"><div className="ow-note-task-list">
      {!tasks.length && <p>{t('workspace.task.empty')}</p>}
      {tasks.map(work => <Button key={work.id} tone="quiet" pressed={selectedId === work.id} disabled={busy}
        onClick={() => setSelectedId(work.id)}><span>{work.request}<small>{t(work.state === 'paused' ? 'workspace.task.paused' : 'workspace.task.recorded')}</small></span></Button>)}
      {partialRequests.map(comment => {
        const source = documents.find(one => one.product === 'note' && one.id === comment.pin.document.id && !one.unavailable);
        return <Button key={comment.id} tone="quiet" disabled={busy || !source} onClick={() => source && onOpen(source)}>
          <span>{comment.body}<small>{t('workspace.task.partialRequest')}</small></span></Button>;
      })}
      <details><summary>{t('workspace.task.new')}</summary><p>{t('workspace.task.captureDescription')}</p>
        {notes.map(result => {
          const source = documents.find(one => one.product === 'note' && one.id === result.document.id && !one.unavailable);
          return <Button key={result.id} disabled={busy || !repository.writable || record.archived || !source}
            onClick={() => source && onOpen(source)}>{result.name}</Button>;
        })}</details>
    </div><div className="ow-note-task-detail">
      {selected && comment ? <><h3>{selected.request}</h3><blockquote>{comment.target.quote}</blockquote>
        <p>{comment.pin.title} · {t('workspace.task.version')} {comment.pin.revision}</p>
        <p>{t('workspace.task.originalDescription')}</p>
        <Button disabled={busy || !original} onClick={() => original && onOpen(original)}>{t('workspace.task.openOriginal')}</Button>
        <ConnectedWorkControl key={selected.id} repository={repository} project={record.id} work={selected.id}
          revision={revision} product="note" results={record.results} />
        {selected.state === 'paused' && <p role="status">{t('workspace.task.paused')}</p>}
      </> : <p>{t('workspace.task.choose')}</p>}
    </div></div>
  </section>;
}
