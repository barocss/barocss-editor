/**
 * Re-export text-run-index API from @barocss/shared for editor-view-dom consumers.
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
} from '@barocss/shared';
