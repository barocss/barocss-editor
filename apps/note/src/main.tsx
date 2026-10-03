import { OfficeLocaleProvider } from '@barocss/office-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Lab } from './lab';
import { Workspace } from './workspace';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><OfficeLocaleProvider>{new URLSearchParams(location.search).has('lab') ? <Lab /> : <Workspace />}</OfficeLocaleProvider></StrictMode>
);
