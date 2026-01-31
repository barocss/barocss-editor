/**
 * Re-export from shared text-run-index package so renderer-dom API stays unchanged.
 * editor-view-dom and other consumers keep importing from @barocss/renderer-dom.
 */
export {
  type TextRun,
  type ContainerRuns,
  buildTextRunIndex,
  getTextRunsByElement,
  getTextRunsById,
  invalidateRunsByElement,
  invalidateRunsById,
  binarySearchRun,
} from '@barocss/text-run-index';


