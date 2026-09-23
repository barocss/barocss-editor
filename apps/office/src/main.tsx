import { createRoot } from 'react-dom/client';
import './style.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
  // Keep the local IndexedDB library unmounted until service identity and document access exist.
  void import('./auth-app').then(({ AuthApp }) => root.render(<AuthApp />));
} else {
  void import('@barocss/office-workspace/ui').then(({ WorkspaceHome }) => root.render(<WorkspaceHome />));
}
