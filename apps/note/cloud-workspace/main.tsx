import { createRoot } from 'react-dom/client';
import { OfficeLocaleProvider } from '@barocss/office-ui';
import { Workspace } from './workspace';
import '../src/style.css';
import './workspace.css';

createRoot(document.getElementById('root')!).render(<OfficeLocaleProvider locale="ko"><Workspace /></OfficeLocaleProvider>);
