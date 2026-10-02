/** A product owns native selection and comments. The workspace owns work records. */
export interface ProductFeedbackTarget {
  kind: 'document' | 'word-comment';
  id: string;
  quote: string;
}
export interface ProductFeedbackHost {
  product: 'note' | 'word' | 'slides' | 'site';
  id(): string;
  editable(): boolean;
  /** Capture before moving focus. Return null for an unsupported/ambiguous selection. */
  capture(): ProductFeedbackTarget | null;
  /** Refuse a retired document, selection or permission. Must use native history. */
  comment(target: ProductFeedbackTarget, body: string): Promise<ProductFeedbackTarget>;
  locate(target: ProductFeedbackTarget): 'located' | 'missing' | 'ambiguous';
  /** Reading changes presentation only; it must never grant write permission. */
  reading?(value: boolean): void;
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
