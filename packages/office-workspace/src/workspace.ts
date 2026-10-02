import { createProjectRecord, readProjectRecord, documentLibrary, type ProjectDocument, type ProjectRecord, type ProjectSnapshot, type Pin, type LibraryRow, type LibrarySnapshot } from '@barocss/shared';
import { createSchema, validateTree, type SchemaDefinition } from '@barocss/schema';
import { isProduct, plainText, productCodec, productDraftStore, productKeys, products, productStore, referenceKey, setDocumentTitle, visitTree, type Product } from './products';

export interface WorkspaceMeta {
  favorite: boolean;
  folder: string;
  trashedAt: number | null;
  openedAt: number;
  references: string[];
  copiedFrom?: string;
}
export interface WorkspaceDocument extends WorkspaceMeta {
  product: Product;
  id: string;
  key: string;
  title: string;
  savedAt: number;
  searchText: string;
  error?: string;
}
export interface BackupDocument { product: Product; row: LibraryRow; text: string; meta: WorkspaceMeta; }
export interface WorkspaceBackup { format: 'wonffice-workspace'; version: 1; workspace: string; createdAt: string; documents: BackupDocument[]; projects?: ProjectRecord[]; }
const defaults = (): WorkspaceMeta => ({ favorite: false, folder: '', trashedAt: null, openedAt: 0, references: [] });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function metadata(value: unknown): WorkspaceMeta {
  const v = object(value) ? value : {};
  return { favorite: v.favorite === true, folder: typeof v.folder === 'string' ? v.folder : '',
    trashedAt: typeof v.trashedAt === 'number' && Number.isFinite(v.trashedAt) ? v.trashedAt : null,
    openedAt: typeof v.openedAt === 'number' && Number.isFinite(v.openedAt) ? v.openedAt : 0,
    references: Array.isArray(v.references) ? [...new Set(v.references.filter((r): r is string => typeof r === 'string'))] : [],
    ...(typeof v.copiedFrom === 'string' ? { copiedFrom: v.copiedFrom } : {}) };
}
export function workspaceIdentity(): string {
  const key = 'wonffice.local-workspace';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}
export async function readProductDocument(product: Product, text: string) {
  const codec = await productCodec(product);
  const parsed = codec.read(text);
  if ('error' in parsed) throw new Error(parsed.error);
  const issues = validateTree(createSchema(`workspace-${product}`, codec.schema() as SchemaDefinition), parsed.document as never);
  if (issues.length) throw new Error(`지원하지 않는 ${products[product].label} 내용: ${issues[0].path}`);
  return { codec, document: parsed.document };
}

/** Catalog metadata has its own revisions, so starring a file cannot overwrite editor content. */
export class OfficeWorkspace {
  readonly metaStore: ReturnType<typeof documentLibrary>;
  constructor(readonly id: string) { this.metaStore = documentLibrary({ db: `wonffice-workspace-${id}`, store: 'catalog' }); }

