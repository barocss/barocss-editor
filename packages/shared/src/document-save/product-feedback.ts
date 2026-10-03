/** A product owns native selection and comments. The workspace owns work records. */
export interface ProductFeedbackTarget {
  kind: 'document' | 'word-comment';
  id: string;
  quote: string;
}
/** Supplied server proposal. Native editors still own validation, history and the original. */
export interface ProductRevisionProposal {
  targetId: string;
  snapshotText: string;
  expectedSnapshotText: string;
  replacement: string;
}
export interface ProductRevisionPreview {
  current(): boolean;
  apply(): Promise<boolean>;
  dispose(): void;
}
export interface ProductFeedbackHost {
  product: 'note' | 'word' | 'slides' | 'site';
  id(): string;
  editable(): boolean;
  /** Capture before moving focus. Return null for an unsupported/ambiguous selection. */
  capture(): ProductFeedbackTarget | null;
  /** Check the captured gesture after workspace storage/navigation awaits. */
  ownsCapture?(target: ProductFeedbackTarget): boolean;
  /** Refuse a retired document, selection or permission. Must use native history. */
  comment(target: ProductFeedbackTarget, body: string): Promise<ProductFeedbackTarget>;
  locate(target: ProductFeedbackTarget): 'located' | 'missing' | 'ambiguous';
  /** Reading changes presentation only; it must never grant write permission. */
  reading?(value: boolean): void;
  /** A proposal is not a command. Capture an exact native plan before approval awaits. */
  previewRevision?(proposal: ProductRevisionProposal, owns?: () => boolean): ProductRevisionPreview | null;
}
let current: ProductFeedbackHost | undefined;
export function registerProductFeedbackHost(host: ProductFeedbackHost): () => void {
  current = host;
  window.dispatchEvent(new Event('wonffice:feedback-host-change'));
  return () => {
    if (current !== host) return;
    current = undefined;
    window.dispatchEvent(new Event('wonffice:feedback-host-change'));
  };
}
export function productFeedbackHost(): ProductFeedbackHost | undefined { return current; }
