/** The validated host supplies routes. Standalone native editors keep their existing links. */
export interface DocumentLocation {
  readonly product: string;
  readonly workspaceId: string;
  readId(): string | undefined;
  url(id: string): string;
  /** The initial requested address stays owned while its original is read. */
  isCurrent?(): boolean;
}
let current: { location: DocumentLocation } | undefined;

export function registerDocumentLocation(location: DocumentLocation): () => void {
  const registration = { location };
  current = registration;
  return () => { if (current === registration) current = undefined; };
}
export function captureDocumentLocation(product: string): () => boolean {
  const registered = current;
  return () => current === registered && (!registered || (registered.location.product === product && (registered.location.isCurrent?.() ?? true)));
}
export function documentLocationWorkspace(): string | null {
  return current?.location.workspaceId ?? new URLSearchParams(location.search).get('workspace');
}
export function documentLocationId(product: string): string | undefined {
  if (current) {
    if (current.location.product !== product) throw new Error('Document location belongs to another product.');
    const id = current.location.readId();
    if (!id) throw new Error('Document location has no original identity.');
    return id;
  }
  if (product === 'note') return decodeURIComponent(location.hash.slice(1)) || undefined;
  return new URLSearchParams(location.hash.slice(1)).get(product) ?? undefined;
}
export function documentLocationURL(product: string, id: string): string {
  if (current) {
    if (current.location.product !== product) throw new Error('Document location belongs to another product.');
    return current.location.url(id);
  }
  return `${location.pathname}${location.search}#${product === 'note' ? '' : `${product}=`}${encodeURIComponent(id)}`;
}