  /** Project rows share the catalog; no product document is copied or replaced. */
  async projects(): Promise<ProjectSnapshot[]> {
    return (await this.metaStore.snapshots()).filter(s => s.row.name.startsWith('project:')).map(s => {
      const record = readProjectRecord(JSON.parse(s.text));
      if (s.row.name !== `project:${record.id}`) throw new Error('Project identity does not match its catalog row.');
      return { record, revision: s.row.revision ?? 0 };
    });
  }
  async project(id: string): Promise<ProjectSnapshot | null> {
    const snapshot = await this.metaStore.read(`project:${id}`);
    if (!snapshot) return null;
    const record = readProjectRecord(JSON.parse(snapshot.text));
    if (record.id !== id) throw new Error('Project identity does not match its catalog row.');
    return { record, revision: snapshot.row.revision ?? 0 };
  }
  async createProject(title: string, goal: string): Promise<ProjectSnapshot> {
    const record = createProjectRecord(title, goal);
    const row = await this.metaStore.keep({ name: `project:${record.id}`, title: record.title }, JSON.stringify(record), { expectedRevision: null });
    return { record, revision: row.revision ?? 0 };
  }
  async pin(document: ProjectDocument): Promise<Pin> {
    if (!isProduct(document.product) || !document.id) throw new Error('Invalid source document.');
    if ((await this.meta(referenceKey(document))).trashedAt !== null) throw new Error('The source is in the trash.');
    const snapshot = await this.require(document.product, document.id);
    await readProductDocument(document.product, snapshot.text);
    if ((await this.meta(referenceKey(document))).trashedAt !== null) throw new Error('The source is in the trash.');
    return { id: crypto.randomUUID(), document: { product: document.product, id: document.id }, revision: snapshot.row.revision ?? 0, text: snapshot.text, title: snapshot.row.title || products[document.product].label };
  }
  async saveProject(value: ProjectRecord, expectedRevision: number): Promise<ProjectSnapshot> {
    const record = readProjectRecord(value), previous = await this.project(record.id);
    if (!previous) throw new Error('The project no longer exists.');
    const allPins = (p: ProjectRecord) => [...p.results.flatMap(r => r.inputs), ...p.comments.map(c => c.pin), ...p.works.flatMap(w => w.inputs)];
    const existing = new Map(allPins(previous.record).map(p => [p.id, p]));
    for (const result of record.results) {
      if ((await this.meta(referenceKey(result.document))).trashedAt !== null) throw new Error('A linked document is in the trash.');
      await this.require(result.document.product, result.document.id);
    }
    const previousComments = new Map(previous.record.comments.map(comment => [comment.id, comment]));
    for (const comment of record.comments) {
      const old = previousComments.get(comment.id);
      if (old && (old.resultId !== comment.resultId || JSON.stringify(old.target) !== JSON.stringify(comment.target) || old.pin.id !== comment.pin.id)) throw new Error('Comment source anchors are immutable.');
      if (!old) {
        const result = record.results.find(result => result.id === comment.resultId);
        if (!result) throw new Error('The comment result is no longer linked.');
        if (referenceKey(result.document) !== referenceKey(comment.pin.document)) throw new Error('The comment source does not match its result.');
        if (comment.target.kind === 'word-comment') {
          const { document } = await readProductDocument('word', comment.pin.text);
          let matches = 0;
          visitTree(document, node => { if (node.stype === 'resources' && Array.isArray(node.content)) for (const child of node.content) {
            if (object(child) && child.stype === 'commentThread' && object(child.attributes) && child.attributes.id === comment.target.id) matches++;
          } });
          if (matches !== 1) throw new Error('The pinned native comment thread is unavailable.');
        }
      }
    }
    const proposed = new Map<string, Pin>();
    for (const pin of allPins(record)) {
      const duplicate = proposed.get(pin.id), old = existing.get(pin.id);
      if ((duplicate && JSON.stringify(duplicate) !== JSON.stringify(pin)) || (old && JSON.stringify(old) !== JSON.stringify(pin))) throw new Error('Pinned sources are immutable.');
      proposed.set(pin.id, pin);
      if (!old) {
        const current = await this.pin(pin.document);
        if (current.revision !== pin.revision || current.text !== pin.text || current.title !== pin.title) throw new Error('The source changed. Review the current version before saving.');
      }
    }
    const row = await this.metaStore.keep({ name: `project:${record.id}`, title: record.title }, JSON.stringify(record), { expectedRevision });
    return { record, revision: row.revision ?? 0 };
  }
  async list(): Promise<WorkspaceDocument[]> {
    const metas = new Map<string, WorkspaceMeta>((await this.metaStore.snapshots()).filter(s => !s.row.name.startsWith('project:')).map(s => [s.row.name, metadata(JSON.parse(s.text))]));
    const results = await Promise.all(productKeys.map(async product => {
      const snapshots = await productStore(product).snapshots();
      return snapshots.map(({ row, text }): WorkspaceDocument => {
        const key = referenceKey({ product, id: row.name });
        let meta = metas.get(key) ?? metadata(row.metadata);
        if (product === 'note') {
          const native = metadata(row.metadata);
          let parent = typeof row.metadata?.parentId === 'string' ? row.metadata.parentId : null;
          const seen = new Set([row.name]);
          while (parent && !seen.has(parent)) {
            seen.add(parent);
            const ancestor = snapshots.find(one => one.row.name === parent)?.row;
            if (ancestor?.metadata?.trashedAt !== null && typeof ancestor?.metadata?.trashedAt === 'number') native.trashedAt = ancestor.metadata.trashedAt;
            parent = typeof ancestor?.metadata?.parentId === 'string' ? ancestor.metadata.parentId : null;
          }
          meta = { ...meta, favorite: native.favorite, trashedAt: native.trashedAt };
        }
        let body = '', error: string | undefined;
        try { body = plainText(JSON.parse(text).document); }
        catch { error = '파일을 읽을 수 없습니다. 백업한 뒤 복구하세요.'; }
        return { ...meta, key, product, id: row.name, title: row.title || `제목 없는 ${products[product].label}`,
          savedAt: row.savedAt, searchText: body, ...(error ? { error } : {}) };
      });
    }));
    return results.flat().sort((a, b) => Math.max(b.openedAt, b.savedAt) - Math.max(a.openedAt, a.savedAt));
  }
  async meta(key: string): Promise<WorkspaceMeta> {
    if (key.startsWith('note:')) {
      const row = (await this.list()).find(one => one.key === key);
      if (row) return metadata(row);
    }
    const found = await this.metaStore.read(key);
    if (found) return metadata(JSON.parse(found.text));
    const [product, ...parts] = key.split(':');
    if (isProduct(product)) return metadata((await productStore(product).read(parts.join(':')))?.row.metadata);
    return defaults();
  }
  async update(key: string, patch: Partial<WorkspaceMeta>): Promise<void> {
    if (key.startsWith('project:')) throw new Error('Use the project revision guard to update a project.');
    const previous = await this.metaStore.read(key);
    const next = { ...await this.meta(key), ...patch };
    if (key.startsWith('note:') && (patch.trashedAt !== undefined || patch.favorite !== undefined)) {
      const snapshot = await this.require('note', key.slice(5));
      if (patch.trashedAt === null && typeof snapshot.row.metadata?.parentId === 'string') {
        const parent = await this.meta(`note:${snapshot.row.metadata.parentId}`);
        if (parent.trashedAt !== null) throw new Error('상위 노트를 먼저 복원하세요.');
      }
      await productStore('note').keep({ ...snapshot.row, metadata: { ...snapshot.row.metadata,
        ...(patch.trashedAt !== undefined ? { trashedAt: patch.trashedAt } : {}), ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {})
      } }, snapshot.text, { expectedRevision: snapshot.row.revision ?? 0 });
    }
    await this.metaStore.keep({ name: key }, JSON.stringify(next), { expectedRevision: previous?.row.revision ?? null });
  }
  async create(product: Product, title: string): Promise<string> {
    const codec = await productCodec(product);
    const id = crypto.randomUUID(), document = codec.create();
    setDocumentTitle(product, document, title.trim() || `새 ${products[product].label}`, id);
    const text = codec.text(document as never);
    await readProductDocument(product, text);
    await productStore(product).keep({ name: id, title: title.trim() || `새 ${products[product].label}` }, text, { expectedRevision: null });
    return id;
  }
  async rename(product: Product, id: string, title: string): Promise<void> {
    if (!title.trim()) throw new Error('이름을 입력하세요.');
    const snapshot = await this.require(product, id);
    const { codec, document } = await readProductDocument(product, snapshot.text);
    setDocumentTitle(product, document, title.trim(), id);
    await productStore(product).keep({ ...snapshot.row, title: title.trim() }, codec.text(document as never), { expectedRevision: snapshot.row.revision ?? 0 });
  }
  async require(product: Product, id: string): Promise<LibrarySnapshot> {
    const snapshot = await productStore(product).read(id);
    if (!snapshot) throw new Error('자료가 없습니다. 원본을 다시 확인하세요.');
    return snapshot;
  }
  async copy(product: Product, id: string): Promise<string> {
    const snapshot = await this.require(product, id);
    const { codec, document } = await readProductDocument(product, snapshot.text);
    const next = crypto.randomUUID(), title = `${snapshot.row.title || products[product].label} 사본`;
    setDocumentTitle(product, document, title, next);
    if (product === 'note') visitTree(document, node => {
      if (node.stype === 'pageReference' && node.attributes?.pageId === id) node.attributes.pageId = next;
    });
    await productStore(product).keep({ name: next, title }, codec.text(document as never), { expectedRevision: null });
    await this.update(referenceKey({ product, id: next }), { copiedFrom: referenceKey({ product, id }), references: (await this.meta(referenceKey({ product, id }))).references });
    return next;
  }
  async noteToSite(id: string): Promise<string> {
    const source = await this.require('note', id);
    const note = await readProductDocument('note', source.text);
    visitTree(note.document, node => {
      if (node.stype === 'pageReference') throw new Error('페이지 참조가 포함된 노트입니다. Site 본문 복사 전에 해당 참조를 일반 링크로 바꾸세요. 원본은 유지됩니다.');
    });
    const codec = await productCodec('site');
    const document = codec.create();
    let inserted = false;
    visitTree(document, node => {
      if (!inserted && node.stype === 'richText') { node.content = structuredClone((note.document as { content: never[] }).content); inserted = true; }
    });
    if (!inserted) throw new Error('Site 본문을 만들지 못했습니다.');
    const next = crypto.randomUUID(), title = `${source.row.title || '노트'} · Site 사본`;
    setDocumentTitle('site', document, title);
    const text = codec.text(document as never);
    // Refuse unsupported nodes before any write; never silently drop blocks during conversion.
    await readProductDocument('site', text);
    await productStore('site').keep({ name: next, title }, text, { expectedRevision: null });
    await this.update(`site:${next}`, { copiedFrom: `note:${id}`, references: [`note:${id}`] });
    return next;
  }
  async link(source: string, target: string): Promise<void> {
    if (source === target) throw new Error('같은 자료를 연결할 수 없습니다.');
    const rows = await this.list();
    if (![source, target].every(key => rows.some(row => row.key === key && row.trashedAt === null))) throw new Error('연결할 자료가 없거나 휴지통에 있습니다.');
    const current = await this.meta(source);
    await this.update(source, { references: [...new Set([...current.references, target])] });
  }
  async backup(): Promise<WorkspaceBackup> {
    const documents: BackupDocument[] = [];
    for (const product of productKeys) for (const snapshot of await productStore(product).snapshots())
      documents.push({ product, ...snapshot, meta: await this.meta(referenceKey({ product, id: snapshot.row.name })) });
    for (const product of productKeys) for (const snapshot of await productDraftStore(product).snapshots())
      documents.push({ product, ...snapshot, row: { ...snapshot.row, name: `recovery:${snapshot.row.name}`, title: `${snapshot.row.title || products[product].label} 복구 초안` }, meta: defaults() });
    return { format: 'wonffice-workspace', version: 1, workspace: this.id, createdAt: new Date().toISOString(), documents, projects: (await this.projects()).map(p => p.record) };
  }
  async importFile(source: string): Promise<number> {
    const value = JSON.parse(source);
    if (value?.format === 'wonffice-workspace') return this.restore(value);
    if (value?.format === 'wonffice-product-library' && value.version === 1 && isProduct(value.product) && Array.isArray(value.documents) && Array.isArray(value.drafts)) {
      const documents = [...value.documents, ...value.drafts.map((entry: LibrarySnapshot) => ({ ...entry, row: { ...entry.row, name: `draft-${entry.row?.name}`, title: `${entry.row?.title || '자료'} 초안` } }))];
      return this.restore({ format: 'wonffice-workspace', version: 1, workspace: `${value.product}-import`, createdAt: new Date().toISOString(),
        documents: documents.map(entry => ({ product: value.product, ...entry, meta: metadata(entry.row?.metadata) })) });
    }
    const product = productKeys.find(key => products[key].format === value?.format);
    if (product) {
      const { document } = await readProductDocument(product, source);
      let title = product === 'note' ? String((document as { attributes?: { title?: string } }).attributes?.title || '') : '';
      visitTree(document, node => { if (node.stype === 'docTitle') title = plainText(node); });
      return this.restore({ format: 'wonffice-workspace', version: 1, workspace: 'file-import', createdAt: new Date().toISOString(),
        documents: [{ product, row: { name: (document as { attributes?: { pageId?: string } }).attributes?.pageId || crypto.randomUUID(), title }, text: source, meta: defaults() }] });
    }
    if (value?.format === 'barocss-note-workspace' && value.version === 1 && Array.isArray(value.pages) && Array.isArray(value.drafts)) {
      const entries = [...value.pages, ...value.drafts.map((entry: Record<string, unknown>) => ({ ...entry, id: `draft-${entry.id}`, title: `${entry.title || '노트'} 초안` }))];
      return this.restore({ format: 'wonffice-workspace', version: 1, workspace: 'note-import', createdAt: new Date().toISOString(), documents: entries.map(entry => ({
        product: 'note', row: { name: entry.id, title: entry.title, metadata: entry.metadata }, text: entry.text, meta: metadata(entry.metadata)
      })) });
    }
    throw new Error('Wonffice 백업 또는 Note·Word·Slides·Site JSON 파일을 선택하세요.');
  }
  /** Validate every entry first. Restore to new identities; an existing document is never replaced. */
  async restore(value: unknown): Promise<number> {
    const backup = readWorkspaceBackup(value);
    const ids = new Map(backup.documents.map(entry => [referenceKey({ product: entry.product, id: entry.row.name }), crypto.randomUUID()]));
    const prepared = await Promise.all(backup.documents.map(async entry => {
      const { codec, document } = await readProductDocument(entry.product, entry.text);
      const source = referenceKey({ product: entry.product, id: entry.row.name });
      const id = ids.get(source)!;
      const title = `${entry.row.title || products[entry.product].label} (복원)`;
      setDocumentTitle(entry.product, document, title, id);
      if (entry.product === 'note') visitTree(document, node => {
        if (node.attributes && typeof node.attributes.pageId === 'string')
          node.attributes.pageId = ids.get(`note:${node.attributes.pageId}`) ?? node.attributes.pageId;
      });
      const meta = { ...entry.meta, copiedFrom: source, references: entry.meta.references.map(key => {
        const target = backup.documents.find(d => referenceKey({ product: d.product, id: d.row.name }) === key);
        return target ? referenceKey({ product: target.product, id: ids.get(key)! }) : key;
      }) };
      const rowMeta = { ...entry.row.metadata };
      if (entry.product === 'note' && typeof rowMeta.parentId === 'string') rowMeta.parentId = ids.get(`note:${rowMeta.parentId}`) ?? null;
      return { product: entry.product, id, title, text: codec.text(document as never), rowMeta, meta };
    }));
    // Validate immutable historical sources as native files before any restore write.
    for (const record of backup.projects ?? []) for (const pin of [...record.results.flatMap(result => result.inputs), ...record.comments.map(comment => comment.pin), ...record.works.flatMap(work => work.inputs)]) await readProductDocument(pin.document.product, pin.text);
    const projects = (backup.projects ?? []).map(record => {
      const next = structuredClone(record);
      next.id = crypto.randomUUID();
      // Only live result links are remapped. Pins and durable native thread IDs remain historical evidence.
      next.results = next.results.map(result => ({ ...result, document: { ...result.document, id: ids.get(referenceKey(result.document))! } }));
      return readProjectRecord(next);
    });
    let count = 0;
    try {
      for (const product of productKeys) {
        const group = prepared.filter(entry => entry.product === product);
        await productStore(product).keepMany(group.map(entry => ({ entry: { name: entry.id, title: entry.title, metadata: entry.rowMeta }, text: entry.text, expectedRevision: null })));
        count += group.length;
        await this.metaStore.keepMany(group.map(entry => ({ entry: { name: referenceKey({ product, id: entry.id }) }, text: JSON.stringify(entry.meta), expectedRevision: null })));
      }
      await this.metaStore.keepMany(projects.map(record => ({ entry: { name: `project:${record.id}`, title: record.title }, text: JSON.stringify(record), expectedRevision: null })));
    } catch { throw new Error(`복원 중 저장하지 못했습니다. ${count}개 사본이 저장되었습니다. 기존 자료와 백업 파일은 유지됩니다.`); }
    return count;
  }
}

