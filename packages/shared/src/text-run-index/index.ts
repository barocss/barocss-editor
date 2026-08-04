export {
  type TextRun,
  type ContainerRuns,
  buildTextRunIndex,
  getTextRunsByElement,
  getTextRunsById,
  invalidateRunsByElement,
  invalidateRunsById,
  binarySearchRun,
  stripFiller,
  FILLER_CHAR,
  FILLER_ATTR,
} from './text-run-index';
