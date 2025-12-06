/**
 * Google Docs HTML cleaning utility
 *
 * HTML copied from Google Docs contains a mix of wrapper divs, style/script tags,
 * data-*, class-based metadata, etc.
 * This class removes unnecessary wrappers and tags, leaving only actual content
 * below body to pass to HTMLConverter.
 */
export class GoogleDocsHTMLCleaner {
  /**
   * Cleans Google Docs HTML.
   *
   * @param html Original HTML copied from Google Docs
   * @returns Cleaned HTML (based on body inner content)
   */
  clean(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc.body) {
      return html;
    }

    // Remove style / script tags
    this._removeElements(doc.body, ['style', 'script']);

    // To flatten Google Docs-specific wrapper div/section, etc.,
    // we could unwrap based on class/id patterns here,
    // but currently we only perform minimal cleaning.

    return doc.body.innerHTML;
  }

  /**
   * Removes all elements with specified tag names.
   */
  private _removeElements(root: Element, tagNames: string[]): void {
    for (const tag of tagNames) {
      const elements = root.getElementsByTagName(tag);
      for (let i = elements.length - 1; i >= 0; i--) {
        elements[i].remove();
      }
    }
  }
}


