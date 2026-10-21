import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentLocationId, documentLocationURL, documentLocationWorkspace, registerDocumentLocation } from './document-location';

afterEach(() => { vi.unstubAllGlobals(); });
describe('native document location supplied by its host', () => {
  it('reads and writes canonical identities through the validated host, with no product hash', () => {
    vi.stubGlobal('location', new URL('http://localhost/workspace/original'));
    const remove = registerDocumentLocation({ product: 'word', workspaceId: 'workspace', readId: () => 'original', url: id => `/workspace/${id}` });
    try {
      expect(documentLocationWorkspace()).toBe('workspace');
      expect(documentLocationId('word')).toBe('original');
      expect(documentLocationURL('word', 'next')).toBe('/workspace/next');
      expect(() => documentLocationId('site')).toThrow(/another product/i);
      expect(() => documentLocationURL('site', 'next')).toThrow(/another product/i);
    } finally { remove(); }
  });
  it('old cleanup cannot remove a replacement registration of the same adapter', () => {
    const adapter = { product: 'note', workspaceId: 'w', readId: () => 'n', url: (id: string) => `/w/${id}` };
    const old = registerDocumentLocation(adapter), next = registerDocumentLocation(adapter);
    try { old(); expect(documentLocationId('note')).toBe('n'); }
    finally { old(); next(); }
  });
  it('refuses a missing identity from a registered host instead of using standalone sample behavior', () => {
    const remove = registerDocumentLocation({ product: 'word', workspaceId: 'w', readId: () => undefined, url: () => '/w/sample' });
    try { expect(() => documentLocationId('word')).toThrow(/no original identity/i); }
    finally { remove(); }
  });
  it('keeps standalone Note and Word legacy addresses readable', () => {
    vi.stubGlobal('location', new URL('http://localhost/?workspace=w#note%20one'));
    expect(documentLocationId('note')).toBe('note one');
    expect(documentLocationURL('note', 'next note')).toBe('/?workspace=w#next%20note');
    expect(documentLocationWorkspace()).toBe('w');
    vi.stubGlobal('location', new URL('http://localhost/?mode=edit#word=original'));
    expect(documentLocationId('word')).toBe('original');
    expect(documentLocationURL('word', 'next')).toBe('/?mode=edit#word=next');
    expect(documentLocationWorkspace()).toBeNull();
  });
});
