import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createSampleDocument, createStarterDocument, exportWordDocx, readWordDocx } from '@barocss/office-word';
import { App } from './app';
import { mountWordRuntime, type WordRuntime } from './runtime';
import { createMergedCellSample, createStaggeredCellSample } from './merged-cell-sample';
import { createReferenceSample } from './reference-sample';
import { createCaptionSample } from './caption-sample';
import { createStyleManagementSample } from './style-management-sample';
import { createFormatPainterSample } from './format-painter-sample';
import './style.css';

export function mountWord(container: HTMLElement, onFurniture?: (id?: string) => void): WordRuntime {
  const demo = new URLSearchParams(location.search);
  let initialDocument = demo.get('sample') === 'captions' ? createCaptionSample() : ['references', 'references-docx'].includes(demo.get('sample') ?? '') ? createReferenceSample() : demo.get('sample') === 'styles' ? createStyleManagementSample() : demo.get('sample') === 'format-painter' ? createFormatPainterSample()
    : demo.get('sample') === 'merged-cell-rows' ? createStaggeredCellSample()
    : demo.get('sample') === 'merged-cell-columns' ? createMergedCellSample(false, true)
    : demo.get('sample') === 'merged-cell-lines' ? createMergedCellSample(true)
    : demo.get('sample') === 'merged-cell' ? createMergedCellSample()
    : demo.has('sample') || demo.has('lab') ? createSampleDocument() : createStarterDocument();
  if (demo.get('sample') === 'references-docx') {
    const file = exportWordDocx(initialDocument);
    initialDocument = readWordDocx(file.bytes, 'DOCX 참조 교환').document;
  }

  return mountWordRuntime(container, {
    initialDocument, editable: true, debug: true,
    author: { name: 'Jinho', date: () => new Date().toISOString().slice(0, 10) }
  }, onFurniture);
}

createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(App, { mount: mountWord }))
);
