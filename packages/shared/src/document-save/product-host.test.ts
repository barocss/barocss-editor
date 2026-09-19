import { describe, expect, it } from 'vitest';
import { prepareProductNavigation, registerProductDocumentHost } from './product-host';

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
