import { isNotePageId, noteFileText, readNoteFile, type NoteDocument } from '@barocss/office-note';
import type { LibraryKeepItem, LibrarySnapshot } from '@barocss/shared';
import { pageMeta, type PageMeta } from './workspace-library';

export const MAX_WORKSPACE_BACKUP_BYTES = 100 * 1024 * 1024;
export interface BackupEntry { id: string; title: string; text: string; savedAt: number; metadata?: Record<string, unknown> }
export interface WorkspaceBackup { format: 'barocss-note-workspace'; version: 1; createdAt: string; pages: BackupEntry[]; drafts: BackupEntry[] }
export interface RestorePage {
  id: string; originalId: string; title: string; kind: 'page' | 'draft'; copied: boolean;
  document?: NoteDocument; reason?: string; meta: PageMeta;
}
export interface WorkspaceRestorePlan {
  writes: LibraryKeepItem[]; pages: RestorePage[]; copied: number; unreadable: number; repairedParents: number;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const archiveEntry = ({ row, text }: LibrarySnapshot): BackupEntry => ({ id: row.name, title: row.title ?? '', savedAt: row.savedAt, ...(row.metadata ? { metadata: row.metadata } : {}), text });

/** Original bytes are included even when a newer app cannot currently open one of the pages. */
export function workspaceBackupText(pages: LibrarySnapshot[], drafts: LibrarySnapshot[] = [], now = new Date()): string {
  return JSON.stringify({ format: 'barocss-note-workspace', version: 1, createdAt: now.toISOString(), pages: pages.map(archiveEntry), drafts: drafts.map(archiveEntry) } satisfies WorkspaceBackup, null, 2);
}
export function readWorkspaceBackup(source: string): { backup: WorkspaceBackup } | { error: string } {
  if (source.length > MAX_WORKSPACE_BACKUP_BYTES || new TextEncoder().encode(source).byteLength > MAX_WORKSPACE_BACKUP_BYTES) return { error: '백업 파일은 100MB 이하로 열 수 있습니다.' };
  let value: unknown;
  try { value = JSON.parse(source); } catch { return { error: '백업 파일의 JSON을 읽을 수 없습니다.' }; }
  if (!object(value) || value.format !== 'barocss-note-workspace' || value.version !== 1) return { error: '지원하는 Note 보관함 백업 파일이 아닙니다.' };
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return { error: '백업 생성 날짜가 올바르지 않습니다.' };
  const validEntries = (entries: unknown): entries is BackupEntry[] => {
    if (!Array.isArray(entries) || entries.length > 10000) return false;
    const seen = new Set<string>();
    return entries.every(entry => {
      if (!object(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 512 || seen.has(entry.id)
        || typeof entry.title !== 'string' || typeof entry.text !== 'string' || typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)
        || entry.metadata !== undefined && !object(entry.metadata)) return false;
      seen.add(entry.id); return true;
    });
  };
  if (!validEntries(value.pages) || !validEntries(value.drafts)) return { error: '페이지 목록이 올바르지 않거나 중복된 ID가 있습니다. 원본 백업을 확인하세요.' };
  return { backup: value as unknown as WorkspaceBackup };
}
function remapDocument(document: NoteDocument, id: string, ids: ReadonlyMap<string, string>): NoteDocument {
  const copy = structuredClone(document);
  copy.attributes.pageId = id;
  const visit = (value: unknown) => {
    if (!object(value)) return;
    if (value.stype === 'pageReference' && object(value.attributes) && typeof value.attributes.pageId === 'string') {
      value.attributes.pageId = ids.get(value.attributes.pageId) ?? value.attributes.pageId;
    }
    if (Array.isArray(value.content)) value.content.forEach(visit);
  };
  visit(copy); return copy;
}

/** Plan first, then insert every page atomically. Existing identities are never overwrite targets. */
export function planWorkspaceRestore(backup: WorkspaceBackup, existing: ReadonlySet<string>, createId: () => string = () => crypto.randomUUID()): WorkspaceRestorePlan {
  // Reserve every incoming identity too: a generated copy may not steal a later page's ID.
  const entries = [...backup.pages, ...backup.drafts];
  const parsed = new Map(entries.map(entry => {
    try { return [entry, readNoteFile(entry.text)] as const; }
    catch { return [entry, { error: '이 페이지를 해석하지 못했습니다. 원본 파일은 보존됩니다.' }] as const; }
  }));
  const declaredIds = entries.flatMap(entry => { const value = parsed.get(entry)!; return 'document' in value && value.document.attributes.pageId ? [value.document.attributes.pageId] : []; });
  const taken = new Set([...existing, ...entries.map(page => page.id), ...declaredIds]);
  const fresh = () => {
    for (let attempt = 0; attempt < 100; attempt++) { const id = createId(); if (isNotePageId(id) && !taken.has(id)) { taken.add(id); return id; } }
    throw new Error('복원할 페이지 ID를 만들지 못했습니다. 다시 시도하세요.');
  };
  const ids = new Map(backup.pages.map(page => [page.id, existing.has(page.id) || !isNotePageId(page.id) ? fresh() : page.id]));
  const pages: RestorePage[] = [], writes: LibraryKeepItem[] = [];
  let repairedParents = 0;
  for (const kind of ['page', 'draft'] as const) for (const entry of kind === 'page' ? backup.pages : backup.drafts) {
    const id = kind === 'page' ? ids.get(entry.id)! : fresh();
    const read = parsed.get(entry)!;
    const rawMeta = kind === 'draft' && object(entry.metadata?.page) ? entry.metadata.page : entry.metadata;
    const meta = pageMeta(rawMeta, entry.savedAt);
    // Missing parents in a portable backup cannot silently attach to an unrelated existing page.
    if (kind === 'page' && meta.parentId && !ids.has(meta.parentId)) repairedParents += 1;
    meta.parentId = meta.parentId ? ids.get(meta.parentId) ?? null : null;
    if (kind === 'draft') { meta.trashedAt = null; meta.parentId = null; }
    let title = entry.title || ('document' in read ? read.document.attributes.title : '제목 없는 노트');
    if (kind === 'draft') title = `${title} (백업에서 복구한 초안)`;
    let document: NoteDocument | undefined;
    if ('document' in read) {
      const references = new Map(ids);
      // A conflicting draft is restored as its own page; its self links follow that copy.
      if (kind === 'draft') {
        const originalId = typeof entry.metadata?.originalId === 'string' ? entry.metadata.originalId : read.document.attributes.pageId;
        if (originalId) references.set(originalId, id);
      }
      // The stored row owns identity. An obsolete document ID is a local self alias
      // only when no other archived page owns it; never steal a real cross-page link.
      const declared = read.document.attributes.pageId;
      if (declared && !ids.has(declared)) references.set(declared, id);
      document = remapDocument(read.document, id, references);
      if (kind === 'draft') document.attributes.title = title;
      else title = document.attributes.title;
    }
    pages.push({ id, originalId: entry.id, title, kind, copied: kind === 'page' && id !== entry.id, document, ...('error' in read ? { reason: read.error } : {}), meta });
    writes.push({ entry: { name: id, title, metadata: { ...rawMeta, ...meta } }, text: document ? noteFileText(document) : entry.text, expectedRevision: null });
  }
  const parents = new Map(pages.map(page => [page.id, page.meta.parentId]));
  pages.forEach((page, index) => {
    const seen = new Set([page.id]); let parent = parents.get(page.id);
    while (parent) {
      if (seen.has(parent) || !parents.has(parent)) { page.meta.parentId = null; repairedParents += 1; break; }
      seen.add(parent); parent = parents.get(parent);
    }
    writes[index].entry.metadata = { ...writes[index].entry.metadata, ...page.meta };
  });
  return { writes, pages, copied: pages.filter(page => page.copied).length, unreadable: pages.filter(page => page.reason).length, repairedParents };
}
