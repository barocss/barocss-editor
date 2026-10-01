import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createSampleDeck } from '@barocss/office-slides';
import { App } from './app';
import { createSlidesRuntime } from './runtime';
import './style.css';

export function mountSlides(container: HTMLElement) {
  return createSlidesRuntime(container, { initialDocument: createSampleDeck(), editable: true, debug: true });
}
const root = document.getElementById('root');
if (root) createRoot(root).render(createElement(StrictMode, null, createElement(App, { mount: mountSlides })));
