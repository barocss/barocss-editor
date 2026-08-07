import { describe, it, expect } from 'vitest';
import {
  WORD_FONT_CATALOGUE,
  documentFontFamilies,
  fontFaceSpecs,
  googleFontUrl,
  isWebFont
} from '../src/fonts';
import type { DocumentAccess } from '../src/document-access';

/**
 * Which fonts a document names, and which of those a host has to fetch.
 *
 * The stakes are higher than they look, because pagination measures. Text laid
 * out in a fallback and then repainted in the real face has had its page breaks
 * computed against the wrong widths, and every page after the first lands in the
 * wrong place — a fault that reads as a pagination bug and is nothing of the
 * kind. So the host has to know what to fetch before it believes a measurement,
 * which is what makes finding the families a document already names part of the
 * product rather than an afterthought in the toolbar.
 */
const docOf = (nodes: Record<string, any>, rootId = 'root'): DocumentAccess => ({
  getNode: (id: string) => nodes[id],
  rootId
});

describe('the catalogue', () => {
  it('offers the fonts a desktop already has alongside the ones to fetch', () => {
    const system = WORD_FONT_CATALOGUE.filter((entry) => !entry.web);
    expect(system.map((entry) => entry.family)).toContain('Georgia');
    expect(WORD_FONT_CATALOGUE.some((entry) => entry.web)).toBe(true);
  });

  it('names each family once', () => {
    // A duplicate would show twice in the control and, worse, could disagree
    // with itself about whether it needs fetching.
    const names = WORD_FONT_CATALOGUE.map((entry) => entry.family);
    expect(new Set(names).size).toBe(names.length);
  });

  it('knows which families have to be fetched', () => {
    expect(isWebFont('Merriweather')).toBe(true);
    expect(isWebFont('Georgia')).toBe(false);
    // Not in the catalogue at all: a document may name anything, and a font
    // nobody offered is not one this host can go and get.
    expect(isWebFont('Some Private Font')).toBe(false);
    expect(isWebFont(undefined)).toBe(false);
  });
});

describe('where to fetch from', () => {
  it('asks for the weights the document can actually use', () => {
    const url = googleFontUrl(['Merriweather'])!;
    // Bold as well as regular: a browser asked to embolden a face it only has in
    // regular invents one, at a different width — and width is the thing being
    // measured.
    expect(url).toContain('wght@400;700');
    expect(url).toContain('family=Merriweather');
  });

  it('blocks rather than swapping', () => {
    // Swapping paints in a fallback first, which is exactly the sequence that
    // produces pages broken for the wrong font.
    expect(googleFontUrl(['Lora'])).toContain('display=block');
  });

  it('escapes a family whose name has spaces', () => {
    expect(googleFontUrl(['Playfair Display'])).toContain('family=Playfair+Display');
  });

  it('asks for several families at once', () => {
    const url = googleFontUrl(['Lora', 'Inter'])!;
    expect(url).toContain('family=Lora');
    expect(url).toContain('family=Inter');
  });

  it('has nothing to fetch for fonts already present', () => {
    // No request at all, rather than a request for nothing.
    expect(googleFontUrl(['Georgia', 'Arial'])).toBeNull();
    expect(googleFontUrl([])).toBeNull();
  });
});

describe('waiting for a family', () => {
  it('waits on each weight separately', () => {
    // Asking for the family alone resolves when any one face arrives, and the
    // bold turning up later rewrites the width of every line it is on — after
    // the breaks were decided.
    expect(fontFaceSpecs('Lora')).toEqual(['400 1em "Lora"', '700 1em "Lora"']);
  });
});

describe('what a document names', () => {
  it('finds fonts named by a style and by direct formatting alike', () => {
    const doc = docOf({
      root: { sid: 'root', content: ['res', 'body'] },
      res: { sid: 'res', stype: 'resources', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', attributes: { fontFamily: 'Merriweather' } },
      body: { sid: 'body', content: ['t1'] },
      t1: {
        sid: 't1',
        stype: 'inline-text',
        text: 'hello',
        marks: [{ stype: 'fontFamily', range: [0, 5], attrs: { family: 'Inter' } }]
      }
    });
    expect(documentFontFamilies(doc).sort()).toEqual(['Inter', 'Merriweather']);
  });

  it('reduces a stack to the family that has to be fetched', () => {
    const doc = docOf({
      root: { sid: 'root', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', attributes: { fontFamily: '"Lora", Georgia, serif' } }
    });
    expect(documentFontFamilies(doc)).toEqual(['Lora']);
  });

  it('leaves out what needs no fetching', () => {
    // A document set entirely in system fonts costs no requests, which is the
    // usual case and has to stay free.
    const doc = docOf({
      root: { sid: 'root', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', attributes: { fontFamily: 'Georgia, serif' } }
    });
    expect(documentFontFamilies(doc)).toEqual([]);
  });

  it('survives a document that is cyclic or empty', () => {
    expect(documentFontFamilies(docOf({ root: { sid: 'root' } }))).toEqual([]);
    const cyclic = docOf({ root: { sid: 'root', content: ['a'] }, a: { sid: 'a', content: ['a'] } });
    expect(documentFontFamilies(cyclic)).toEqual([]);
  });
});