export function readWorkspaceBackup(value: unknown): WorkspaceBackup {
  if (!object(value) || value.format !== 'wonffice-workspace' || value.version !== 1 || typeof value.workspace !== 'string' || !Array.isArray(value.documents)) throw new Error('지원하는 Wonffice 백업 파일이 아닙니다.');
  const seen = new Set<string>();
  for (const entry of value.documents) {
    if (!object(entry) || !isProduct(entry.product) || !object(entry.row) || typeof entry.row.name !== 'string' || !entry.row.name || typeof entry.text !== 'string') throw new Error('백업 자료의 형식이 올바르지 않습니다.');
    const key = referenceKey({ product: entry.product, id: entry.row.name });
    if (seen.has(key)) throw new Error('백업에 같은 자료 ID가 두 번 있습니다.');
    seen.add(key);
  }
  const projects: ProjectRecord[] = [];
  if (value.projects !== undefined) {
    if (!Array.isArray(value.projects)) throw new Error('Invalid backup projects.');
    const projectIds = new Set<string>();
    for (const input of value.projects) {
      const record = readProjectRecord(input);
      if (projectIds.has(record.id) || record.results.some(result => !seen.has(referenceKey(result.document)))) throw new Error('Invalid backup project membership.');
      projectIds.add(record.id); projects.push(record);
    }
  }
  return { ...value, ...(value.projects !== undefined ? { projects } : {}), documents: value.documents.map(entry => ({ ...entry, meta: metadata(entry.meta) })) } as unknown as WorkspaceBackup;
}
