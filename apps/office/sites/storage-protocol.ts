import type { LibraryEntry, LibrarySnapshot } from '@barocss/shared';
export const STORAGE_ROOT = '/api/office-storage';
export const MAX_COMMIT_BYTES = 1_800_000;
export type StoreKind = 'note' | 'word' | 'slides' | 'site' | 'catalog' | 'slides-library' | 'site-library';
export interface StorageSession { userScope: string; workspaceId: string }
export interface StorageItem { entry: LibraryEntry; text: string; expectedRevision: number | null; deleted?: boolean }
export interface StorageAttempt { requestId: string; items: StorageItem[] }
export interface StorageReceipt { workspaceId: string; requestId: string; requestHash: string; snapshots: LibrarySnapshot[] }
export const isStoreKind = (value: string): value is StoreKind => ['note', 'word', 'slides', 'site', 'catalog', 'slides-library', 'site-library'].includes(value);
export const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 &&
  value.trim() === value && !/[/\\]/.test(value) && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export async function storageHash(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
