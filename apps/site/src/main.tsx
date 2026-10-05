import { OfficeLocaleProvider } from '@barocss/office-ui';
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createSampleSite } from '@barocss/office-site';
import { App } from './app';
import { mountSiteRuntime } from './runtime';
import './style.css';

// The standalone editor uses the same full native runtime. Authenticated mounting
// imports server-workspace instead and does not install sample/debug globals.
export function mountSite(container: HTMLElement) {
  return mountSiteRuntime(container, { initialDocument: createSampleSite(), editable: true, debug: true });
}
const root = document.getElementById('root');
if (root) createRoot(root).render(createElement(StrictMode, null,
  createElement(OfficeLocaleProvider, { children: createElement(App, { mount: mountSite }) })));
