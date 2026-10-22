import { createPreviewReplica } from './fixture.ts';
import { SheetController } from './controller.ts';
import { mountSheetPreview } from './binding.ts';

try {
  const controller = new SheetController(createPreviewReplica());
  const preview = mountSheetPreview(controller);
  window.addEventListener('pagehide', event => { if (!event.persisted) preview.destroy(); });
} catch (error) {
  const status = document.getElementById('preview-status');
  if (status) status.textContent = `Preview could not start: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
