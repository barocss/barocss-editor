import type { documentLibrary } from '../document-library/document-library';
import type { ProductDocumentHost } from './product-host';

/** An origin-local product backup. Importers must make copies and validate all files before writing. */
export async function productLibraryArchive(product: ProductDocumentHost['product'], documents: ReturnType<typeof documentLibrary>, drafts: ReturnType<typeof documentLibrary>) {
  const [saved, recovered] = await Promise.all([documents.snapshots(), drafts.snapshots()]);
  return { format: 'wonffice-product-library', version: 1, product, createdAt: new Date().toISOString(), documents: saved, drafts: recovered };
}
export function downloadDocumentArchive(value: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
