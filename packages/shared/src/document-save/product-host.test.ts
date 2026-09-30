import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductDocumentOpen, isProductDocumentTrashed, ProductDocumentTrashedError, prepareProductNavigation, registerProductDocumentHost } from './product-host';

const catalog = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../document-library/document-library', () => ({ documentLibrary: () => catalog }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('product navigation ownership', () => {
  it('does not navigate without a ready document or after a failed save', async () => {
    expect(await prepareProductNavigation()).toBe(false);
    const close = registerProductDocumentHost({ product: 'word', id: () => 'one', beforeNavigate: async () => false });
    expect(await prepareProductNavigation()).toBe(false); close();
  });
  it('refuses a navigation prepared for a document replaced while its save was pending', async () => {
    let id = 'one';
    const close = registerProductDocumentHost({ product: 'slides', id: () => id, beforeNavigate: async () => { id = 'two'; return true; } });
    expect(await prepareProductNavigation()).toBe(false); close();
  });
  it('cleanup from an old mounted host cannot unregister a newer host', async () => {
    const old = registerProductDocumentHost({ product: 'word', id: () => 'old', beforeNavigate: async () => false });
    const current = registerProductDocumentHost({ product: 'site', id: () => 'current', beforeNavigate: async () => true });
    old(); expect(await prepareProductNavigation()).toBe(true); current();
  });
});


describe('workspace trash policy for product libraries', () => {
  const workspace = () => {
    vi.stubGlobal('location', { search: '?workspace=one' });
    vi.stubGlobal('localStorage', { getItem: () => 'one' });
  };
  it('filters trash without changing the product store and checks again before opening', async () => {
    workspace();
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":null}' });
    expect(await isProductDocumentTrashed('slides', 'a')).toBe(false);
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":0}' });
    await expect(assertProductDocumentOpen('slides', 'a')).rejects.toBeInstanceOf(ProductDocumentTrashedError);
    expect(catalog.read).toHaveBeenNthCalledWith(1, 'slides:a');
    expect(catalog.read).toHaveBeenNthCalledWith(2, 'slides:a');
  });
  it('opens the same original identity after workspace restoration', async () => {
    workspace();
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":123}' });
    expect(await isProductDocumentTrashed('word', 'original-a')).toBe(true);
    catalog.read.mockResolvedValueOnce({ text: '{"trashedAt":null}' });
    await expect(assertProductDocumentOpen('word', 'original-a')).resolves.toBeUndefined();
    expect(catalog.read).toHaveBeenLastCalledWith('word:original-a');
  });
  it('keeps standalone libraries available and preserves the workspace mismatch denial', async () => {
    vi.stubGlobal('location', { search: '' });
    expect(await isProductDocumentTrashed('site', 'a')).toBe(false);
    await expect(assertProductDocumentOpen('site', 'a')).resolves.toBeUndefined();
    vi.stubGlobal('location', { search: '?workspace=other' });
    vi.stubGlobal('localStorage', { getItem: () => 'one' });
    await expect(assertProductDocumentOpen('site', 'a')).rejects.toThrow('다른 작업 공간');
    expect(catalog.read).not.toHaveBeenCalled();
  });
  it('retains catalog read errors instead of treating unknown trash state as available', async () => {
    workspace();
    catalog.read.mockRejectedValue(new Error('catalog unavailable'));
    await expect(isProductDocumentTrashed('site', 'a')).rejects.toThrow('catalog unavailable');
    await expect(assertProductDocumentOpen('site', 'a')).rejects.toThrow('catalog unavailable');
  });
});
