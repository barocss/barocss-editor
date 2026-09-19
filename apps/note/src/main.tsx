import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Lab } from './lab';
import { Workspace } from './workspace';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{new URLSearchParams(location.search).has('lab') ? <Lab /> : <Workspace />}</StrictMode>
);
